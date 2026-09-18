/**
 * ============================================================================
 *  KODE PERUSAHAAN / SLUG TENANT
 * ============================================================================
 *  Dulu `tenants.slug` dibuat otomatis dari nama perusahaan (slugify + coba
 *  lagi kalau bentrok) dan sama sekali tidak terlihat pengguna. Sekarang
 *  pendaftar MENGISI sendiri "Kode Perusahaan" (mis. "RMS" untuk PT Rukun
 *  Mitra Sejati) — nilai ini LANGSUNG jadi `tenants.slug`, jadi validasinya
 *  harus lebih ketat daripada sekadar auto-generate: harus aman dipakai
 *  sebagai bagian pertama URL (`/rms/login`, dst.), dan tidak boleh bentrok
 *  dengan path tingkat atas yang sudah dipakai aplikasi sendiri.
 *
 *  Satu tempat dipakai bersama oleh authController.signup (memvalidasi saat
 *  daftar) dan publicController.checkSlugAvailability (pengecekan langsung
 *  saat mengetik di form) — supaya aturannya tidak diam-diam melenceng antara
 *  keduanya.
 * ============================================================================
 */

const SLUG_MIN = 2;
const SLUG_MAX = 30;

// Huruf kecil/angka, boleh pakai minus di TENGAH (bukan di awal/akhir, bukan
// dobel) — supaya selalu aman jadi satu bagian path URL tanpa perlu escaping.
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/* Path tingkat atas yang sudah dipakai aplikasi sendiri (lihat frontend/src/App.jsx)
   plus beberapa kata umum yang bisa membingungkan — semuanya TIDAK BOLEH
   dipakai jadi kode perusahaan, supaya /:slug/login tidak pernah bentrok
   dengan rute nyata aplikasi. Perbarui daftar ini kalau ada rute tingkat atas
   baru ditambahkan di App.jsx. */
const RESERVED_SLUGS = new Set([
  'scan', 'harga', 'ajukan-permintaan', 'login', 'signup', 'daftar', 'masuk', 'profile',
  'dashboard', 'assets', 'assignments', 'cetak-barcode-massal', 'opname', 'consumables',
  'requests', 'zecode', 'reports', 'categories', 'asset-types', 'locations', 'departments',
  'custom-fields', 'users', 'audit-logs', 'trash', 'settings', 'billing', 'platform',
  'api', 'admin', 'app', 'www', 'static', 'public', 'assets-static', 'null', 'undefined',
]);

function normalizeSlug(raw) {
  return String(raw || '').toLowerCase().trim();
}

function isValidSlugFormat(slug) {
  return slug.length >= SLUG_MIN && slug.length <= SLUG_MAX && SLUG_PATTERN.test(slug);
}

function isReservedSlug(slug) {
  return RESERVED_SLUGS.has(slug);
}

module.exports = { SLUG_MIN, SLUG_MAX, SLUG_PATTERN, RESERVED_SLUGS, normalizeSlug, isValidSlugFormat, isReservedSlug };
