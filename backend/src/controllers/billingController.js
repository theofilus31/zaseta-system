const crypto = require('crypto');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const { getAllPlans, getPlan, getSelfServePlanIds, isUpgrade } = require('../config/plans');
const { activateSubscription, cancelActiveSubscription, priceFor } = require('../services/subscriptionService');
const { sendUpgradeRequestResolved } = require('../utils/mailer');
const { getPaymentGateway } = require('../services/paymentGateway');

/**
 * ============================================================================
 *  BILLING — Fase 4 SaaS + Pakasir self-serve (lihat migration_billing_
 *  phase4.sql, migration_billing_subscriptions.sql,
 *  migration_pakasir_self_serve_billing.sql)
 * ============================================================================
 *  Ganti paket berbayar dibayar LANGSUNG lewat Pakasir (payment gateway,
 *  lihat services/paymentGateway/PakasirProvider.js) dan diaktifkan OTOMATIS
 *  begitu webhook mengonfirmasi lunas (handlePakasirWebhook) — TIDAK ADA lagi
 *  verifikasi transfer manual oleh admin platform. Pindah ke paket TANPA
 *  biaya (Free) diterapkan seketika (tidak ada uang untuk diverifikasi).
 *
 *  Alurnya:
 *  1. requestPlanChange — tenant memilih paket baru. Kalau berbayar: buat
 *     baris plan_upgrade_requests (status 'pending', harga dikunci) + minta
 *     Pakasir membuatkan checkout, kembalikan checkoutUrl untuk diarahkan.
 *     Kalau gratis: terapkan seketika lewat activateSubscription, tidak ada
 *     checkout sama sekali.
 *  2. Tenant membayar di halaman Pakasir.
 *  3. handlePakasirWebhook menerima konfirmasi, cross-check ke API Pakasir
 *     (lihat PakasirProvider.handleWebhook), lalu memanggil
 *     activateSubscription dengan harga yang DIKUNCI di langkah 1.
 *
 *  cancelPendingCheckout membiarkan tenant membatalkan checkout yang belum
 *  dibayar supaya bisa memilih paket lain.
 *
 *  Penulisan subscriptions/invoices/tenants.plan SELALU lewat
 *  services/subscriptionService.js — TIDAK PERNAH `UPDATE tenants SET
 *  plan = ...` langsung di controller ini, supaya cache tenants.plan dan
 *  riwayat subscriptions/invoices di baliknya tidak pernah menyimpang.
 * ============================================================================
 */

async function currentUsage(tenantId) {
  const [[{ assetCount }]] = await pool.query(
    `SELECT COUNT(*) AS "assetCount" FROM assets WHERE tenant_id = :tenantId AND deleted_at IS NULL`,
    { tenantId }
  );
  const [[{ userCount }]] = await pool.query(
    `SELECT COUNT(*) AS "userCount" FROM users WHERE tenant_id = :tenantId AND deleted_at IS NULL`,
    { tenantId }
  );
  const [[{ locationCount }]] = await pool.query(
    `SELECT COUNT(*) AS "locationCount" FROM locations WHERE tenant_id = :tenantId AND is_active = TRUE`,
    { tenantId }
  );
  return { assets: assetCount, users: userCount, locations: locationCount };
}

/** Bagian pemakaian yang MELEBIHI batas paket target — dipakai
 *  requestPlanChange untuk peringatan downgrade (rule "soft limit": data
 *  lama tidak pernah dihapus, tapi tenant harus diberi tahu di muka). Kosong
 *  berarti aman. */
function usageExceedingPlan(usage, plan) {
  const exceeded = [];
  if (plan.maxAssets !== null && usage.assets > plan.maxAssets) exceeded.push('aset');
  if (plan.maxUsers !== null && usage.users > plan.maxUsers) exceeded.push('pengguna');
  if (plan.locationLimit !== null && usage.locations > plan.locationLimit) exceeded.push('lokasi');
  return exceeded;
}

// GET /api/billing/plans — publik, tanpa auth (dipakai halaman Harga & Landing)
// Hanya paket AKTIF (lihat config/plans.js) — paket yang sudah dipensiunkan
// admin platform tidak boleh muncul di sini, walau tenant lama masih boleh
// memakainya (lihat getPlan() di getMyBilling di bawah).
const getPlans = asyncHandler(async (req, res) => {
  res.json({ plans: getAllPlans() });
});

