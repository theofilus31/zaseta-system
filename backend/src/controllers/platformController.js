const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const { sendNewUserWelcome } = require('../utils/mailer');
const { generateTempPassword } = require('../utils/tempPassword');
const { getAllPlans, getPlan, reloadPlansCache } = require('../config/plans');
const { recordManualCorrection } = require('../services/subscriptionService');
const { runPlanExpiryCheck } = require('../jobs/planExpiry');
const { clampPagination } = require('../utils/pagination');
const { reloadIpWhitelist, normalizeIp } = require('../utils/ipWhitelist');

const IP_FORMAT_REGEX = /^[0-9a-fA-F.:]+$/;

const USERNAME_REGEX = /^[a-z0-9_-]{3,50}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * ============================================================================
 *  ADMIN PLATFORM — Fase 5 SaaS (super-admin, lintas tenant)
 * ============================================================================
 *  Semua endpoint di sini SENGAJA lintas tenant — dijaga `requirePlatformAdmin`
 *  di routes/platformRoutes.js (bukan requirePermission/requireRole biasa,
 *  yang keduanya berlaku DI DALAM satu tenant). Ini kelanjutan konsep
 *  `is_platform_admin` yang diperkenalkan Fase 4 untuk persetujuan upgrade
 *  paket (lihat billingController.js) — sekarang diperluas jadi panel yang
 *  lebih lengkap: daftar/kelola tenant, statistik, ubah paket manual, dan
 *  kelola siapa saja yang punya akses admin platform.
 * ============================================================================
 */

const TENANT_STATUSES = ['trial', 'active', 'suspended'];

// Pilihan jendela grafik pertumbuhan di Dashboard (Fase 5) — sengaja
// allowlist tetap (bukan angka bebas dari query string) karena nilainya
// disisipkan langsung ke teks INTERVAL SQL, lihat query userGrowth/
// subscriberGrowth di bawah.
const GROWTH_DAY_OPTIONS = [7, 30, 90];
const DEFAULT_GROWTH_DAYS = 30;

// GET /api/platform/stats?days=7|30|90 — ringkasan lintas seluruh tenant,
// dipakai Dashboard admin platform: KPI (login, langganan, aktivitas
// realtime — TIDAK ikut terpengaruh `days`, itu selalu "saat ini"), dua
// grafik pertumbuhan kumulatif sepanjang jendela yang diminta, dan feed
// aktivitas terbaru.
const getStats = asyncHandler(async (req, res) => {
  const growthDays = GROWTH_DAY_OPTIONS.includes(Number(req.query.days))
    ? Number(req.query.days)
    : DEFAULT_GROWTH_DAYS;

  const [[tenantTotals]] = await pool.query(
    `SELECT COUNT(*) AS total,
            COUNT(CASE WHEN status = 'trial' THEN 1 END) AS trial,
            COUNT(CASE WHEN status = 'active' THEN 1 END) AS active,
            COUNT(CASE WHEN status = 'suspended' THEN 1 END) AS suspended,
            COUNT(CASE WHEN plan != 'free' THEN 1 END) AS subscribed
     FROM tenants`
  );

  const [planRows] = await pool.query(`SELECT plan, COUNT(*) AS count FROM tenants GROUP BY plan`);
  const planCounts = Object.fromEntries(planRows.map((r) => [r.plan, r.count]));

  // Perkiraan pendapatan bulanan — dihitung dari harga katalog x jumlah tenant
  // per paket, BUKAN dari transaksi sungguhan (belum ada payment gateway,
  // lihat billingController). Paket gratis & Enterprise Custom (price: null,
  // bukan bagian katalog `plans` sama sekali) sengaja tidak ikut dihitung.
  // `includeInactive: true` — tenant yang masih di paket yang SUDAH
  // dipensiunkan (is_active=false) tetap harus ikut terhitung, mereka masih
  // membayar walau paketnya sudah tidak ditawarkan ke pelanggan baru.
  const estimatedMrr = getAllPlans({ includeInactive: true }).reduce((sum, plan) => {
    if (!plan.price) return sum;
    return sum + plan.price * (planCounts[plan.id] || 0);
  }, 0);

  const [[assetTotals]] = await pool.query(`SELECT COUNT(*) AS count FROM assets WHERE deleted_at IS NULL`);
  const [[userTotals]] = await pool.query(
    `SELECT COUNT(*) AS total,
            COUNT(CASE WHEN last_login_at IS NOT NULL THEN 1 END) AS "loggedIn"
     FROM users WHERE deleted_at IS NULL`
  );
  const [[recentSignups]] = await pool.query(
    `SELECT COUNT(*) AS count FROM tenants WHERE created_at >= (NOW() - INTERVAL '30 days')`
  );

  // "Aktif sekarang" — belum ada infrastruktur presence/websocket, jadi
  // dipakai proxy: pengguna dengan aksi apa pun (lihat audit_logs.action) di
  // audit_logs dalam 5 menit terakhir. Tidak realtime-push, tapi cukup akurat
  // untuk "siapa yang sedang benar-benar memakai sistem sekarang" tanpa perlu
  // membangun infra presence baru — frontend cukup polling ulang endpoint ini.
  const [[activeNow]] = await pool.query(
    `SELECT COUNT(DISTINCT user_id) AS users, COUNT(DISTINCT tenant_id) AS tenants
     FROM audit_logs WHERE created_at >= (NOW() - INTERVAL '5 minutes')`
  );

  // Kumulatif harian lewat generate_series + subquery korelasi — bukan yang
  // paling efisien, tapi jendelanya cuma 30 hari dan halaman ini jarang
  // dibuka, jadi kesederhanaan (gampang dibaca ulang setahun lagi) menang atas
  // performa mikro. `d.day` bertipe TIMESTAMPTZ (bukan DATE) karena salah satu
  // overload generate_series yang dipilih Postgres untuk argumen tanggal +
  // interval — `::text` langsung di atasnya jadi ikut membawa jam & zona waktu
  // ("2026-09-18 00:00:00+07"), bukan "2026-09-18" bersih seperti yang
  // dimaksud komentar aslinya. GrowthChart.jsx mengasumsikan string tanggal
  // polos (`new Date(isoDate + 'T00:00:00')`), jadi tanpa `::date` dulu SEBELUM
  // `::text`, label sumbu-X-nya jadi "Invalid Date". `::date::text` (dua cast)
  // yang benar, bukan `::text` saja.
  const [userGrowth] = await pool.query(
    `SELECT d.day::date::text AS date,
            (SELECT COUNT(*) FROM users u WHERE u.deleted_at IS NULL AND u.created_at::date <= d.day) AS value
     FROM generate_series((CURRENT_DATE - INTERVAL '${growthDays - 1} days')::date, CURRENT_DATE, '1 day') AS d(day)
     ORDER BY d.day ASC`
  );

  // CATATAN AKURASI: hanya menangkap tenant yang naik paket lewat checkout
  // self-serve (plan_upgrade_requests berstatus 'paid' -- dibayar lewat
  // Pakasir; 'approved' dipertahankan di filter untuk baris LAMA dari alur
  // verifikasi manual sebelum migration_pakasir_self_serve_billing.sql).
  // Koreksi paket manual oleh admin platform (lihat updateTenantPlan di
  // bawah) TIDAK tercatat di sini karena tidak ada tabel riwayat paket —
  // jadi grafik ini adalah PENDEKATAN, titik terakhirnya bisa sedikit lebih
  // rendah dari `tenants.subscribed` di atas. Itu bukan bug.
  const [subscriberGrowth] = await pool.query(
    `SELECT d.day::date::text AS date,
            (SELECT COUNT(DISTINCT pur.tenant_id) FROM plan_upgrade_requests pur
             WHERE pur.status IN ('paid', 'approved') AND pur.reviewed_at::date <= d.day) AS value
     FROM generate_series((CURRENT_DATE - INTERVAL '${growthDays - 1} days')::date, CURRENT_DATE, '1 day') AS d(day)
     ORDER BY d.day ASC`
  );

  const [recentActivity] = await pool.query(
    `SELECT al.id, al.action, al.entity_type AS "entityType", al.created_at AS "createdAt",
            u.name AS "userName", t.company_name AS "tenantName"
     FROM audit_logs al
     JOIN tenants t ON t.id = al.tenant_id
     LEFT JOIN users u ON u.id = al.user_id
     ORDER BY al.created_at DESC
     LIMIT 8`
  );

  res.json({
    tenants: tenantTotals,
    planCounts,
    estimatedMrr,
    totalAssets: assetTotals.count,
    totalUsers: userTotals.total,
    usersLoggedIn: userTotals.loggedIn,
    tenantsSubscribed: tenantTotals.subscribed,
    recentSignups: recentSignups.count,
    activeNow,
    growthDays,
    userGrowth,
    subscriberGrowth,
    recentActivity,
  });
});

