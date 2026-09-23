const pool = require('../config/db');
const { getPlan } = require('../config/plans');

/**
 * ============================================================================
 *  LAYANAN LANGGANAN — satu-satunya tempat yang boleh menulis ke
 *  subscriptions / invoices / tenants.plan sekaligus.
 * ============================================================================
 *  billingController (handlePakasirWebhook) & platformController
 *  (updateTenantPlan) WAJIB lewat sini, TIDAK BOLEH `UPDATE tenants SET
 *  plan = ...` langsung — supaya tenants.plan/plan_expires_at/billing_cycle
 *  (cache "state terkini", dibaca planLimits.js/dashboard/dll) tidak pernah
 *  diam-diam menyimpang dari riwayat subscriptions/invoices di baliknya.
 * ============================================================================
 */

const CYCLE_DAYS = { monthly: 30, yearly: 365 };

function priceFor(plan, billingCycle) {
  if (!plan.price) return 0; // Free — tidak pernah berbayar berapa pun siklusnya
  return billingCycle === 'yearly' ? plan.priceYearly : plan.price;
}

function periodEndFor(billingCycle, price) {
  if (!price) return null; // Free / tanpa biaya = tanpa batas waktu
  return new Date(Date.now() + CYCLE_DAYS[billingCycle] * 24 * 60 * 60 * 1000);
}

async function nextInvoiceNumber() {
  const year = new Date().getFullYear();
  const [rows] = await pool.query(
    `SELECT invoice_number FROM invoices WHERE invoice_number LIKE :prefix ORDER BY invoice_number DESC LIMIT 1`,
    { prefix: `INV/${year}/%` }
  );
  const last = rows[0] ? Number(String(rows[0].invoice_number).split('/')[2]) : 0;
  return `INV/${year}/${String(last + 1).padStart(5, '0')}`;
}

/**
 * Aktivasi langganan — dipanggil begitu pembayaran paket berbayar
 * DIKONFIRMASI LUNAS oleh webhook Pakasir (lihat billingController.
 * handlePakasirWebhook), begitu tenant memindahkan ke paket TANPA biaya
 * (Free, tidak butuh pembayaran), atau begitu admin platform mengoreksi
 * paket tenant secara manual (recordManualCorrection, fungsi TERPISAH dari
 * ini).
 *
 * Fungsi ini MURNI PEMBUKUAN — TIDAK PERNAH menghubungi payment gateway
 * sendiri. Pemanggil bertanggung jawab memastikan uangnya SUDAH diterima
 * (untuk paket berbayar) SEBELUM memanggil ini; kalau belum ada pembayaran
 * sungguhan, `providerTransactionId` cukup dibiarkan null (dipakai paket
 * Free/koreksi admin).
 *
 *  1. Tutup subscription aktif/trialing lama tenant ini (kalau ada).
 *  2. Buat baris subscriptions baru — harga di-snapshot SEKARANG (dari
 *     `priceOverride` kalau dioper, atau dari config/plans.js SAAT INI kalau
 *     tidak) — bukan dihitung ulang lagi nanti kalau katalog berubah.
 *  3. Buat invoice 'paid' untuk paket berbayar — TIDAK ada invoice untuk
 *     Free (Free tidak pernah butuh subscription payment).
 *  4. Sinkronkan cache tenants.plan/plan_expires_at/billing_cycle.
 *
 *  `priceOverride` — dipakai billingController.handlePakasirWebhook supaya
 *  tenant ditagih harga yang dia lihat SAAT MENGAJUKAN CHECKOUT (snapshot di
 *  plan_upgrade_requests.price), bukan harga katalog saat webhook baru
 *  sampai — katalog sekarang bisa diubah instan lewat menu Katalog Paket,
 *  jadi keduanya bisa berbeda kalau harga sempat diubah selagi tenant belum
 *  menyelesaikan pembayaran. `null`/`undefined` (bawaan) berarti "pakai
 *  harga katalog saat ini" — dipakai authController (signup Free) dan
 *  permintaan lama dari sebelum kolom price ada di plan_upgrade_requests.
 */
async function activateSubscription({ tenantId, planId, billingCycle = 'monthly', createdBy = null, provider = 'system', priceOverride = null, providerTransactionId = null }) {
  const plan = getPlan(planId);
  if (!plan) throw new Error(`Paket "${planId}" tidak dikenal.`);

  const resolvedCycle = plan.price && billingCycle === 'yearly' ? 'yearly' : 'monthly';
  const price = priceOverride !== null && priceOverride !== undefined ? Number(priceOverride) : priceFor(plan, resolvedCycle);
  const periodEnd = periodEndFor(resolvedCycle, price);

  await pool.query(
    `UPDATE subscriptions SET status = 'canceled', canceled_at = NOW()
     WHERE tenant_id = :tenantId AND status IN ('active', 'trialing')`,
    { tenantId }
  );

  const [subResult] = await pool.query(
    `INSERT INTO subscriptions (tenant_id, plan_id, billing_cycle, status, price, currency, current_period_start, current_period_end, provider, created_by)
     VALUES (:tenantId, :planId, :billingCycle, 'active', :price, 'IDR', NOW(), :periodEnd, :provider, :createdBy)
     RETURNING id`,
    { tenantId, planId, billingCycle: resolvedCycle, price, periodEnd, provider, createdBy }
  );
  const subscriptionId = subResult.insertId;

  let invoice = null;
  if (price > 0) {
    const invoiceNumber = await nextInvoiceNumber();
    const [invResult] = await pool.query(
      `INSERT INTO invoices (tenant_id, subscription_id, invoice_number, amount, currency, status, payment_method, paid_at, due_at, provider, provider_transaction_id)
       VALUES (:tenantId, :subscriptionId, :invoiceNumber, :amount, 'IDR', 'paid', :provider, NOW(), NOW(), :provider, :providerTransactionId)
       RETURNING id`,
      { tenantId, subscriptionId, invoiceNumber, amount: price, provider, providerTransactionId }
    );
    invoice = { id: invResult.insertId, invoiceNumber, amount: price };
  }

  await pool.query(
    `UPDATE tenants SET plan = :planId, plan_expires_at = :periodEnd, billing_cycle = :billingCycle WHERE id = :tenantId`,
    { planId, periodEnd, billingCycle: price ? resolvedCycle : null, tenantId }
  );

  return { subscriptionId, planId, billingCycle: resolvedCycle, price, periodEnd, invoice };
}

