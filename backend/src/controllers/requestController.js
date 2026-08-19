const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const { performCheckOut } = require('./assignmentController');

/**
 * ============================================================================
 *  PERMINTAAN ASET
 * ============================================================================
 *  Selama ini satu-satunya cara aset berpindah tangan adalah GA yang
 *  memutuskan sendiri "serahkan ini ke orang itu". Tidak ada jalur untuk arah
 *  sebaliknya: karyawan MEMINTA sesuatu, lalu permintaannya ditinjau sebelum
 *  benar-benar dipenuhi.
 *
 *  Alurnya: diajukan -> disetujui/ditolak -> dipenuhi (dari disetujui)
 *  Begitu dipenuhi, permintaan ini sungguh-sungguh menjadi penugasan aset
 *  biasa (asset_assignments) lewat performCheckOut() yang sama dipakai
 *  halaman Serahkan Aset — bukan catatan yang berdiri sendiri dan berbeda
 *  aturan dari serah terima biasa.
 * ============================================================================
 */

const PRIORITY_LABEL = { rendah: 'Rendah', sedang: 'Sedang', tinggi: 'Tinggi' };
const STATUS_LABEL = { diajukan: 'Diajukan', disetujui: 'Disetujui', ditolak: 'Ditolak', dipenuhi: 'Dipenuhi', dibatalkan: 'Dibatalkan' };
const PRIORITIES = Object.keys(PRIORITY_LABEL);

async function generateRequestCode() {
  const year = new Date().getFullYear();
  const [rows] = await pool.query(
    `SELECT request_no FROM asset_requests WHERE request_no LIKE :prefix ORDER BY request_no DESC LIMIT 1`,
    { prefix: `REQ/${year}/%` }
  );
  const last = rows[0] ? Number(String(rows[0].request_no).split('/')[2]) : 0;
  return `REQ/${year}/${String(last + 1).padStart(4, '0')}`;
}

function toItem(row) {
  return {
    id: row.id,
    requestNo: row.request_no,
    requesterName: row.requester_name,
    department: row.department,
    categoryId: row.category_id,
    categoryName: row.category_name || null,
    itemName: row.item_name,
    reason: row.reason,
    priority: row.priority,
    priorityLabel: PRIORITY_LABEL[row.priority] || row.priority,
    neededBy: row.needed_by,
    status: row.status,
    statusLabel: STATUS_LABEL[row.status] || row.status,
    reviewNote: row.review_note,
    reviewedBy: row.reviewed_by_name || null,
    reviewedAt: row.reviewed_at,
    fulfilledAssetId: row.fulfilled_asset_id,
    fulfilledAssetCode: row.fulfilled_asset_code || null,
    fulfilledAssetName: row.fulfilled_asset_name || null,
    fulfilledBy: row.fulfilled_by_name || null,
    fulfilledAt: row.fulfilled_at,
    createdBy: row.created_by_name || null,
    createdAt: row.created_at,
  };
}

const SELECT_ITEM = `
  SELECT r.*, c.name AS category_name,
         a.asset_code AS fulfilled_asset_code, a.name AS fulfilled_asset_name,
         ur.name AS reviewed_by_name, uf.name AS fulfilled_by_name, uc.name AS created_by_name
  FROM asset_requests r
  LEFT JOIN asset_categories c ON c.id = r.category_id
  LEFT JOIN assets a           ON a.id = r.fulfilled_asset_id
  LEFT JOIN users ur           ON ur.id = r.reviewed_by
  LEFT JOIN users uf           ON uf.id = r.fulfilled_by
  LEFT JOIN users uc           ON uc.id = r.created_by`;