// GET /api/platform/revenue?days=7|30|90 — dipakai halaman "Langganan &
// Pendapatan". BEDA dari getStats.estimatedMrr (perkiraan katalog): di sini
// `revenueAllTime`/`revenueGrowth` diambil dari tabel `invoices` yang sungguhan
// dibuat activateSubscription() saat pembayaran Pakasir dikonfirmasi lunas
// (lihat billingController.handlePakasirWebhook) — jadi angka pendapatan
// riil, bukan proyeksi.
// `estimatedMrr`/`planBreakdown` tetap proyeksi katalog (harga x jumlah
// tenant AKTIF sekarang di paket itu) karena tenant bisa downgrade/upgrade
// kapan saja — pendapatan BULAN DEPAN memang cuma bisa diperkirakan, bukan
// dihitung pasti dari histori.
const getRevenue = asyncHandler(async (req, res) => {
  const days = GROWTH_DAY_OPTIONS.includes(Number(req.query.days))
    ? Number(req.query.days)
    : DEFAULT_GROWTH_DAYS;

  const [planRows] = await pool.query(`SELECT plan, COUNT(*) AS count FROM tenants GROUP BY plan`);
  const planCounts = Object.fromEntries(planRows.map((r) => [r.plan, r.count]));

  const planBreakdown = getAllPlans({ includeInactive: true }).filter((p) => p.price).map((p) => ({
    id: p.id,
    name: p.name,
    tenantCount: planCounts[p.id] || 0,
    mrr: p.price * (planCounts[p.id] || 0),
  }));
  const estimatedMrr = planBreakdown.reduce((sum, p) => sum + p.mrr, 0);
  const payingTenants = planBreakdown.reduce((sum, p) => sum + p.tenantCount, 0);

  const [[{ total: revenueAllTime }]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM invoices WHERE status = 'paid'`
  );

  // Kumulatif — sama persis pola userGrowth/subscriberGrowth di getStats,
  // supaya bisa dipakai langsung oleh komponen GrowthChart yang sama
  // (komponennya sengaja tidak menjumlahkan apa pun sendiri). `d.day::date::text`
  // (BUKAN `d.day::text` saja) — lihat catatan panjang di getStats.userGrowth
  // soal kenapa cast tunggal membawa jam & zona waktu yang bikin GrowthChart
  // gagal mem-parsing tanggalnya.
  const [revenueGrowth] = await pool.query(
    `SELECT d.day::date::text AS date,
            COALESCE((SELECT SUM(i.amount) FROM invoices i WHERE i.status = 'paid' AND i.paid_at::date <= d.day), 0) AS value
     FROM generate_series((CURRENT_DATE - INTERVAL '${days - 1} days')::date, CURRENT_DATE, '1 day') AS d(day)
     ORDER BY d.day ASC`
  );

  // Pratinjau ringkas ganti paket terakhir (lunas via Pakasir, dibatalkan,
  // atau diterapkan langsung karena paket Free) -- 'approved'/'rejected'
  // ikut disertakan supaya baris LAMA dari alur verifikasi manual (sebelum
  // migration_pakasir_self_serve_billing.sql) tetap muncul di riwayat.
  const [recentConversions] = await pool.query(
    `SELECT r.id, r.requested_plan AS "requestedPlan", r.previous_plan AS "previousPlan",
            r.status, r.reviewed_at AS "reviewedAt", t.company_name AS "tenantName"
     FROM plan_upgrade_requests r
     JOIN tenants t ON t.id = r.tenant_id
     WHERE r.status IN ('paid', 'applied', 'canceled', 'approved', 'rejected')
     ORDER BY r.reviewed_at DESC
     LIMIT 6`
  );

  res.json({
    estimatedMrr,
    payingTenants,
    arpu: payingTenants > 0 ? Math.round(estimatedMrr / payingTenants) : 0,
    revenueAllTime: Number(revenueAllTime),
    planBreakdown,
    days,
    revenueGrowth,
    recentConversions,
  });
});

// GET /api/platform/activity?action=&tenantId= — feed aktivitas lintas tenant
// yang ramah dibaca (mirip kartu "Aktivitas Realtime" di Dashboard, tapi daftar
// penuh + filter), dipoll berkala oleh frontend. SENGAJA tidak menyertakan
// oldValues/newValues seperti listAllAuditLogs — payload itu berat dan tidak
// perlu untuk feed yang di-refresh tiap beberapa detik; kalau admin butuh
// detail before/after, itu tugas halaman Log Audit Platform, bukan ini.
const ACTIVITY_LIMIT = 100;
const getActivity = asyncHandler(async (req, res) => {
  const { action, tenantId } = req.query;
  const conditions = [];
  const params = {};
  if (action) {
    conditions.push('al.action = :action');
    params.action = action;
  }
  if (tenantId) {
    conditions.push('al.tenant_id = :tenantId');
    params.tenantId = tenantId;
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT al.id, al.action, al.entity_type AS "entityType", al.created_at AS "createdAt",
            u.name AS "userName", t.id AS "tenantId", t.company_name AS "tenantName"
     FROM audit_logs al
     JOIN tenants t ON t.id = al.tenant_id
     LEFT JOIN users u ON u.id = al.user_id
     ${whereClause}
     ORDER BY al.created_at DESC
     LIMIT ${ACTIVITY_LIMIT}`,
    params
  );

  res.json({ logs: rows });
});

