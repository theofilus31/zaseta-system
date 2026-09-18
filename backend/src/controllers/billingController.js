const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const { getAllPlans, getPlan, getSelfServePlanIds, isUpgrade } = require('../config/plans');
const { activateSubscription, cancelActiveSubscription, priceFor } = require('../services/subscriptionService');
const { sendUpgradeRequestNotification, sendUpgradeRequestResolved } = require('../utils/mailer');

/**
 * ============================================================================
 *  BILLING — Fase 4 SaaS (lihat migration_billing_phase4.sql,
 *  migration_billing_subscriptions.sql)
 * ============================================================================
 *  Belum ada payment gateway sungguhan TERPASANG (lihat
 *  services/paymentGateway/ — abstraksinya sudah siap, provider 'manual'
 *  yang aktif sekarang): upgrade paket diajukan tenant lewat
 *  createUpgradeRequest, lalu diverifikasi MANUAL (transfer bank) oleh admin
 *  platform lewat resolveUpgradeRequest. Info rekening transfer diambil dari
 *  BILLING_TRANSFER_INFO di .env supaya gampang diganti tanpa deploy ulang
 *  kode — lihat backend/.env.example.
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
 *  createUpgradeRequest untuk peringatan downgrade (rule "soft limit": data
 *  lama tidak pernah dihapus, tapi tenant harus diberi tahu sebelum
 *  pengajuannya benar-benar diproses admin). Kosong berarti aman. */
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
 * GET /api/billing/me — paket, pemakaian, dan permintaan upgrade tenant yang
 * sedang login. Sengaja hanya butuh authenticate (tanpa requirePermission
 * khusus) supaya SEMUA pengguna tenant bisa melihat batas paketnya sendiri —
 * mengajukan upgrade tetap dijaga terpisah (lihat createUpgradeRequest).
 */
