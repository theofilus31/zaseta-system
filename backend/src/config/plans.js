const pool = require('./db');

/**
 * ============================================================================
 *  KATALOG PAKET LANGGANAN — DIKACU DI MEMORI (susulan billing Fase 4)
 * ============================================================================
 *  Sebelumnya `PLANS` adalah array statis di berkas ini — mengubah harga/
 *  limit/fitur paket butuh deploy ulang. Sekarang sumber kebenarannya tabel
 *  `plans` (lihat migrations/migration_plans_catalog_db.sql), dikelola admin
 *  platform lewat menu Katalog Paket (`platformController` listPlansAdmin/
 *  createPlan/updatePlan/deletePlan/movePlan). Nama berkas ini TETAP
 *  `config/plans.js` supaya semua `require('../config/plans')` yang sudah
 *  ada tidak perlu diubah jalurnya.
 *
 *  Katalognya disalin ke memori sekali saat server menyala (lihat
 *  server.js — DITUNGGU sebelum app.listen(), bukan fire-and-forget seperti
 *  utils/ipWhitelist.js, karena salah baca limit/harga di sini berdampak
 *  langsung ke uang & penegakan limit, bukan cuma daftar putih IP), lalu
 *  disegarkan ulang tiap kali admin platform menambah/mengubah/menghapus
 *  paket. `getPlan()`/`isUpgrade()`/dll di bawah SEMUANYA sinkron (baca cache,
 *  bukan query DB) — dipanggil di banyak titik permintaan (planLimits
 *  middleware setiap POST aset/pengguna/lokasi), jadi tidak boleh nge-query
 *  ulang setiap kali dipanggil.
 *
 *  `maxAssets`/`maxUsers`/`locationLimit` bernilai `null` berarti TANPA
 *  BATAS. `price`/`priceYearly` bernilai `null` berarti harga khusus
 *  (hubungi sales). `priceYearly` adalah harga SETAHUN PENUH (konvensi
 *  "bayar 10 bulan, dapat 12 bulan").
 *
 *  `isActive = false` berarti paket "dipensiunkan": disembunyikan dari
 *  katalog publik (`getAllPlans()`) dan tidak lagi bisa diajukan lewat
 *  upgrade mandiri (`getSelfServePlanIds()`), TAPI tetap bisa di-resolve
 *  lewat `getPlan(id)` untuk tenant lama yang masih memakainya — jangan
 *  pernah menghapus fisik satu paket yang masih dipakai siapa pun (lihat
 *  platformController.deletePlan untuk penjaganya).
 *
 *  Paket 'free' TIDAK BOLEH dihapus atau dinonaktifkan — signup mandiri
 *  (authController) dan penurunan otomatis saat kedaluwarsa
 *  (subscriptionService.downgradeToFreeOnExpiry) mengasumsikan paket ini
 *  SELALU ada dan SELALU gratis. Ditegakkan di platformController, bukan
 *  di sini.
 *
 *  Belum ada payment gateway sungguhan terpasang (lihat
 *  services/paymentGateway/) — paket berbayar diaktifkan lewat provider
 *  'manual' (verifikasi transfer bank oleh admin platform). Struktur
 *  provider-nya sudah abstrak supaya provider lain (Midtrans/Xendit) tinggal
 *  ditambah tanpa mengubah billingController.
 * ============================================================================
 */

let cache = { all: [], byId: new Map() };

function mapRow(row) {
  const features = Array.isArray(row.features)
    ? row.features
    : (typeof row.features === 'string' ? JSON.parse(row.features) : []);

  return {
    id: row.id,
    name: row.name,
    tagline: row.tagline,
    price: row.price,
    priceYearly: row.price_yearly,
    maxAssets: row.max_assets,
    maxUsers: row.max_users,
    locationLimit: row.location_limit,
    features,
    highlight: row.highlight,
    custom: row.custom,
    selfServe: row.self_serve,
    customPricingHint: row.custom_pricing_hint || undefined,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

/** Dipanggil sekali saat startup (server.js) dan lagi setiap kali admin
 *  platform menulis ke tabel `plans` — lihat catatan berkas di atas. */
async function reloadPlansCache() {
  const [rows] = await pool.query(`SELECT * FROM plans ORDER BY sort_order ASC`);
  const all = rows.map(mapRow);
  cache = { all, byId: new Map(all.map((p) => [p.id, p])) };
}

/** Katalog publik/upgrade mandiri — HANYA paket aktif, urut sesuai tingkatan.
 *  `{ includeInactive: true }` untuk keperluan admin (daftar kelola paket,
 *  perhitungan MRR yang tidak boleh diam-diam mengecualikan tenant yang masih
 *  membayar paket yang sudah dipensiunkan). */
function getAllPlans({ includeInactive = false } = {}) {
  return includeInactive ? cache.all : cache.all.filter((p) => p.isActive);
}

function getPlan(planId) {
  return cache.byId.get(planId) || null;
}

/** Paket yang boleh diajukan lewat alur upgrade/downgrade mandiri tenant —
 *  aktif DAN ditandai self-serve. */
function getSelfServePlanIds() {
  return cache.all.filter((p) => p.isActive && p.selfServe).map((p) => p.id);
}

/** Urutan "tingkatan" paket (kolom `sort_order`) — dipakai membedakan
 *  upgrade vs downgrade (lihat billingController.createUpgradeRequest) tanpa
 *  membandingkan harga mentah. Dicari dari SELURUH paket (termasuk yang
 *  nonaktif) supaya tenant lama di paket yang sudah dipensiunkan tetap bisa
 *  dibandingkan tingkatannya dengan benar. */
function tierIndex(planId) {
  const plan = cache.byId.get(planId);
  return plan ? plan.sortOrder : null;
}

/** true kalau `toPlanId` tingkatannya lebih tinggi dari `fromPlanId` (upgrade
 *  sungguhan) — false untuk downgrade ATAU pindah ke paket yang tidak dikenal. */
function isUpgrade(fromPlanId, toPlanId) {
  const from = tierIndex(fromPlanId);
  const to = tierIndex(toPlanId);
  if (from === null || to === null) return false;
  return to > from;
}

module.exports = { reloadPlansCache, getAllPlans, getPlan, getSelfServePlanIds, tierIndex, isUpgrade };