/**
 * ============================================================================
 *  KATALOG PAKET (CRUD) — dipakai halaman Katalog Paket admin platform
 * ============================================================================
 *  Sumber kebenaran sekarang tabel `plans` (lihat
 *  migrations/migration_plans_catalog_db.sql) — config/plans.js hanya
 *  pemuat cache di memori. Setiap fungsi yang MENULIS di sini WAJIB
 *  memanggil `reloadPlansCache()` sesudahnya, kalau tidak permintaan
 *  berikutnya (di proses Node yang sama) masih membaca data lama sampai
 *  server di-restart.
 *
 *  Paket 'free' dikunci di beberapa sisi (lihat guard PROTECTED_FREE_PLAN_ID
 *  di bawah) karena authController.signup/googleSignup dan
 *  subscriptionService.downgradeToFreeOnExpiry mengasumsikannya SELALU ada
 *  dan SELALU gratis — kalau itu berubah tanpa sepengetahuan kode-kode itu,
 *  tenant baru & penurunan otomatis kedaluwarsa langsung rusak.
 * ============================================================================
 */
const PROTECTED_FREE_PLAN_ID = 'free';
const PLAN_ID_REGEX = /^[a-z][a-z0-9_]{1,49}$/;

function normalizeNullableInt(value, fieldLabel) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    const err = new Error(`${fieldLabel} harus bilangan bulat >= 0, atau dikosongkan untuk tanpa batas.`);
    err.status = 400;
    throw err;
  }
  return n;
}

function normalizeFeatures(features) {
  if (!Array.isArray(features)) return [];
  return features.map((f) => String(f).trim()).filter(Boolean).slice(0, 30);
}

// GET /api/platform/plans — SEMUA paket termasuk yang sudah dipensiunkan
// (is_active=false), beda dari GET /api/billing/plans (publik, aktif saja).
const listPlansAdmin = asyncHandler(async (req, res) => {
  res.json({ plans: getAllPlans({ includeInactive: true }) });
});

