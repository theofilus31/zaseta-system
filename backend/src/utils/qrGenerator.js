const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { Jimp } = require('jimp');

/**
 * ============================================================================
 *  LOGO DI TENGAH KODE QR
 * ============================================================================
 *  Logo Zaseta sendiri (BUKAN logo tenant yang bisa diganti-ganti lewat
 *  Pengaturan) sengaja ditempel di tengah SETIAP kode QR yang dibuat --
 *  aset maupun barang habis pakai, di semua tenant -- sebagai tanda "dibuat
 *  oleh Zaseta", terlepas dari merek yang tenant pakai di aplikasinya
 *  sendiri. File-nya disalin ke backend/src/assets (bukan dirujuk langsung
 *  ke frontend/public) supaya backend tidak bergantung pada struktur folder
 *  frontend kalau suatu saat keduanya di-deploy terpisah.
 *
 *  Kode QR punya kapasitas koreksi galat bawaan (bisa tetap terbaca meski
 *  sebagian modulnya tertutup) -- inilah yang dimanfaatkan untuk menaruh
 *  logo di tengah tanpa merusak kemampuan pindainya:
 *   - errorCorrectionLevel dinaikkan ke 'H' (~30% modul boleh rusak/tertutup)
 *     dari 'M' (~15%) sebelumnya -- 'M' TIDAK cukup aman begitu ada logo
 *     menutupi bagian tengah.
 *   - Logo dibatasi ~22% dari lebar QR, dengan bantalan putih di sekelilingnya
 *     (supaya tidak menyatu dengan modul gelap di sekitarnya) -- angka ini
 *     jauh di bawah ambang 30% tadi, menyisakan ruang aman untuk finder
 *     pattern (kotak di 3 sudut) yang sama sekali tidak boleh tertutup.
 * ============================================================================
 */
const LOGO_PATH = path.join(__dirname, '../assets/zaseta-favicon.png');
const LOGO_SIZE_RATIO = 0.22;
const LOGO_PADDING_RATIO = 1.15; // bantalan putih di sekeliling logo, relatif ke ukuran logo

async function overlayLogo(qrBuffer) {
  const qrImage = await Jimp.read(qrBuffer);
  const logoImage = await Jimp.read(LOGO_PATH);

  const qrSize = qrImage.bitmap.width;
  const logoSize = Math.round(qrSize * LOGO_SIZE_RATIO);
  logoImage.resize({ w: logoSize, h: logoSize });

  const paddedSize = Math.round(logoSize * LOGO_PADDING_RATIO);
  const padded = new Jimp({ width: paddedSize, height: paddedSize, color: 0xffffffff });
  const logoOffset = Math.round((paddedSize - logoSize) / 2);
  padded.composite(logoImage, logoOffset, logoOffset);

  const center = Math.round((qrSize - paddedSize) / 2);
  qrImage.composite(padded, center, center);

  return qrImage.getBase64('image/png');
}

/** Inti bersama: token unik + data URL gambar QR (berlogo Zaseta di tengah)
    yang mengarah ke `${prefix}/${code}`. */
async function generateQrToken(prefix) {
  const code = uuidv4();
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const scanUrl = `${frontendUrl}${prefix}/${code}`;

  const qrBuffer = await QRCode.toBuffer(scanUrl, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 320,
  });
  const imageDataUrl = await overlayLogo(qrBuffer);

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
