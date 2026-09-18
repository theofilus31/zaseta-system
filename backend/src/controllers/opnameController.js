const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const { toCsvCell } = require('../utils/csv');

/**
 * ============================================================================
 *  STOK OPNAME (pemeriksaan fisik aset)
 * ============================================================================
 *  Menjawab pertanyaan yang tidak bisa dijawab tabel `assets`: dari sekian
 *  aset yang tercatat, mana yang tadi benar-benar terlihat wujudnya?
 *
 *  Alurnya:
 *    1. Buka sesi  -> daftar periksa dibekukan dari catatan saat itu juga
 *    2. Periksa    -> tiap aset ditandai ditemukan / salah lokasi / tidak ada,
 *                     paling cepat dengan memindai label QR-nya
 *    3. Tutup sesi -> selisihnya jadi laporan, dan (kalau dipilih) koreksi
 *                     lokasi & kondisi ikut diterapkan ke data aset
 *
 *  Yang membuat langkah 3 penting: tanpa itu, opname cuma menghasilkan daftar
 *  temuan yang harus diketik ulang satu per satu ke form aset — pekerjaan yang
 *  dalam praktiknya tidak pernah selesai, sehingga data tetap salah meski
 *  opname-nya sudah dilakukan.
 * ============================================================================
 */

const CONDITIONS = ['baik', 'rusak_ringan', 'rusak_berat'];
const RESULTS = ['belum', 'ditemukan', 'salah_lokasi', 'tidak_ditemukan'];

/* Aset yang sudah keluar dari inventaris aktif tidak ikut diperiksa — mencari
   barang yang memang sudah dijual atau dihapuskan hanya membuang waktu petugas
   dan membuat angka "tidak ditemukan" kehilangan arti. */
const RETIRED_STATUSES = ['terjual', 'hilang', 'dihapuskan'];

/** Nomor sesi berurut per tahun: OPN/2026/0001 */
async function generateOpnameCode(tenantId) {
  const year = new Date().getFullYear();
  const [rows] = await pool.query(
    `SELECT code FROM stock_opnames
     WHERE tenant_id = :tenantId AND code LIKE :prefix
     ORDER BY code DESC LIMIT 1`,
    { tenantId, prefix: `OPN/${year}/%` }
  );
  const last = rows[0] ? Number(String(rows[0].code).split('/')[2]) : 0;
  return `OPN/${year}/${String(last + 1).padStart(4, '0')}`;
}

/** Ringkasan hitungan per hasil untuk satu sesi atau sekumpulan sesi. */
const SUMMARY_SELECT = `
  COUNT(i.id) AS total,
  COUNT(*) FILTER (WHERE i.result = 'belum')           AS belum,
  COUNT(*) FILTER (WHERE i.result = 'ditemukan')       AS ditemukan,
  COUNT(*) FILTER (WHERE i.result = 'salah_lokasi')    AS salah_lokasi,
  COUNT(*) FILTER (WHERE i.result = 'tidak_ditemukan') AS tidak_ditemukan`;

const toSummary = (row) => ({
  total: Number(row.total || 0),
  belum: Number(row.belum || 0),
  ditemukan: Number(row.ditemukan || 0),
  salahLokasi: Number(row.salah_lokasi || 0),
  tidakDitemukan: Number(row.tidak_ditemukan || 0),
});

