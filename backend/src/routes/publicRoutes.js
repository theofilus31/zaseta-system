const express = require('express');
const router = express.Router();
const { scanAsset, scanConsumable, getPublicTenantCount, listPublicCategories, createPublicRequest, submitContact, checkSlugAvailability, resolveUsernameTenant } = require('../controllers/publicController');
const { getPublicBranding, getLogo } = require('../controllers/settingsController');
const { publicReadLimiter, publicWriteLimiter, enumerationLimiter } = require('../middleware/publicLimiter');

// Tidak ada middleware authenticate — seluruh rute di berkas ini bersifat publik.
router.get('/scan/:code', publicReadLimiter, scanAsset);

/* Pindai QR/barcode barang habis pakai — rute terpisah dari /scan/:code
   aset di atas (lihat catatan di migration_consumable_qr.sql). */
router.get('/scan-consumable/:code', publicReadLimiter, scanConsumable);

/* Halaman pengajuan permintaan aset publik — link khusus yang dibagikan GA ke
   karyawan tanpa akun aplikasi, supaya mereka bisa mengajukan kebutuhan aset
   sendiri tanpa perlu dibuatkan manual. */
router.get('/categories', publicReadLimiter, listPublicCategories);

/* Chip "X perusahaan bergabung" di landing page — lihat catatan di
   publicController.getPublicTenantCount. */
router.get('/tenant-count', publicReadLimiter, getPublicTenantCount);
router.post('/requests', publicWriteLimiter, createPublicRequest);

/* Merek dibutuhkan SEBELUM ada sesi: halaman Masuk dan halaman Pindai QR
   keduanya menampilkan logo & nama perusahaan tanpa pengguna login. Isinya
   memang tidak rahasia — logo dan nama perusahaan justru dipasang untuk
   dilihat orang. Tetap diberi publicReadLimiter (Fase 6) — sejak dukungan
   ?slug= ditambahkan (Fase 5 Tahap 2), endpoint ini bisa dipukul tanpa henti
   untuk mengorek nama/logo tiap tenant lewat brute-force kode perusahaan
   kalau tidak dibatasi, sama seperti rute publik lain di berkas ini. */
router.get('/branding', publicReadLimiter, getPublicBranding);
router.get('/branding/logo/:variant', publicReadLimiter, getLogo);

/* Form "Hubungi Kami" di landing page — saran/kritik atau ajak kerja sama. */
router.post('/contact', publicWriteLimiter, submitContact);

/* Pengecekan ketersediaan "Kode Perusahaan" langsung saat mengetik di form Daftar. */
router.get('/check-slug', publicReadLimiter, checkSlugAvailability);

/* Fase 5 Tahap 3 — halaman Masuk umum mengarahkan ke /:slug/login begitu
   nama pengguna yang diketik dikenali milik satu tenant tertentu.
   enumerationLimiter (bukan publicReadLimiter) — lihat komentarnya di
   middleware/publicLimiter.js: ini "primitif tebak-akun", butuh pembatas
   per-IP yang lebih ketat, bukan pembatas baca biasa. */
router.get('/resolve-username', enumerationLimiter, resolveUsernameTenant);

module.exports = router;
