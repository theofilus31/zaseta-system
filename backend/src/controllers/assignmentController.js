const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const { todayLocal } = require('../utils/dateLocal');

/**
 * ============================================================================
 *  PENUGASAN ASET (custody / serah terima)
 * ============================================================================
 *  Menjawab pertanyaan yang paling sering muncul di pengelolaan aset IT tapi
 *  belum bisa dijawab sistem ini: "laptop ini sedang dipegang siapa?".
 *
 *  Alurnya sengaja dibuat seperti serah terima di dunia nyata:
 *    Serahkan (check-out)  -> aset punya pemegang, status jadi "dipakai"
 *    Terima kembali (check-in) -> pemegang dilepas, status kembali "idle",
 *                                 dan kondisi fisik boleh dikoreksi saat
 *                                 barangnya diperiksa.
 *
 *  Riwayat penugasan tidak pernah dihapus — dokumen serah terima justru
 *  gunanya untuk ditelusuri belakangan.
 * ============================================================================
 */

const CONDITIONS = ['baik', 'rusak_ringan', 'rusak_berat'];

/** Penugasan yang sedang aktif untuk sebuah aset, kalau ada. */
async function findActiveAssignment(assetId) {
  const [rows] = await pool.query(
    `SELECT * FROM asset_assignments
     WHERE asset_id = :assetId AND returned_at IS NULL
     ORDER BY assigned_at DESC, id DESC LIMIT 1`,
    { assetId }
  );
  return rows[0] || null;
}

