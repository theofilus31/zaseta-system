const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { clampPagination } = require('../utils/pagination');

/**
 * GET /api/audit-logs?action=&entityType=&userId=&search=&dateFrom=&dateTo=&page=&limit=
 *
 * Tabel audit_logs sudah terisi sejak awal oleh seluruh controller, tapi belum
 * pernah ada cara membacanya selain lewat SQL langsung. Endpoint ini membuka
 * data itu untuk halaman Riwayat Aktivitas — pertanyaan macam "siapa yang
 * menghapus aset ini?" jadi bisa dijawab tanpa membuka database.
 *
 * old_values/new_values ikut dikirim supaya UI bisa menampilkan
 * perbandingan sebelum/sesudah pada setiap perubahan.
 */
const listAuditLogs = asyncHandler(async (req, res) => {
  const { action, entityType, userId, search = '', dateFrom, dateTo } = req.query;
  const { page, limit } = clampPagination(req.query, { defaultLimit: 25 });
  const offset = (page - 1) * limit;
  const conditions = ['al.tenant_id = :tenantId'];
  const params = { tenantId: req.user.tenant_id };

  if (action) {
    conditions.push('al.action = :action');
    params.action = action;
  }
  if (entityType) {
    conditions.push('al.entity_type = :entityType');
    params.entityType = entityType;
  }
  if (userId) {
    conditions.push('al.user_id = :userId');
    params.userId = userId;
  }
  if (search) {
    // Cari berdasarkan nama pelaku atau nomor entitas yang disentuh
    conditions.push('(u.name ILIKE :searchLike OR al.entity_id = :searchExact)');
    params.searchLike = `%${search}%`;
    // entity_id bertipe angka; kirim 0 kalau kata kuncinya bukan angka agar tidak error
    params.searchExact = /^\d+$/.test(search) ? Number(search) : 0;
  }
  if (dateFrom) {
    conditions.push('al.created_at >= :dateFrom');
    params.dateFrom = `${dateFrom} 00:00:00`;
  }
  if (dateTo) {
    conditions.push('al.created_at <= :dateTo');
    params.dateTo = `${dateTo} 23:59:59`;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT al.id, al.action, al.entity_type, al.entity_id,
            al.old_values, al.new_values, al.ip_address, al.created_at,
            u.id AS user_id, u.name AS user_name, u.username
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     ${whereClause}
     ORDER BY al.created_at DESC, al.id DESC
     LIMIT :limit OFFSET :offset`,
    { ...params, limit: Number(limit), offset }
  );

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     ${whereClause}`,
    params
  );

  /* old_values/new_values disimpan sebagai JSON string. Diurai di sini supaya
     frontend menerima objek siap pakai. Baris lama yang formatnya tidak valid
     dikirim apa adanya sebagai teks, bukan membuat seluruh permintaan gagal. */
  const parse = (value) => {
    if (!value) return null;
    if (typeof value === 'object') return value; // driver tertentu sudah mengurainya
    try { return JSON.parse(value); } catch { return { _raw: String(value) }; }
  };

  res.json({
    data: rows.map((r) => ({
      ...r,
      old_values: parse(r.old_values),
      new_values: parse(r.new_values),
    })),
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: countRows[0].total,
      totalPages: Math.ceil(countRows[0].total / Number(limit)),
    },
  });
});

/**
 * GET /api/audit-logs/filters
 * Nilai yang benar-benar ada di tabel, untuk mengisi dropdown filter — supaya
 * tidak menawarkan pilihan yang pasti nihil hasilnya.
 */
const getAuditFilters = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenant_id;
  const [actions] = await pool.query(
    `SELECT DISTINCT action FROM audit_logs WHERE tenant_id = :tenantId ORDER BY action ASC`,
    { tenantId }
  );
  const [entityTypes] = await pool.query(
    `SELECT DISTINCT entity_type FROM audit_logs WHERE tenant_id = :tenantId ORDER BY entity_type ASC`,
    { tenantId }
  );
  const [users] = await pool.query(
    `SELECT DISTINCT u.id, u.name
     FROM audit_logs al JOIN users u ON u.id = al.user_id
     WHERE al.tenant_id = :tenantId
     ORDER BY u.name ASC`,
    { tenantId }
  );

  res.json({
    actions: actions.map((r) => r.action),
    entityTypes: entityTypes.map((r) => r.entity_type),
    users,
  });
});

module.exports = { listAuditLogs, getAuditFilters };