/**
 * GET /api/billing/me — paket, pemakaian, dan checkout tertunda tenant yang
 * sedang login. Sengaja hanya butuh authenticate (tanpa requirePermission
 * khusus) supaya SEMUA pengguna tenant bisa melihat batas paketnya sendiri —
 * mengganti paket tetap dijaga terpisah (lihat requestPlanChange).
 */
const getMyBilling = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenant_id;

  const [[tenantRow]] = await pool.query(
    `SELECT plan, plan_expires_at, billing_cycle, status FROM tenants WHERE id = :tenantId`,
    { tenantId }
  );
  const plan = getPlan(tenantRow.plan) || getPlan('free');
  const usage = await currentUsage(tenantId);

  // `price`/`currency` = harga yang DIKUNCI saat checkout dibuat (lihat
  // requestPlanChange) — ditampilkan apa adanya di sini supaya tenant tahu
  // persis angka yang akan ditagihkan, walau katalog sempat berubah
  // sesudahnya sebelum pembayaran selesai.
  const [pendingRows] = await pool.query(
    `SELECT id, requested_plan AS "requestedPlan", billing_cycle AS "billingCycle", price, currency, created_at AS "createdAt"
     FROM plan_upgrade_requests WHERE tenant_id = :tenantId AND status = 'pending'
     ORDER BY created_at DESC LIMIT 1`,
    { tenantId }
  );

  // SENGAJA bukan cuma status IN ('active','trialing') — begitu langganan
  // dibatalkan statusnya langsung 'canceled' (lihat subscriptionService.
  // cancelActiveSubscription) TAPI tenant tetap berhak pakai paketnya sampai
  // plan_expires_at. Kalau query ini cuma mengambil baris 'active', baris
  // 'canceled' yang justru harus ditampilkan ("dibatalkan, berakhir tgl X")
  // malah tidak pernah terlihat sama sekali begitu dibatalkan.
  const [[currentSub]] = await pool.query(
    `SELECT id, status, current_period_start AS "currentPeriodStart", current_period_end AS "currentPeriodEnd", canceled_at AS "canceledAt"
     FROM subscriptions WHERE tenant_id = :tenantId
     ORDER BY created_at DESC LIMIT 1`,
    { tenantId }
  );

  res.json({
    plan,
    planExpiresAt: tenantRow.plan_expires_at,
    billingCycle: tenantRow.billing_cycle,
    usage,
    pendingRequest: pendingRows[0] || null,
    subscription: currentSub || null,
  });
});

/**
 * GET /api/billing/invoices — riwayat tagihan tenant yang sedang login
 * ("Billing History"), terbaru dulu.
 */
const listInvoices = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenant_id;
  const [rows] = await pool.query(
    `SELECT i.id, i.invoice_number AS "invoiceNumber", i.amount, i.currency, i.status,
            i.payment_method AS "paymentMethod", i.paid_at AS "paidAt", i.due_at AS "dueAt",
            i.provider, i.created_at AS "createdAt",
            s.plan_id AS "planId", s.billing_cycle AS "billingCycle"
     FROM invoices i
     LEFT JOIN subscriptions s ON s.id = i.subscription_id
     WHERE i.tenant_id = :tenantId
     ORDER BY i.created_at DESC
     LIMIT 100`,
    { tenantId }
  );
  res.json({ invoices: rows.map((r) => ({ ...r, planName: getPlan(r.planId)?.name || r.planId })) });
});

/**
 * GET /api/billing/invoices/:id — detail SATU invoice, dipakai halaman
 * cetak/unduh (InvoicePrintPage.jsx — "unduh" di sini berarti print-to-PDF
 * lewat browser, pola yang sama dengan BastPrintPage.jsx, bukan PDF yang
 * dirender di server). Scoped ke tenant_id (bukan sekadar `id` dari URL)
 * supaya tenant lain tidak bisa menebak nomor invoice tenant lain.
 */
