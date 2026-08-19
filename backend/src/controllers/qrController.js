const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const generateAssetQr = require('../utils/qrGenerator');

// GET /api/assets/:id/qr — ambil info QR untuk halaman print
const getAssetQr = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [rows] = await pool.query(
    `SELECT q.code, q.scan_url, q.image_path, a.asset_code, a.name
     FROM qr_codes q JOIN assets a ON a.id = q.asset_id
     WHERE q.asset_id = :id`,
    { id }
  );
  if (!rows[0]) return res.status(404).json({ message: 'QR untuk aset ini belum tersedia.' });
  res.json(rows[0]);
});

// POST /api/assets/:id/qr/regenerate — buat ulang QR (misal token lama bocor)
const regenerateAssetQr = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { code, scanUrl, imageDataUrl } = await generateAssetQr();

  await pool.query(
    `UPDATE qr_codes SET code = :code, scan_url = :scanUrl, image_path = :imagePath, generated_by = :userId, generated_at = NOW(), scan_count = 0
     WHERE asset_id = :id`,
    { id, code, scanUrl, imagePath: imageDataUrl, userId: req.user.id }
  );

  await logAudit({ userId: req.user.id, action: 'update', entityType: 'qr_code', entityId: id, newValues: { code } });

  res.json({ code, scanUrl, imageDataUrl });
});

// POST /api/assets/qr/batch — ambil info QR untuk banyak aset sekaligus (halaman cetak massal)
// Body: { ids: [1, 2, 3] }
const getAssetsQrBatch = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'Pilih minimal satu aset untuk dicetak.' });
  }

  const [rows] = await pool.query(
    `SELECT q.asset_id AS id, q.image_path, a.asset_code, a.name
     FROM qr_codes q JOIN assets a ON a.id = q.asset_id
     WHERE q.asset_id IN (:ids) AND a.deleted_at IS NULL`,
    { ids }
  );

  // Urutkan hasil sesuai urutan ids yang dikirim client (mis. urutan pemilihan/sort di tabel)
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(Number(id))).filter(Boolean);

  res.json({ data: ordered });
});

module.exports = { getAssetQr, regenerateAssetQr, getAssetsQrBatch };