// GET /api/assignments?assetId=&holder=&activeOnly=&page=&limit=
const listAssignments = asyncHandler(async (req, res) => {
  const { assetId, holder = '', activeOnly, page = 1, limit = 25 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  const conditions = ['a.deleted_at IS NULL'];
  const params = {};

  if (assetId) {
    conditions.push('asg.asset_id = :assetId');
    params.assetId = assetId;
  }
  if (holder) {
    conditions.push('(asg.holder_name LIKE :holderLike OR asg.department LIKE :holderLike)');
    params.holderLike = `%${holder}%`;
  }
  if (activeOnly === 'true') {
    conditions.push('asg.returned_at IS NULL');
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const [rows] = await pool.query(
    `SELECT asg.*,
            a.asset_code, a.name AS asset_name, a.status AS asset_status,
            ub.name AS assigned_by_name, ur.name AS returned_by_name
     FROM asset_assignments asg
     JOIN assets a ON a.id = asg.asset_id
     LEFT JOIN users ub ON ub.id = asg.assigned_by
     LEFT JOIN users ur ON ur.id = asg.returned_by
     ${whereClause}
     ORDER BY (asg.returned_at IS NOT NULL) ASC, asg.assigned_at DESC, asg.id DESC
     LIMIT :limit OFFSET :offset`,
    { ...params, limit: Number(limit), offset }
  );

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM asset_assignments asg JOIN assets a ON a.id = asg.asset_id
     ${whereClause}`,
    params
  );

  res.json({
    data: rows,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: countRows[0].total,
      totalPages: Math.ceil(countRows[0].total / Number(limit)),
    },
  });
});

/**
 * Inti dari serah terima (check-out), dipisah dari handler HTTP-nya supaya
 * bisa dipanggil dari tempat lain — persisnya, dari requestController saat
 * sebuah permintaan aset dipenuhi. Menyalin aturan ini ke dua tempat hampir
 * pasti berakhir dengan salah satunya lupa diperbarui saat aturannya berubah.
 *
 * Melempar Error ber-`.status` (bukan langsung menulis res.status/json) supaya
 * pemanggilnya bebas menentukan bentuk responsnya sendiri — checkOut() di
 * bawah membungkusnya jadi respons HTTP asli, requestController membungkusnya
 * jadi bagian dari respons "permintaan dipenuhi".
 *
 * Tiga tulisan (baris penugasan baru, status aset, riwayat status) sekarang
 * satu transaksi — sebelumnya tiga `pool.query` terpisah, jadi proses yang
 * terhenti persis di antara dua tulisan bisa meninggalkan aset yang tercatat
 * "diserahkan" di satu tabel tapi masih "menganggur" di tabel lain, seolah
 * bisa diserahkan lagi ke orang kedua.
 *
 * Bisa dipanggil dengan `conn` transaksi milik pemanggil (dari
 * requestController.fulfillRequest, supaya "penuhi permintaan" dan "serahkan
 * aset"-nya sungguh-sungguh satu operasi yang gagal/berhasil bersama), atau
 * tanpa `conn` sama sekali (dari checkOut() di bawah), yang akan membuka dan
 * mengurus transaksinya sendiri.
 */
async function performCheckOut({ assetId, holderName, holderContact, department, assignedAt, assignNote, userId, ip, conn: externalConn }) {
  if (!assetId || !holderName) {
    const err = new Error('assetId dan nama pemegang wajib diisi.'); err.status = 400; throw err;
  }

  const conn = externalConn || await pool.getConnection();
  const ownsTransaction = !externalConn;

  try {
    if (ownsTransaction) await conn.beginTransaction();

    const [assetRows] = await conn.query(
      `SELECT id, name, status FROM assets WHERE id = :assetId AND deleted_at IS NULL FOR UPDATE`,
      { assetId }
    );
    const asset = assetRows[0];
    if (!asset) { const err = new Error('Aset tidak ditemukan.'); err.status = 404; throw err; }

    /* Aset yang sudah keluar dari inventaris aktif tidak masuk akal untuk
       diserahkan ke siapa pun. */
    const LABEL = { terjual: 'Terjual', dijual: 'Dijual', hilang: 'Hilang', dihapuskan: 'Dihapuskan' };
    if (['terjual', 'dijual', 'hilang', 'dihapuskan'].includes(asset.status)) {
      const err = new Error(`Aset berstatus "${LABEL[asset.status]}" tidak bisa diserahkan. Ubah statusnya lebih dulu.`);
      err.status = 400; throw err;
    }
    if (asset.status === 'dipindah') {
      const err = new Error('Aset sedang dalam proses perpindahan. Selesaikan perpindahannya lebih dulu.');
      err.status = 400; throw err;
    }

    /* FOR UPDATE mengunci baris aset di atas untuk durasi transaksi ini,
       sehingga dua permintaan serah terima yang datang bersamaan atas aset
       yang sama tidak bisa keduanya lolos dari pengecekan "belum dipegang
       siapa pun" ini — permintaan kedua menunggu sampai permintaan pertama
       selesai, baru melihat penugasan yang baru saja dibuat. */
    const [activeRows] = await conn.query(
      `SELECT * FROM asset_assignments
       WHERE asset_id = :assetId AND returned_at IS NULL
       ORDER BY assigned_at DESC, id DESC LIMIT 1`,
      { assetId }
    );
    const active = activeRows[0];
    if (active) {
      const err = new Error(`Aset ini masih dipegang oleh ${active.holder_name}. Terima kembali dulu sebelum diserahkan ke orang lain.`);
      err.status = 409; throw err;
    }

    const [result] = await conn.query(
      `INSERT INTO asset_assignments
         (asset_id, holder_name, holder_contact, department, assigned_at, assigned_by, assign_note)
       VALUES (:assetId, :holderName, :holderContact, :department, :assignedAt, :userId, :assignNote)`,
      {
        assetId,
        holderName: holderName.trim(),
        holderContact: holderContact || null,
        department: department || null,
        assignedAt: assignedAt || todayLocal(),
        userId,
        assignNote: assignNote || null,
      }
    );

    /* Aset yang sedang dipegang orang, menurut definisi, sedang dipakai.
       Perubahan status ikut dicatat di riwayat status supaya dua linimasa
       (status & custody) tidak saling bertentangan. */
    if (asset.status !== 'dipakai') {
      await conn.query(`UPDATE assets SET status = 'dipakai', updated_by = :userId WHERE id = :assetId`,
        { assetId, userId });
      await conn.query(
        `INSERT INTO asset_status_histories (asset_id, old_status, new_status, changed_by, notes)
         VALUES (:assetId, :oldStatus, 'dipakai', :userId, :notes)`,
        { assetId, oldStatus: asset.status, userId, notes: `Diserahkan kepada ${holderName}` }
      );
    }

    if (ownsTransaction) await conn.commit();

    /* Audit log ditulis lewat pool.query sendiri, DI LUAR transaksi ini —
       konsisten dengan pola di opnameController/consumableController: kalau
       transaksi ini bagian dari transaksi yang lebih besar milik pemanggil
       (fulfillRequest), pemanggil itulah yang mencatat audit log setelah
       TRANSAKSI GABUNGANNYA commit, supaya tidak ada log "aset diserahkan"
       untuk permintaan yang ternyata gagal dipenuhi. */
    if (ownsTransaction) {
      await logAudit({
        userId, action: 'create', entityType: 'asset_assignment', entityId: result.insertId,
        newValues: { assetId, holderName, department }, ipAddress: ip,
      });
    }

    return { assignmentId: result.insertId, assetName: asset.name };
  } catch (err) {
    if (ownsTransaction) await conn.rollback();
    throw err;
  } finally {
    if (ownsTransaction) conn.release();
  }
}

// POST /api/assignments — serahkan aset ke seseorang (check-out)
const checkOut = asyncHandler(async (req, res) => {
  const { assetId, holderName, holderContact, department, assignedAt, assignNote } = req.body;

  const { assignmentId } = await performCheckOut({
    assetId, holderName, holderContact, department, assignedAt, assignNote,
    userId: req.user.id, ip: req.ip,
  });

  res.status(201).json({ id: assignmentId, message: `Aset diserahkan kepada ${holderName}.` });
});

// PUT /api/assignments/:id/return — terima kembali aset (check-in)
//
// Empat tulisan (tutup penugasan, baca aset, ubah status aset, riwayat
// status) sekarang satu transaksi dengan kunci baris pada penugasan —
// sebelumnya empat `pool.query` terpisah, berisiko meninggalkan penugasan
// yang tercatat "sudah kembali" sementara aset masih berstatus "dipakai",
// atau membiarkan dua permintaan check-in yang datang bersamaan
// keduanya lolos menutup penugasan yang sama.
const checkIn = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { returnedAt, returnNote, returnCondition, newStatus } = req.body;

  if (returnCondition && !CONDITIONS.includes(returnCondition)) {
    return res.status(400).json({ message: 'Kondisi pengembalian tidak valid.' });
  }

  const conn = await pool.getConnection();
  let assignment, targetStatus;
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(`SELECT * FROM asset_assignments WHERE id = :id FOR UPDATE`, { id });
    assignment = rows[0];
    if (!assignment) {
      await conn.rollback();
      return res.status(404).json({ message: 'Data penugasan tidak ditemukan.' });
    }
    if (assignment.returned_at) {
      await conn.rollback();
      return res.status(400).json({ message: 'Penugasan ini sudah ditutup sebelumnya.' });
    }

    await conn.query(
      `UPDATE asset_assignments
       SET returned_at = :returnedAt, returned_by = :userId,
           return_note = :returnNote, return_condition = :returnCondition
       WHERE id = :id`,
      {
        id,
        returnedAt: returnedAt || todayLocal(),
        userId: req.user.id,
        returnNote: returnNote || null,
        returnCondition: returnCondition || null,
      }
    );

    /* Aset kembali ke gudang: statusnya jadi "idle" kecuali penerima memilih
       lain. Kondisi fisik ikut diperbarui kalau saat diperiksa ternyata
       berbeda — inilah momen paling wajar untuk mengoreksinya. */
    const [assetRows] = await conn.query(
      `SELECT status, condition_status FROM assets WHERE id = :assetId FOR UPDATE`,
      { assetId: assignment.asset_id }
    );
    const asset = assetRows[0];
    targetStatus = newStatus && ['idle', 'dipakai'].includes(newStatus) ? newStatus : 'idle';

    await conn.query(
      `UPDATE assets
       SET status = :targetStatus,
           condition_status = COALESCE(:returnCondition, condition_status),
           updated_by = :userId
       WHERE id = :assetId`,
      {
        assetId: assignment.asset_id,
        targetStatus,
        returnCondition: returnCondition || null,
        userId: req.user.id,
      }
    );

    if (asset && asset.status !== targetStatus) {
      await conn.query(
        `INSERT INTO asset_status_histories (asset_id, old_status, new_status, changed_by, notes)
         VALUES (:assetId, :oldStatus, :newStatus, :userId, :notes)`,
        {
          assetId: assignment.asset_id, oldStatus: asset.status, newStatus: targetStatus,
          userId: req.user.id, notes: `Diterima kembali dari ${assignment.holder_name}`,
        }
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  await logAudit({
    userId: req.user.id, action: 'update', entityType: 'asset_assignment', entityId: id,
    oldValues: { holderName: assignment.holder_name, returnedAt: null },
    newValues: { returnedAt: returnedAt || 'hari ini', returnCondition, newStatus: targetStatus },
    ipAddress: req.ip,
  });

  res.json({ message: `Aset diterima kembali dari ${assignment.holder_name}.` });
});

// GET /api/assignments/holders — rekap per pemegang, untuk melihat siapa memegang apa
const listHolders = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT holder_name, department,
            COUNT(*) AS total_active,
            MIN(assigned_at) AS since
     FROM asset_assignments
     WHERE returned_at IS NULL
     GROUP BY holder_name, department
     ORDER BY total_active DESC, holder_name ASC`
  );
  res.json(rows.map((r) => ({ ...r, total_active: Number(r.total_active) })));
});

/**
 * ============================================================================
 *  BERITA ACARA SERAH TERIMA (BAST)
 * ============================================================================
 *  Nomor dokumen dibuat SEKALI SAJA, pada saat pertama kali dicetak — bukan
 *  saat serah terima dicatat. Kalau nomor dibuat otomatis untuk setiap baris
 *  asset_assignments, serah terima yang tidak pernah butuh dokumen formal
 *  (kebanyakan kasus internal yang santai) ikut memakai nomor urut, dan
 *  nomornya jadi berlubang-lubang tanpa alasan yang bisa dijelaskan ke
 *  auditor. Nomor yang sudah dibuat disimpan supaya cetak ulang menunjukkan
 *  nomor yang sama, bukan nomor baru setiap kali tombol Cetak ditekan.
 * ============================================================================
 */

/** Nomor berurut per tahun: BAST/2026/0001. Dihitung dari KEDUA kolom nomor
 * (serah & kembali) karena keduanya berbagi satu urutan penomoran. */
async function generateBastCode() {
  const year = new Date().getFullYear();
  const prefix = `BAST/${year}/`;

  const [rows] = await pool.query(
    `SELECT doc_no AS code FROM asset_assignments WHERE doc_no LIKE :prefix
     UNION ALL
     SELECT return_doc_no AS code FROM asset_assignments WHERE return_doc_no LIKE :prefix`,
    { prefix: `${prefix}%` }
  );

  let last = 0;
  for (const r of rows) {
    const n = Number(String(r.code).split('/')[2]);
    if (n > last) last = n;
  }
  return `${prefix}${String(last + 1).padStart(4, '0')}`;
}

// GET /api/assignments/:id/bast?type=serah|kembali
const getBast = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { type = 'serah' } = req.query;

  if (!['serah', 'kembali'].includes(type)) {
    return res.status(400).json({ message: 'Jenis berita acara tidak dikenal.' });
  }

  const [rows] = await pool.query(
    `SELECT asg.*,
            a.asset_code, a.name AS asset_name, a.brand, a.model, a.serial_number, a.condition_status,
            c.name AS category_name,
            l.name AS location_name, sl.name AS sub_location_name,
            ub.name AS assigned_by_name, ur.name AS returned_by_name
     FROM asset_assignments asg
     JOIN assets a ON a.id = asg.asset_id
     LEFT JOIN asset_categories c ON c.id = a.category_id
     LEFT JOIN locations l ON l.id = a.location_id
     LEFT JOIN sub_locations sl ON sl.id = a.sub_location_id
     LEFT JOIN users ub ON ub.id = asg.assigned_by
     LEFT JOIN users ur ON ur.id = asg.returned_by
     WHERE asg.id = :id`,
    { id }
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ message: 'Data serah terima tidak ditemukan.' });

  if (type === 'kembali' && !row.returned_at) {
    return res.status(400).json({ message: 'Aset ini belum diterima kembali — belum ada berita acara pengembalian untuk dicetak.' });
  }

  /* `column` hanya bisa jadi salah satu dari dua nilai tetap di atas (sudah
     divalidasi), bukan masukan bebas dari pengguna — aman diselipkan ke SQL. */
  const column = type === 'serah' ? 'doc_no' : 'return_doc_no';
  let docNo = row[column];

  if (!docNo) {
    docNo = await generateBastCode();
    await pool.query(`UPDATE asset_assignments SET ${column} = :docNo WHERE id = :id`, { docNo, id });

    await logAudit({
      userId: req.user.id, action: 'create', entityType: 'assignment_bast', entityId: id,
      newValues: { type, docNo, assetCode: row.asset_code, holderName: row.holder_name },
      ipAddress: req.ip,
    });
  }

  res.json({
    docNo,
    type,
    assetId: row.asset_id,
    assetCode: row.asset_code,
    assetName: row.asset_name,
    brand: row.brand,
    model: row.model,
    serialNumber: row.serial_number,
    conditionStatus: row.condition_status,
    categoryName: row.category_name,
    location: [row.location_name, row.sub_location_name].filter(Boolean).join(' · ') || null,
    holderName: row.holder_name,
    holderContact: row.holder_contact,
    department: row.department,
    assignedAt: row.assigned_at,
    assignedByName: row.assigned_by_name,
    assignNote: row.assign_note,
    returnedAt: row.returned_at,
    returnedByName: row.returned_by_name,
    returnNote: row.return_note,
    returnCondition: row.return_condition,
  });
});

module.exports = { listAssignments, checkOut, checkIn, listHolders, findActiveAssignment, getBast, performCheckOut };
