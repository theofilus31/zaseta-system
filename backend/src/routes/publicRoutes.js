const express = require('express');
const router = express.Router();
const { scanAsset } = require('../controllers/publicController');
const { getPublicBranding, getLogo } = require('../controllers/settingsController');

// Tidak ada middleware authenticate — seluruh rute di berkas ini bersifat publik.
router.get('/scan/:code', scanAsset);

/* Merek dibutuhkan SEBELUM ada sesi: halaman Masuk dan halaman Pindai QR
   keduanya menampilkan logo & nama perusahaan tanpa pengguna login. Isinya
   memang tidak rahasia — logo dan nama perusahaan justru dipasang untuk
   dilihat orang. */
router.get('/branding', getPublicBranding);
router.get('/branding/logo/:variant', getLogo);

module.exports = router;
