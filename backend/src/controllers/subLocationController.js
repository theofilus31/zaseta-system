const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');

// GET /api/sub-locations?locationId=  (wajib, sub lokasi selalu milik satu lokasi induk)
const listSubLocations = asyncHandler(async (req, res) => {
  const { locationId } = req.query;
  if (!locationId) {
    return res.status(400).json({ message: 'locationId wajib disertakan.' });
  }
  const [rows] = await pool.query(
    `SELECT id, location_id, code, name, description, is_active
     FROM sub_locations WHERE location_id = :locationId AND is_active = TRUE ORDER BY name ASC`,
    { locationId }
  );
  res.json(rows);
});

// POST /api/sub-locations
const createSubLocation = asyncHandler(async (req, res) => {
  const { locationId, code, name, description } = req.body;
  if (!locationId || !code || !name) {
    return res.status(400).json({ message: 'locationId, kode, dan nama sub lokasi wajib diisi.' });
  }
  if (code.includes('/')) {
    return res.status(400).json({ message: 'Kode sub lokasi tidak boleh mengandung karakter "/" (dipakai sebagai pemisah pada kode aset).' });
  }

  const [existing] = await pool.query(
    `SELECT id, is_active FROM sub_locations WHERE location_id = :locationId AND code = :code`,
    { locationId, code }
  );
  if (existing[0] && existing[0].is_active) {
    return res.status(409).json({ message: 'Kode sub lokasi sudah dipakai di lokasi ini.' });
  }
  if (existing[0] && !existing[0].is_active) {
    // Kode ini pernah dipakai sub lokasi yang sudah dihapus (soft-delete) — aktifkan kembali alih-alih menolak.
    await pool.query(`UPDATE sub_locations SET is_active = TRUE, name = :name WHERE id = :id`, { id: existing[0].id, name });
    await logAudit({ userId: req.user.id, action: 'update', entityType: 'sub_location', entityId: existing[0].id, newValues: { ...req.body, reactivated: true } });
    return res.status(200).json({ id: existing[0].id, code, name, reactivated: true });
  }

  const [result] = await pool.query(
    `INSERT INTO sub_locations (location_id, code, name) VALUES (:locationId, :code, :name)`,
    { locationId, code, name }
  );
  await logAudit({ userId: req.user.id, action: 'create', entityType: 'sub_location', entityId: result.insertId, newValues: req.body });
  res.status(201).json({ id: result.insertId, code, name });
});

// PUT /api/sub-locations/:id
// Sama seperti lokasi: kode sub lokasi tidak bisa diubah lewat endpoint ini, hanya nama/deskripsi/status.
const updateSubLocation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, isActive } = req.body;

  const [rows] = await pool.query(`SELECT location_id FROM sub_locations WHERE id = :id`, { id });
  if (!rows[0]) return res.status(404).json({ message: 'Sub lokasi tidak ditemukan.' });

  await pool.query(
    `UPDATE sub_locations SET name = :name, description = :description, is_active = :isActive WHERE id = :id`,
    { id, name, description: description || null, isActive: isActive ?? true }
  );
  await logAudit({ userId: req.user.id, action: 'update', entityType: 'sub_location', entityId: id, newValues: { name, description, isActive } });
  res.json({ message: 'Sub lokasi berhasil diperbarui.' });
});

// DELETE /api/sub-locations/:id (soft)
const deleteSubLocation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await pool.query(`UPDATE sub_locations SET is_active = FALSE WHERE id = :id`, { id });
  await logAudit({ userId: req.user.id, action: 'delete', entityType: 'sub_location', entityId: id });
  res.json({ message: 'Sub lokasi berhasil dinonaktifkan.' });
});

module.exports = { listSubLocations, createSubLocation, updateSubLocation, deleteSubLocation };
