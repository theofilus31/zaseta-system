const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

/**
 * Membuat token unik + data URL gambar QR untuk sebuah aset.
 */
async function generateAssetQr() {
  const code = uuidv4();
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const scanUrl = `${frontendUrl}/scan/${code}`;
  const imageDataUrl = await QRCode.toDataURL(scanUrl, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
  });
  return { code, scanUrl, imageDataUrl };
}

module.exports = generateAssetQr;