// POST /api/platform/plans — buat paket baru, ditambahkan di URUTAN PALING
// BAWAH katalog (sort_order = max+1). Urutan tingkatannya sendiri baru
// bisa diatur sesudahnya lewat movePlan (naik/turun).
const createPlan = asyncHandler(async (req, res) => {
  const { id, name, tagline, price, priceYearly, maxAssets, maxUsers, locationLimit,
    features, highlight, custom, selfServe, customPricingHint } = req.body;

  const normalizedId = String(id || '').trim().toLowerCase();
  if (!PLAN_ID_REGEX.test(normalizedId)) {
    return res.status(400).json({ message: 'ID paket harus huruf kecil/angka/garis bawah, diawali huruf, 2-50 karakter (mis. "starter_plus").' });
  }
  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: 'Nama paket wajib diisi.' });
  }

  const [[existing]] = await pool.query(`SELECT id FROM plans WHERE id = :id`, { id: normalizedId });
  if (existing) {
    return res.status(409).json({ message: `ID paket "${normalizedId}" sudah dipakai.` });
  }

  const [[{ nextOrder }]] = await pool.query(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS "nextOrder" FROM plans`);

  const priceValue = Number(price) || 0;
  await pool.query(
    `INSERT INTO plans (id, name, tagline, price, price_yearly, max_assets, max_users, location_limit,
                          features, highlight, custom, self_serve, custom_pricing_hint, sort_order, is_active)
     VALUES (:id, :name, :tagline, :price, :priceYearly, :maxAssets, :maxUsers, :locationLimit,
             :features, :highlight, :custom, :selfServe, :customPricingHint, :sortOrder, TRUE)`,
    {
      id: normalizedId,
      name: String(name).trim(),
      tagline: String(tagline || '').trim(),
      price: priceValue,
      priceYearly: normalizeNullableInt(priceYearly, 'Harga tahunan'),
      maxAssets: normalizeNullableInt(maxAssets, 'Batas aset'),
      maxUsers: normalizeNullableInt(maxUsers, 'Batas pengguna'),
      locationLimit: normalizeNullableInt(locationLimit, 'Batas lokasi'),
      features: JSON.stringify(normalizeFeatures(features)),
      highlight: Boolean(highlight),
      custom: Boolean(custom),
      selfServe: selfServe === undefined ? true : Boolean(selfServe),
      customPricingHint: customPricingHint ? String(customPricingHint).trim() : null,
      sortOrder: nextOrder,
    }
  );

  await reloadPlansCache();
  // entityId TIDAK dioper -- audit_logs.entity_id bertipe BIGINT, sedangkan
  // id paket adalah slug teks ('starter', dst.), jadi disertakan di
  // newValues saja (JSONB, terima teks apa pun).
  await logAudit({ userId: req.user.id, action: 'create', entityType: 'plan', newValues: { id: normalizedId, name } });

  res.status(201).json({ plan: getPlan(normalizedId) });
});

// PATCH /api/platform/plans/:id — update sebagian field. `id` dan `sortOrder`
// TIDAK bisa diubah lewat sini (id = primary key/immutable, sortOrder lewat
// movePlan) — dikirim di body tetap diabaikan, bukan galat, supaya frontend
// boleh mengirim objek paket apa adanya tanpa harus menyaringnya dulu.
const updatePlan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [[existing]] = await pool.query(`SELECT * FROM plans WHERE id = :id`, { id });
  if (!existing) return res.status(404).json({ message: 'Paket tidak ditemukan.' });

  const body = req.body;
  const isFree = id === PROTECTED_FREE_PLAN_ID;

  if (isFree && body.price !== undefined && Number(body.price) !== 0) {
    return res.status(400).json({ message: 'Paket Free tidak boleh diberi harga — signup mandiri mengasumsikannya selalu gratis.' });
  }
  if (isFree && body.isActive === false) {
    return res.status(400).json({ message: 'Paket Free tidak boleh dinonaktifkan — dipakai signup mandiri & penurunan otomatis saat kedaluwarsa.' });
  }

  const next = {
    name: body.name !== undefined ? String(body.name).trim() : existing.name,
    tagline: body.tagline !== undefined ? String(body.tagline).trim() : existing.tagline,
    price: body.price !== undefined ? (Number(body.price) || 0) : existing.price,
    priceYearly: body.priceYearly !== undefined ? normalizeNullableInt(body.priceYearly, 'Harga tahunan') : existing.price_yearly,
    maxAssets: body.maxAssets !== undefined ? normalizeNullableInt(body.maxAssets, 'Batas aset') : existing.max_assets,
    maxUsers: body.maxUsers !== undefined ? normalizeNullableInt(body.maxUsers, 'Batas pengguna') : existing.max_users,
    locationLimit: body.locationLimit !== undefined ? normalizeNullableInt(body.locationLimit, 'Batas lokasi') : existing.location_limit,
    features: body.features !== undefined ? JSON.stringify(normalizeFeatures(body.features)) : JSON.stringify(existing.features),
    highlight: body.highlight !== undefined ? Boolean(body.highlight) : existing.highlight,
    custom: body.custom !== undefined ? Boolean(body.custom) : existing.custom,
    selfServe: body.selfServe !== undefined ? Boolean(body.selfServe) : existing.self_serve,
    customPricingHint: body.customPricingHint !== undefined ? (body.customPricingHint ? String(body.customPricingHint).trim() : null) : existing.custom_pricing_hint,
    isActive: body.isActive !== undefined ? Boolean(body.isActive) : existing.is_active,
  };

  await pool.query(
    `UPDATE plans SET name = :name, tagline = :tagline, price = :price, price_yearly = :priceYearly,
            max_assets = :maxAssets, max_users = :maxUsers, location_limit = :locationLimit,
            features = :features, highlight = :highlight, custom = :custom, self_serve = :selfServe,
            custom_pricing_hint = :customPricingHint, is_active = :isActive
     WHERE id = :id`,
    { id, ...next }
  );

  await reloadPlansCache();
  await logAudit({ userId: req.user.id, action: 'update', entityType: 'plan', newValues: { id, ...next } });

  res.json({ plan: getPlan(id) });
});

// PATCH /api/platform/plans/:id/move — { direction: 'up'|'down' }. Menukar
// sort_order dengan tetangga terdekat (BUKAN drag-and-drop bebas) — cukup
// untuk katalog yang isinya beberapa paket saja, dan tidak mungkin
// menghasilkan urutan yang bentrok/tidak lengkap seperti reorder bebas bisa.
const movePlan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const direction = req.body.direction === 'up' ? 'up' : req.body.direction === 'down' ? 'down' : null;
  if (!direction) return res.status(400).json({ message: 'direction harus "up" atau "down".' });

  const ordered = getAllPlans({ includeInactive: true });
  const idx = ordered.findIndex((p) => p.id === id);
  if (idx === -1) return res.status(404).json({ message: 'Paket tidak ditemukan.' });

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= ordered.length) {
    return res.status(400).json({ message: `Paket ini sudah paling ${direction === 'up' ? 'atas' : 'bawah'}.` });
  }

  const current = ordered[idx];
  const neighbor = ordered[swapIdx];

  await pool.query(`UPDATE plans SET sort_order = :sortOrder WHERE id = :id`, { id: current.id, sortOrder: neighbor.sortOrder });
  await pool.query(`UPDATE plans SET sort_order = :sortOrder WHERE id = :id`, { id: neighbor.id, sortOrder: current.sortOrder });

  await reloadPlansCache();
  await logAudit({ userId: req.user.id, action: 'update', entityType: 'plan', newValues: { id, moved: direction, swappedWith: neighbor.id } });

  res.json({ plans: getAllPlans({ includeInactive: true }) });
});

// DELETE /api/platform/plans/:id — ditolak kalau paket 'free', atau kalau
// masih dipakai tenant/subscription/permintaan upgrade mana pun (lihat
// catatan "SENGAJA BUKAN FK" di migration_plans_catalog_db.sql — larangan
// ini ditegakkan di sini, bukan di database).
const deletePlan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (id === PROTECTED_FREE_PLAN_ID) {
    return res.status(400).json({ message: 'Paket Free tidak boleh dihapus.' });
  }

  const [[existing]] = await pool.query(`SELECT id, name FROM plans WHERE id = :id`, { id });
  if (!existing) return res.status(404).json({ message: 'Paket tidak ditemukan.' });

  const [[usage]] = await pool.query(
    `SELECT
        (SELECT COUNT(*) FROM tenants WHERE plan = :id) AS "tenantCount",
        (SELECT COUNT(*) FROM subscriptions WHERE plan_id = :id) AS "subscriptionCount",
        (SELECT COUNT(*) FROM plan_upgrade_requests WHERE requested_plan = :id OR previous_plan = :id) AS "requestCount"`,
    { id }
  );
  const stillUsed = Number(usage.tenantCount) > 0 || Number(usage.subscriptionCount) > 0 || Number(usage.requestCount) > 0;
  if (stillUsed) {
    return res.status(409).json({
      message: `Paket "${existing.name}" masih dipakai (${usage.tenantCount} tenant, ${usage.subscriptionCount} riwayat langganan, ${usage.requestCount} permintaan upgrade) — nonaktifkan saja (jangan tampil di katalog publik) daripada dihapus.`,
    });
  }

  await pool.query(`DELETE FROM plans WHERE id = :id`, { id });
  await reloadPlansCache();
  await logAudit({ userId: req.user.id, action: 'delete', entityType: 'plan', oldValues: { id, name: existing.name } });

  res.json({ message: `Paket "${existing.name}" dihapus.` });
});

// GET /api/platform/tenants — semua tenant + pemakaian ringkas masing-masing.
const listTenants = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT t.id, t.slug, t.company_name AS "companyName", t.status, t.plan,
            t.plan_expires_at AS "planExpiresAt", t.created_at AS "createdAt",
            (SELECT COUNT(*) FROM assets a WHERE a.tenant_id = t.id AND a.deleted_at IS NULL) AS "assetCount",
            (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.deleted_at IS NULL) AS "userCount",
            (SELECT CONCAT(u2.name, ' <', u2.email, '>')
             FROM users u2 JOIN roles r ON r.id = u2.role_id
             WHERE u2.tenant_id = t.id AND r.name = 'admin' AND u2.deleted_at IS NULL
             ORDER BY u2.created_at ASC LIMIT 1) AS "ownerContact"
     FROM tenants t
     ORDER BY t.created_at DESC`
  );
  res.json({ tenants: rows });
});

