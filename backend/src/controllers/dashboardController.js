const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

/**
 * GET /api/dashboard/summary
 *
 * Ringkasan untuk Dasbor. Disusun agar menjawab empat pertanyaan yang benar-benar
 * ditanyakan pengelola aset setiap hari:
 *
 *   1. Berapa banyak aset, dan berapa nilainya?      -> totals + finance
 *   2. Apa yang perlu ditindaklanjuti hari ini?      -> attention
 *   3. Di mana aset berada & bagaimana kondisinya?   -> byLocation + byCondition
 *   4. Apa yang berubah belakangan ini?              -> recentActivity
 *
 * Semua angka mengecualikan aset terhapus (soft delete).
 */
const getSummary = asyncHandler(async (req, res) => {
  /* ---------- Hitungan pokok & keuangan ----------
     Digabung dalam satu query agar tidak menembak tabel assets berkali-kali.
     Aset berstatus "terjual" sudah keluar dari inventaris aktif, jadi nilainya
     TIDAK ikut dihitung sebagai nilai aset yang masih dimiliki. */
  const [[totals]] = await pool.query(`
    SELECT
      COUNT(*)                                                          AS totalAssets,
      SUM(status IN ('dipakai','idle'))                                 AS activeAssets,
      SUM(status = 'terjual')                                           AS soldAssets,
      /* "Keluar" = sudah tidak dimiliki lagi: terjual, hilang, atau dihapuskan.
         Ketiganya tidak boleh ikut menambah nilai kekayaan yang tercatat. */
      SUM(status IN ('terjual','hilang','dihapuskan'))                  AS retiredAssets,
      COALESCE(SUM(CASE WHEN status NOT IN ('terjual','hilang','dihapuskan') THEN purchase_price END), 0) AS acquisitionValue,
      COALESCE(SUM(CASE WHEN status = 'dijual'  THEN sale_value_net END), 0)  AS listedValue,
      COALESCE(SUM(CASE WHEN status = 'terjual' THEN sold_price END), 0)      AS soldValue,
      /* Nilai buku = penyusutan garis lurus, dihitung langsung di SQL agar
         tidak perlu menarik seluruh baris aset ke aplikasi hanya untuk
         menjumlahkannya. Aset tanpa masa manfaat/tanggal beli dianggap belum
         menyusut, jadi nilai bukunya sama dengan harga beli. */
      COALESCE(SUM(
        CASE WHEN status NOT IN ('terjual','hilang','dihapuskan') AND purchase_price IS NOT NULL THEN
          CASE
            WHEN useful_life_months IS NULL OR useful_life_months = 0 OR purchase_date IS NULL
              THEN purchase_price
            ELSE GREATEST(
              COALESCE(salvage_value, 0),
              purchase_price - (purchase_price - COALESCE(salvage_value, 0))
                * LEAST(TIMESTAMPDIFF(MONTH, purchase_date, CURDATE()) / useful_life_months, 1)
            )
          END
        END
      ), 0) AS bookValue
    FROM assets
    WHERE deleted_at IS NULL
  `);

  /* ---------- Custody & garansi ----------
     Dua sinyal operasional yang tidak terlihat dari status aset saja. */
  const [[custody]] = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM asset_assignments WHERE returned_at IS NULL)                 AS assignedAssets,
      (SELECT COUNT(DISTINCT holder_name) FROM asset_assignments WHERE returned_at IS NULL) AS activeHolders,
      (SELECT COUNT(*) FROM assets a
        WHERE a.deleted_at IS NULL AND a.status = 'dipakai'
          AND NOT EXISTS (SELECT 1 FROM asset_assignments g
                          WHERE g.asset_id = a.id AND g.returned_at IS NULL))            AS inUseWithoutHolder
  `);

  const [[warranty]] = await pool.query(`
    SELECT
      SUM(warranty_expiry IS NOT NULL AND warranty_expiry < CURDATE())                   AS expired,
      SUM(warranty_expiry >= CURDATE() AND warranty_expiry <= DATE_ADD(CURDATE(), INTERVAL 30 DAY))  AS expiring30,
      SUM(warranty_expiry >  DATE_ADD(CURDATE(), INTERVAL 30 DAY)
          AND warranty_expiry <= DATE_ADD(CURDATE(), INTERVAL 90 DAY))                   AS expiring90,
      SUM(warranty_expiry IS NULL)                                                       AS unknown
    FROM assets
    WHERE deleted_at IS NULL AND status NOT IN ('terjual','hilang','dihapuskan')
  `);

  /* Aset yang garansinya paling dekat berakhir — daftar tindak lanjut,
     bukan sekadar angka. */
  const [warrantySoon] = await pool.query(`
    SELECT id, asset_code, name, warranty_expiry,
           DATEDIFF(warranty_expiry, CURDATE()) AS days_remaining
    FROM assets
    WHERE deleted_at IS NULL AND status NOT IN ('terjual','hilang','dihapuskan')
      AND warranty_expiry IS NOT NULL
      AND warranty_expiry <= DATE_ADD(CURDATE(), INTERVAL 90 DAY)
    ORDER BY warranty_expiry ASC
    LIMIT 5
  `);

  const [topHolders] = await pool.query(`
    SELECT holder_name, department, COUNT(*) AS total
    FROM asset_assignments
    WHERE returned_at IS NULL
    GROUP BY holder_name, department
    ORDER BY total DESC, holder_name ASC
    LIMIT 5
  `);

  /* ---------- Hal yang butuh perhatian ----------
     Setiap angka di sini harus bisa ditindaklanjuti — di frontend masing-masing
     jadi tautan ke Daftar Aset yang sudah terfilter. */
  const [[attention]] = await pool.query(`
    SELECT
      SUM(condition_status = 'rusak_berat')                AS rusakBerat,
      SUM(condition_status = 'rusak_ringan')               AS rusakRingan,
      SUM(status = 'dipindah')                             AS inTransit,
      SUM(status = 'dijual')                               AS listedForSale,
      SUM(status = 'hilang')                               AS lost,
      SUM(location_id IS NULL)                             AS withoutLocation,
      SUM(status = 'idle' AND condition_status = 'baik')   AS readyToDeploy
    FROM assets
    WHERE deleted_at IS NULL
  `);

  const [byStatus] = await pool.query(`
    SELECT status, COUNT(*) AS total
    FROM assets WHERE deleted_at IS NULL
    GROUP BY status
  `);

  const [byCondition] = await pool.query(`
    SELECT condition_status, COUNT(*) AS total
    FROM assets WHERE deleted_at IS NULL
    GROUP BY condition_status
  `);

  /* Hanya kategori/lokasi yang benar-benar punya aset yang dikirim — daftar
     panjang berisi angka nol tidak membantu siapa pun. */
  const [byCategory] = await pool.query(`
    SELECT c.id AS category_id, c.name AS category_name, COUNT(a.id) AS total
    FROM asset_categories c
    JOIN assets a ON a.category_id = c.id AND a.deleted_at IS NULL
    GROUP BY c.id
    ORDER BY total DESC
    LIMIT 8
  `);

  const [byLocation] = await pool.query(`
    SELECT l.id AS location_id, l.code AS location_code, l.name AS location_name,
           COUNT(a.id) AS total,
           SUM(a.condition_status <> 'baik') AS damaged
    FROM locations l
    JOIN assets a ON a.location_id = l.id AND a.deleted_at IS NULL
    GROUP BY l.id
    ORDER BY total DESC
    LIMIT 8
  `);

  /* Sebaran per departemen — format laporan yang paling sering diminta di
     lingkungan General Affairs. Aset tanpa departemen ikut dihitung terpisah
     supaya tidak diam-diam hilang dari rekap. */
  const [byDepartment] = await pool.query(`
    SELECT d.id AS department_id, d.code, d.name,
           COUNT(a.id) AS total,
           COALESCE(SUM(CASE WHEN a.status NOT IN ('terjual','hilang','dihapuskan') THEN a.purchase_price END), 0) AS value
    FROM departments d
    JOIN assets a ON a.department_id = d.id AND a.deleted_at IS NULL
    GROUP BY d.id
    ORDER BY total DESC
    LIMIT 8
  `);

  const [[unassignedDept]] = await pool.query(`
    SELECT COUNT(*) AS total FROM assets WHERE deleted_at IS NULL AND department_id IS NULL
  `);

  /* Aset yang paling lama tidak tersentuh — kandidat untuk diverifikasi
     keberadaannya saat stok opname. */
  const [staleAssets] = await pool.query(`
    SELECT a.id, a.asset_code, a.name, a.status, a.updated_at,
           l.name AS location_name
    FROM assets a
    LEFT JOIN locations l ON l.id = a.location_id
    WHERE a.deleted_at IS NULL AND a.status IN ('dipakai','idle')
    ORDER BY a.updated_at ASC
    LIMIT 5
  `);

  const [recentActivity] = await pool.query(`
    SELECT al.action, al.entity_type, al.entity_id, al.created_at, u.name AS user_name
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    ORDER BY al.created_at DESC
    LIMIT 8
  `);

  res.json({
    totals: {
      totalAssets: Number(totals.totalAssets) || 0,
      activeAssets: Number(totals.activeAssets) || 0,
      soldAssets: Number(totals.soldAssets) || 0,
      retiredAssets: Number(totals.retiredAssets) || 0,
    },
    finance: {
      acquisitionValue: Number(totals.acquisitionValue) || 0,
      bookValue: Number(totals.bookValue) || 0,
      listedValue: Number(totals.listedValue) || 0,
      soldValue: Number(totals.soldValue) || 0,
    },
    custody: {
      assignedAssets: Number(custody.assignedAssets) || 0,
      activeHolders: Number(custody.activeHolders) || 0,
      inUseWithoutHolder: Number(custody.inUseWithoutHolder) || 0,
    },
    warranty: {
      expired: Number(warranty.expired) || 0,
      expiring30: Number(warranty.expiring30) || 0,
      expiring90: Number(warranty.expiring90) || 0,
      unknown: Number(warranty.unknown) || 0,
    },
    byDepartment: byDepartment.map((r) => ({
      departmentId: r.department_id, code: r.code, name: r.name,
      total: Number(r.total), value: Number(r.value) || 0,
    })),
    assetsWithoutDepartment: Number(unassignedDept.total) || 0,
    warrantySoon: warrantySoon.map((r) => ({ ...r, days_remaining: Number(r.days_remaining) })),
    topHolders: topHolders.map((r) => ({ ...r, total: Number(r.total) })),
    attention: {
      rusakBerat: Number(attention.rusakBerat) || 0,
      rusakRingan: Number(attention.rusakRingan) || 0,
      inTransit: Number(attention.inTransit) || 0,
      listedForSale: Number(attention.listedForSale) || 0,
      withoutLocation: Number(attention.withoutLocation) || 0,
      lost: Number(attention.lost) || 0,
      readyToDeploy: Number(attention.readyToDeploy) || 0,
    },
    byStatus: byStatus.map((r) => ({ status: r.status, total: Number(r.total) })),
    byCondition: byCondition.map((r) => ({ condition: r.condition_status, total: Number(r.total) })),
    byCategory: byCategory.map((r) => ({
      categoryId: r.category_id, name: r.category_name, total: Number(r.total),
    })),
    byLocation: byLocation.map((r) => ({
      locationId: r.location_id, code: r.location_code, name: r.location_name,
      total: Number(r.total), damaged: Number(r.damaged) || 0,
    })),
    staleAssets,
    recentActivity,

    // Dipertahankan agar klien lama tidak langsung rusak saat backend diperbarui
    totalAssets: Number(totals.totalAssets) || 0,
  });
});

module.exports = { getSummary };
