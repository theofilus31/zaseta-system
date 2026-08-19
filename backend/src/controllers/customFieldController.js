const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');

// GET /api/custom-fields?categoryId=  → field global (categoryId NULL) + field khusus kategori
const listCustomFields = asyncHandler(async (req, res) => {
  const { categoryId } = req.query;
  const [rows] = await pool.query(
    `SELECT id, category_id, field_key, field_label, field_type, field_options, is_required, sort_order
     FROM asset_custom_fields
     WHERE is_active = TRUE AND (category_id IS NULL OR category_id = :categoryId)
     ORDER BY sort_order ASC, id ASC`,
    { categoryId: categoryId || null }
  );
  res.json(rows.map(r => ({ ...r, field_options: r.field_options ? JSON.parse(r.field_options) : null })));
});

const createCustomField = asyncHandler(async (req, res) => {
  const { categoryId, fieldKey, fieldLabel, fieldType, fieldOptions, isRequired, sortOrder } = req.body;
  if (!fieldKey || !fieldLabel || !fieldType) {
    return res.status(400).json({ message: 'fieldKey, fieldLabel, dan fieldType wajib diisi.' });
  }
  const [result] = await pool.query(
    `INSERT INTO asset_custom_fields (category_id, field_key, field_label, field_type, field_options, is_required, sort_order)
     VALUES (:categoryId, :fieldKey, :fieldLabel, :fieldType, :fieldOptions, :isRequired, :sortOrder)`,
    {
      categoryId: categoryId || null,
      fieldKey,
      fieldLabel,
      fieldType,
      fieldOptions: fieldOptions ? JSON.stringify(fieldOptions) : null,
      isRequired: !!isRequired,
      sortOrder: sortOrder || 0,
    }
  );
  await logAudit({ userId: req.user.id, action: 'create', entityType: 'asset_custom_field', entityId: result.insertId, newValues: req.body });
  res.status(201).json({ id: result.insertId, fieldKey, fieldLabel });
});

const updateCustomField = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { fieldLabel, fieldType, fieldOptions, isRequired, sortOrder, isActive } = req.body;
  await pool.query(
    `UPDATE asset_custom_fields
     SET field_label = :fieldLabel, field_type = :fieldType, field_options = :fieldOptions,
         is_required = :isRequired, sort_order = :sortOrder, is_active = :isActive
     WHERE id = :id`,
    {
      id,
      fieldLabel,
      fieldType,
      fieldOptions: fieldOptions ? JSON.stringify(fieldOptions) : null,
      isRequired: !!isRequired,
      sortOrder: sortOrder || 0,
      isActive: isActive ?? true,
    }
  );
  await logAudit({ userId: req.user.id, action: 'update', entityType: 'asset_custom_field', entityId: id, newValues: req.body });
  res.json({ message: 'Bidang kustom berhasil diperbarui.' });
});

const deleteCustomField = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await pool.query(`UPDATE asset_custom_fields SET is_active = FALSE WHERE id = :id`, { id });
  await logAudit({ userId: req.user.id, action: 'delete', entityType: 'asset_custom_field', entityId: id });
  res.json({ message: 'Bidang kustom berhasil dinonaktifkan.' });
});

module.exports = { listCustomFields, createCustomField, updateCustomField, deleteCustomField };
