import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import axiosClient from '../api/axiosClient.js';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pagination from '../components/ui/Pagination.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { Badge } from '../components/ui/StatusBadge.jsx';
import { SkeletonRows } from '../components/ui/Skeleton.jsx';
import { SearchInput } from '../components/ui/Form.jsx';

/* Istilah teknis di database diterjemahkan agar riwayat terbaca sebagai
   kalimat, bukan sebagai dump tabel. */
const ACTION_LABEL = {
  create: 'Menambahkan', update: 'Memperbarui', delete: 'Menghapus',
  login: 'Masuk', logout: 'Keluar', scan: 'Memindai', export: 'Mengekspor',
};

const ACTION_STYLE = {
  create: { tone: 'brand', icon: 'fa-plus' },
  update: { tone: 'info', icon: 'fa-pen' },
  delete: { tone: 'danger', icon: 'fa-trash-can' },
  scan: { tone: 'accent', icon: 'fa-qrcode' },
  login: { tone: 'neutral', icon: 'fa-right-to-bracket' },
  logout: { tone: 'neutral', icon: 'fa-right-from-bracket' },
  export: { tone: 'warning', icon: 'fa-file-export' },
};

/* Daftar ini harus persis sama dengan string entityType yang benar-benar
   dikirim logAudit() di seluruh controller backend — bukan ditebak dari
   nama menunya. Dua kunci sempat salah tebak (`custom_field` seharusnya
   `asset_custom_field`, `profile` seharusnya `user_profile`) dan diam-diam
   tidak pernah cocok sejak awal, sehingga kolom Data menampilkan nama tabel
   mentah alih-alih label yang terbaca. */
const ENTITY_LABEL = {
  asset: 'Aset',
  asset_category: 'Kode Barang/Aset',
  asset_type: 'Kategori Aset',
  asset_custom_field: 'Bidang Kustom',
  asset_assignment: 'Serah Terima Aset',
  asset_attachment: 'Lampiran Berkas',
  asset_maintenance: 'Pemeliharaan Aset',
  asset_reminder: 'Pengingat Aset',
  asset_request: 'Permintaan Aset',
  asset_export: 'Ekspor Aset',
  asset_import: 'Impor Aset',
  assignment_bast: 'Berita Acara Serah Terima',
  location: 'Lokasi',
  sub_location: 'Sub Lokasi',
  location_import: 'Impor Lokasi',
  department: 'Departemen',
  consumable: 'Barang Habis Pakai',
  stock_opname: 'Stok Opname',
  depreciation_report: 'Laporan Penyusutan',
  category_import: 'Impor Kode Barang',
  user: 'Pengguna',
  user_profile: 'Profil Pengguna',
  user_email: 'Surel Pengguna',
  user_password: 'Kata Sandi Pengguna',
  user_username: 'Nama Pengguna',
  qr_code: 'Kode QR',
  app_settings: 'Pengaturan Aplikasi',
};

/* Kolom teknis yang tidak berguna dibaca manusia di panel perubahan. */
const HIDDEN_KEYS = new Set(['customFields', 'password', 'passwordHash', 'password_hash']);

const FIELD_LABEL = {
  name: 'Nama', brand: 'Brand', model: 'Model', status: 'Status',
  condition: 'Kondisi', condition_status: 'Kondisi', vendor: 'Vendor',
  notes: 'Catatan', serialNumber: 'Nomor Seri', specDetail: 'Spesifikasi',
  categoryId: 'Kode Barang', assetTypeId: 'Kategori Aset',
  locationId: 'Lokasi', subLocationId: 'Sub Lokasi',
  purchaseDate: 'Tanggal Beli', purchasePrice: 'Harga Beli',
  saleValueNet: 'Harga Jual/Net', soldDate: 'Tanggal Terjual', soldPrice: 'Harga Terjual',
  username: 'Nama Pengguna', email: 'Surel', slug: 'Kode',
  // roleId hanya muncul di catatan lama, sebelum peran dihapus
  roleId: 'Peran (lama)', isAdmin: 'Administrator',
  code: 'Kode', description: 'Deskripsi', rows: 'Jumlah Baris',

  // Sama seperti ENTITY_LABEL — daftar ini harus persis sama dengan nama
  // key yang benar-benar dikirim logAudit() di newValues/oldValues, supaya
  // panel sebelum/sesudah tidak menampilkan camelCase mentah.
  assetId: 'Aset', assetCode: 'Kode Aset',
  title: 'Judul', category: 'Kategori', unit: 'Satuan',

  // Pengingat & pemeliharaan (Tahap 4)
  reminderDate: 'Tanggal Pengingat', recurrence: 'Pengulangan', selesai: 'Selesai',
  scheduledDate: 'Tanggal Jadwal', maintenanceType: 'Jenis Pemeliharaan', cost: 'Biaya',

  // Barang habis pakai (Tahap 5)
  minStock: 'Ambang Stok Minimum', stock: 'Stok',
  stok_masuk: 'Stok Masuk', stok_keluar: 'Stok Keluar', stokBaru: 'Stok Baru',
  selisih: 'Selisih', alasan: 'Alasan',

  // Permintaan aset (Tahap 6)
  requestNo: 'Nomor Permintaan', requesterName: 'Nama Peminta', itemName: 'Nama Barang',
  priority: 'Prioritas', reviewNote: 'Catatan Tinjauan', assignmentId: 'ID Penugasan',
  requestedBy: 'Peminta', department: 'Departemen', departmentId: 'Departemen',

  // Laporan penyusutan (Tahap 6)
  asOfDate: 'Per Tanggal', jumlahBaris: 'Jumlah Baris',

  // Stok opname (Tahap 2b)
  totalAset: 'Jumlah Aset', diterapkan: 'Diterapkan',

  // Lampiran berkas (Tahap 3)
  fileName: 'Nama Berkas', sizeKb: 'Ukuran (KB)',

  // Serah terima & BAST (Tahap 3, 6)
  holderName: 'Nama Pemegang', returnedAt: 'Tanggal Kembali',
  returnCondition: 'Kondisi Kembali', newStatus: 'Status Baru',
  type: 'Jenis', docNo: 'Nomor Dokumen',
};

