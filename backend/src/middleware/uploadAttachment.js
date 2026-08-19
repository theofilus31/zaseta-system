const multer = require('multer');

/**
 * Unggahan lampiran berkas aset (faktur, kartu garansi, manual, foto).
 *
 * Terpisah dari `upload.js` (khusus CSV) dan `uploadImage.js` (khusus logo)
 * karena jenis dan ukuran berkasnya lagi-lagi berbeda — lampiran boleh berupa
 * dokumen kantor, bukan cuma gambar. Tetap disimpan di memori lalu diubah
 * jadi base64 ke database, konsisten dengan logo dan gambar Kode QR.
 */
const ALLOWED = {
  'application/pdf': true,
  'image/jpeg': true,
  'image/png': true,
  'image/webp': true,
  'application/msword': true,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
  'application/vnd.ms-excel': true,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': true,
};

const uploadAttachment = multer({
  storage: multer.memoryStorage(),
  // 8MB cukup lapang untuk hasil pindai faktur/kartu garansi tanpa membuat
  // baris database membengkak tak terkendali (base64 menambah ~33% ukuran).
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED[file.mimetype]) {
      const err = new Error('Format berkas tidak didukung. Gunakan PDF, gambar (JPG/PNG/WEBP), atau dokumen Word/Excel.');
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

module.exports = uploadAttachment;
