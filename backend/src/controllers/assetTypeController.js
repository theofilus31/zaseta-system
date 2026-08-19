const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');

// GET /api/asset-types
const listAssetTypes = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, name, description, is_active FROM asset_types ORDER BY name ASC`
  );
  res.json(rows);
});

// POST /api/asset-types
const createAssetType = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ message: 'Nama kategori aset wajib diisi.' });
  }
  const [result] = await pool.query(
    `INSERT INTO asset_types (name, description) VALUES (:name, :description)`,
    { name, description: description || null }
  );
  await logAudit({ userId: req.user.id, action: 'create', entityType: 'asset_type', entityId: result.insertId, newValues: req.body });
  res.status(201).json({ id: result.insertId, name, description: description || null });
});

// PUT /api/asset-types/:id
const updateAssetType = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, isActive } = req.body;
  if (!name) {
    return res.status(400).json({ message: 'Nama kategori aset wajib diisi.' });
  }
  await pool.query(
    `UPDATE asset_types SET name = :name, description = :description, is_active = :isActive WHERE id = :id`,
    { id, name, description: description || null, isActive: isActive ?? true }
  );
  await logAudit({ userId: req.user.id, action: 'update', entityType: 'asset_type', entityId: id, newValues: req.body });
  res.json({ message: 'Kategori aset berhasil diperbarui.' });
});

// DELETE /api/asset-types/:id
const deleteAssetType = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await pool.query(`DELETE FROM asset_types WHERE id = :id`, { id });
  await logAudit({ userId: req.user.id, action: 'delete', entityType: 'asset_type', entityId: id });
  res.json({ message: 'Kategori aset berhasil dihapus.' });
});

module.exports = { listAssetTypes, createAssetType, updateAssetType, deleteAssetType };