/**
 * Koreksi paket manual oleh admin platform (platformController.updateTenantPlan)
 * — BEDA dari activateSubscription: tanggal kedaluwarsanya ditentukan admin
 * sendiri (atau sengaja kosong = tanpa batas waktu permanen), bukan dihitung
 * dari billing_cycle 30/365 hari. Tidak pernah membuat invoice (bukan
 * transaksi pembayaran, murni koreksi data) tapi TETAP tercatat sebagai satu
 * baris subscriptions (provider: 'manual_correction') supaya riwayatnya utuh
 * (rule "semua perubahan subscription tercatat di riwayat").
 */
async function recordManualCorrection({ tenantId, planId, expiresAt = null, createdBy = null }) {
  const plan = getPlan(planId);
  if (!plan) throw new Error(`Paket "${planId}" tidak dikenal.`);

  await pool.query(
    `UPDATE subscriptions SET status = 'canceled', canceled_at = NOW()
     WHERE tenant_id = :tenantId AND status IN ('active', 'trialing')`,
    { tenantId }
  );

  await pool.query(
    `INSERT INTO subscriptions (tenant_id, plan_id, billing_cycle, status, price, currency, current_period_start, current_period_end, provider, created_by)
     VALUES (:tenantId, :planId, 'monthly', 'active', :price, 'IDR', NOW(), :expiresAt, 'manual_correction', :createdBy)`,
    { tenantId, planId, price: plan.price || 0, expiresAt, createdBy }
  );

  await pool.query(
    `UPDATE tenants SET plan = :planId, plan_expires_at = :expiresAt, billing_cycle = NULL WHERE id = :tenantId`,
    { planId, expiresAt, tenantId }
  );
}

/**
 * Penurunan otomatis ke Free saat kedaluwarsa (jobs/planExpiry.js) — BEDA
 * dari cancelActiveSubscription (yang cuma menandai "jangan diperpanjang" dan
 * membiarkan akses jalan terus sampai periode berjalan habis): fungsi ini
 * DIPANGGIL SETELAH periode itu sungguh-sungguh habis, jadi subscription
 * lama ditandai 'expired' (bukan 'canceled' — beda alasan histori) dan
 * tenant langsung mendapat subscription Free baru (price 0, tanpa invoice,
 * tanpa batas waktu) supaya selalu ada tepat satu baris 'active' per tenant.
 */
async function downgradeToFreeOnExpiry({ tenantId }) {
  await pool.query(
    `UPDATE subscriptions SET status = 'expired' WHERE tenant_id = :tenantId AND status IN ('active', 'trialing')`,
    { tenantId }
  );
  await pool.query(
    `INSERT INTO subscriptions (tenant_id, plan_id, billing_cycle, status, price, currency, current_period_start, current_period_end, provider)
     VALUES (:tenantId, 'free', 'monthly', 'active', 0, 'IDR', NOW(), NULL, 'system')`,
    { tenantId }
  );
  await pool.query(
    `UPDATE tenants SET plan = 'free', plan_expires_at = NULL, billing_cycle = NULL WHERE id = :tenantId`,
    { tenantId }
  );
}

/**
 * Batalkan langganan aktif — TIDAK langsung menurunkan tenants.plan. Tenant
 * tetap berhak pakai paketnya sampai plan_expires_at yang SUDAH dibayar
 * (sama seperti langganan streaming: batalkan = tidak diperpanjang lagi,
 * bukan langsung dicabut hari itu juga). Penurunan sungguhan ke Free tetap
 * lewat jobs/planExpiry.js seperti biasa begitu plan_expires_at lewat —
 * subscriptions.status = 'canceled' di sini cuma menandai "jangan
 * diperpanjang", bukan mencabut akses seketika.
 */
async function cancelActiveSubscription({ tenantId }) {
  const [[sub]] = await pool.query(
    `SELECT id FROM subscriptions WHERE tenant_id = :tenantId AND status IN ('active', 'trialing')
     ORDER BY created_at DESC LIMIT 1`,
    { tenantId }
  );
  if (!sub) return null;

  await pool.query(
    `UPDATE subscriptions SET status = 'canceled', canceled_at = NOW() WHERE id = :id`,
    { id: sub.id }
  );
  return { subscriptionId: sub.id };
}

module.exports = {
  activateSubscription, recordManualCorrection, downgradeToFreeOnExpiry, cancelActiveSubscription,
  CYCLE_DAYS, priceFor, periodEndFor,
};
