const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { getPlan } = require('../config/plans');

/**
 * Penegakan limit paket (Fase 4 SaaS) — dipasang di rute PEMBUATAN data
 * (POST aset, POST pengguna, POST lokasi). Cukup dicek di titik pembuatan:
 * limit yang sudah pernah terlampaui (mis. setelah downgrade — lihat
 * subscriptionService.activateSubscription, downgrade TIDAK PERNAH menghapus
 * data existing) TIDAK memblokir edit/lihat data yang sudah ada, hanya
 * mencegah bertambah lebih banyak lagi ("soft limit").
 *
 * `getPlan()` (config/plans.js) tidak pernah mengembalikan `null` di sini
 * kecuali kolom tenants.plan berisi nilai yang tidak dikenal katalog — itu
 * data yang tidak konsisten, bukan alur normal, jadi diloloskan (fail-open)
 * daripada memblokir seluruh tenant karena kesalahan data.
 *
 * Pesannya sengaja spesifik (bukan "Batas tercapai" generik) + `upgradeUrl`
 * ikut dikirim supaya frontend bisa menampilkan CTA "Upgrade Plan" langsung
 * di titik gagalnya, bukan cuma toast galat biasa — lihat
 * components/PlanLimitNotice.jsx.
 */
function limitMiddleware({ countQuery, limitKey, label, labelPlural }) {
  return asyncHandler(async (req, res, next) => {
    const tenantId = req.user.tenant_id;
    const [[tenantRow]] = await pool.query(`SELECT plan FROM tenants WHERE id = :tenantId`, { tenantId });
    const plan = getPlan(tenantRow?.plan);
    const limit = plan ? plan[limitKey] : null;

    if (limit === null || limit === undefined) return next(); // tanpa batas, atau paket tidak dikenal

    const [[{ count }]] = await pool.query(countQuery, { tenantId });
    if (count >= limit) {
      return res.status(403).json({
        message: `Batas ${labelPlural} tercapai. Paket ${plan.name} Anda mengizinkan sampai ${limit.toLocaleString('id-ID')} ${labelPlural}. Tingkatkan paket Anda untuk menambah ${label} lagi.`,
        code: 'PLAN_LIMIT_REACHED',
        limitKey,
        limit,
        current: count,
        planId: plan.id,
        planName: plan.name,
        upgradeUrl: '/billing',
      });
    }
    next();
  });
}

const checkAssetLimit = limitMiddleware({
  countQuery: `SELECT COUNT(*) AS count FROM assets WHERE tenant_id = :tenantId AND deleted_at IS NULL`,
  limitKey: 'maxAssets',
  label: 'aset',
  labelPlural: 'aset',
});

const checkUserLimit = limitMiddleware({
  countQuery: `SELECT COUNT(*) AS count FROM users WHERE tenant_id = :tenantId AND deleted_at IS NULL`,
  limitKey: 'maxUsers',
  label: 'pengguna',
  labelPlural: 'pengguna',
});

const checkLocationLimit = limitMiddleware({
  countQuery: `SELECT COUNT(*) AS count FROM locations WHERE tenant_id = :tenantId AND is_active = TRUE`,
  limitKey: 'locationLimit',
  label: 'lokasi',
  labelPlural: 'lokasi',
});

module.exports = { checkAssetLimit, checkUserLimit, checkLocationLimit };
