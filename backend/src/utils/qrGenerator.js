const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

/** Inti bersama: token unik + data URL gambar QR yang mengarah ke `${prefix}/${code}`. */
async function generateQrToken(prefix) {
  const code = uuidv4();
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const scanUrl = `${frontendUrl}${prefix}/${code}`;
  const imageDataUrl = await QRCode.toDataURL(scanUrl, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
  });
  return { code, scanUrl, imageDataUrl };
}

/**
 * Membuat token unik + data URL gambar QR untuk sebuah aset.
 */
async function generateAssetQr() {
  return generateQrToken('/scan');
}

/** Sama seperti generateAssetQr, tapi mengarah ke /scan-consumable (lihat
 * consumableQrController.js) -- barang habis pakai sengaja punya rute pindai
 * terpisah dari aset, bukan dicampur ke /scan/:code yang sudah ada, supaya
 * alur pindai aset yang sudah teruji tidak ikut berisiko. */
async function generateConsumableQr() {
  return generateQrToken('/scan-consumable');
}

module.exports = generateAssetQr;
module.exports.generateConsumableQr = generateConsumableQr;
