const multer = require('multer');

/**
 * Unggahan gambar untuk logo merek.
 *
 * Terpisah dari `upload.js` (khusus CSV) karena batas ukuran dan jenis
 * berkasnya berbeda. Tetap memakai penyimpanan di memori: berkasnya langsung
 * diubah jadi base64 dan disimpan ke database, jadi tidak pernah menyentuh
 * disk — tidak ada direktori unggahan yang perlu disiapkan atau dibersihkan
 * saat aplikasi dipindahkan ke server lain.
 */
/* image/svg+xml SENGAJA tidak diizinkan meski format gambar — SVG bisa
   berisi <script> dan handler on*=, dan berkas ini disajikan apa adanya
   lewat endpoint PUBLIK tanpa login (GET /api/public/branding/logo/:variant).
   Isinya tidak disaring/dibersihkan, jadi mengizinkannya berarti siapa pun
   yang punya izin settings.edit bisa menaruh script yang berjalan di asal
   aplikasi ini kalau berkasnya sampai dibuka langsung di tab peramban. */
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];

const uploadImage = multer({
  storage: multer.memoryStorage(),
  // 1MB sudah sangat lapang untuk sebuah logo; batas ini juga menjaga ukuran
  // baris database tetap wajar karena base64 membengkak ~33%.
  limits: { fileSize: 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.includes(file.mimetype)) {
      const err = new Error('Logo harus berformat PNG, JPG, atau WEBP.');
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

module.exports = uploadImage;
