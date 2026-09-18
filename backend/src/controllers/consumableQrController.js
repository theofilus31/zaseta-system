const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const generateAssetQr = require('../utils/qrGenerator');

const { generateConsumableQr } = generateAssetQr;

/**
 * ============================================================================
 *  KODE QR/BARCODE — BARANG HABIS PAKAI
 * ============================================================================
 *  Sama polanya dengan qrController.js (aset), tapi tabelnya terpisah
 *  (consumable_qr_codes, lihat migration_consumable_qr.sql) dan rute
 *  pindainya beda (/scan-consumable/:code, bukan /scan/:code).
 *
 *  BEDA dari aset: barang habis pakai TIDAK otomatis dapat QR saat dibuat
 *  (createConsumable tidak diubah) untuk barang yang sudah ada SEBELUM fitur
 *  ini. `getConsumableQr` di bawah dibuat "on-demand" (lazy) -- begitu
 *  pertama kali dibuka lewat "Cetak Barcode", baris QR-nya baru dibuatkan
 *  kalau belum ada. Ini sengaja supaya tidak perlu skrip backfill terpisah.
 * ============================================================================
 */

// GET /api/consumables/:id/qr/print
const getConsumableQr = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenant_id;

  const [itemRows] = await pool.query(
    `SELECT id, code, name FROM consumables WHERE id = :id AND tenant_id = :tenantId`,
    { id, tenantId }
  );
  const item = itemRows[0];
  if (!item) return res.status(404).json({ message: 'Barang tidak ditemukan.' });

  const [qrRows] = await pool.query(
    `SELECT code, scan_url, image_path FROM consumable_qr_codes WHERE consumable_id = :id`, { id }
  );

  if (qrRows[0]) {
    return res.json({ code: qrRows[0].code, scan_url: qrRows[0].scan_url, image_path: qrRows[0].image_path, name: item.name, item_code: item.code });
  }

  // Belum ada baris QR untuk barang ini (dibuat sebelum fitur ini ada) — buat sekarang.
  const { code, scanUrl, imageDataUrl } = await generateConsumableQr();
  await pool.query(
    `INSERT INTO consumable_qr_codes (consumable_id, code, scan_url, image_path, generated_by) VALUES (:id, :code, :scanUrl, :imagePath, :userId)`,
    { id, code, scanUrl, imagePath: imageDataUrl, userId: req.user.id }
  );
  await logAudit({ userId: req.user.id, action: 'create', entityType: 'consumable_qr_code', entityId: id, newValues: { code } });

  res.json({ code, scan_url: scanUrl, image_path: imageDataUrl, name: item.name, item_code: item.code });
});

// POST /api/consumables/:id/qr/regenerate — buat ulang QR (mis. label lama rusak/hilang)
const regenerateConsumableQr = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenant_id;

  const [itemRows] = await pool.query(`SELECT id FROM consumables WHERE id = :id AND tenant_id = :tenantId`, { id, tenantId });
  if (!itemRows[0]) return res.status(404).json({ message: 'Barang tidak ditemukan.' });

  const { code, scanUrl, imageDataUrl } = await generateConsumableQr();

  const [existing] = await pool.query(`SELECT id FROM consumable_qr_codes WHERE consumable_id = :id`, { id });
  if (existing[0]) {
    await pool.query(
      `UPDATE consumable_qr_codes SET code = :code, scan_url = :scanUrl, image_path = :imagePath, generated_by = :userId, generated_at = NOW(), scan_count = 0
       WHERE consumable_id = :id`,
      { id, code, scanUrl, imagePath: imageDataUrl, userId: req.user.id }
    );
  } else {
    await pool.query(
      `INSERT INTO consumable_qr_codes (consumable_id, code, scan_url, image_path, generated_by) VALUES (:id, :code, :scanUrl, :imagePath, :userId)`,
      { id, code, scanUrl, imagePath: imageDataUrl, userId: req.user.id }
    );
  }

  await logAudit({ userId: req.user.id, action: 'update', entityType: 'consumable_qr_code', entityId: id, newValues: { code } });

  res.json({ code, scan_url: scanUrl, image_path: imageDataUrl });
});

module.exports = { getConsumableQr, regenerateConsumableQr };