const getMyBilling = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenant_id;

  const [[tenantRow]] = await pool.query(
    `SELECT plan, plan_expires_at, billing_cycle, status FROM tenants WHERE id = :tenantId`,
    { tenantId }
  );
  const plan = getPlan(tenantRow.plan) || getPlan('free');
  const usage = await currentUsage(tenantId);

  // `price`/`currency` = harga yang DIKUNCI saat pengajuan (lihat
  // createUpgradeRequest) — ditampilkan apa adanya di sini supaya tenant
  // tahu persis angka yang akan ditagihkan, walau katalog sempat berubah
  // sesudahnya sebelum admin sempat menyetujui.
  const [pendingRows] = await pool.query(
    `SELECT id, requested_plan AS "requestedPlan", billing_cycle AS "billingCycle", price, currency, note, created_at AS "createdAt"
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
    transferInfo: process.env.BILLING_TRANSFER_INFO || null,
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
 * POST /api/billing/upgrade-requests — { requestedPlan, billingCycle?, note? }
 * Admin-only (lihat routes/billingRoutes.js): keputusan finansial/kontraktual,
 * bukan sesuatu yang masuk akal didelegasikan lewat matriks izin per-menu
 * biasa — sama seperti alasan requireRole dipakai di tempat lain (Profil).
 *
 * Dipakai untuk UPGRADE maupun DOWNGRADE — satu-satunya jalur pindah paket,
 * dibedakan lewat isUpgrade() murni untuk keperluan tampilan/notifikasi,
 * bukan untuk melarang salah satunya.
 *
 * `billingCycle` ('monthly'/'yearly', bawaan 'monthly') dicatat APA ADANYA
 * dari pilihan tenant — dipakai resolveUpgradeRequest untuk menghitung masa
 * aktif saat disetujui. Paket Free selalu dipaksa 'monthly' (kolomnya NOT
 * NULL di skema, tapi siklus sama sekali tidak relevan untuk paket gratis).
 */
const createUpgradeRequest = asyncHandler(async (req, res) => {
  const { requestedPlan, note } = req.body;
  const billingCycle = req.body.billingCycle === 'yearly' ? 'yearly' : 'monthly';
  const tenantId = req.user.tenant_id;

  if (!getSelfServePlanIds().includes(requestedPlan)) {
    return res.status(400).json({ message: 'Paket yang diajukan tidak valid.' });
  }

  const [[tenantRow]] = await pool.query(`SELECT plan, company_name AS "companyName" FROM tenants WHERE id = :tenantId`, { tenantId });
  if (requestedPlan === tenantRow.plan) {
    return res.status(400).json({ message: 'Anda sudah berada di paket ini.' });
  }

  const [existingPending] = await pool.query(
    `SELECT id FROM plan_upgrade_requests WHERE tenant_id = :tenantId AND status = 'pending' LIMIT 1`,
    { tenantId }
  );
  if (existingPending[0]) {
    return res.status(409).json({ message: 'Anda sudah punya permintaan upgrade yang masih menunggu diproses.' });
  }

  const requestedPlanConfig = getPlan(requestedPlan);
  const finalCycle = requestedPlanConfig?.price ? billingCycle : 'monthly';
  // Dikunci DI SINI, bukan dihitung ulang saat admin menyetujui — lihat
  // catatan panjang di subscriptionService.activateSubscription soal
  // priceOverride. Tanpa ini, admin mengubah harga paket lewat menu Katalog
  // Paket SELAGI permintaan ini menunggu akan diam-diam mengubah jumlah yang
  // ditagihkan ke tenant, padahal dia mengajukan berdasarkan harga di sini.
  const lockedPrice = priceFor(requestedPlanConfig, finalCycle);

  // Peringatan downgrade (rule "soft limit") — TIDAK memblokir pengajuan,
  // cuma memberi tahu tenant di muka bahwa datanya akan tetap aman tapi
  // penambahan baru terkunci sampai pemakaian turun di bawah batas paket
  // target. Dihitung ulang lagi begitu admin menyetujui (lihat
  // resolveUpgradeRequest) karena pemakaian bisa berubah selama menunggu.
  let downgradeWarning = null;
  if (!isUpgrade(tenantRow.plan, requestedPlan)) {
    const usage = await currentUsage(tenantId);
    const exceeded = usageExceedingPlan(usage, requestedPlanConfig);
    if (exceeded.length > 0) {
      downgradeWarning = `Pemakaian Anda saat ini melebihi batas paket yang dipilih (${exceeded.join(', ')}). Data yang sudah ada tetap bisa diakses, tetapi Anda tidak bisa menambah data baru sampai pemakaian berada di bawah batas paket ini.`;
    }
  }

  const trimmedNote = note ? String(note).trim().slice(0, 2000) : null;
  const [result] = await pool.query(
    /* previous_plan: snapshot paket SAAT INI, bukan sekadar dihitung dari
       tenants.plan saat riwayat dibaca nanti — begitu permintaan ini
       disetujui, tenants.plan berubah, dan tanpa snapshot ini riwayat akan
       terlihat seolah tenant "upgrade dari paket barunya sendiri". */
    `INSERT INTO plan_upgrade_requests (tenant_id, requested_plan, previous_plan, billing_cycle, price, note, requested_by)
     VALUES (:tenantId, :requestedPlan, :previousPlan, :billingCycle, :price, :note, :requestedBy)
     RETURNING id`,
    { tenantId, requestedPlan, previousPlan: tenantRow.plan, billingCycle: finalCycle, price: lockedPrice, note: trimmedNote, requestedBy: req.user.id }
  );

  await logAudit({
    userId: req.user.id, action: 'create', entityType: 'plan_upgrade_request', entityId: result.insertId,
    newValues: { requestedPlan, billingCycle: finalCycle, price: lockedPrice, note: trimmedNote },
  });

  // Surel ke admin platform bersifat best-effort — kegagalan kirim tidak boleh
  // menggagalkan pengajuan itu sendiri (sama seperti pola surel di userController).
  try {
    const [platformAdmins] = await pool.query(
      `SELECT email FROM users WHERE is_platform_admin = TRUE AND status = 'active' AND deleted_at IS NULL`
    );
    if (platformAdmins.length > 0) {
      const reviewUrl = `${(process.env.FRONTEND_URL || '').replace(/\/$/, '')}/platform/billing-requests`;
      await sendUpgradeRequestNotification({
        to: platformAdmins.map((a) => a.email).join(','),
        tenantName: tenantRow.companyName,
        requesterName: req.user.name,
        requesterEmail: req.user.email,
        planName: getPlan(requestedPlan)?.name || requestedPlan,
        note: trimmedNote,
        reviewUrl,
      });
    }
  } catch (err) {
    console.error('Gagal mengirim surel notifikasi permintaan upgrade:', err.message);
  }

  res.status(201).json({ id: result.insertId, requestedPlan, billingCycle: finalCycle, price: lockedPrice, note: trimmedNote, status: 'pending', downgradeWarning });
});

/**
 * POST /api/billing/cancel — batalkan langganan berbayar tenant yang sedang
 * login. Admin-only (sama seperti createUpgradeRequest — keputusan
 * finansial). TIDAK langsung menurunkan paket (lihat
 * subscriptionService.cancelActiveSubscription) — tenant tetap berhak pakai
 * paketnya sampai plan_expires_at yang sudah dibayar.
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
 * GET /api/billing/upgrade-requests — LINTAS TENANT, khusus admin platform
 * (requirePlatformAdmin, lihat routes/billingRoutes.js). `status` query
 * opsional ('pending' bawaan) — histori penuh bisa diminta dengan ?status=all.
 */
const listUpgradeRequests = asyncHandler(async (req, res) => {
  const statusFilter = req.query.status === 'all' ? null : (req.query.status || 'pending');

  const [rows] = await pool.query(
    `SELECT r.id, r.requested_plan AS "requestedPlan", r.previous_plan AS "previousPlan", r.billing_cycle AS "billingCycle",
            r.price, r.currency, r.note, r.status, r.admin_note AS "adminNote",
            r.created_at AS "createdAt", r.reviewed_at AS "reviewedAt",
            t.id AS "tenantId", t.company_name AS "tenantName",
            u.name AS "requesterName", u.email AS "requesterEmail"
     FROM plan_upgrade_requests r
     JOIN tenants t ON t.id = r.tenant_id
     JOIN users u ON u.id = r.requested_by
     ${statusFilter ? 'WHERE r.status = :statusFilter' : ''}
     ORDER BY r.created_at DESC`,
    statusFilter ? { statusFilter } : {}
  );

  res.json({ requests: rows });
});

/**
 * POST /api/billing/upgrade-requests/:id/approve
 * POST /api/billing/upgrade-requests/:id/reject — { adminNote? }
 * Keduanya khusus admin platform. Menyetujui memanggil
 * subscriptionService.activateSubscription — di sinilah verifikasi transfer
 * manual "berlaku": ditulis SEKALIGUS ke subscriptions (riwayat), invoices
 * (tagihan berstatus 'paid'), dan tenants.plan/plan_expires_at/billing_cycle
 * (cache state terkini). Masa aktif dihitung dari billing_cycle yang
 * DIAJUKAN tenant sendiri (30 hari 'monthly', 365 hari 'yearly') — Free
 * tidak pernah kedaluwarsa. Penegakan otomatis saat kedaluwarsa lihat
 * jobs/planExpiry.js.
 */
function resolveUpgradeRequest(approve) {
  return asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { adminNote } = req.body;

    const [rows] = await pool.query(
      `SELECT r.*, t.company_name AS "tenantName", u.email AS "requesterEmail"
       FROM plan_upgrade_requests r
       JOIN tenants t ON t.id = r.tenant_id
       JOIN users u ON u.id = r.requested_by
       WHERE r.id = :id LIMIT 1`,
      { id }
    );
    const request = rows[0];
    if (!request) return res.status(404).json({ message: 'Permintaan tidak ditemukan.' });
    if (request.status !== 'pending') {
      return res.status(409).json({ message: 'Permintaan ini sudah diproses sebelumnya.' });
    }

    const trimmedAdminNote = adminNote ? String(adminNote).trim().slice(0, 2000) : null;
    const plan = getPlan(request.requested_plan);

    if (approve) {
      await activateSubscription({
        tenantId: request.tenant_id,
        planId: request.requested_plan,
        billingCycle: request.billing_cycle,
        createdBy: req.user.id,
        provider: 'manual',
        // Harga yang DIKUNCI saat tenant mengajukan (lihat createUpgradeRequest)
        // -- request.price bisa NULL untuk permintaan lama dari sebelum kolom
        // ini ada, activateSubscription() fallback ke harga katalog saat ini
        // untuk kasus itu saja (lihat catatannya di subscriptionService.js).
        priceOverride: request.price,
      });
    }

    await pool.query(
      `UPDATE plan_upgrade_requests SET status = :status, admin_note = :adminNote, reviewed_by = :reviewedBy, reviewed_at = NOW() WHERE id = :id`,
      { status: approve ? 'approved' : 'rejected', adminNote: trimmedAdminNote, reviewedBy: req.user.id, id }
    );

    await logAudit({
      userId: req.user.id, tenantId: request.tenant_id, action: 'update', entityType: 'plan_upgrade_request', entityId: Number(id),
      newValues: { status: approve ? 'approved' : 'rejected', adminNote: trimmedAdminNote },
    });

    try {
      await sendUpgradeRequestResolved({
        to: request.requesterEmail,
        planName: plan?.name || request.requested_plan,
        approved: approve,
        adminNote: trimmedAdminNote,
        tenantId: request.tenant_id,
      });
    } catch (err) {
      console.error('Gagal mengirim surel keputusan permintaan upgrade:', err.message);
    }

    res.json({ id: Number(id), status: approve ? 'approved' : 'rejected' });
  });
}

module.exports = {
  getPlans,
  getMyBilling,
  listInvoices,
  createUpgradeRequest,
  cancelSubscription,
  listUpgradeRequests,
  approveUpgradeRequest: resolveUpgradeRequest(true),
  rejectUpgradeRequest: resolveUpgradeRequest(false),
};
