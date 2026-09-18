const pool = require('../config/db');
const { calculateDepreciation } = require('../utils/depreciation');

/**
 * ============================================================================
 *  PENGAMBIL DATA ZECODE
 * ============================================================================
 *  Prinsip paling penting di berkas ini: MODEL AI TIDAK PERNAH MENGARANG
 *  ANGKA. Setiap fungsi di sini mengambil data ASLI lewat SQL, lalu
 *  menyusun kalimat jawabannya sendiri lewat kode biasa (template string) —
 *  bukan menyerahkan angka mentah ke model dan berharap modelnya
 *  merangkumnya dengan benar. Model lokal 7B (atau model apa pun,
 *  sebenarnya) punya risiko halusinasi kalau diminta "merangkum" data
 *  numerik; risiko itu sepenuhnya dihindari dengan tidak pernah memberi
 *  model itu pekerjaan itu sama sekali.
 *
 *  Peran model AI di Zecode HANYA sebatas: memahami maksud pertanyaan
 *  (intent) + menjawab basa-basi/sapaan yang memang tidak menyentuh data.
 *  Begitu jawabannya menyangkut data sistem, jawabannya 100% dari sini.
 * ============================================================================
 */

const STATUS_LABEL = {
  dijual: 'Dijual', terjual: 'Terjual', dipindah: 'Dipindahkan',
  dipakai: 'Dipakai', idle: 'Menganggur', hilang: 'Hilang', dihapuskan: 'Dihapuskan',
};
const CONDITION_LABEL = { baik: 'Baik', rusak_ringan: 'Rusak Ringan', rusak_berat: 'Rusak Berat' };
const RETIRED_STATUSES = ['terjual', 'hilang', 'dihapuskan'];
const rupiah = (v) => (v === null || v === undefined ? null : `Rp ${Number(v).toLocaleString('id-ID')}`);
const tanggal = (v) => (v ? new Date(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : null);

const MAX_ROWS = 8; // daftar di obrolan sengaja dibuat singkat, bukan tabel penuh

/** "Ditemukan N aset..." / "Tidak ditemukan aset..." — dipakai berulang. */
function noneFound(subject) {
  return `Tidak ditemukan ${subject} yang cocok. Coba kata kunci lain, atau buka halaman terkait untuk mencari lebih leluasa.`;
}

// ---------------------------------------------------------------------------
async function asset_search({ keyword, status, condition }, tenantId) {
  const conditions = ['a.deleted_at IS NULL', 'a.tenant_id = :tenantId'];
  const params = { tenantId };
  if (keyword) {
    conditions.push('(a.name ILIKE :kw OR a.asset_code ILIKE :kw OR a.brand ILIKE :kw OR a.model ILIKE :kw OR a.serial_number ILIKE :kw)');
    params.kw = `%${keyword}%`;
  }
  if (status && STATUS_LABEL[status]) { conditions.push('a.status = :status'); params.status = status; }
  if (condition && CONDITION_LABEL[condition]) { conditions.push('a.condition_status = :condition'); params.condition = condition; }

  const [rows] = await pool.query(
    `SELECT a.asset_code, a.name, a.brand, a.model, a.status, a.condition_status,
            l.name AS location_name, sl.name AS sub_location_name
     FROM assets a
     LEFT JOIN locations l ON l.id = a.location_id
     LEFT JOIN sub_locations sl ON sl.id = a.sub_location_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.updated_at DESC
     LIMIT ${MAX_ROWS + 1}`,
    params
  );

  if (rows.length === 0) return { text: noneFound('aset'), link: '/assets' };

  const shown = rows.slice(0, MAX_ROWS);
  const lines = shown.map((r) => {
    const lokasi = [r.location_name, r.sub_location_name].filter(Boolean).join(' · ');
    return `• **${r.name}** (${r.asset_code}) — ${STATUS_LABEL[r.status] || r.status}, kondisi ${CONDITION_LABEL[r.condition_status] || r.condition_status}${lokasi ? `, di ${lokasi}` : ''}`;
  });
  const more = rows.length > MAX_ROWS ? `\n\n_...dan ${rows.length - MAX_ROWS} lainnya. Buka Daftar Aset untuk melihat semuanya._` : '';

  return { text: `Ditemukan ${rows.length} aset:\n\n${lines.join('\n')}${more}`, link: '/assets' };
}

// ---------------------------------------------------------------------------
async function asset_detail({ keyword }, tenantId) {
  if (!keyword) return { text: 'Sebutkan nama atau kode aset yang ingin dicari.' };

  const [rows] = await pool.query(
    `SELECT a.*, l.name AS location_name, sl.name AS sub_location_name, d.name AS department_name,
            asg.holder_name, asg.department AS holder_department
     FROM assets a
     LEFT JOIN locations l ON l.id = a.location_id
     LEFT JOIN sub_locations sl ON sl.id = a.sub_location_id
     LEFT JOIN departments d ON d.id = a.department_id
     LEFT JOIN asset_assignments asg ON asg.asset_id = a.id AND asg.returned_at IS NULL
     WHERE a.tenant_id = :tenantId AND a.deleted_at IS NULL AND (a.name ILIKE :kw OR a.asset_code ILIKE :kw)
     ORDER BY a.updated_at DESC LIMIT 1`,
    { tenantId, kw: `%${keyword}%` }
  );
  const a = rows[0];
  if (!a) return { text: noneFound(`aset bernama/berkode "${keyword}"`), link: '/assets' };

  const lokasi = [a.location_name, a.sub_location_name].filter(Boolean).join(' · ') || '—';
  const dep = calculateDepreciation(a);

  const parts = [
    `**${a.name}** (${a.asset_code})`,
    `Status: ${STATUS_LABEL[a.status] || a.status} · Kondisi: ${CONDITION_LABEL[a.condition_status] || a.condition_status}`,
    `Lokasi: ${lokasi}`,
  ];
  if (a.brand || a.model) parts.push(`Brand/Model: ${[a.brand, a.model].filter(Boolean).join(' / ')}`);
  if (a.department_name) parts.push(`Departemen: ${a.department_name}`);
  if (a.holder_name) parts.push(`Sedang dipegang: ${a.holder_name}${a.holder_department ? ` (${a.holder_department})` : ''}`);
  if (a.warranty_expiry) parts.push(`Garansi sampai: ${tanggal(a.warranty_expiry)}`);
  if (dep) parts.push(`Nilai buku saat ini: ${rupiah(dep.bookValue)}`);

  return { text: parts.join('\n'), link: `/assets/${a.id}` };
}

// ---------------------------------------------------------------------------
async function holder_lookup({ holder_name }, tenantId) {
  if (!holder_name) return { text: 'Sebutkan nama orang yang ingin dicari aset yang dipegangnya.' };

  const [rows] = await pool.query(
    `SELECT a.asset_code, a.name, asg.holder_name, asg.department, asg.assigned_at
     FROM asset_assignments asg
     JOIN assets a ON a.id = asg.asset_id
     WHERE a.tenant_id = :tenantId AND asg.returned_at IS NULL AND asg.holder_name ILIKE :kw
     ORDER BY asg.assigned_at DESC LIMIT ${MAX_ROWS}`,
    { tenantId, kw: `%${holder_name}%` }
  );
  if (rows.length === 0) return { text: noneFound(`aset yang dipegang "${holder_name}"`), link: '/assets' };

  const lines = rows.map((r) => `• **${r.name}** (${r.asset_code}) — sejak ${tanggal(r.assigned_at)}`);
  return { text: `${rows[0].holder_name} sedang memegang ${rows.length} aset:\n\n${lines.join('\n')}`, link: '/assets' };
}

// ---------------------------------------------------------------------------
async function warranty_soon(params, tenantId) {
  const [rows] = await pool.query(
    `SELECT asset_code, name, warranty_expiry, (warranty_expiry - CURRENT_DATE) AS days_remaining
     FROM assets
     WHERE tenant_id = :tenantId AND deleted_at IS NULL AND status NOT IN ('${RETIRED_STATUSES.join("','")}')
       AND warranty_expiry IS NOT NULL AND warranty_expiry <= CURRENT_DATE + INTERVAL '90 days'
     ORDER BY warranty_expiry ASC LIMIT ${MAX_ROWS + 1}`,
    { tenantId }
  );
  if (rows.length === 0) return { text: 'Tidak ada aset yang garansinya akan berakhir dalam 90 hari ke depan. Semua aman.', link: '/dashboard' };

  const shown = rows.slice(0, MAX_ROWS);
  const lines = shown.map((r) => {
    const d = Number(r.days_remaining);
    const label = d < 0 ? `sudah berakhir ${Math.abs(d)} hari lalu` : d === 0 ? 'berakhir hari ini' : `${d} hari lagi`;
    return `• **${r.name}** (${r.asset_code}) — ${label}`;
  });
  const more = rows.length > MAX_ROWS ? `\n\n_...dan ${rows.length - MAX_ROWS} lainnya._` : '';
  return { text: `${rows.length} aset garansinya perlu diperhatikan:\n\n${lines.join('\n')}${more}`, link: '/dashboard' };
}

// ---------------------------------------------------------------------------
async function low_stock(params, tenantId) {
  const [rows] = await pool.query(
    `SELECT code, name, unit, current_stock, min_stock
     FROM consumables WHERE tenant_id = :tenantId AND is_active = TRUE AND current_stock <= min_stock
     ORDER BY (CAST(current_stock AS INTEGER) - CAST(min_stock AS INTEGER)) ASC LIMIT ${MAX_ROWS + 1}`,
    { tenantId }
  );
  if (rows.length === 0) return { text: 'Tidak ada barang habis pakai yang stoknya di bawah ambang minimum. Semua aman.', link: '/consumables' };

  const shown = rows.slice(0, MAX_ROWS);
  const lines = shown.map((r) => `• **${r.name}** (${r.code}) — tersisa ${r.current_stock} ${r.unit} (ambang ${r.min_stock})`);
  const more = rows.length > MAX_ROWS ? `\n\n_...dan ${rows.length - MAX_ROWS} lainnya._` : '';
  return { text: `${rows.length} barang stoknya menipis/habis:\n\n${lines.join('\n')}${more}`, link: '/consumables?lowStockOnly=true' };
}

// ---------------------------------------------------------------------------
async function pending_requests(params, tenantId) {
  const [rows] = await pool.query(
    `SELECT request_no, requester_name, item_name, priority, created_at
     FROM asset_requests WHERE tenant_id = :tenantId AND status = 'diajukan'
     ORDER BY created_at ASC LIMIT ${MAX_ROWS + 1}`,
    { tenantId }
  );
  if (rows.length === 0) return { text: 'Tidak ada permintaan aset yang menunggu ditinjau saat ini.', link: '/requests' };

  const PRIORITY_LABEL = { rendah: 'Rendah', sedang: 'Sedang', tinggi: 'Tinggi' };
  const shown = rows.slice(0, MAX_ROWS);
  const lines = shown.map((r) => `• **${r.item_name}** untuk ${r.requester_name} — prioritas ${PRIORITY_LABEL[r.priority] || r.priority} (${r.request_no})`);
  const more = rows.length > MAX_ROWS ? `\n\n_...dan ${rows.length - MAX_ROWS} lainnya._` : '';
  return { text: `${rows.length} permintaan menunggu ditinjau:\n\n${lines.join('\n')}${more}`, link: '/requests?status=diajukan' };
}

// ---------------------------------------------------------------------------
async function dashboard_summary(params, tenantId) {
  const [[totals]] = await pool.query(`
    SELECT
      COUNT(*) AS "totalAssets",
      COUNT(*) FILTER (WHERE status IN ('dipakai','idle')) AS "activeAssets",
      COALESCE(SUM(CASE WHEN status NOT IN ('${RETIRED_STATUSES.join("','")}') THEN purchase_price END), 0) AS "acquisitionValue"
    FROM assets WHERE tenant_id = :tenantId AND deleted_at IS NULL
  `, { tenantId });
  const [[custody]] = await pool.query(
    `SELECT COUNT(*) AS "assignedAssets" FROM asset_assignments asg JOIN assets a ON a.id = asg.asset_id WHERE a.tenant_id = :tenantId AND asg.returned_at IS NULL`,
    { tenantId }
  );
  const [[lowStockCount]] = await pool.query(
    `SELECT COUNT(*) AS c FROM consumables WHERE tenant_id = :tenantId AND is_active = TRUE AND current_stock <= min_stock`,
    { tenantId }
  );
  const [[pendingCount]] = await pool.query(
    `SELECT COUNT(*) AS c FROM asset_requests WHERE tenant_id = :tenantId AND status = 'diajukan'`,
    { tenantId }
  );

  const text = [
    `Ringkasan sistem saat ini:`,
    `• Total aset: ${totals.totalAssets} (${totals.activeAssets} aktif digunakan/tersedia)`,
    `• Nilai perolehan aset aktif: ${rupiah(totals.acquisitionValue)}`,
    `• Sedang dipegang seseorang: ${custody.assignedAssets} aset`,
    `• Barang habis pakai stok menipis: ${lowStockCount.c}`,
    `• Permintaan aset menunggu ditinjau: ${pendingCount.c}`,
  ].join('\n');

  return { text, link: '/dashboard' };
}

module.exports = {
  asset_search, asset_detail, holder_lookup, warranty_soon, low_stock, pending_requests, dashboard_summary,
};
