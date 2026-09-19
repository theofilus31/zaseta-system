const { QRCodeStyling } = require('qr-code-styling/lib/qr-code-styling.common.js');
const nodeCanvas = require('canvas');
const { JSDOM } = require('jsdom');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

/**
 * ============================================================================
 *  GAYA & LOGO DI TENGAH SETIAP KODE QR
 * ============================================================================
 *  Bukan QR polos hitam-putih bawaan lagi -- dibuat "berornamen" (modul
 *  bulat, warna hijau brand, sudut pemandu membulat) dengan logo Zaseta di
 *  tengah, mengikuti contoh gaya yang diminta (referensi: QR gigi hijau
 *  bertitik) -- warna & logonya diganti jadi identitas Zaseta sendiri.
 *
 *  Logo Zaseta SENDIRI (BUKAN logo tenant yang bisa diganti-ganti lewat
 *  Pengaturan) sengaja ditempel di SETIAP kode QR -- aset maupun barang
 *  habis pakai, di semua tenant -- sebagai tanda "dibuat oleh Zaseta",
 *  terlepas dari merek yang tenant pakai di aplikasinya sendiri. File
 *  logonya disalin ke backend/src/assets (bukan dirujuk ke frontend/public)
 *  supaya backend tidak bergantung pada struktur folder frontend kalau
 *  suatu saat keduanya di-deploy terpisah.
 *
 *  qr-code-styling dipakai (bukan menggambar sendiri lewat jimp seperti
 *  percobaan sebelumnya) karena sudah punya perhitungan "zona aman" bawaan
 *  untuk kombinasi gaya-titik + logo di tengah -- errorCorrectionLevel 'H'
 *  (~30% modul boleh rusak/tertutup, dari 'M' ~15% sebelumnya) supaya kode
 *  QR tetap terbaca meski sebagian modul di tengah tertutup logo.
 *
 *  BUTUH `canvas` (rendering native) & `jsdom` (DOM tiruan) karena
 *  qr-code-styling aslinya dibuat untuk browser -- keduanya HANYA dipakai
 *  di sini, lihat README paket itu bagian "Node Support". Sudah dicoba
 *  aman diinstal di Windows tanpa compiler (pakai binary prebuilt).
 * ============================================================================
 */
const LOGO_PATH = path.join(__dirname, '../assets/zaseta-favicon.png');
const LOGO_DATA_URI = `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`;
const BRAND_GREEN = '#2f9c4f'; // brand-500, lihat tailwind.config.js

function buildStyledQr(scanUrl) {
  return new QRCodeStyling({
    jsdom: JSDOM,
    nodeCanvas,
    width: 320,
    height: 320,
    data: scanUrl,
    image: LOGO_DATA_URI,
    margin: 8,
    qrOptions: { errorCorrectionLevel: 'H' },
    dotsOptions: { color: BRAND_GREEN, type: 'dots' },
    cornersSquareOptions: { color: BRAND_GREEN, type: 'extra-rounded' },
    cornersDotOptions: { color: BRAND_GREEN, type: 'dot' },
    backgroundOptions: { color: '#ffffff' },
    imageOptions: { crossOrigin: 'anonymous', margin: 6, imageSize: 0.4, hideBackgroundDots: true },
  });
}

/** Inti bersama: token unik + data URL gambar QR (berornamen + berlogo
    Zaseta di tengah) yang mengarah ke `${prefix}/${code}`. */
async function generateQrToken(prefix) {
  const code = uuidv4();
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const scanUrl = `${frontendUrl}${prefix}/${code}`;

  // getRawData mengembalikan Buffer di Node (bukan Blob seperti di browser).
  const buffer = await buildStyledQr(scanUrl).getRawData('png');
  const imageDataUrl = `data:image/png;base64,${buffer.toString('base64')}`;

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
