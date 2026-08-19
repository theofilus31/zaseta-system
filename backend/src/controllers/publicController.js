const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');

// GET /api/public/scan/:code — dipanggil dari halaman scan publik, TANPA AUTH
const scanAsset = asyncHandler(async (req, res) => {
  const { code } = req.params;

  const [qrRows] = await pool.query(`SELECT asset_id FROM qr_codes WHERE code = :code`, { code });
  if (!qrRows[0]) {
    return res.status(404).json({ message: 'QR code tidak valid atau tidak ditemukan.' });
  }
  const assetId = qrRows[0].asset_id;

  const [assetRows] = await pool.query(
    `SELECT a.id, a.asset_code, a.name, a.brand, a.model, a.spec_detail, a.status, a.purchase_date, a.vendor,
            c.name AS category_name, l.name AS location_name, sl.name AS sub_location_name
     FROM assets a
     JOIN asset_categories c ON c.id = a.category_id
     LEFT JOIN locations l ON l.id = a.location_id
     LEFT JOIN sub_locations sl ON sl.id = a.sub_location_id
     WHERE a.id = :assetId AND a.deleted_at IS NULL`,
    { assetId }
  );
  const asset = assetRows[0];
  if (!asset) return res.status(404).json({ message: 'Aset tidak ditemukan atau sudah tidak aktif.' });

  const [customFieldRows] = await pool.query(
    `SELECT cf.field_label, cf.field_type, v.value_text
     FROM asset_custom_fields cf
     LEFT JOIN asset_custom_field_values v ON v.custom_field_id = cf.id AND v.asset_id = :assetId
     WHERE cf.is_active = TRUE AND v.value_text IS NOT NULL
     ORDER BY cf.sort_order ASC`,
    { assetId }
  );

  // Update statistik scan + audit log (anonim, tanpa user_id)
  await pool.query(`UPDATE qr_codes SET scan_count = scan_count + 1, last_scanned_at = NOW() WHERE code = :code`, { code });
  await logAudit({ userId: null, action: 'scan', entityType: 'asset', entityId: assetId, ipAddress: req.ip });

  res.json({ ...asset, customFields: customFieldRows });
});

module.exports = { scanAsset };