const getInvoice = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenant_id;

  const [[row]] = await pool.query(
    `SELECT i.id, i.invoice_number AS "invoiceNumber", i.amount, i.currency, i.status,
            i.payment_method AS "paymentMethod", i.paid_at AS "paidAt", i.due_at AS "dueAt",
            i.provider, i.created_at AS "createdAt",
            s.plan_id AS "planId", s.billing_cycle AS "billingCycle",
            s.current_period_start AS "periodStart", s.current_period_end AS "periodEnd",
            t.company_name AS "companyName"
     FROM invoices i
     LEFT JOIN subscriptions s ON s.id = i.subscription_id
     JOIN tenants t ON t.id = i.tenant_id
     WHERE i.id = :id AND i.tenant_id = :tenantId`,
    { id, tenantId }
  );
  if (!row) return res.status(404).json({ message: 'Invoice tidak ditemukan.' });

  res.json({ invoice: { ...row, planName: getPlan(row.planId)?.name || row.planId } });
});

/**
 * POST /api/billing/checkout — { requestedPlan, billingCycle? }
 * Admin-only (lihat routes/billingRoutes.js): keputusan finansial/kontraktual,
 * bukan sesuatu yang masuk akal didelegasikan lewat matriks izin per-menu
 * biasa — sama seperti alasan requireRole dipakai di tempat lain (Profil).
 *
 * Dipakai untuk UPGRADE maupun DOWNGRADE — satu-satunya jalur pindah paket,
 * dibedakan lewat isUpgrade() murni untuk keperluan tampilan, bukan untuk
 * melarang salah satunya. Paket TANPA biaya (harga 0, mis. Free) diterapkan
 * SEKETIKA tanpa checkout; paket berbayar WAJIB dibayar dulu lewat Pakasir
 * sebelum aktif (lihat handlePakasirWebhook).
 *
 * Idempotent untuk permintaan yang SUDAH pending & PLAN-nya SAMA: dipanggil
 * ulang mengembalikan checkoutUrl yang sama (Pakasir sendiri "find or
 * create" per order_id+amount+method) — dipakai tombol "Lanjutkan
 * Pembayaran" di BillingPage kalau tenant sempat meninggalkan halaman
 * checkout tanpa membayar.
 *
 * `billingCycle` ('monthly'/'yearly', bawaan 'monthly') dicatat APA ADANYA
 * dari pilihan tenant — dipakai handlePakasirWebhook untuk menghitung masa
 * aktif saat lunas. Paket Free selalu dipaksa 'monthly' (kolomnya NOT NULL
 * di skema, tapi siklus sama sekali tidak relevan untuk paket gratis).
 */