// PATCH /api/platform/tenants/:id/status — { status: 'trial'|'active'|'suspended' }
const updateTenantStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!TENANT_STATUSES.includes(status)) {
    return res.status(400).json({ message: 'Status tidak valid.' });
  }

  const [[tenant]] = await pool.query(`SELECT id, status FROM tenants WHERE id = :id`, { id });
  if (!tenant) return res.status(404).json({ message: 'Tenant tidak ditemukan.' });

  await pool.query(`UPDATE tenants SET status = :status WHERE id = :id`, { status, id });

  await logAudit({
    userId: req.user.id, tenantId: Number(id), action: 'update', entityType: 'tenant_status', entityId: Number(id),
    oldValues: { status: tenant.status }, newValues: { status },
  });

  res.json({ id: Number(id), status });
});

// PATCH /api/platform/tenants/:id/plan — { plan, expiresAt? } — koreksi manual
// admin platform, DI LUAR alur pengajuan upgrade biasa (lihat billingController)
// — makanya boleh set paket apa pun termasuk Enterprise Custom, tidak dibatasi
// SELF_SERVE_PLAN_IDS.
const updateTenantPlan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { plan, expiresAt } = req.body;

  const planConfig = getPlan(plan);
  if (!planConfig) {
    return res.status(400).json({ message: 'Paket tidak dikenali.' });
  }

  const [[tenant]] = await pool.query(`SELECT id, plan FROM tenants WHERE id = :id`, { id });
  if (!tenant) return res.status(404).json({ message: 'Tenant tidak ditemukan.' });

  // Free tidak pernah kedaluwarsa. Paket lain memakai tanggal yang dikirim
  // admin; kosong berarti sengaja tanpa batas waktu (penyesuaian manual
  // permanen), bukan diwarisi dari nilai lama — supaya perilakunya eksplisit,
  // bukan tebakan.
  const resolvedExpiresAt = planConfig.price ? (expiresAt ? new Date(expiresAt) : null) : null;

  // Lewat subscriptionService (bukan UPDATE tenants langsung) supaya koreksi
  // manual ini juga tercatat sebagai riwayat subscriptions — lihat
  // subscriptionService.recordManualCorrection.
  await recordManualCorrection({
    tenantId: Number(id), planId: plan, expiresAt: resolvedExpiresAt, createdBy: req.user.id,
  });

  await logAudit({
    userId: req.user.id, tenantId: Number(id), action: 'update', entityType: 'tenant_plan', entityId: Number(id),
    oldValues: { plan: tenant.plan }, newValues: { plan, expiresAt: resolvedExpiresAt },
  });

  res.json({ id: Number(id), plan, planExpiresAt: resolvedExpiresAt });
});

// DELETE /api/platform/tenants/:id — { confirmSlug } — hapus tenant PERMANEN.
// Ireversibel: seluruh data tenant (aset, pengguna, riwayat, dst.) ikut
// terhapus lewat ON DELETE CASCADE (lihat schema.postgres.sql — setiap tabel
// tenant-scoped mereferensikan tenants(id) ON DELETE CASCADE). Konfirmasi
// wajib mengetik ulang slug tenant persis (pola "ketik nama repo untuk
// hapus") — jauh lebih berisiko daripada updateTenantStatus (suspend masih
// bisa dibalik, ini tidak).
const deleteTenant = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { confirmSlug } = req.body;

  const [[tenant]] = await pool.query(`SELECT id, slug, company_name AS "companyName" FROM tenants WHERE id = :id`, { id });
  if (!tenant) return res.status(404).json({ message: 'Tenant tidak ditemukan.' });

  if (!confirmSlug || String(confirmSlug).trim().toLowerCase() !== tenant.slug) {
    return res.status(400).json({ message: `Ketik kode perusahaan "${tenant.slug}" persis untuk konfirmasi penghapusan.` });
  }

  // Katup pengaman: tenant yang jadi "rumah" satu atau lebih admin platform
  // tidak boleh langsung dihapus di sini — cabut dulu akses admin platform
  // penggunanya lewat menu Admin Platform, supaya tidak ada admin platform
  // yang tiba-tiba kehilangan akun begitu saja lewat aksi ini.
  const [[{ count: platformAdminCount }]] = await pool.query(
    `SELECT COUNT(*) AS count FROM users WHERE tenant_id = :id AND is_platform_admin = TRUE`, { id }
  );
  if (platformAdminCount > 0) {
    return res.status(409).json({
      message: 'Tenant ini masih punya admin platform aktif. Cabut dulu akses admin platform semua penggunanya lewat menu Admin Platform sebelum menghapus tenant ini.',
    });
  }

  await pool.query(`DELETE FROM tenants WHERE id = :id`, { id });

  /* tenantId di sini SENGAJA diisi tenant milik PELAKU (req.user.tenant_id),
     bukan tenant yang baru dihapus -- audit_logs.tenant_id juga ON DELETE
     CASCADE ke tenants, jadi kalau dicatat di bawah tenant yang dihapus,
     baris audit ini sendiri ikut lenyap bersamanya dan jejaknya hilang. */
  await logAudit({
    userId: req.user.id, tenantId: req.user.tenant_id, action: 'delete', entityType: 'tenant', entityId: Number(id),
    oldValues: { slug: tenant.slug, companyName: tenant.companyName },
  });

  res.json({ id: Number(id), message: `Tenant "${tenant.companyName}" berhasil dihapus permanen.` });
});

