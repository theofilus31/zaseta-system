const pool = require('../config/db');
const logAudit = require('../utils/auditLogger');
const { sendPlanExpiredNotice } = require('../utils/mailer');
const { getPlan } = require('../config/plans');
const { downgradeToFreeOnExpiry } = require('../services/subscriptionService');

/**
 * ============================================================================
 *  PENEGAKAN KEDALUWARSA PAKET — Fase 4/5 SaaS susulan
 * ============================================================================
 *  `tenants.plan_expires_at` sebelumnya CUMA ditulis (saat upgrade disetujui
 *  di billingController, atau saat admin platform mengoreksi paket manual di
 *  platformController) — tidak pernah ada apa pun yang membacanya kembali,
 *  jadi tenant dengan paket berbayar yang sudah lewat tanggalnya tetap
 *  berakses penuh selamanya. Job ini menutup celah itu: berjalan harian,
 *  mencari tenant berpaket bukan Free dengan `plan_expires_at` sudah lewat,
 *  lalu menurunkannya ke Free (BUKAN suspend — datanya tetap aman, cuma
 *  batas paket yang mengecil, sama seperti downgrade manual biasa).
 *
 *  `plan_expires_at IS NULL` sengaja TIDAK pernah kena job ini — itu artinya
 *  admin platform sudah mengoreksi paket itu sebagai "tanpa batas waktu"
 *  (lihat platformController.updateTenantPlan), bukan lupa mengisi tanggal.
 *
 *  Dijadwalkan lewat node-cron di server.js, sama seperti jobs/
 *  notificationDigest.js. Juga dipanggil langsung dari endpoint admin platform
 *  untuk menguji tanpa menunggu jadwalnya (lihat platformRoutes.js).
 * ============================================================================
 */
async function runPlanExpiryCheck() {
  const [expired] = await pool.query(
    `SELECT id, company_name AS "companyName", plan
     FROM tenants
     WHERE plan != 'free' AND plan_expires_at IS NOT NULL AND plan_expires_at < NOW()`
  );

  let downgraded = 0;
  const errors = [];

  for (const tenant of expired) {
    try {
      const previousPlan = getPlan(tenant.plan);

      // eslint-disable-next-line no-await-in-loop
      await downgradeToFreeOnExpiry({ tenantId: tenant.id });

      // eslint-disable-next-line no-await-in-loop
      await logAudit({
        tenantId: tenant.id, action: 'update', entityType: 'tenant_plan', entityId: tenant.id,
        oldValues: { plan: tenant.plan }, newValues: { plan: 'free', reason: 'plan_expired_auto_downgrade' },
      });

      downgraded += 1;

      // eslint-disable-next-line no-await-in-loop
      const [admins] = await pool.query(
        `SELECT email FROM users WHERE tenant_id = :tenantId AND role_id IN (SELECT id FROM roles WHERE name = 'admin')
         AND status = 'active' AND deleted_at IS NULL`,
        { tenantId: tenant.id }
      );
      if (admins.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await sendPlanExpiredNotice({
          to: admins.map((a) => a.email).join(','),
          previousPlanName: previousPlan?.name || tenant.plan,
          tenantId: tenant.id,
        });
      }
    } catch (err) {
      // Satu tenant gagal (mis. surel gagal terkirim) tidak boleh menghentikan
      // pemrosesan tenant lain yang juga sudah kedaluwarsa.
      errors.push({ tenantId: tenant.id, companyName: tenant.companyName, message: err.message });
    }
  }

  return { tenantsChecked: expired.length, downgraded, errors };
}

module.exports = { runPlanExpiryCheck };
