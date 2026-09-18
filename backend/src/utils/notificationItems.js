const pool = require('../config/db');
const { userCan } = require('../middleware/auth');

/**
 * ============================================================================
 *  PENGUMPUL ITEM "PERLU DITINDAKLANJUTI"
 * ============================================================================
 *  Logika ini awalnya cuma dipakai lonceng notifikasi di dalam aplikasi
 *  (lihat notificationController.js). Dipindah ke sini supaya digest email
 *  harian (lihat jobs/notificationDigest.js) memakai SUMBER YANG SAMA persis
 *  — seorang pengguna melihat di lonceng aplikasinya sama dengan yang dikirim
 *  ke suratnya, tidak ada dua definisi "mendesak" yang bisa berbeda.
 * ============================================================================
 */

const WARRANTY_WINDOW_DAYS = 30;
const DUE_WINDOW_DAYS = 7;
const RETIRED_STATUSES = ['terjual', 'hilang', 'dihapuskan'];

const relativeLabel = (days) => {
  if (days < 0) return `Terlewat ${Math.abs(days)} hari`;
  if (days === 0) return 'Hari ini';
  if (days === 1) return 'Besok';
  return `${days} hari lagi`;
};

/** @returns {Promise<{items: object[], counts: {total: number, overdue: number}}>} */
async function getNotificationItems(user) {
  const items = [];
  const tenantId = user.tenant_id;
  const canSeeAssets = userCan(user, 'assets', 'view');
  const canSeeConsumables = userCan(user, 'consumables', 'view');
  const canSeeRequests = userCan(user, 'requests', 'view');

  if (canSeeAssets) {
    const [warrantyRows] = await pool.query(
      `SELECT id, asset_code, name, warranty_expiry, (warranty_expiry - CURRENT_DATE) AS days_remaining
       FROM assets
       WHERE tenant_id = :tenantId AND deleted_at IS NULL AND status NOT IN ('${RETIRED_STATUSES.join("','")}')
         AND warranty_expiry IS NOT NULL
         AND warranty_expiry <= CURRENT_DATE + make_interval(days => :window)
       ORDER BY warranty_expiry ASC`,
      { tenantId, window: WARRANTY_WINDOW_DAYS }
    );
    for (const r of warrantyRows) {
      const days = Number(r.days_remaining);
      items.push({
        id: `warranty-${r.id}`,
        category: 'warranty',
        severity: days < 0 ? 'danger' : (days <= 7 ? 'warning' : 'info'),
        title: days < 0 ? 'Garansi sudah berakhir' : 'Garansi segera berakhir',
        assetName: r.name,
        assetCode: r.asset_code,
        detail: relativeLabel(days),
        dueDate: r.warranty_expiry,
        assetId: r.id,
        link: `/assets/${r.id}`,
      });
    }

    const [reminderRows] = await pool.query(
      `SELECT r.id, r.asset_id, r.title, r.reminder_date, r.notes,
              a.asset_code, a.name AS asset_name,
              (r.reminder_date - CURRENT_DATE) AS days_remaining
       FROM asset_reminders r
       JOIN assets a ON a.id = r.asset_id AND a.deleted_at IS NULL
       WHERE r.tenant_id = :tenantId AND r.is_active = TRUE
         AND r.reminder_date <= CURRENT_DATE + make_interval(days => :window)
       ORDER BY r.reminder_date ASC`,
      { tenantId, window: DUE_WINDOW_DAYS }
    );
    for (const r of reminderRows) {
      const days = Number(r.days_remaining);
      items.push({
        id: `reminder-${r.id}`,
        category: 'reminder',
        severity: days < 0 ? 'danger' : 'warning',
        title: r.title,
        assetName: r.asset_name,
        assetCode: r.asset_code,
        detail: relativeLabel(days),
        dueDate: r.reminder_date,
        assetId: r.asset_id,
        link: `/assets/${r.asset_id}`,
      });
    }

    const [maintRows] = await pool.query(
      `SELECT m.id, m.asset_id, m.title, m.scheduled_date,
              a.asset_code, a.name AS asset_name,
              (m.scheduled_date - CURRENT_DATE) AS days_remaining
       FROM asset_maintenances m
       JOIN assets a ON a.id = m.asset_id AND a.deleted_at IS NULL
       WHERE m.tenant_id = :tenantId AND m.status = 'dijadwalkan'
         AND m.scheduled_date <= CURRENT_DATE + make_interval(days => :window)
       ORDER BY m.scheduled_date ASC`,
      { tenantId, window: DUE_WINDOW_DAYS }
    );
    for (const r of maintRows) {
      const days = Number(r.days_remaining);
      items.push({
        id: `maintenance-${r.id}`,
        category: 'maintenance',
        severity: days < 0 ? 'danger' : 'warning',
        title: r.title,
        assetName: r.asset_name,
        assetCode: r.asset_code,
        detail: relativeLabel(days),
        dueDate: r.scheduled_date,
        assetId: r.asset_id,
        link: `/assets/${r.asset_id}`,
      });
    }
  }

  if (canSeeConsumables) {
    const [lowStockRows] = await pool.query(
      `SELECT id, code, name, unit, current_stock, min_stock
       FROM consumables
       WHERE tenant_id = :tenantId AND is_active = TRUE AND current_stock <= min_stock
       ORDER BY (CAST(current_stock AS INTEGER) - CAST(min_stock AS INTEGER)) ASC`,
      { tenantId }
    );
    for (const r of lowStockRows) {
      const habis = r.current_stock <= 0;
      items.push({
        id: `consumable-${r.id}`,
        category: 'consumable',
        severity: habis ? 'danger' : 'warning',
        title: habis ? 'Stok habis' : 'Stok menipis',
        assetName: r.name,
        assetCode: r.code,
        detail: `Tersisa ${r.current_stock} ${r.unit} (ambang ${r.min_stock})`,
        dueDate: null,
        assetId: r.id,
        link: `/consumables/${r.id}`,
      });
    }
  }

  if (canSeeRequests) {
    const [pendingRows] = await pool.query(
      `SELECT id, request_no, requester_name, item_name, priority, created_at,
              (CURRENT_DATE - created_at::date) AS days_waiting
       FROM asset_requests
       WHERE tenant_id = :tenantId AND status = 'diajukan'
       ORDER BY created_at ASC`,
      { tenantId }
    );
    for (const r of pendingRows) {
      const lama = Number(r.days_waiting) > 3;
      items.push({
        id: `request-${r.id}`,
        category: 'request',
        severity: lama ? 'warning' : 'info',
        title: 'Menunggu ditinjau',
        assetName: r.item_name,
        assetCode: r.request_no,
        detail: `${r.requester_name} · ${r.days_waiting <= 0 ? 'diajukan hari ini' : `diajukan ${r.days_waiting} hari lalu`}`,
        dueDate: null,
        assetId: r.id,
        link: `/requests/${r.id}`,
      });
    }
  }

  items.sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate) - new Date(b.dueDate);
  });

  return {
    items,
    counts: {
      total: items.length,
      overdue: items.filter((i) => i.severity === 'danger').length,
    },
  };
}

module.exports = { getNotificationItems };