// ---------------------------------------------------------------------------
// GET /api/opnames?status=&page=&limit=
// ---------------------------------------------------------------------------
const listOpnames = asyncHandler(async (req, res) => {
  const { status = '', page = 1, limit = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  const conditions = ['o.tenant_id = :tenantId'];
  const params = { tenantId: req.user.tenant_id };
  if (status) {
    conditions.push('o.status = :status');
    params.status = status;
  }
  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const [rows] = await pool.query(
    `SELECT o.*,
            l.name AS location_name, sl.name AS sub_location_name, c.name AS category_name,
            uc.name AS created_by_name, uf.name AS finished_by_name,
            ${SUMMARY_SELECT}
     FROM stock_opnames o
     LEFT JOIN stock_opname_items i ON i.opname_id = o.id
     LEFT JOIN locations l      ON l.id = o.scope_location_id
     LEFT JOIN sub_locations sl ON sl.id = o.scope_sub_location_id
     LEFT JOIN asset_categories c ON c.id = o.scope_category_id
     LEFT JOIN users uc ON uc.id = o.created_by
     LEFT JOIN users uf ON uf.id = o.finished_by
     ${whereClause}
     GROUP BY o.id, l.name, sl.name, c.name, uc.name, uf.name
     ORDER BY (o.status = 'berjalan') DESC, o.created_at DESC
     LIMIT :limit OFFSET :offset`,
    { ...params, limit: Number(limit), offset }
  );

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM stock_opnames o ${whereClause}`, params
  );

  res.json({
    data: rows.map((r) => ({ ...r, summary: toSummary(r) })),
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: countRows[0].total,
      totalPages: Math.ceil(countRows[0].total / Number(limit)),
    },
  });
});

// ---------------------------------------------------------------------------
// GET /api/opnames/active
// ---------------------------------------------------------------------------
/**
 * Sesi yang sedang berjalan, dipakai halaman hasil pindaian untuk memutuskan
 * apakah perlu menawarkan tombol "Tandai Ditemukan". Sengaja mengembalikan
 * daftar, bukan satu objek: opname per ruangan bisa saja berjalan paralel.
 * Kalau `assetId` diberikan, hanya sesi yang memuat aset itu yang dikembalikan.
 */
const listActiveOpnames = asyncHandler(async (req, res) => {
  const { assetId } = req.query;
  const tenantId = req.user.tenant_id;

  const [rows] = await pool.query(
    `SELECT o.id, o.code, o.name,
            ${assetId ? 'i.id AS item_id, i.result,' : ''}
            l.name AS location_name, sl.name AS sub_location_name
     FROM stock_opnames o
     ${assetId ? 'JOIN stock_opname_items i ON i.opname_id = o.id AND i.asset_id = :assetId' : ''}
     LEFT JOIN locations l      ON l.id = o.scope_location_id
     LEFT JOIN sub_locations sl ON sl.id = o.scope_sub_location_id
     WHERE o.tenant_id = :tenantId AND o.status = 'berjalan'
     ORDER BY o.created_at DESC`,
    assetId ? { assetId, tenantId } : { tenantId }
  );
  res.json(rows);
});

// ---------------------------------------------------------------------------
// GET /api/opnames/:id?result=&search=
// ---------------------------------------------------------------------------
const getOpname = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { result = '', search = '' } = req.query;
  const tenantId = req.user.tenant_id;

  const [sessions] = await pool.query(
    `SELECT o.*,
            l.name AS location_name, sl.name AS sub_location_name, c.name AS category_name,
            uc.name AS created_by_name, uf.name AS finished_by_name
     FROM stock_opnames o
     LEFT JOIN locations l      ON l.id = o.scope_location_id
     LEFT JOIN sub_locations sl ON sl.id = o.scope_sub_location_id
     LEFT JOIN asset_categories c ON c.id = o.scope_category_id
     LEFT JOIN users uc ON uc.id = o.created_by
     LEFT JOIN users uf ON uf.id = o.finished_by
     WHERE o.id = :id AND o.tenant_id = :tenantId`,
    { id, tenantId }
  );
  const session = sessions[0];
  if (!session) return res.status(404).json({ message: 'Sesi opname tidak ditemukan.' });

  /* Ringkasan dihitung dari SELURUH item, bukan dari item yang lolos saringan —
     kalau tidak, angka "sisa 12 belum diperiksa" akan ikut mengecil begitu
     petugas mengetik sesuatu di kotak cari, dan itu menyesatkan. */
  const [summaryRows] = await pool.query(
    `SELECT ${SUMMARY_SELECT} FROM stock_opname_items i WHERE i.opname_id = :id`, { id }
  );

  const itemConditions = ['i.opname_id = :id'];
  const itemParams = { id };
  if (result && RESULTS.includes(result)) {
    itemConditions.push('i.result = :result');
    itemParams.result = result;
  }
  if (search) {
    itemConditions.push('(a.name ILIKE :search OR a.asset_code ILIKE :search OR a.serial_number ILIKE :search)');
    itemParams.search = `%${search}%`;
  }

  const [items] = await pool.query(
    `SELECT i.*,
            a.asset_code, a.name AS asset_name, a.brand, a.model, a.serial_number, a.status AS asset_status,
            el.name AS expected_location_name, esl.name AS expected_sub_location_name,
            fl.name AS found_location_name,    fsl.name AS found_sub_location_name,
            u.name AS checked_by_name
     FROM stock_opname_items i
     JOIN assets a ON a.id = i.asset_id
     LEFT JOIN locations el      ON el.id = i.expected_location_id
     LEFT JOIN sub_locations esl ON esl.id = i.expected_sub_location_id
     LEFT JOIN locations fl      ON fl.id = i.found_location_id
     LEFT JOIN sub_locations fsl ON fsl.id = i.found_sub_location_id
     LEFT JOIN users u ON u.id = i.checked_by
     WHERE ${itemConditions.join(' AND ')}
     ORDER BY CASE i.result
                WHEN 'belum' THEN 0 WHEN 'salah_lokasi' THEN 1
                WHEN 'tidak_ditemukan' THEN 2 WHEN 'ditemukan' THEN 3 ELSE 4 END,
              a.asset_code ASC`,
    itemParams
  );

  res.json({ ...session, summary: toSummary(summaryRows[0]), items });
});

// ---------------------------------------------------------------------------
// POST /api/opnames
// ---------------------------------------------------------------------------
const createOpname = asyncHandler(async (req, res) => {
  const { name, locationId, subLocationId, categoryId, notes } = req.body;
  const tenantId = req.user.tenant_id;

  if (!String(name || '').trim()) {
    return res.status(400).json({ message: 'Nama sesi opname wajib diisi.' });
  }

  // locationId/subLocationId/categoryId datang dari input pemakai — pastikan benar-benar milik tenant ini.
  if (locationId) {
    const [r] = await pool.query(`SELECT id FROM locations WHERE id = :locationId AND tenant_id = :tenantId`, { locationId, tenantId });
    if (!r[0]) return res.status(400).json({ message: 'Lokasi tidak valid.' });
  }
  if (subLocationId) {
    const [r] = await pool.query(`SELECT id FROM sub_locations WHERE id = :subLocationId AND tenant_id = :tenantId`, { subLocationId, tenantId });
    if (!r[0]) return res.status(400).json({ message: 'Sub lokasi tidak valid.' });
  }
  if (categoryId) {
    const [r] = await pool.query(`SELECT id FROM asset_categories WHERE id = :categoryId AND tenant_id = :tenantId`, { categoryId, tenantId });
    if (!r[0]) return res.status(400).json({ message: 'Kode barang/aset tidak valid.' });
  }

  /* Dua sesi berjalan atas ruangan yang sama akan saling menimpa kesimpulan:
     petugas memindai aset di sesi A, lalu sesi B tetap menganggapnya belum
     diperiksa. Cukup satu sesi berjalan per cakupan. */
  const [running] = await pool.query(
    `SELECT id, code, name FROM stock_opnames
     WHERE tenant_id = :tenantId
       AND status = 'berjalan'
       AND scope_location_id IS NOT DISTINCT FROM :locationId
       AND scope_sub_location_id IS NOT DISTINCT FROM :subLocationId
       AND scope_category_id IS NOT DISTINCT FROM :categoryId
     LIMIT 1`,
    {
      tenantId,
      locationId: locationId || null,
      subLocationId: subLocationId || null,
      categoryId: categoryId || null,
    }
  );
  if (running[0]) {
    return res.status(409).json({
      message: `Sesi "${running[0].name}" (${running[0].code}) dengan cakupan yang sama masih berjalan. Selesaikan dulu sesi itu.`,
    });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const code = await generateOpnameCode(tenantId);
    const [result] = await conn.query(
      `INSERT INTO stock_opnames
         (tenant_id, code, name, scope_location_id, scope_sub_location_id, scope_category_id, notes, created_by)
       VALUES (:tenantId, :code, :name, :locationId, :subLocationId, :categoryId, :notes, :userId)
       RETURNING id`,
      {
        tenantId,
        code,
        name: name.trim(),
        locationId: locationId || null,
        subLocationId: subLocationId || null,
        categoryId: categoryId || null,
        notes: notes || null,
        userId: req.user.id,
      }
    );
    const opnameId = result.insertId;

    /* Pembekuan daftar periksa. Lokasi & kondisi disalin apa adanya supaya
       nanti bisa dibandingkan dengan temuan lapangan. */
    const scopeConditions = ['a.tenant_id = :tenantId', 'a.deleted_at IS NULL', `a.status NOT IN ('${RETIRED_STATUSES.join("','")}')`];
    const scopeParams = { opnameId, tenantId };
    if (locationId) { scopeConditions.push('a.location_id = :locationId'); scopeParams.locationId = locationId; }
    if (subLocationId) { scopeConditions.push('a.sub_location_id = :subLocationId'); scopeParams.subLocationId = subLocationId; }
    if (categoryId) { scopeConditions.push('a.category_id = :categoryId'); scopeParams.categoryId = categoryId; }

    const [snapshot] = await conn.query(
      `INSERT INTO stock_opname_items
         (opname_id, asset_id, expected_location_id, expected_sub_location_id, expected_condition)
       SELECT :opnameId, a.id, a.location_id, a.sub_location_id, a.condition_status
       FROM assets a
       WHERE ${scopeConditions.join(' AND ')}`,
      scopeParams
    );

    if (snapshot.affectedRows === 0) {
      /* Sesi tanpa satu pun aset tidak ada gunanya, dan kalau dibiarkan akan
         langsung tampil "100% selesai" — kesimpulan yang jelas salah. */
      await conn.rollback();
      return res.status(400).json({
        message: 'Tidak ada aset aktif yang masuk cakupan ini. Periksa lagi pilihan lokasi/kategorinya.',
      });
    }

    await conn.commit();

    await logAudit({
      userId: req.user.id, action: 'create', entityType: 'stock_opname', entityId: opnameId,
      newValues: { code, name, locationId, subLocationId, categoryId, totalAset: snapshot.affectedRows },
      ipAddress: req.ip,
    });

    res.status(201).json({
      id: opnameId, code, total: snapshot.affectedRows,
      message: `Sesi ${code} dibuka dengan ${snapshot.affectedRows} aset untuk diperiksa.`,
    });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// ---------------------------------------------------------------------------
// Penandaan satu item
// ---------------------------------------------------------------------------
/**
 * Menyimpan hasil pemeriksaan satu aset.
 *
 * Kalau petugas tidak menyebut lokasi temuan, lokasi cakupan sesi dipakai
 * sebagai anggapan — karena petugas memang sedang berdiri di ruangan itu.
 * Selisih lokasi dihitung sistem, bukan diputuskan petugas: begitu lokasi
 * temuan berbeda dari catatan, hasilnya otomatis jadi "salah lokasi".
 */
async function applyCheck(session, item, body, userId) {
  const {
    result: requested, foundLocationId, foundSubLocationId, foundCondition, note,
  } = body;

  if (requested && !RESULTS.includes(requested)) {
    return { error: 'Hasil pemeriksaan tidak dikenali.' };
  }
  if (foundCondition && !CONDITIONS.includes(foundCondition)) {
    return { error: 'Kondisi temuan tidak valid.' };
  }

  let result = requested || 'ditemukan';
  let locId = foundLocationId ?? null;
  let subId = foundSubLocationId ?? null;

  if (result === 'tidak_ditemukan') {
    locId = null;
    subId = null;
  } else if (result !== 'belum') {
    if (locId === null && subId === null) {
      locId = session.scope_location_id ?? item.expected_location_id;
      subId = session.scope_sub_location_id ?? item.expected_sub_location_id;
    }
    const pindah = String(locId ?? '') !== String(item.expected_location_id ?? '')
                || String(subId ?? '') !== String(item.expected_sub_location_id ?? '');
    result = pindah ? 'salah_lokasi' : 'ditemukan';
  }

  await pool.query(
    `UPDATE stock_opname_items
     SET result = :result,
         found_location_id = :locId, found_sub_location_id = :subId,
         found_condition = :foundCondition,
         note = :note, checked_by = :userId, checked_at = NOW()
     WHERE id = :itemId`,
    {
      itemId: item.id, result, locId, subId,
      foundCondition: foundCondition || null,
      note: note || null,
      userId,
    }
  );

  return { result };
}

/** Ambil sesi + item, sekaligus tolak kalau sesinya sudah ditutup. */
async function loadOpenSession(opnameId, tenantId) {
  const [rows] = await pool.query(`SELECT * FROM stock_opnames WHERE id = :id AND tenant_id = :tenantId`, { id: opnameId, tenantId });
  const session = rows[0];
  if (!session) return { error: { code: 404, message: 'Sesi opname tidak ditemukan.' } };
  if (session.status !== 'berjalan') {
    return { error: { code: 400, message: `Sesi ini sudah ${session.status}. Tidak bisa diubah lagi.` } };
  }
  return { session };
}

// PUT /api/opnames/:id/items/:itemId
const checkItem = asyncHandler(async (req, res) => {
  const { id, itemId } = req.params;

  const { session, error } = await loadOpenSession(id, req.user.tenant_id);
  if (error) return res.status(error.code).json({ message: error.message });

  const [items] = await pool.query(
    `SELECT * FROM stock_opname_items WHERE id = :itemId AND opname_id = :id`, { itemId, id }
  );
  if (!items[0]) return res.status(404).json({ message: 'Aset ini tidak ada di daftar periksa sesi tersebut.' });

  const outcome = await applyCheck(session, items[0], req.body, req.user.id);
  if (outcome.error) return res.status(400).json({ message: outcome.error });

  res.json({ result: outcome.result, message: 'Hasil pemeriksaan tersimpan.' });
});

// POST /api/opnames/:id/scan  { code } — jalur cepat dari pemindaian label
const scanItem = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { code } = req.body;
  const tenantId = req.user.tenant_id;

  if (!code) return res.status(400).json({ message: 'Kode QR wajib disertakan.' });

  const { session, error } = await loadOpenSession(id, tenantId);
  if (error) return res.status(error.code).json({ message: error.message });

  // Ikut memfilter tenant lewat join ke assets — kalau tidak, kode QR aset milik
  // tenant lain akan lolos dianggap "dikenali" lalu bocor ke fallback di bawah.
  const [qrRows] = await pool.query(
    `SELECT q.asset_id FROM qr_codes q JOIN assets a ON a.id = q.asset_id
     WHERE q.code = :code AND a.tenant_id = :tenantId LIMIT 1`,
    { code, tenantId }
  );
  if (!qrRows[0]) return res.status(404).json({ message: 'Kode QR tidak dikenali.' });

  const [items] = await pool.query(
    `SELECT i.*, a.name AS asset_name, a.asset_code
     FROM stock_opname_items i JOIN assets a ON a.id = i.asset_id
     WHERE i.opname_id = :id AND i.asset_id = :assetId`,
    { id, assetId: qrRows[0].asset_id }
  );
  const item = items[0];

  /* Aset yang terpindai tapi tidak ada di daftar periksa adalah temuan yang
     justru penting: barang dari ruangan lain yang nyasar ke sini. Ditolak
     dengan pesan yang menyebutkan asetnya, bukan sekadar "tidak ditemukan",
     supaya petugas tahu harus mengembalikannya ke mana. */
  if (!item) {
    const [assetRows] = await pool.query(
      `SELECT a.asset_code, a.name, l.name AS location_name, sl.name AS sub_location_name
       FROM assets a
       LEFT JOIN locations l ON l.id = a.location_id
       LEFT JOIN sub_locations sl ON sl.id = a.sub_location_id
       WHERE a.id = :assetId`,
      { assetId: qrRows[0].asset_id }
    );
    const a = assetRows[0];
    const tempat = [a?.location_name, a?.sub_location_name].filter(Boolean).join(' · ') || 'lokasi tak tercatat';
    return res.status(404).json({
      message: a
        ? `${a.name} (${a.asset_code}) di luar cakupan sesi ini — tercatat di ${tempat}.`
        : 'Aset untuk kode ini sudah tidak ada.',
      outOfScope: true,
    });
  }

  const outcome = await applyCheck(session, item, req.body, req.user.id);
  if (outcome.error) return res.status(400).json({ message: outcome.error });

  res.json({
    itemId: item.id,
    assetName: item.asset_name,
    assetCode: item.asset_code,
    result: outcome.result,
    alreadyChecked: item.result !== 'belum',
    message: `${item.asset_name} ditandai ${outcome.result === 'salah_lokasi' ? 'salah lokasi' : 'ditemukan'}.`,
  });
});

// ---------------------------------------------------------------------------
// POST /api/opnames/:id/finish
// ---------------------------------------------------------------------------
/**
 * Menutup sesi dan (opsional) menerapkan temuannya ke data aset.
 *
 * Penerapan dipisah jadi tiga pilihan terpisah karena kepercayaan terhadap
 * masing-masing temuan berbeda: memindahkan lokasi di catatan itu murni
 * pembetulan administratif, sedangkan menandai aset HILANG punya konsekuensi
 * (nilai bukunya berhenti, butuh berita acara) — jadi tidak boleh ikut
 * terjadi hanya karena petugas menekan "Selesaikan".
 */
const finishOpname = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { applyLocation = false, applyCondition = false, markMissingAsLost = false, notes } = req.body;

  const { session, error } = await loadOpenSession(id, req.user.tenant_id);
  if (error) return res.status(error.code).json({ message: error.message });

  const [pendingRows] = await pool.query(
    `SELECT COUNT(*) AS sisa FROM stock_opname_items WHERE opname_id = :id AND result = 'belum'`, { id }
  );
  const sisa = Number(pendingRows[0].sisa);

  const applied = { lokasi: 0, kondisi: 0, hilang: 0, belumDiperiksa: sisa };

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (applyLocation) {
      const [items] = await conn.query(
        `SELECT asset_id, found_location_id, found_sub_location_id
         FROM stock_opname_items
         WHERE opname_id = :id AND result = 'salah_lokasi'`,
        { id }
      );
      for (const it of items) {
        await conn.query(
          `UPDATE assets SET location_id = :locId, sub_location_id = :subId, updated_by = :userId
           WHERE id = :assetId`,
          { assetId: it.asset_id, locId: it.found_location_id, subId: it.found_sub_location_id, userId: req.user.id }
        );
        applied.lokasi += 1;
      }
    }

    if (applyCondition) {
      const [items] = await conn.query(
        `SELECT i.asset_id, i.found_condition
         FROM stock_opname_items i JOIN assets a ON a.id = i.asset_id
         WHERE i.opname_id = :id
           AND i.found_condition IS NOT NULL
           AND i.found_condition <> a.condition_status`,
        { id }
      );
      for (const it of items) {
        await conn.query(
          `UPDATE assets SET condition_status = :cond, updated_by = :userId WHERE id = :assetId`,
          { assetId: it.asset_id, cond: it.found_condition, userId: req.user.id }
        );
        applied.kondisi += 1;
      }
    }

    if (markMissingAsLost) {
      const [items] = await conn.query(
        `SELECT i.asset_id, i.note, a.status
         FROM stock_opname_items i JOIN assets a ON a.id = i.asset_id
         WHERE i.opname_id = :id AND i.result = 'tidak_ditemukan' AND a.status <> 'hilang'`,
        { id }
      );
      for (const it of items) {
        /* retired_reason wajib untuk status "hilang" (lihat assetController).
           Diisi rujukan ke sesi opname-nya supaya jejaknya bisa ditelusuri
           balik ke pemeriksaan mana yang menyimpulkan barang ini hilang. */
        await conn.query(
          `UPDATE assets
           SET status = 'hilang', retired_date = CURRENT_DATE,
               retired_reason = :reason, updated_by = :userId
           WHERE id = :assetId`,
          {
            assetId: it.asset_id,
            reason: it.note || `Tidak ditemukan pada stok opname ${session.code}`,
            userId: req.user.id,
          }
        );
        await conn.query(
          `INSERT INTO asset_status_histories (asset_id, old_status, new_status, changed_by, notes)
           VALUES (:assetId, :oldStatus, 'hilang', :userId, :notes)`,
          {
            assetId: it.asset_id, oldStatus: it.status, userId: req.user.id,
            notes: `Tidak ditemukan pada stok opname ${session.code}`,
          }
        );
        applied.hilang += 1;
      }
    }

    await conn.query(
      `UPDATE stock_opnames
       SET status = 'selesai', finished_at = NOW(), finished_by = :userId,
           notes = COALESCE(:notes, notes)
       WHERE id = :id AND tenant_id = :tenantId`,
      { id, tenantId: req.user.tenant_id, userId: req.user.id, notes: notes || null }
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  await logAudit({
    userId: req.user.id, action: 'update', entityType: 'stock_opname', entityId: id,
    oldValues: { status: 'berjalan' },
    newValues: { status: 'selesai', diterapkan: applied },
    ipAddress: req.ip,
  });

  res.json({ message: `Sesi ${session.code} ditutup.`, applied });
});

// POST /api/opnames/:id/cancel
const cancelOpname = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { session, error } = await loadOpenSession(id, req.user.tenant_id);
  if (error) return res.status(error.code).json({ message: error.message });

  await pool.query(
    `UPDATE stock_opnames SET status = 'dibatalkan', finished_at = NOW(), finished_by = :userId WHERE id = :id AND tenant_id = :tenantId`,
    { id, tenantId: req.user.tenant_id, userId: req.user.id }
  );

  await logAudit({
    userId: req.user.id, action: 'update', entityType: 'stock_opname', entityId: id,
    oldValues: { status: 'berjalan' }, newValues: { status: 'dibatalkan' }, ipAddress: req.ip,
  });

  res.json({ message: `Sesi ${session.code} dibatalkan.` });
});

// DELETE /api/opnames/:id
const deleteOpname = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenant_id;

  const [rows] = await pool.query(`SELECT * FROM stock_opnames WHERE id = :id AND tenant_id = :tenantId`, { id, tenantId });
  const session = rows[0];
  if (!session) return res.status(404).json({ message: 'Sesi opname tidak ditemukan.' });

  /* Sesi yang sudah selesai adalah bukti pemeriksaan — itulah seluruh alasan
     opname dikerjakan. Yang boleh dibuang hanya sesi yang belum menghasilkan
     kesimpulan apa pun. */
  if (session.status === 'selesai') {
    return res.status(400).json({
      message: 'Sesi yang sudah selesai tidak bisa dihapus karena menjadi bukti pemeriksaan.',
    });
  }

  await pool.query(`DELETE FROM stock_opnames WHERE id = :id AND tenant_id = :tenantId`, { id, tenantId });

  await logAudit({
    userId: req.user.id, action: 'delete', entityType: 'stock_opname', entityId: id,
    oldValues: { code: session.code, name: session.name, status: session.status }, ipAddress: req.ip,
  });

  res.json({ message: `Sesi ${session.code} dihapus.` });
});

// ---------------------------------------------------------------------------
// GET /api/opnames/:id/export — laporan selisih (CSV)
// ---------------------------------------------------------------------------
const exportOpname = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenant_id;

  const [sessions] = await pool.query(`SELECT * FROM stock_opnames WHERE id = :id AND tenant_id = :tenantId`, { id, tenantId });
  const session = sessions[0];
  if (!session) return res.status(404).json({ message: 'Sesi opname tidak ditemukan.' });

  const [rows] = await pool.query(
    `SELECT a.asset_code, a.name AS asset_name, a.brand, a.model, a.serial_number,
            i.result, i.expected_condition, i.found_condition, i.note, i.checked_at,
            el.name AS expected_location_name, esl.name AS expected_sub_location_name,
            fl.name AS found_location_name,    fsl.name AS found_sub_location_name,
            u.name AS checked_by_name
     FROM stock_opname_items i
     JOIN assets a ON a.id = i.asset_id
     LEFT JOIN locations el      ON el.id = i.expected_location_id
     LEFT JOIN sub_locations esl ON esl.id = i.expected_sub_location_id
     LEFT JOIN locations fl      ON fl.id = i.found_location_id
     LEFT JOIN sub_locations fsl ON fsl.id = i.found_sub_location_id
     LEFT JOIN users u ON u.id = i.checked_by
     WHERE i.opname_id = :id
     ORDER BY CASE i.result
                WHEN 'tidak_ditemukan' THEN 0 WHEN 'salah_lokasi' THEN 1
                WHEN 'belum' THEN 2 WHEN 'ditemukan' THEN 3 ELSE 4 END,
              a.asset_code ASC`,
    { id }
  );

  const RESULT_LABEL = {
    belum: 'Belum Diperiksa', ditemukan: 'Ditemukan',
    salah_lokasi: 'Salah Lokasi', tidak_ditemukan: 'Tidak Ditemukan',
  };
  const CONDITION_LABEL = { baik: 'Baik', rusak_ringan: 'Rusak Ringan', rusak_berat: 'Rusak Berat' };

  const headers = [
    'Kode Aset', 'Nama Aset', 'Brand', 'Model', 'Nomor Seri', 'Hasil',
    'Lokasi Tercatat', 'Sub Lokasi Tercatat', 'Lokasi Temuan', 'Sub Lokasi Temuan',
    'Kondisi Tercatat', 'Kondisi Temuan', 'Catatan', 'Diperiksa Oleh', 'Waktu Periksa',
  ];

  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      r.asset_code, r.asset_name, r.brand, r.model, r.serial_number,
      RESULT_LABEL[r.result] || r.result,
      r.expected_location_name, r.expected_sub_location_name,
      r.found_location_name, r.found_sub_location_name,
      CONDITION_LABEL[r.expected_condition] || r.expected_condition,
      CONDITION_LABEL[r.found_condition] || r.found_condition,
      r.note, r.checked_by_name,
      r.checked_at ? new Date(r.checked_at).toISOString().slice(0, 16).replace('T', ' ') : '',
    ].map(toCsvCell).join(','));
  }

  await logAudit({
    userId: req.user.id, action: 'export', entityType: 'stock_opname', entityId: id,
    newValues: { code: session.code, jumlahBaris: rows.length }, ipAddress: req.ip,
  });

  const fileName = `${session.code.replace(/\//g, '-')}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  // BOM supaya Excel di Windows membaca UTF-8, bukan menebak encoding lokal.
  res.send('﻿' + lines.join('\r\n'));
});

module.exports = {
  listOpnames, listActiveOpnames, getOpname, createOpname,
  checkItem, scanItem, finishOpname, cancelOpname, deleteOpname, exportOpname,
};
