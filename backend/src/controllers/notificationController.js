const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { userCan } = require('../middleware/auth');

/**
 * ============================================================================
 *  PEMBERITAHUAN (pusat "perlu ditindaklanjuti")
 * ============================================================================
 *  Sebelum ini, tiga sumber tanggal penting (garansi, pengingat kustom,
 *  jadwal pemeliharaan) masing-masing hanya terlihat kalau orangnya sengaja
 *  membuka halaman yang tepat. Titik akhir ini menggabungkan ketiganya jadi
 *  satu daftar, dibaca oleh lonceng di bagian atas aplikasi — supaya "apa
 *  yang harus saya urus hari ini?" bisa dijawab tanpa membuka satu per satu
 *  aset satu per satu.
 *
 *  Sengaja TIDAK punya status "sudah dibaca" yang disimpan di database.
 *  Daftar ini dihitung ulang setiap dibuka, sama seperti bagian Garansi di
 *  Dasbor yang sudah ada — begitu tanggalnya lewat jendela waktu yang
 *  dipantau, dia hilang sendiri dari daftar tanpa perlu ada yang menghapus.
 *  Melacak status baca per pengguna adalah fitur yang jauh lebih besar
 *  daripada yang diminta di sini, dan generasi ulang otomatis ini sudah
 *  menjawab kebutuhan utamanya: tidak ada tanggal penting yang terlewat.
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

// GET /api/notifications
const getNotifications = asyncHandler(async (req, res) => {
  const items = [];
  const canSeeAssets = userCan(req.user, 'assets', 'view');
  const canSeeConsumables = userCan(req.user, 'consumables', 'view');
  const canSeeRequests = userCan(req.user, 'requests', 'view');

  /* Tiga sumber pertama semuanya menempel pada data aset — kalau pengguna
     tidak boleh melihat menu Daftar Aset, tidak satu pun dari ketiganya
     ditampilkan, sekalipun mereka lolos masuk endpoint ini lewat izin
     consumables.view. */
  if (canSeeAssets) {
    /* 1. Garansi — jendela lebih lebar (30 hari) karena biasanya butuh
       proses pengajuan perpanjangan yang tidak instan. */
    const [warrantyRows] = await pool.query(
      `SELECT id, asset_code, name, warranty_expiry, DATEDIFF(warranty_expiry, CURDATE()) AS days_remaining
       FROM assets
       WHERE deleted_at IS NULL AND status NOT IN ('${RETIRED_STATUSES.join("','")}')
         AND warranty_expiry IS NOT NULL
         AND warranty_expiry <= DATE_ADD(CURDATE(), INTERVAL :window DAY)
       ORDER BY warranty_expiry ASC`,
      { window: WARRANTY_WINDOW_DAYS }
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

    /* 2. Pengingat kustom — jendela lebih sempit (7 hari): sifatnya beragam,
       dan menampilkan yang masih 30 hari lagi hanya akan membuat daftar
       penuh dengan hal yang belum perlu ditindaklanjuti hari ini. */
    const [reminderRows] = await pool.query(
      `SELECT r.id, r.asset_id, r.title, r.reminder_date, r.notes,
              a.asset_code, a.name AS asset_name,
              DATEDIFF(r.reminder_date, CURDATE()) AS days_remaining
       FROM asset_reminders r
       JOIN assets a ON a.id = r.asset_id AND a.deleted_at IS NULL
       WHERE r.is_active = TRUE
         AND r.reminder_date <= DATE_ADD(CURDATE(), INTERVAL :window DAY)
       ORDER BY r.reminder_date ASC`,
      { window: DUE_WINDOW_DAYS }
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

    /* 3. Pemeliharaan terjadwal — sama sempitnya dengan pengingat, dan hanya
       yang masih berstatus "dijadwalkan" (yang sudah selesai/dibatalkan
       bukan lagi hal yang perlu ditindaklanjuti). */
    const [maintRows] = await pool.query(
      `SELECT m.id, m.asset_id, m.title, m.scheduled_date,
              a.asset_code, a.name AS asset_name,
              DATEDIFF(m.scheduled_date, CURDATE()) AS days_remaining
       FROM asset_maintenances m
       JOIN assets a ON a.id = m.asset_id AND a.deleted_at IS NULL
       WHERE m.status = 'dijadwalkan'
         AND m.scheduled_date <= DATE_ADD(CURDATE(), INTERVAL :window DAY)
       ORDER BY m.scheduled_date ASC`,
      { window: DUE_WINDOW_DAYS }
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
    /* 4. Barang habis pakai yang stoknya menipis — tidak punya "tanggal
       jatuh tempo" seperti tiga sumber di atas, jadi diurutkan berdasarkan
       separah apa kekurangannya (current_stock - min_stock), bukan tanggal. */
    const [lowStockRows] = await pool.query(
      `SELECT id, code, name, unit, current_stock, min_stock
       FROM consumables
       WHERE is_active = TRUE AND current_stock <= min_stock
       ORDER BY (CAST(current_stock AS SIGNED) - CAST(min_stock AS SIGNED)) ASC`
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
    /* 5. Permintaan aset yang masih menunggu ditinjau — juga tanpa "tanggal
       jatuh tempo" alami, jadi diurutkan dari yang paling lama diajukan
       (paling mendesak ditinjau). Lewat 3 hari dianggap sudah lama menunggu. */
    const [pendingRows] = await pool.query(
      `SELECT id, request_no, requester_name, item_name, priority, created_at,
              DATEDIFF(CURDATE(), created_at) AS days_waiting
       FROM asset_requests
       WHERE status = 'diajukan'
       ORDER BY created_at ASC`
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

  /* Item bertanggal diurutkan dari yang paling mendesak; item tanpa tanggal
     (stok menipis, permintaan menunggu) ditaruh mengikuti urutan kueri di
     atas, di akhir. */
  items.sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate) - new Date(b.dueDate);
  });

  res.json({
    items,
    counts: {
      total: items.length,
      overdue: items.filter((i) => i.severity === 'danger').length,
    },
  });
});

module.exports = { getNotifications };