// GET /api/platform/admins — semua pengguna dengan akses admin platform.
const listPlatformAdmins = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.username, u.status, t.id AS "tenantId", t.company_name AS "tenantName"
     FROM users u JOIN tenants t ON t.id = u.tenant_id
     WHERE u.is_platform_admin = TRUE AND u.deleted_at IS NULL
     ORDER BY u.name ASC`
  );
  res.json({ admins: rows });
});

// POST /api/platform/admins — { name, email, username } — bikin akun admin
// platform BARU langsung dari sini, tanpa harus lewat "buat tenant, buat
// user tenant, baru cari & beri akses" seperti alur setPlatformAdmin di
// bawah. Akun barunya ditaruh di tenant YANG SAMA dengan admin platform yang
// membuatnya (req.user.tenant_id) — bukan tenant baru — karena akun ini
// murni identitas staf platform, tidak pernah dipakai untuk mengelola aset
// tenant mana pun (lihat ProtectedRoute `platform` di frontend/src/App.jsx).
// Kata sandi awal dibuatkan sistem & dikirim ke surel, sama seperti
// userController.createUser — admin yang membuat akun ini tidak pernah tahu
// kata sandi orang lain.
const createPlatformAdmin = asyncHandler(async (req, res) => {
  const { name, email, username } = req.body;
  if (!name || !email || !username) {
    return res.status(400).json({ message: 'Nama, surel, dan nama pengguna wajib diisi.' });
  }

  const normalizedUsername = String(username).toLowerCase().trim();
  if (!USERNAME_REGEX.test(normalizedUsername)) {
    return res.status(400).json({
      message: 'Nama pengguna hanya boleh huruf kecil, angka, garis bawah (_), tanda minus (-), minimal 3 karakter.',
    });
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ message: 'Alamat surel tidak valid.' });
  }

  const tenantId = req.user.tenant_id;

  const [existingUsername] = await pool.query(
    `SELECT id FROM users WHERE tenant_id = :tenantId AND username = :username AND deleted_at IS NULL`,
    { tenantId, username: normalizedUsername }
  );
  if (existingUsername[0]) return res.status(409).json({ message: 'Nama pengguna sudah dipakai.' });

  const [existingEmail] = await pool.query(
    `SELECT id FROM users WHERE tenant_id = :tenantId AND email = :email AND deleted_at IS NULL`,
    { tenantId, email }
  );
  if (existingEmail[0]) return res.status(409).json({ message: 'Surel sudah dipakai admin platform lain.' });

  const [[adminRole]] = await pool.query(`SELECT id FROM roles WHERE name = 'admin' LIMIT 1`);
  if (!adminRole) return res.status(500).json({ message: 'Peran internal "admin" tidak ada di database.' });

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const [result] = await pool.query(
    `INSERT INTO users (tenant_id, username, role_id, is_platform_admin, name, email, password_hash, status, email_verified_at)
     VALUES (:tenantId, :username, :roleId, TRUE, :name, :email, :passwordHash, 'active', NOW()) RETURNING id`,
    { tenantId, username: normalizedUsername, roleId: adminRole.id, name, email, passwordHash }
  );

  await logAudit({
    userId: req.user.id, tenantId, action: 'create', entityType: 'platform_admin', entityId: result.insertId,
    newValues: { username: normalizedUsername, name, email },
  });

  let emailSent = true;
  try {
    const loginUrl = `${(process.env.FRONTEND_URL || '').replace(/\/$/, '')}/login`;
    await sendNewUserWelcome({ to: email, name, username: normalizedUsername, password: tempPassword, loginUrl, tenantId });
  } catch (err) {
    console.error('Gagal mengirim surel akun admin platform baru:', err.message);
    emailSent = false;
  }

  res.status(201).json({
    id: result.insertId, name, email, username: normalizedUsername,
    message: emailSent
      ? `Admin platform "${name}" berhasil ditambahkan. Kata sandi awal telah dikirim ke ${email}.`
      : `Admin platform "${name}" berhasil ditambahkan, tapi pengiriman surel kata sandi awal gagal. Minta yang bersangkutan memakai "Lupa Kata Sandi" di halaman Masuk.`,
  });
});

// GET /api/platform/users?page=&limit=&q= — DIREKTORI pengguna LINTAS TENANT,
// dipaginasi (beda dari searchUsers di bawah: itu untuk memberi/mencabut
// akses admin platform, minimal 2 huruf, maks 20 baris tanpa halaman
// berikutnya — dibiarkan apa adanya supaya tidak mengubah alur yang sudah
// dipakai PlatformAdmins.jsx). `q` opsional di sini, beda dari searchUsers.
const listAllUsers = asyncHandler(async (req, res) => {
  // String(...) wajib -- query string yang aneh (mis. ?q[]=a&q[]=b) membuat
  // req.query.q jadi array, dan .trim() array melempar TypeError (500).
  // searchUsers di bawah sudah benar begini; ini yang sempat terlewat.
  const q = String(req.query.q || '').trim();
  const { page, limit } = clampPagination(req.query, { defaultLimit: 20 });
  const offset = (page - 1) * limit;

  const conditions = ['u.deleted_at IS NULL'];
  const params = {};
  if (q) {
    conditions.push('(u.name ILIKE :like OR u.email ILIKE :like OR u.username ILIKE :like)');
    params.like = `%${q}%`;
  }
  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.username, u.status, u.is_platform_admin AS "isPlatformAdmin",
            u.last_login_at AS "lastLoginAt", u.created_at AS "createdAt",
            t.id AS "tenantId", t.company_name AS "tenantName", r.name AS role
     FROM users u
     JOIN tenants t ON t.id = u.tenant_id
     JOIN roles r ON r.id = u.role_id
     ${whereClause}
     ORDER BY u.created_at DESC
     LIMIT :limit OFFSET :offset`,
    { ...params, limit: Number(limit), offset }
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM users u ${whereClause}`, params
  );

  res.json({
    users: rows.map((r) => ({ ...r, isPlatformAdmin: Boolean(r.isPlatformAdmin) })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// GET /api/platform/audit-log?page=&limit=&action=&search=&dateFrom=&dateTo=
// — log audit LINTAS TENANT. Sumber & bentuk datanya sama seperti
// auditController.listAuditLogs (halaman Riwayat Aktivitas per-tenant), tapi
// TANPA filter tenant_id — sengaja dipisah jadi fungsi sendiri daripada
// menambah parameter "lintas tenant" opsional ke listAuditLogs, karena
// endpoint itu dijaga requirePermission biasa, bukan requirePlatformAdmin.
const listAllAuditLogs = asyncHandler(async (req, res) => {
  const { action, search = '', dateFrom, dateTo } = req.query;
  const { page, limit } = clampPagination(req.query, { defaultLimit: 25 });
  const offset = (page - 1) * limit;

  const conditions = [];
  const params = {};
  if (action) {
    conditions.push('al.action = :action');
    params.action = action;
  }
  if (search) {
    conditions.push('(u.name ILIKE :searchLike OR t.company_name ILIKE :searchLike)');
    params.searchLike = `%${search}%`;
  }
  if (dateFrom) {
    conditions.push('al.created_at >= :dateFrom');
    params.dateFrom = `${dateFrom} 00:00:00`;
  }
  if (dateTo) {
    conditions.push('al.created_at <= :dateTo');
    params.dateTo = `${dateTo} 23:59:59`;
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT al.id, al.action, al.entity_type AS "entityType", al.entity_id AS "entityId",
            al.old_values AS "oldValues", al.new_values AS "newValues", al.ip_address AS "ipAddress", al.created_at AS "createdAt",
            u.id AS "userId", u.name AS "userName", t.id AS "tenantId", t.company_name AS "tenantName"
     FROM audit_logs al
     JOIN tenants t ON t.id = al.tenant_id
     LEFT JOIN users u ON u.id = al.user_id
     ${whereClause}
     ORDER BY al.created_at DESC, al.id DESC
     LIMIT :limit OFFSET :offset`,
    { ...params, limit: Number(limit), offset }
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM audit_logs al JOIN tenants t ON t.id = al.tenant_id LEFT JOIN users u ON u.id = al.user_id ${whereClause}`,
    params
  );

  const parse = (value) => {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return { _raw: String(value) }; }
  };

  res.json({
    logs: rows.map((r) => ({ ...r, oldValues: parse(r.oldValues), newValues: parse(r.newValues) })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// GET /api/platform/users/search?q= — cari pengguna LINTAS TENANT untuk
// diberi/dicabut akses admin platform (lihat setPlatformAdmin). Minimal 2
// karakter supaya tidak menyapu seluruh tabel users pada pengetikan pertama.
const searchUsers = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ users: [] });

  const like = `%${q}%`;
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.username, u.is_platform_admin AS "isPlatformAdmin",
            t.id AS "tenantId", t.company_name AS "tenantName"
     FROM users u JOIN tenants t ON t.id = u.tenant_id
     WHERE u.deleted_at IS NULL AND (u.email ILIKE :like OR u.username ILIKE :like OR u.name ILIKE :like)
     ORDER BY u.name ASC LIMIT 20`,
    { like }
  );
  res.json({ users: rows.map((r) => ({ ...r, isPlatformAdmin: Boolean(r.isPlatformAdmin) })) });
});

