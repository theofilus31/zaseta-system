/**
 * ============================================================================
 *  KATALOG PAKET LANGGANAN (Fase 4 SaaS, revisi harga & limit susulan)
 * ============================================================================
 *  Satu-satunya sumber kebenaran untuk harga, limit, DAN daftar fitur tiap
 *  paket. Dipakai oleh:
 *    - middleware/planLimits.js  → menegakkan limit aset/pengguna/lokasi
 *    - billingController         → mengirim katalog ke frontend (termasuk
 *                                   `features`), memvalidasi permintaan
 *                                   upgrade/downgrade, snapshot harga invoice
 *    - subscriptionService.js    → snapshot harga saat subscription dibuat
 *
 *  Ini yang bikin rule "feature access berdasarkan plan, bukan nama plan
 *  yang tersebar di banyak tempat" berlaku: kalau perlu ubah fitur/limit/
 *  harga suatu paket, cukup ubah array di sini — TIDAK ada controller atau
 *  komponen frontend yang boleh hardcode angka/fitur plan sendiri-sendiri.
 *
 *  `maxAssets`/`maxUsers`/`locationLimit` bernilai `null` berarti TANPA
 *  BATAS. `price`/`priceYearly` bernilai `null` berarti harga khusus
 *  (hubungi sales) — TIDAK ADA paket seperti itu di katalog saat ini, field
 *  ini cuma dukungan struktural untuk kalau `enterprise.customPricingHint`
 *  di bawah suatu saat perlu jadi paket harga khusus sungguhan.
 *
 *  `priceYearly` adalah harga SETAHUN PENUH (bukan per bulan) untuk siklus
 *  tagihan tahunan — konvensi "bayar 10 bulan, dapat 12 bulan"
 *  (priceYearly = price × 10), hemat ±16,7% dibanding 12× harga bulanan.
 *  `0` untuk Free (memang gratis, bukan "tidak relevan" seperti `null`).
 *
 *  Belum ada payment gateway sungguhan terpasang (lihat
 *  services/paymentGateway/) — paket berbayar diaktifkan lewat provider
 *  'manual' (verifikasi transfer bank oleh admin platform). Struktur
 *  provider-nya sudah abstrak supaya provider lain (Midtrans/Xendit) tinggal
 *  ditambah tanpa mengubah billingController.
 * ============================================================================
 */

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    priceYearly: 0,
    maxAssets: 100,
    maxUsers: 2,
    locationLimit: 1,
    highlight: false,
    custom: false,
    selfServe: true,
    tagline: 'Untuk mencoba sistem — tidak perlu kartu pembayaran.',
    features: [
      '100 aset',
      '2 pengguna, 1 lokasi',
      'Manajemen aset dasar',
      'Dasbor ringkasan aset',
      'Kode QR aset',
      'Riwayat & ekspor data dasar',
      'Dukungan komunitas',
    ],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 99000,
    priceYearly: 990000,
    maxAssets: 1000,
    maxUsers: 5,
    locationLimit: null,
    highlight: false,
    custom: false,
    selfServe: true,
    tagline: 'Perusahaan kecil yang mulai serius merapikan aset.',
    features: [
      '1.000 aset, 5 pengguna',
      'Multi-lokasi & sub-lokasi',
      'Perpindahan (mutasi) aset',
      'Manajemen pemeliharaan',
      'Laporan lebih detail',
      'Impor data dari Excel',
      'QR/Barcode lanjutan',
      'Dukungan prioritas',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    price: 249000,
    priceYearly: 2490000,
    maxAssets: 5000,
    maxUsers: 15,
    locationLimit: null,
    highlight: true,
    custom: false,
    selfServe: true,
    tagline: 'Paling banyak dipilih — tim IT/GA dengan banyak lokasi.',
    features: [
      '5.000 aset, 15 pengguna',
      'Alur persetujuan (approval)',
      'Peran & izin akses granular',
      'Log audit',
      'Penyusutan nilai aset',
      'Laporan lanjutan',
      'Impor & ekspor Excel',
      'Dukungan prioritas',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 599000,
    priceYearly: 5990000,
    maxAssets: 20000,
    maxUsers: 50,
    locationLimit: null,
    highlight: false,
    custom: false,
    selfServe: true,
    // Bukan paket "hubungi sales" — tetap bisa diajukan mandiri seperti
    // paket lain (harga di atas berlaku sebagai default). `customPricingHint`
    // murni microcopy CTA sekunder untuk kebutuhan DI ATAS itu (kontrak, SLA
    // khusus) — bukan flag yang mengubah alur upgrade/downgrade normal.
    customPricingHint: 'Butuh kapasitas lebih besar atau kontrak/SLA khusus?',
    tagline: 'Organisasi besar — harga mulai dari, siap disesuaikan kebutuhan.',
    features: [
      '20.000+ aset, 50+ pengguna',
      'Peran & izin akses lanjutan',
      'Alur persetujuan lanjutan',
      'Log audit lanjutan',
      'Penyusutan aset & laporan kustom',
      'Multi-cabang/lokasi tanpa batas',
      'Akses API & dukungan integrasi',
      'Dukungan prioritas/khusus',
    ],
  },
];

const PLAN_BY_ID = Object.fromEntries(PLANS.map((p) => [p.id, p]));

/** Semua paket saat ini bisa diajukan lewat alur upgrade/downgrade mandiri. */
const SELF_SERVE_PLAN_IDS = PLANS.filter((p) => p.selfServe).map((p) => p.id);

/** Urutan "tingkatan" paket — dipakai untuk membedakan upgrade vs downgrade
 *  (lihat billingController.createUpgradeRequest) tanpa membandingkan harga
 *  mentah (Enterprise sengaja lebih murah dari Business versi lama dulu
 *  pernah terjadi saat harga diubah — urutan eksplisit ini tidak ikut goyah
 *  kalau itu terulang). */
const PLAN_TIER_ORDER = PLANS.map((p) => p.id);

function getPlan(planId) {
  return PLAN_BY_ID[planId] || null;
}

function tierIndex(planId) {
  const idx = PLAN_TIER_ORDER.indexOf(planId);
  return idx === -1 ? null : idx;
}

/** true kalau `toPlanId` tingkatannya lebih tinggi dari `fromPlanId` (upgrade
 *  sungguhan) — false untuk downgrade ATAU pindah ke paket yang tidak dikenal. */
function isUpgrade(fromPlanId, toPlanId) {
  const from = tierIndex(fromPlanId);
  const to = tierIndex(toPlanId);
  if (from === null || to === null) return false;
  return to > from;
}

module.exports = { PLANS, PLAN_BY_ID, SELF_SERVE_PLAN_IDS, PLAN_TIER_ORDER, getPlan, tierIndex, isUpgrade };
