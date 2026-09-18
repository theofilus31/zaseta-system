const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const generateAssetQr = require('../utils/qrGenerator');

// GET /api/assets/:id/qr — ambil info QR untuk halaman print
const getAssetQr = asyncHandler(async (req, res) => {
  const { id } = req.params;
  // qr_codes TIDAK punya kolom tenant_id sendiri — pengecekan a.tenant_id di JOIN
  // ini adalah satu-satunya yang mencegah tenant lain menebak asset_id/id QR orang lain.
  const [rows] = await pool.query(
    `SELECT q.code, q.scan_url, q.image_path, a.asset_code, a.name
     FROM qr_codes q JOIN assets a ON a.id = q.asset_id
     WHERE q.asset_id = :id AND a.tenant_id = :tenantId`,
    { id, tenantId: req.user.tenant_id }
  );
  if (!rows[0]) return res.status(404).json({ message: 'QR untuk aset ini belum tersedia.' });
  res.json(rows[0]);
});

// POST /api/assets/:id/qr/regenerate — buat ulang QR (misal token lama bocor)
const regenerateAssetQr = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenant_id;

  const [assetRows] = await pool.query(`SELECT id FROM assets WHERE id = :id AND tenant_id = :tenantId`, { id, tenantId });
  if (!assetRows[0]) return res.status(404).json({ message: 'Aset tidak ditemukan.' });

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

  /* `IN (:ids)` mengandalkan pemipihan array otomatis mysql2 untuk placeholder
     bernama — `pg` tidak melakukan itu (array dioper apa adanya sebagai SATU
     parameter), jadi ditulis sebagai `= ANY(...)` dengan cast eksplisit ke
     bigint[] alih-alih IN (...) biasa. */
  const [rows] = await pool.query(
    `SELECT q.asset_id AS id, q.image_path, a.asset_code, a.name
     FROM qr_codes q JOIN assets a ON a.id = q.asset_id
     WHERE q.asset_id = ANY(:ids::bigint[]) AND a.tenant_id = :tenantId AND a.deleted_at IS NULL`,
    { ids: ids.map(Number), tenantId: req.user.tenant_id }
  );

  /* Urutkan hasil sesuai urutan ids yang dikirim client (mis. urutan pemilihan/sort
     di tabel). Kunci Map di-String()-kan di KEDUA sisi — kolom bigint (asset_id)
     dikembalikan `pg` sebagai STRING (beda dari mysql2 yang mengembalikannya
     sebagai number untuk nilai dalam rentang aman), jadi byId.get(Number(id))
     tidak pernah cocok dengan kunci "2"/"3" bertipe string dan diam-diam
     menghasilkan array kosong tanpa error apa pun. */
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  const ordered = ids.map((id) => byId.get(String(id))).filter(Boolean);

  res.json({ data: ordered });
});

module.exports = { getAssetQr, regenerateAssetQr, getAssetsQrBatch };