const requestPlanChange = asyncHandler(async (req, res) => {
  const billingCycle = req.body.billingCycle === 'yearly' ? 'yearly' : 'monthly';
  const tenantId = req.user.tenant_id;

  if (!getSelfServePlanIds().includes(req.body.requestedPlan)) {
    return res.status(400).json({ message: 'Paket yang diajukan tidak valid.' });
  }
  const requestedPlan = req.body.requestedPlan;

  const [[tenantRow]] = await pool.query(`SELECT plan, company_name AS "companyName" FROM tenants WHERE id = :tenantId`, { tenantId });
  if (requestedPlan === tenantRow.plan) {
    return res.status(400).json({ message: 'Anda sudah berada di paket ini.' });
  }

  const [existingPending] = await pool.query(
    `SELECT id, requested_plan AS "requestedPlan", billing_cycle AS "billingCycle", price, order_id AS "orderId"
     FROM plan_upgrade_requests WHERE tenant_id = :tenantId AND status = 'pending' LIMIT 1`,
    { tenantId }
  );

  const requestedPlanConfig = getPlan(requestedPlan);
  const finalCycle = requestedPlanConfig?.price ? billingCycle : 'monthly';
  // Dikunci DI SINI, bukan dihitung ulang saat webhook lunas — lihat catatan
  // panjang di subscriptionService.activateSubscription soal priceOverride.
  // Tanpa ini, admin mengubah harga paket lewat menu Katalog Paket SELAGI
  // tenant belum sempat membayar akan diam-diam mengubah jumlah yang
  // ditagihkan, padahal Pakasir sudah dibuatkan checkout dengan harga lama.
  const lockedPrice = priceFor(requestedPlanConfig, finalCycle);

  // Peringatan downgrade (rule "soft limit") — TIDAK memblokir permintaan,
  // cuma memberi tahu tenant di muka bahwa datanya akan tetap aman tapi
  // penambahan baru terkunci sampai pemakaian turun di bawah batas paket
  // target.
  let downgradeWarning = null;
  if (!isUpgrade(tenantRow.plan, requestedPlan)) {
    const usage = await currentUsage(tenantId);
    const exceeded = usageExceedingPlan(usage, requestedPlanConfig);
    if (exceeded.length > 0) {
      downgradeWarning = `Pemakaian Anda saat ini melebihi batas paket yang dipilih (${exceeded.join(', ')}). Data yang sudah ada tetap bisa diakses, tetapi Anda tidak bisa menambah data baru sampai pemakaian berada di bawah batas paket ini.`;
    }
  }

  // Paket TANPA biaya -- tidak ada pembayaran, terapkan seketika. Kalau ada
  // checkout paket LAIN yang masih pending, batalkan dulu supaya tidak ada
  // dua permintaan aktif sekaligus.
  if (!lockedPrice) {
    if (existingPending[0]) {
      await pool.query(`UPDATE plan_upgrade_requests SET status = 'canceled', reviewed_at = NOW() WHERE id = :id`, { id: existingPending[0].id });
    }
    await activateSubscription({ tenantId, planId: requestedPlan, billingCycle: finalCycle, createdBy: req.user.id, provider: 'system' });

    const [result] = await pool.query(
      `INSERT INTO plan_upgrade_requests (tenant_id, requested_plan, previous_plan, billing_cycle, price, requested_by, status, payment_provider, reviewed_at)
       VALUES (:tenantId, :requestedPlan, :previousPlan, :billingCycle, 0, :requestedBy, 'applied', 'system', NOW())
       RETURNING id`,
      { tenantId, requestedPlan, previousPlan: tenantRow.plan, billingCycle: finalCycle, requestedBy: req.user.id }
    );

    await logAudit({
      userId: req.user.id, action: 'update', entityType: 'plan_upgrade_request', entityId: result.insertId,
      newValues: { requestedPlan, billingCycle: finalCycle, status: 'applied' },
    });

    return res.status(201).json({ id: result.insertId, requestedPlan, billingCycle: finalCycle, price: 0, status: 'applied', downgradeWarning, checkoutUrl: null });
  }

  // Paket berbayar -- kalau tenant sudah punya checkout pending untuk paket
  // YANG SAMA, minta ulang checkoutUrl-nya (idempotent) alih-alih menolak;
  // untuk paket LAIN, tenant harus membatalkan dulu (lihat cancelPendingCheckout).
  let requestId, orderId;
  if (existingPending[0]) {
    if (existingPending[0].requestedPlan !== requestedPlan) {
      return res.status(409).json({ message: 'Anda punya pembayaran yang masih menunggu untuk paket lain. Batalkan dulu sebelum memilih paket ini.' });
    }
    requestId = existingPending[0].id;
    orderId = existingPending[0].orderId;
  } else {
    orderId = crypto.randomUUID();
    const [result] = await pool.query(
      /* previous_plan: snapshot paket SAAT INI, bukan sekadar dihitung dari
         tenants.plan saat riwayat dibaca nanti — begitu permintaan ini
         lunas, tenants.plan berubah, dan tanpa snapshot ini riwayat akan
         terlihat seolah tenant "upgrade dari paket barunya sendiri". */
      `INSERT INTO plan_upgrade_requests (tenant_id, requested_plan, previous_plan, billing_cycle, price, requested_by, order_id, payment_provider)
       VALUES (:tenantId, :requestedPlan, :previousPlan, :billingCycle, :price, :requestedBy, :orderId, 'pakasir')
       RETURNING id`,
      { tenantId, requestedPlan, previousPlan: tenantRow.plan, billingCycle: finalCycle, price: lockedPrice, requestedBy: req.user.id, orderId }
    );
    requestId = result.insertId;

    await logAudit({
      userId: req.user.id, action: 'create', entityType: 'plan_upgrade_request', entityId: requestId,
      newValues: { requestedPlan, billingCycle: finalCycle, price: lockedPrice, provider: 'pakasir' },
    });
  }

  const gateway = getPaymentGateway('pakasir');
  let checkout;
  try {
    checkout = await gateway.createCheckout({ invoiceNumber: orderId, amount: lockedPrice });
  } catch (err) {
    return res.status(502).json({ message: `Gagal membuat pembayaran: ${err.message}` });
  }

  await pool.query(
    `UPDATE plan_upgrade_requests SET provider_transaction_id = :txnId WHERE id = :id`,
    { txnId: checkout.providerTransactionId, id: requestId }
  );

  res.status(201).json({
    id: requestId, requestedPlan, billingCycle: finalCycle, price: lockedPrice,
    status: 'pending', downgradeWarning, checkoutUrl: checkout.checkoutUrl,
  });
});