// PATCH /api/platform/users/:id/platform-admin — { grant: boolean }
const setPlatformAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const grant = Boolean(req.body.grant);

  const [[targetUser]] = await pool.query(
    `SELECT id, tenant_id AS "tenantId", name, email, is_platform_admin AS "isPlatformAdmin"
     FROM users WHERE id = :id AND deleted_at IS NULL`,
    { id }
  );
  if (!targetUser) return res.status(404).json({ message: 'Pengguna tidak ditemukan.' });

  // Katup pengaman: jangan sampai mencabut akses admin platform TERAKHIR yang
  // tersisa — begitu itu terjadi, tidak ada lagi siapa pun yang bisa membuka
  // panel ini untuk memberi akses balik.
  if (!grant && targetUser.isPlatformAdmin) {
    const [[{ count }]] = await pool.query(
      `SELECT COUNT(*) AS count FROM users WHERE is_platform_admin = TRUE AND status = 'active' AND deleted_at IS NULL`
    );
    if (count <= 1) {
      return res.status(409).json({ message: 'Tidak bisa mencabut akses admin platform terakhir yang tersisa.' });
    }
  }

  await pool.query(`UPDATE users SET is_platform_admin = :grant WHERE id = :id`, { grant, id });

  await logAudit({
    userId: req.user.id, tenantId: targetUser.tenantId, action: 'update', entityType: 'platform_admin', entityId: Number(id),
    oldValues: { isPlatformAdmin: Boolean(targetUser.isPlatformAdmin) }, newValues: { isPlatformAdmin: grant },
  });

  res.json({ id: Number(id), isPlatformAdmin: grant });
});

// POST /api/platform/plan-expiry/run — jalankan pengecekan kedaluwarsa paket
// sekarang juga, untuk menguji tanpa menunggu jadwal cron jam 2 pagi (lihat
// jobs/planExpiry.js, dijadwalkan di server.js).
const runPlanExpiryNow = asyncHandler(async (req, res) => {
  const result = await runPlanExpiryCheck();
  res.json({
    message: `${result.downgraded} dari ${result.tenantsChecked} tenant berpaket kedaluwarsa diturunkan ke Free.`,
    ...result,
  });
});