// GET /api/requests?status=&search=&page=&limit=
const listRequests = asyncHandler(async (req, res) => {
  const { status = '', search = '', page = 1, limit = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  const conditions = [];
  const params = {};
  if (status) { conditions.push('r.status = :status'); params.status = status; }
  if (search) {
    conditions.push('(r.item_name LIKE :search OR r.requester_name LIKE :search OR r.request_no LIKE :search)');
    params.search = `%${search}%`;
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `${SELECT_ITEM} ${whereClause}
     ORDER BY (r.status = 'diajukan') DESC, r.created_at DESC
     LIMIT :limit OFFSET :offset`,
    { ...params, limit: Number(limit), offset }
  );
  const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM asset_requests r ${whereClause}`, params);

  res.json({
    data: rows.map(toItem),
    pagination: {
      page: Number(page), limit: Number(limit),
      total: countRows[0].total, totalPages: Math.ceil(countRows[0].total / Number(limit)),
    },
  });
});

// GET /api/requests/:id
const getRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [rows] = await pool.query(`${SELECT_ITEM} WHERE r.id = :id`, { id });
  if (!rows[0]) return res.status(404).json({ message: 'Permintaan tidak ditemukan.' });
  res.json(toItem(rows[0]));
});

// POST /api/requests
/**
 * Inti dari pengajuan permintaan, dipisah dari handler HTTP-nya supaya bisa
 * dipanggil dari tempat lain — persisnya, dari zecodeController saat Zecode
 * membantu mengajukan permintaan atas nama pengguna (setelah dikonfirmasi
 * pengguna, bukan otomatis). Melempar Error ber-`.status` seperti pola yang
 * sama dipakai performCheckOut di assignmentController.
 */
async function performCreateRequest({ requesterName, department, categoryId, itemName, reason, priority = 'sedang', neededBy, userId, ip }) {
  if (!String(requesterName || '').trim()) { const err = new Error('Nama peminta wajib diisi.'); err.status = 400; throw err; }
  if (!String(itemName || '').trim()) { const err = new Error('Nama barang yang diminta wajib diisi.'); err.status = 400; throw err; }
  if (!PRIORITIES.includes(priority)) { const err = new Error('Prioritas tidak dikenal.'); err.status = 400; throw err; }

  const requestNo = await generateRequestCode();
  const [result] = await pool.query(
    `INSERT INTO asset_requests
       (request_no, requester_name, department, category_id, item_name, reason, priority, needed_by, created_by)
     VALUES (:requestNo, :requesterName, :department, :categoryId, :itemName, :reason, :priority, :neededBy, :userId)`,
    {
      requestNo, requesterName: requesterName.trim(), department: department || null,
      categoryId: categoryId || null, itemName: itemName.trim(), reason: reason || null,
      priority, neededBy: neededBy || null, userId,
    }
  );

  await logAudit({
    userId, action: 'create', entityType: 'asset_request', entityId: result.insertId,
    newValues: { requestNo, requesterName, itemName, priority }, ipAddress: ip,
  });

  const [rows] = await pool.query(`${SELECT_ITEM} WHERE r.id = :id`, { id: result.insertId });
  return toItem(rows[0]);
}

// POST /api/requests
const createRequest = asyncHandler(async (req, res) => {
  const { requesterName, department, categoryId, itemName, reason, priority, neededBy } = req.body;
  const item = await performCreateRequest({
    requesterName, department, categoryId, itemName, reason, priority, neededBy,
    userId: req.user.id, ip: req.ip,
  });
  res.status(201).json({ message: `Permintaan ${item.requestNo} berhasil diajukan.`, ...item });
});

/** Ambil permintaan, sekaligus tolak kalau statusnya bukan yang diharapkan. */
async function loadRequestWithStatus(id, expectedStatuses) {
  const [rows] = await pool.query(`SELECT * FROM asset_requests WHERE id = :id`, { id });
  const row = rows[0];
  if (!row) return { error: { code: 404, message: 'Permintaan tidak ditemukan.' } };
  if (!expectedStatuses.includes(row.status)) {
    return {
      error: {
        code: 400,
        message: `Permintaan ini berstatus "${STATUS_LABEL[row.status]}", tindakan ini tidak berlaku lagi.`,
      },
    };
  }
  return { row };
}

// PUT /api/requests/:id/approve
const approveRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reviewNote } = req.body;

  const { row, error } = await loadRequestWithStatus(id, ['diajukan']);
  if (error) return res.status(error.code).json({ message: error.message });

  await pool.query(
    `UPDATE asset_requests SET status = 'disetujui', review_note = :reviewNote, reviewed_by = :userId, reviewed_at = NOW() WHERE id = :id`,
    { id, reviewNote: reviewNote || null, userId: req.user.id }
  );

  await logAudit({
    userId: req.user.id, action: 'update', entityType: 'asset_request', entityId: id,
    oldValues: { status: 'diajukan' }, newValues: { status: 'disetujui', reviewNote }, ipAddress: req.ip,
  });

  res.json({ message: `Permintaan ${row.request_no} disetujui.` });
});

// PUT /api/requests/:id/reject
const rejectRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reviewNote } = req.body;

  if (!String(reviewNote || '').trim()) {
    return res.status(400).json({ message: 'Alasan penolakan wajib diisi.' });
  }

  const { row, error } = await loadRequestWithStatus(id, ['diajukan']);
  if (error) return res.status(error.code).json({ message: error.message });

  await pool.query(
    `UPDATE asset_requests SET status = 'ditolak', review_note = :reviewNote, reviewed_by = :userId, reviewed_at = NOW() WHERE id = :id`,
    { id, reviewNote: reviewNote.trim(), userId: req.user.id }
  );

  await logAudit({
    userId: req.user.id, action: 'update', entityType: 'asset_request', entityId: id,
    oldValues: { status: 'diajukan' }, newValues: { status: 'ditolak', reviewNote }, ipAddress: req.ip,
  });

  res.json({ message: `Permintaan ${row.request_no} ditolak.` });
});

// PUT /api/requests/:id/fulfill — { assetId, assignedAt, assignNote }
// "Penuhi" dan "serahkan aset"-nya sekarang satu transaksi (lewat `conn` yang
// dioper ke performCheckOut) — sebelumnya dua operasi terpisah, jadi proses
// yang terhenti di antara keduanya bisa meninggalkan aset yang sudah
// terserahkan tapi permintaannya tetap "disetujui" selamanya: tidak bisa
// dipenuhi ulang (performCheckOut akan menolak, asetnya sudah dipegang orang)
// dan tidak ada cara memperbaikinya lewat aplikasi selain mengutak-atik
// database langsung.
const fulfillRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { assetId, assignedAt, assignNote } = req.body;

  if (!assetId) return res.status(400).json({ message: 'Pilih aset yang akan diserahkan.' });

  const { row, error } = await loadRequestWithStatus(id, ['disetujui']);
  if (error) return res.status(error.code).json({ message: error.message });

  const conn = await pool.getConnection();
  let assignmentId, assetName;
  try {
    await conn.beginTransaction();

    /* Menyerahkan aset lewat jalur yang PERSIS sama dengan halaman Serahkan
       Aset biasa — aturan kondisi aset, penugasan ganda, dan riwayat status
       otomatis ikut berlaku tanpa perlu ditulis ulang di sini. Dioper `conn`
       supaya bagian ini TIDAK commit sendiri — menunggu UPDATE permintaan
       di bawah ikut berhasil dulu. */
    ({ assignmentId, assetName } = await performCheckOut({
      assetId, holderName: row.requester_name, department: row.department,
      assignedAt, assignNote: assignNote || `Memenuhi permintaan ${row.request_no}`,
      userId: req.user.id, ip: req.ip, conn,
    }));

    await conn.query(
      `UPDATE asset_requests
       SET status = 'dipenuhi', fulfilled_asset_id = :assetId, fulfilled_by = :userId, fulfilled_at = NOW()
       WHERE id = :id`,
      { id, assetId, userId: req.user.id }
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  await logAudit({
    userId: req.user.id, action: 'create', entityType: 'asset_assignment', entityId: assignmentId,
    newValues: { assetId, holderName: row.requester_name, department: row.department }, ipAddress: req.ip,
  });
  await logAudit({
    userId: req.user.id, action: 'update', entityType: 'asset_request', entityId: id,
    oldValues: { status: 'disetujui' }, newValues: { status: 'dipenuhi', assetId, assignmentId }, ipAddress: req.ip,
  });

  res.json({ message: `Permintaan ${row.request_no} dipenuhi dengan ${assetName}, diserahkan kepada ${row.requester_name}.` });
});

// PUT /api/requests/:id/cancel
const cancelRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { row, error } = await loadRequestWithStatus(id, ['diajukan', 'disetujui']);
  if (error) return res.status(error.code).json({ message: error.message });

  await pool.query(`UPDATE asset_requests SET status = 'dibatalkan' WHERE id = :id`, { id });

  await logAudit({
    userId: req.user.id, action: 'update', entityType: 'asset_request', entityId: id,
    oldValues: { status: row.status }, newValues: { status: 'dibatalkan' }, ipAddress: req.ip,
  });

  res.json({ message: `Permintaan ${row.request_no} dibatalkan.` });
});

// DELETE /api/requests/:id — hanya kalau belum pernah ditinjau
const deleteRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [rows] = await pool.query(`SELECT * FROM asset_requests WHERE id = :id`, { id });
  const row = rows[0];
  if (!row) return res.status(404).json({ message: 'Permintaan tidak ditemukan.' });

  if (row.status !== 'diajukan') {
    return res.status(400).json({
      message: `Permintaan yang sudah ${STATUS_LABEL[row.status].toLowerCase()} tidak bisa dihapus — riwayatnya harus tetap ada.`,
    });
  }

  await pool.query(`DELETE FROM asset_requests WHERE id = :id`, { id });

  await logAudit({
    userId: req.user.id, action: 'delete', entityType: 'asset_request', entityId: id,
    oldValues: { requestNo: row.request_no, itemName: row.item_name }, ipAddress: req.ip,
  });

  res.json({ message: `Permintaan ${row.request_no} dihapus.` });
});

module.exports = {
  PRIORITY_LABEL, STATUS_LABEL,
  listRequests, getRequest, createRequest, approveRequest, rejectRequest, fulfillRequest, cancelRequest, deleteRequest,
  performCreateRequest,
};