/* Nilai enum disimpan mentah di audit log. Diterjemahkan saat ditampilkan
   supaya panel perubahan terbaca sama seperti di layar lain.
   Catatan: kolom berisi id relasi (locationId, categoryId, …) tetap tampil
   sebagai angka — audit log hanya menyimpan payload asli, tanpa nama entitas. */
/* Satu peta `status` dipakai bersama oleh aset, permintaan, pemeliharaan,
   DAN stok opname — aman digabung karena tidak ada nilai yang bentrok
   (mis. "dibatalkan" dan "selesai" dipakai beberapa entitas sekaligus,
   tapi artinya sama persis di semua tempat). */
const VALUE_LABEL = {
  status: {
    // Aset
    dijual: 'Dijual', terjual: 'Terjual', dipindah: 'Dipindahkan', dipakai: 'Dipakai',
    idle: 'Menganggur', hilang: 'Hilang', dihapuskan: 'Dihapuskan',
    // Permintaan aset
    diajukan: 'Diajukan', disetujui: 'Disetujui', ditolak: 'Ditolak', dipenuhi: 'Dipenuhi', dibatalkan: 'Dibatalkan',
    // Pemeliharaan
    dijadwalkan: 'Dijadwalkan', selesai: 'Selesai',
    // Stok opname
    berjalan: 'Berjalan',
  },
  condition: { baik: 'Baik', rusak_ringan: 'Rusak Ringan', rusak_berat: 'Rusak Berat' },
  condition_status: { baik: 'Baik', rusak_ringan: 'Rusak Ringan', rusak_berat: 'Rusak Berat' },
  returnCondition: { baik: 'Baik', rusak_ringan: 'Rusak Ringan', rusak_berat: 'Rusak Berat' },
  newStatus: { idle: 'Menganggur', dipakai: 'Dipakai' },
  priority: { rendah: 'Rendah', sedang: 'Sedang', tinggi: 'Tinggi' },
  category: { atk: 'ATK', kebersihan: 'Kebersihan', it_supplies: 'Perlengkapan IT', lainnya: 'Lainnya' },
  maintenanceType: { preventive: 'Preventif (Terjadwal)', corrective: 'Korektif (Perbaikan)', calibration: 'Kalibrasi', other: 'Lainnya' },
  recurrence: { none: 'Sekali', monthly: 'Bulanan', quarterly: 'Triwulanan', yearly: 'Tahunan' },
  type: { serah: 'Serah', kembali: 'Kembali' },
};

const MONEY_KEYS = new Set([
  'purchasePrice', 'saleValueNet', 'soldPrice', 'purchase_price', 'sale_value_net', 'sold_price',
  'cost',
]);

function formatValue(v, key) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Ya' : 'Tidak';
  if (typeof v === 'object') return JSON.stringify(v);

  const mapped = VALUE_LABEL[key]?.[v];
  if (mapped) return mapped;

  if (MONEY_KEYS.has(key) && !Number.isNaN(Number(v))) {
    return `Rp ${Number(v).toLocaleString('id-ID')}`;
  }

  return String(v);
}