// GET /api/platform/ip-whitelist — daftar IP yang lewat semua pembatas laju
// (lihat utils/ipWhitelist.js) + `myIp` supaya frontend bisa tawarkan
// "tambahkan IP saya sekarang" tanpa admin perlu mencari tahu IP-nya sendiri
// dulu (persis kebutuhan yang memicu fitur ini: admin terkunci pembatas laju
// signup saat menguji, dan tidak ada cara cepat membuka jalan untuk diri
// sendiri selain minta developer me-restart server).
const listIpWhitelist = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT w.id, w.ip_address AS "ipAddress", w.label, w.created_at AS "createdAt", u.name AS "createdByName"
     FROM ip_whitelist w
     LEFT JOIN users u ON u.id = w.created_by
     ORDER BY w.created_at DESC`
  );
  res.json({ whitelist: rows, myIp: normalizeIp(req.ip) });
});

// POST /api/platform/ip-whitelist — { ipAddress, label? }
const addIpWhitelist = asyncHandler(async (req, res) => {
  const { ipAddress, label } = req.body;
  if (!ipAddress || !String(ipAddress).trim()) {
    return res.status(400).json({ message: 'Alamat IP wajib diisi.' });
  }
  const ip = normalizeIp(String(ipAddress).trim());
  if (!IP_FORMAT_REGEX.test(ip)) {
    return res.status(400).json({ message: 'Format alamat IP tidak valid.' });
  }
  const trimmedLabel = label ? String(label).trim().slice(0, 150) : null;

  let result;
  try {
    [result] = await pool.query(
      `INSERT INTO ip_whitelist (ip_address, label, created_by) VALUES (:ip, :label, :userId) RETURNING id`,
      { ip, label: trimmedLabel, userId: req.user.id }
    );
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Alamat IP ini sudah ada di daftar putih.' });
    throw err;
  }

  // Segarkan cache di memori SEBELUM balas -- kalau admin langsung mencoba
  // ulang aksi yang tadi kena batas (mis. klik "Daftar" lagi), permintaan
  // berikutnya harus sudah lewat, bukan menunggu penyegaran berikutnya.
  await reloadIpWhitelist();

  await logAudit({
    userId: req.user.id, tenantId: req.user.tenant_id, action: 'create', entityType: 'ip_whitelist', entityId: result.insertId,
    newValues: { ipAddress: ip, label: trimmedLabel },
  });

  res.status(201).json({ id: result.insertId, ipAddress: ip, label: trimmedLabel });
});

// DELETE /api/platform/ip-whitelist/:id
const removeIpWhitelist = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [[row]] = await pool.query(`SELECT ip_address AS "ipAddress" FROM ip_whitelist WHERE id = :id`, { id });
  if (!row) return res.status(404).json({ message: 'Alamat IP tidak ditemukan.' });

  await pool.query(`DELETE FROM ip_whitelist WHERE id = :id`, { id });
  await reloadIpWhitelist();

  await logAudit({
    userId: req.user.id, tenantId: req.user.tenant_id, action: 'delete', entityType: 'ip_whitelist', entityId: Number(id),
    oldValues: { ipAddress: row.ipAddress },
  });

  res.json({ id: Number(id), message: `Alamat IP ${row.ipAddress} dihapus dari daftar putih.` });
});

/**
 * GET /api/platform/testimonials?status=pending|approved|rejected|all
 * Tinjauan testimoni tenant (lihat testimonialController.submitTestimonial)
 * sebelum tampil publik di landing page. `status` bawaan 'pending' --
 * itulah yang benar-benar butuh ditindaklanjuti.
 */
const listTestimonials = asyncHandler(async (req, res) => {
  const statusFilter = req.query.status === 'all' ? null : (req.query.status || 'pending');

  const [rows] = await pool.query(
    `SELECT t.id, t.author_name AS "authorName", t.author_role AS "authorRole", t.company_name AS "companyName",
            t.rating, t.message, t.status, t.created_at AS "createdAt", t.reviewed_at AS "reviewedAt",
            tn.id AS "tenantId"
     FROM testimonials t
     JOIN tenants tn ON tn.id = t.tenant_id
     ${statusFilter ? 'WHERE t.status = :statusFilter' : ''}
     ORDER BY t.created_at DESC`,
    statusFilter ? { statusFilter } : {}
  );

  res.json({ testimonials: rows });
});

/**
 * POST /api/platform/testimonials/:id/approve
 * POST /api/platform/testimonials/:id/reject
 * Disetujui -> langsung muncul di GET /public/testimonials (diurutkan dari
 * reviewed_at, lihat testimonialController.listPublicTestimonials).
 */
function resolveTestimonial(approve) {
  return asyncHandler(async (req, res) => {
    const { id } = req.params;
    const [[testimonial]] = await pool.query(`SELECT id, status, tenant_id AS "tenantId" FROM testimonials WHERE id = :id`, { id });
    if (!testimonial) return res.status(404).json({ message: 'Testimoni tidak ditemukan.' });
    if (testimonial.status !== 'pending') {
      return res.status(409).json({ message: 'Testimoni ini sudah ditinjau sebelumnya.' });
    }

    const status = approve ? 'approved' : 'rejected';
    await pool.query(
      `UPDATE testimonials SET status = :status, reviewed_by = :reviewedBy, reviewed_at = NOW() WHERE id = :id`,
      { status, reviewedBy: req.user.id, id }
    );

    await logAudit({
      userId: req.user.id, tenantId: testimonial.tenantId, action: 'update', entityType: 'testimonial', entityId: Number(id),
      newValues: { status },
    });

    res.json({ id: Number(id), status });
  });
}

module.exports = {
  getStats,
  getRevenue,
  getActivity,
  listPlansAdmin,
  createPlan,
  updatePlan,
  movePlan,
  deletePlan,
  runPlanExpiryNow,
  listTenants,
  updateTenantStatus,
  updateTenantPlan,
  deleteTenant,
  listPlatformAdmins,
  createPlatformAdmin,
  searchUsers,
  setPlatformAdmin,
  listAllUsers,
  listAllAuditLogs,
  listIpWhitelist,
  addIpWhitelist,
  listTestimonials,
  approveTestimonial: resolveTestimonial(true),
  rejectTestimonial: resolveTestimonial(false),
  removeIpWhitelist,
};
