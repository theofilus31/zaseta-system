const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const parseCsv = require('../utils/csvParser');
const { buildCsv } = require('../utils/csv');
const { todayLocal } = require('../utils/dateLocal');

/**
 * Departemen / cost center pemilik aset.
 *
 * Berbeda dari `asset_assignments.department` yang berupa teks bebas dan hanya
 * berlaku selama aset dipegang seseorang: kolom ini menempel pada asetnya
 * sendiri, sehingga aset yang tidak dipegang siapa pun (AC ruang rapat, meja
 * kosong) tetap punya penanggung jawab dan bisa masuk laporan per divisi.
 */

const CODE_REGEX = /^[A-Z0-9_-]{2,30}$/;

// GET /api/departments
const listDepartments = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT d.id, d.code, d.name, d.description, d.is_active,
            (SELECT COUNT(*) FROM assets a WHERE a.department_id = d.id AND a.deleted_at IS NULL) AS asset_count
     FROM departments d
     WHERE d.tenant_id = :tenantId AND d.is_active = TRUE
     ORDER BY d.name ASC`,
    { tenantId: req.user.tenant_id }
  );
  res.json(rows.map((r) => ({ ...r, asset_count: Number(r.asset_count) || 0 })));
});

// POST /api/departments
const createDepartment = asyncHandler(async (req, res) => {
  const { code, name, description } = req.body;
  const tenantId = req.user.tenant_id;
  if (!code || !name) {
    return res.status(400).json({ message: 'Kode dan nama departemen wajib diisi.' });
  }

  const normalized = String(code).trim().toUpperCase();
  if (!CODE_REGEX.test(normalized)) {
    return res.status(400).json({
      message: 'Kode departemen hanya boleh huruf besar, angka, garis bawah (_), atau minus (-), 2–30 karakter.',
    });
  }

  const [existing] = await pool.query(`SELECT id, is_active FROM departments WHERE tenant_id = :tenantId AND code = :code`, { tenantId, code: normalized });
  if (existing[0]?.is_active) {
    return res.status(409).json({ message: `Kode departemen "${normalized}" sudah dipakai.` });
  }
  /* Kode yang pernah dinonaktifkan diaktifkan kembali, bukan dibuat baru —
     supaya aset lama yang masih menunjuk ke sana tidak kehilangan induknya. */
  if (existing[0]) {
    await pool.query(
      `UPDATE departments SET is_active = TRUE, name = :name, description = :description WHERE id = :id`,
      { id: existing[0].id, name, description: description || null }
    );
    await logAudit({ userId: req.user.id, action: 'update', entityType: 'department', entityId: existing[0].id, newValues: { code: normalized, name, reaktivasi: true }, ipAddress: req.ip });
    return res.status(200).json({ id: existing[0].id, code: normalized, name, reactivated: true });
  }

  const [result] = await pool.query(
    `INSERT INTO departments (tenant_id, code, name, description) VALUES (:tenantId, :code, :name, :description) RETURNING id`,
    { tenantId, code: normalized, name, description: description || null }
  );

  await logAudit({ userId: req.user.id, action: 'create', entityType: 'department', entityId: result.insertId, newValues: { code: normalized, name }, ipAddress: req.ip });
  res.status(201).json({ id: result.insertId, code: normalized, name });
});

// PUT /api/departments/:id — kode sengaja tidak bisa diubah
const updateDepartment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ message: 'Nama departemen wajib diisi.' });

  const [existing] = await pool.query(`SELECT * FROM departments WHERE id = :id AND tenant_id = :tenantId`, { id, tenantId: req.user.tenant_id });
  if (!existing[0]) return res.status(404).json({ message: 'Departemen tidak ditemukan.' });

  await pool.query(
    `UPDATE departments SET name = :name, description = :description WHERE id = :id`,
    { id, name, description: description || null }
  );

  await logAudit({ userId: req.user.id, action: 'update', entityType: 'department', entityId: id, oldValues: { name: existing[0].name }, newValues: { name, description }, ipAddress: req.ip });
  res.json({ message: 'Departemen berhasil diperbarui.' });
});

// DELETE /api/departments/:id — nonaktifkan, bukan hapus permanen
const deleteDepartment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenant_id;

  const [rows] = await pool.query(`SELECT id FROM departments WHERE id = :id AND tenant_id = :tenantId`, { id, tenantId });
  if (!rows[0]) return res.status(404).json({ message: 'Departemen tidak ditemukan.' });

  const [[used]] = await pool.query(
    `SELECT COUNT(*) AS total FROM assets WHERE department_id = :id AND deleted_at IS NULL`,
    { id }
  );

  /* Menonaktifkan departemen yang masih memegang aset akan membuat aset-aset
     itu tampil tanpa penanggung jawab. Lebih baik ditolak dengan angka yang
     jelas daripada diam-diam membuat data menggantung. */
  if (Number(used.total) > 0) {
    return res.status(409).json({
      message: `Departemen ini masih tercatat pada ${used.total} aset. Pindahkan aset tersebut ke departemen lain terlebih dahulu.`,
    });
  }

  await pool.query(`UPDATE departments SET is_active = FALSE WHERE id = :id AND tenant_id = :tenantId`, { id, tenantId });
  await logAudit({ userId: req.user.id, action: 'delete', entityType: 'department', entityId: id, ipAddress: req.ip });
  res.json({ message: 'Departemen berhasil dinonaktifkan.' });
});

// GET /api/departments/export
const exportDepartments = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT code, name, description FROM departments WHERE tenant_id = :tenantId AND is_active = TRUE ORDER BY name ASC`,
    { tenantId: req.user.tenant_id }
  );

  const headers = ['Kode Departemen', 'Nama Departemen', 'Deskripsi'];
  const csvRows = rows.map((r) => [r.code, r.name, r.description]);
  const csv = buildCsv(headers, csvRows);

  await logAudit({
    userId: req.user.id, action: 'export', entityType: 'department_export',
    newValues: { rows: rows.length }, ipAddress: req.ip,
  });

  const stamp = todayLocal();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="departemen-${stamp}.csv"`);
  res.send(csv);
});

// POST /api/departments/import — import massal Departemen dari file CSV
// Format kolom yang diharapkan: department_code, department_name
const importDepartments = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Berkas CSV wajib diunggah.' });
  }

  const rows = parseCsv(req.file.buffer.toString('utf-8'));
  if (rows.length === 0) {
    return res.status(400).json({ message: 'Berkas CSV kosong atau formatnya tidak terbaca.' });
  }

  const requiredHeaders = ['department_code', 'department_name'];
  const actualHeaders = Object.keys(rows[0]);
  const missingHeaders = requiredHeaders.filter((h) => !actualHeaders.includes(h));
  if (missingHeaders.length > 0) {
    return res.status(400).json({
      message: `Kolom wajib tidak ditemukan: ${missingHeaders.join(', ')}. Header yang diharapkan: department_code, department_name.`,
    });
  }

  const tenantId = req.user.tenant_id;
  const summary = {
    departmentsCreated: 0,
    departmentsReactivated: 0,
    skipped: [], // { row, reason }
    errors: [],  // { row, reason }
  };

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // +2 karena baris 1 adalah header, dan index dimulai dari 0
    const row = rows[i];
    const code = (row.department_code || '').trim().toUpperCase();
    const name = (row.department_name || '').trim();

    if (!code || !name) {
      summary.errors.push({ row: rowNum, reason: 'department_code dan department_name wajib diisi.' });
      continue;
    }
    if (!CODE_REGEX.test(code)) {
      summary.errors.push({ row: rowNum, reason: 'department_code hanya boleh huruf besar, angka, garis bawah (_), atau minus (-), 2–30 karakter.' });
      continue;
    }

    // Sengaja TIDAK filter is_active — perlu tahu juga kalau kode ini pernah dipakai departemen yang sudah dinonaktifkan,
    // supaya bisa diaktifkan kembali alih-alih dianggap "sudah ada" padahal tidak pernah muncul di dropdown/list.
    const [existing] = await pool.query(`SELECT id, is_active FROM departments WHERE tenant_id = :tenantId AND code = :code`, { tenantId, code });
    if (existing[0] && existing[0].is_active) {
      summary.skipped.push({ row: rowNum, reason: `Departemen "${code}" sudah aktif, tidak dibuat ulang.` });
      continue;
    }
    if (existing[0] && !existing[0].is_active) {
      await pool.query(`UPDATE departments SET is_active = TRUE, name = :name WHERE id = :id`, { id: existing[0].id, name });
      summary.departmentsReactivated++;
      continue;
    }

    await pool.query(`INSERT INTO departments (tenant_id, code, name) VALUES (:tenantId, :code, :name)`, { tenantId, code, name });
    summary.departmentsCreated++;
  }

  await logAudit({ userId: req.user.id, action: 'create', entityType: 'department_import', newValues: summary, ipAddress: req.ip });

  res.json(summary);
});

module.exports = { listDepartments, createDepartment, updateDepartment, deleteDepartment, exportDepartments, importDepartments };