/** Panel sebelum/sesudah, hanya menampilkan field yang benar-benar berubah. */
function ChangeDetail({ oldValues, newValues }) {
  if (!oldValues && !newValues) {
    return <p className="text-xs text-ink-400 italic">Tidak ada rincian perubahan yang tercatat.</p>;
  }

  const keys = [...new Set([...Object.keys(oldValues || {}), ...Object.keys(newValues || {})])]
    .filter((k) => !HIDDEN_KEYS.has(k));

  /* Kalau tidak ada nilai lama, ini penciptaan data — tampilkan sebagai
     daftar nilai awal, bukan sebagai perbandingan kosong -> isi. */
  const isCreate = !oldValues;

  const changed = keys.filter((k) => {
    if (isCreate) return newValues[k] !== null && newValues[k] !== undefined && newValues[k] !== '';
    return JSON.stringify(oldValues?.[k]) !== JSON.stringify(newValues?.[k]);
  });

  if (changed.length === 0) {
    return <p className="text-xs text-ink-400 italic">Tidak ada nilai yang berubah.</p>;
  }

  return (
    <div className="overflow-x-auto scrollbar-slim">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-ink-400">
            <th className="pb-1.5 pr-4 font-medium">Kolom</th>
            {!isCreate && <th className="pb-1.5 pr-4 font-medium">Sebelum</th>}
            <th className="pb-1.5 font-medium">{isCreate ? 'Nilai' : 'Sesudah'}</th>
          </tr>
        </thead>
        <tbody>
          {changed.map((k) => (
            <tr key={k} className="align-top">
              <td className="py-1 pr-4 text-ink-500 whitespace-nowrap">{FIELD_LABEL[k] || k}</td>
              {!isCreate && (
                <td className="py-1 pr-4 text-ink-400 line-through break-all max-w-[16rem]">
                  {formatValue(oldValues?.[k], k)}
                </td>
              )}
              <td className="py-1 text-ink-800 font-medium break-all max-w-[16rem]">
                {formatValue(newValues?.[k], k)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogRow({ log }) {
  const [open, setOpen] = useState(false);
  const style = ACTION_STYLE[log.action] || { tone: 'neutral', icon: 'fa-circle-dot' };
  const entity = ENTITY_LABEL[log.entity_type] || log.entity_type;
  const hasDetail = Boolean(log.old_values || log.new_values);

  return (
    <>
      <tr className={open ? 'is-selected' : ''}>
        <td className="whitespace-nowrap text-[13px] text-ink-500 tabular-nums">
          {new Date(log.created_at).toLocaleString('id-ID', {
            day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
          })}
        </td>

        <td>
          {log.user_name ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full
                           bg-gradient-to-br from-info-500 to-brand-500 text-white text-[10px] font-semibold"
                aria-hidden="true"
              >
                {log.user_name[0]?.toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-ink-800 truncate">{log.user_name}</span>
                <span className="block text-[10px] font-mono text-ink-400 truncate">{log.username}</span>
              </span>
            </div>
          ) : (
            <span className="text-[13px] text-ink-400 italic">Anonim / publik</span>
          )}
        </td>

        <td>
          <Badge tone={style.tone} size="sm">
            <i className={`fas ${style.icon} text-[9px] mr-1.5`} aria-hidden="true" />
            {ACTION_LABEL[log.action] || log.action}
          </Badge>
        </td>

        <td className="text-[13px] text-ink-600">
          {entity}
          {log.entity_id ? <span className="font-mono text-ink-400"> #{log.entity_id}</span> : null}
        </td>

        <td className="text-[11px] font-mono text-ink-400 whitespace-nowrap">
          {log.ip_address || '—'}
        </td>

        <td className="text-right">
          {hasDetail && (
            <button
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg
                         text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
              title={open ? 'Sembunyikan rincian' : 'Lihat rincian perubahan'}
            >
              <i className={`fas fa-chevron-down text-[11px] transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
          )}
        </td>
      </tr>

      {open && (
        <tr>
          <td colSpan={6} className="bg-ink-50/70 !py-4">
            <ChangeDetail oldValues={log.old_values} newValues={log.new_values} />
          </td>
        </tr>
      )}
    </>
  );
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [filters, setFilters] = useState({ actions: [], entityTypes: [], users: [] });
  const [pagination, setPagination] = useState({ totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [userId, setUserId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    axiosClient.get('/audit-logs/filters').then((res) => setFilters(res.data));
  }, []);

  useEffect(() => {
    setLoading(true);
    axiosClient
      .get('/audit-logs', {
        params: { search, action, entityType, userId, dateFrom, dateTo, page, limit: 25 },
      })
      .then((res) => {
        setLogs(res.data.data);
        setPagination(res.data.pagination);
      })
      .finally(() => setLoading(false));
  }, [search, action, entityType, userId, dateFrom, dateTo, page]);

  function update(setter) {
    return (value) => { setter(value); setPage(1); };
  }

  const activeCount = [action, entityType, userId, dateFrom, dateTo].filter(Boolean).length;

  function clearAll() {
    setAction(''); setEntityType(''); setUserId('');
    setDateFrom(''); setDateTo(''); setSearch(''); setPage(1);
  }

  const selectClass = 'field-select field-sunken !py-2.5 !text-[13px] w-full';
  const dateClass = 'field field-sunken !py-2.5 !text-[13px] w-full';

  return (
    <Layout>
      <PageHeader
        eyebrow="Administrasi"
        title="Riwayat Aktivitas"
        description="Jejak seluruh perubahan data di sistem — siapa melakukan apa, kapan, dan nilai apa yang berubah."
      />

      {/* Susunan filter mengikuti pola yang sama dengan Daftar Aset: pencarian +
          satu filter utama selalu tampil, sisanya disembunyikan di balik tombol
          "Filter" supaya baris atas tidak penuh sesak — empat kontrol tambahan
          sekaligus terasa berat untuk pemakaian harian. */}
      <div className="mb-4 rounded-2xl border border-ink-200/70 bg-white shadow-card overflow-hidden">
        <div className="flex flex-col sm:flex-row gap-2.5 p-3">
          <SearchInput
            value={search}
            onChange={(e) => update(setSearch)(e.target.value)}
            placeholder="Cari nama pelaku atau nomor entitas…"
            aria-label="Cari riwayat"
            containerClassName="flex-1 min-w-0"
          />

          <select
            value={action}
            onChange={(e) => update(setAction)(e.target.value)}
            aria-label="Filter aksi"
            className={`${selectClass} sm:w-44`}
          >
            <option value="">Semua Aksi</option>
            {filters.actions.map((a) => <option key={a} value={a}>{ACTION_LABEL[a] || a}</option>)}
          </select>

          <Button
            variant={expanded || activeCount > 0 ? 'subtle' : 'secondary'}
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="shrink-0 justify-center"
          >
            <i className="fas fa-sliders text-xs" aria-hidden="true" />
            Filter
            {activeCount > 0 && (
              <span className="ml-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white tabular-nums">
                {activeCount}
              </span>
            )}
            <i className={`fas fa-chevron-down text-[10px] transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
          </Button>
        </div>

        {expanded && (
          <div className="border-t border-ink-200/70 bg-ink-50/60 px-3 py-3.5 animate-slide-down">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-1.5">Jenis Data</span>
                <select value={entityType} onChange={(e) => update(setEntityType)(e.target.value)} className={selectClass}>
                  <option value="">Semua Jenis Data</option>
                  {filters.entityTypes.map((t) => <option key={t} value={t}>{ENTITY_LABEL[t] || t}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-1.5">Pengguna</span>
                <select value={userId} onChange={(e) => update(setUserId)(e.target.value)} className={selectClass}>
                  <option value="">Semua Pengguna</option>
                  {filters.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-1.5">Dari</span>
                <input type="date" value={dateFrom} onChange={(e) => update(setDateFrom)(e.target.value)} className={dateClass} />
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-1.5">Sampai</span>
                <input type="date" value={dateTo} onChange={(e) => update(setDateTo)(e.target.value)} className={dateClass} />
              </label>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-200/70 bg-white px-4 py-2.5">
          <p className="text-xs text-ink-500">
            <span className="font-semibold text-ink-700 tabular-nums">{pagination.total}</span> catatan
            {activeCount > 0 && <span className="text-ink-400"> (terfilter)</span>}
          </p>

          {(activeCount > 0 || search) && (
            <Button variant="ghost" size="xs" onClick={clearAll} className="ml-auto">
              <i className="fas fa-xmark text-[10px]" aria-hidden="true" /> Bersihkan
            </Button>
          )}
        </div>
      </div>

      <Card padded={false} className="overflow-hidden">
        <CardHeader
          title="Catatan Aktivitas"
          description="Klik tanda panah di kanan untuk melihat perbandingan nilai sebelum dan sesudah."
          bordered
        />

        <div className="overflow-x-auto scrollbar-slim">
          {loading ? (
            <SkeletonRows rows={10} cols={5} />
          ) : logs.length === 0 ? (
            <EmptyState
              icon="fa-clock-rotate-left"
              title="Tidak ada catatan yang cocok"
              description="Coba longgarkan filter atau perlebar rentang tanggalnya."
            />
          ) : (
            <table className="table-base min-w-[900px]">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Pelaku</th>
                  <th>Aksi</th>
                  <th>Data</th>
                  <th>Alamat IP</th>
                  <th className="w-12 !text-right"><span className="sr-only">Rincian</span></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => <LogRow key={log.id} log={log} />)}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <Pagination
        page={page}
        totalPages={pagination.totalPages}
        totalItems={pagination.total}
        onChange={setPage}
      />
    </Layout>
  );
}