/**
 * POST /api/billing/checkout/cancel — batalkan checkout Pakasir yang belum
 * dibayar, supaya tenant bisa memilih paket lain. Admin-only, sama seperti
 * requestPlanChange.
 */
const cancelPendingCheckout = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenant_id;
  const [[request]] = await pool.query(
    `SELECT id, provider_transaction_id AS "providerTransactionId" FROM plan_upgrade_requests
     WHERE tenant_id = :tenantId AND status = 'pending' LIMIT 1`,
    { tenantId }
  );
  if (!request) return res.status(404).json({ message: 'Tidak ada checkout yang menunggu pembayaran.' });

  if (request.providerTransactionId) {
    try {
      await getPaymentGateway('pakasir').cancelTransaction({ providerTransactionId: request.providerTransactionId });
    } catch (err) {
      // Transaksi mungkin sudah kedaluwarsa/dibatalkan di sisi Pakasir --
      // tidak menghalangi kita membatalkan catatan lokal kita sendiri.
      console.error('Gagal membatalkan transaksi Pakasir (dilanjutkan tetap membatalkan lokal):', err.message);
    }
  }

  await pool.query(`UPDATE plan_upgrade_requests SET status = 'canceled', reviewed_at = NOW() WHERE id = :id`, { id: request.id });
  await logAudit({ userId: req.user.id, tenantId, action: 'update', entityType: 'plan_upgrade_request', entityId: request.id, newValues: { status: 'canceled' } });

  res.json({ id: request.id, status: 'canceled' });
});

/**
 * POST /api/billing/cancel — batalkan langganan berbayar tenant yang sedang
 * login. Admin-only (sama seperti requestPlanChange — keputusan finansial).
 * TIDAK langsung menurunkan paket (lihat subscriptionService.
 * cancelActiveSubscription) — tenant tetap berhak pakai paketnya sampai
 * plan_expires_at yang sudah dibayar.
 */
const cancelSubscription = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenant_id;
  const [[tenantRow]] = await pool.query(`SELECT plan FROM tenants WHERE id = :tenantId`, { tenantId });

  if (tenantRow.plan === 'free') {
    return res.status(400).json({ message: 'Paket Free tidak punya langganan berbayar untuk dibatalkan.' });
  }

  const result = await cancelActiveSubscription({ tenantId });
  if (!result) {
    return res.status(404).json({ message: 'Tidak ada langganan aktif untuk dibatalkan.' });
  }

  await logAudit({
    userId: req.user.id, tenantId, action: 'update', entityType: 'subscription', entityId: result.subscriptionId,
    newValues: { status: 'canceled' },
  });

  res.json({ subscriptionId: result.subscriptionId, canceled: true });
});

/**
 * POST /api/billing/webhooks/pakasir — TANPA AUTH (dipanggil server Pakasir
 * sendiri, bukan pengguna kita; lihat routes/billingRoutes.js -- didaftarkan
 * SEBELUM router.use(authenticate)). Otentikasinya lewat header X-Secret,
 * diverifikasi di dalam PakasirProvider.handleWebhook, BUKAN token JWT.
 *
 * Mencocokkan order_id webhook ke plan_upgrade_requests.order_id (dibuat di
 * requestPlanChange) — begitu lunas, memanggil activateSubscription dengan
 * harga yang DIKUNCI saat checkout dibuat, lalu menandai permintaan 'paid'.
 * Idempotent: permintaan yang statusnya BUKAN 'pending' lagi (webhook
 * dobel, atau sudah dibatalkan tenant) diabaikan dengan aman.
 */
const handlePakasirWebhook = asyncHandler(async (req, res) => {
  const provider = getPaymentGateway('pakasir');

  let result;
  try {
    result = await provider.handleWebhook(req.body, req.headers);
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message });
  }

  const [[request]] = await pool.query(
    `SELECT r.id, r.tenant_id AS "tenantId", r.requested_plan AS "requestedPlan", r.billing_cycle AS "billingCycle",
            r.price, r.status, r.requested_by AS "requestedBy", u.email AS "requesterEmail"
     FROM plan_upgrade_requests r
     JOIN users u ON u.id = r.requested_by
     WHERE r.order_id = :orderId`,
    { orderId: result.orderId }
  );
  if (!request) {
    // Webhook terverifikasi asli, tapi tidak ada permintaan kita yang cocok
    // -- balas 200 supaya Pakasir tidak menganggapnya gagal & mengulang
    // terus; dicatat di log server untuk ditelusuri manual.
    console.error(`Webhook Pakasir: order_id "${result.orderId}" tidak cocok dengan permintaan mana pun.`);
    return res.status(200).json({ message: 'Diterima, tidak ada permintaan yang cocok.' });
  }
  if (request.status !== 'pending') {
    return res.status(200).json({ message: 'Permintaan ini sudah diproses sebelumnya.' });
  }

  if (result.status === 'canceled') {
    await pool.query(
      `UPDATE plan_upgrade_requests SET status = 'canceled', provider_transaction_id = :txnId, reviewed_at = NOW() WHERE id = :id`,
      { id: request.id, txnId: result.providerTransactionId }
    );
    return res.status(200).json({ message: 'Transaksi dibatalkan/kedaluwarsa, permintaan ditutup.' });
  }
  if (result.status !== 'paid') {
    // Selain 'completed'/'canceled', dokumentasi Pakasir tidak menyebut
    // status lain untuk webhook -- biarkan permintaan tetap 'pending', masih
    // bisa lunas belakangan.
    return res.status(200).json({ message: `Status transaksi: ${result.status}.` });
  }

  await activateSubscription({
    tenantId: request.tenantId,
    planId: request.requestedPlan,
    billingCycle: request.billingCycle,
    createdBy: request.requestedBy,
    provider: 'pakasir',
    // Harga yang DIKUNCI saat tenant membuat checkout (lihat
    // requestPlanChange) -- BUKAN harga katalog saat ini, supaya perubahan
    // harga di menu Katalog Paket SELAGI tenant belum sempat membayar tidak
    // diam-diam mengubah jumlah yang sudah dia bayar ke Pakasir.
    priceOverride: request.price,
    providerTransactionId: result.providerTransactionId,
  });

  await pool.query(
    `UPDATE plan_upgrade_requests SET status = 'paid', provider_transaction_id = :txnId, paid_at = :paidAt, reviewed_at = NOW() WHERE id = :id`,
    { id: request.id, txnId: result.providerTransactionId, paidAt: result.completedAt || new Date() }
  );

  await logAudit({
    userId: null, tenantId: request.tenantId, action: 'update', entityType: 'plan_upgrade_request', entityId: request.id,
    newValues: { status: 'paid', provider: 'pakasir', providerTransactionId: result.providerTransactionId },
  });

  try {
    await sendUpgradeRequestResolved({
      to: request.requesterEmail,
      planName: getPlan(request.requestedPlan)?.name || request.requestedPlan,
      approved: true,
      adminNote: null,
      tenantId: request.tenantId,
    });
  } catch (err) {
    console.error('Gagal mengirim surel konfirmasi pembayaran:', err.message);
  }

  res.status(200).json({ message: 'Pembayaran dikonfirmasi, paket diperbarui.' });
});

module.exports = {
  getPlans,
  getMyBilling,
  listInvoices,
  getInvoice,
  requestPlanChange,
  cancelPendingCheckout,
  cancelSubscription,
  handlePakasirWebhook,
};
