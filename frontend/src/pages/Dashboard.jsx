import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import axiosClient from '../api/axiosClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import StatusBadge, { STATUS_CONFIG, CONDITION_CONFIG } from '../components/ui/StatusBadge.jsx';
import { SkeletonCards, Skeleton } from '../components/ui/Skeleton.jsx';

/* ---------------- Format angka ---------------- */

/** Rupiah ringkas — dasbor butuh angka yang terbaca sekilas, bukan 12 digit penuh. */
function rupiahRingkas(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`;
  if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  if (v >= 1_000) return `Rp ${(v / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 0 })} rb`;
  return `Rp ${v.toLocaleString('id-ID')}`;
}

const rupiahPenuh = (n) => `Rp ${(Number(n) || 0).toLocaleString('id-ID')}`;

/* ---------------- Ikon KPI ---------------- */
const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
const IconBox = (p) => <svg {...p} viewBox="0 0 24 24" {...s}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" /></svg>;
const IconWallet = (p) => <svg {...p} viewBox="0 0 24 24" {...s}><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" /><circle cx="16" cy="13" r="1.5" /></svg>;
const IconPulse = (p) => <svg {...p} viewBox="0 0 24 24" {...s}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>;
const IconAlert = (p) => <svg {...p} viewBox="0 0 24 24" {...s}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>;
const IconPlus = (p) => <svg {...p} viewBox="0 0 24 24" {...s}><path d="M12 5v14M5 12h14" /></svg>;

/* ============================================================
   PERLU PERHATIAN
   Setiap baris adalah tautan ke Daftar Aset yang sudah terfilter,
   supaya dasbor tidak berhenti sebagai papan angka.
   ============================================================ */
const ATTENTION_ITEMS = [
  {
    key: 'rusakBerat',
    label: 'Rusak berat',
    hint: 'Perlu keputusan: perbaiki atau hapus dari inventaris',
    to: '/assets?condition=rusak_berat',
    icon: 'fa-triangle-exclamation',
    tone: 'danger',
  },
  {
    key: 'inTransit',
    label: 'Masih dalam perpindahan',
    hint: 'Menunggu konfirmasi sudah sampai di lokasi tujuan',
    to: '/assets?status=dipindah',
    icon: 'fa-route',
    tone: 'accent',
  },
  {
    key: 'withoutLocation',
    label: 'Tanpa lokasi',
    hint: 'Biasanya sisa impor CSV yang belum dilengkapi',
    to: '/assets?locationId=none',
    icon: 'fa-location-crosshairs',
    tone: 'warning',
  },
  {
    key: 'rusakRingan',
    label: 'Rusak ringan',
    hint: 'Masih terpakai, tapi dijadwalkan untuk perbaikan',
    to: '/assets?condition=rusak_ringan',
    icon: 'fa-screwdriver-wrench',
    tone: 'warning',
  },
  {
    key: 'lost',
    label: 'Dinyatakan hilang',
    hint: 'Perlu laporan kehilangan dan pertanggungjawaban',
    to: '/assets?status=hilang',
    icon: 'fa-circle-question',
    tone: 'danger',
  },
  {
    key: 'listedForSale',
    label: 'Sedang ditawarkan dijual',
    hint: 'Belum ada pembeli, nilai masih tercatat',
    to: '/assets?status=dijual',
    icon: 'fa-tag',
    tone: 'warning',
  },
  {
    key: 'readyToDeploy',
    label: 'Siap dialokasikan',
    hint: 'Kondisi baik dan menganggur — bisa langsung dipakai',
    to: '/assets?status=idle&condition=baik',
    icon: 'fa-circle-check',
    tone: 'brand',
  },
];

const TONE_STYLE = {
  danger: 'bg-danger-50 text-danger-600',
  warning: 'bg-warning-50 text-warning-600',
  accent: 'bg-accent-50 text-accent-600',
  brand: 'bg-brand-50 text-brand-600',
  info: 'bg-info-50 text-info-600',
};

/* Tiga fitur (pengingat, pemeliharaan, permintaan aset) plus barang habis
   pakai selama ini hanya terlihat lewat lonceng "Perlu Ditindaklanjuti" di
   Topbar, tidak pernah muncul di halaman utama. Garansi SENGAJA tidak
   diulang di sini — sudah punya bagian sendiri lebih bawah di halaman ini. */
const FOLLOWUP_ICON = {
  reminder: 'fa-bell',
  maintenance: 'fa-screwdriver-wrench',
  consumable: 'fa-boxes-stacked',
  request: 'fa-hand-point-right',
};
const FOLLOWUP_SEVERITY_STYLE = {
  danger: 'bg-danger-50 text-danger-600',
  warning: 'bg-warning-50 text-warning-600',
  info: 'bg-info-50 text-info-600',
};

function AttentionRow({ item, value }) {
  const quiet = value === 0;

  return (
    <Link
      to={item.to}
      className={`group flex items-center gap-3.5 rounded-xl px-3 py-3 transition-colors ${
        quiet ? 'opacity-55 hover:opacity-100 hover:bg-ink-50' : 'hover:bg-ink-50'
      }`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONE_STYLE[item.tone]}`}>
        <i className={`fas ${item.icon} text-[13px]`} aria-hidden="true" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-ink-800 group-hover:text-brand-700 transition-colors">
          {item.label}
        </span>
        <span className="block text-[11px] text-ink-400 truncate">{item.hint}</span>
      </span>

      <span className="text-xl font-bold text-ink-900 tabular-nums shrink-0">{value}</span>
      <i className="fas fa-chevron-right text-[10px] text-ink-300 group-hover:text-brand-500 transition-colors shrink-0" aria-hidden="true" />
    </Link>
  );
}

/**
 * Pengingat, pemeliharaan, barang habis pakai, dan permintaan aset —
 * sebelum ini keempatnya hanya kelihatan lewat lonceng "Perlu Ditindaklanjuti"
 * di Topbar, tidak pernah muncul di halaman utama. Kartu ini menariknya dari
 * /api/notifications (sumber yang sama dipakai lonceng itu, supaya angkanya
 * tidak pernah menyimpang) dan menampilkannya langsung di Dasbor.
 *
 * Diambil lewat permintaan tersendiri (bukan digabung ke /dashboard/summary)
 * karena datanya juga dipakai lonceng — memisahkannya berarti tidak ada dua
 * cara berbeda menghitung hal yang sama.
 */
function FollowUpCard() {
  const { can } = useAuth();
  const [items, setItems] = useState(null);

  const visible = can('assets', 'view') || can('consumables', 'view') || can('requests', 'view');

  useEffect(() => {
    if (!visible) return;
    axiosClient.get('/notifications')
      .then((res) => setItems(res.data.items.filter((i) => i.category !== 'warranty')))
      .catch(() => setItems([]));
  }, [visible]);

  if (!visible) return null;

  return (
    <Card padded={false}>
      <CardHeader
        title="Perlu Ditindaklanjuti"
        description="Pengingat, pemeliharaan, stok, dan permintaan aset yang mendekati tenggat."
        bordered
        action={<Button to="/requests" variant="ghost" size="xs">Permintaan Aset</Button>}
      />

      <div className="p-2.5">
        {items === null ? (
          <div className="space-y-2 p-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon="fa-circle-check"
            title="Semua aman"
            description="Tidak ada pengingat, pemeliharaan, stok, atau permintaan yang mendekati tenggat."
            className="py-8"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {items.slice(0, 8).map((item) => (
              <Link
                key={item.id}
                to={item.link}
                className="group flex items-center gap-3.5 rounded-xl px-3 py-3 hover:bg-ink-50 transition-colors"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${FOLLOWUP_SEVERITY_STYLE[item.severity] || FOLLOWUP_SEVERITY_STYLE.info}`}>
                  <i className={`fas ${FOLLOWUP_ICON[item.category] || 'fa-bell'} text-[13px]`} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-ink-800 group-hover:text-brand-700 transition-colors truncate">
                    {item.title}
                  </span>
                  <span className="block text-[11px] text-ink-400 truncate">{item.assetName} · {item.detail}</span>
                </span>
                <i className="fas fa-chevron-right text-[10px] text-ink-300 group-hover:text-brand-500 transition-colors shrink-0" aria-hidden="true" />
              </Link>
            ))}
          </div>
        )}
        {items && items.length > 8 && (
          <p className="text-center text-[11px] text-ink-400 pt-2">
            +{items.length - 8} lainnya — lihat semua lewat lonceng di bagian atas
          </p>
        )}
      </div>
    </Card>
  );
}

/* ============================================================
   DONUT STATUS
   ============================================================ */
const DONUT_ORDER = ['dipakai', 'idle', 'dijual', 'terjual', 'dipindah', 'hilang', 'dihapuskan'];

function StatusDonut({ statusMap, total }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  const segments = DONUT_ORDER.map((key) => {
    const cfg = STATUS_CONFIG[key];
    const value = statusMap[key] || 0;
    const fraction = total > 0 ? value / total : 0;
    const seg = {
      key, label: cfg.label, color: cfg.chart, value,
      percent: fraction * 100,
      dash: fraction * circumference,
      offset: -cumulative * circumference,
    };
    cumulative += fraction;
    return seg;
  });

  return (
    <div>
      <div className="relative mx-auto w-40 h-40">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90" role="img" aria-label="Komposisi status aset">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="12" />
          {segments.filter((x) => x.value > 0).map((x) => (
            <circle
              key={x.key} cx="50" cy="50" r={radius} fill="none"
              stroke={x.color} strokeWidth="12"
              strokeDasharray={`${x.dash} ${circumference}`}
              strokeDashoffset={x.offset}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-ink-900 leading-none tabular-nums">{total}</span>
          <span className="text-[10px] text-ink-400 mt-1">Total Aset</span>
        </div>
      </div>

      <ul className="mt-5 space-y-0.5">
        {segments.map((x) => (
          <li key={x.key}>
            <Link
              to={`/assets?status=${x.key}`}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 -mx-2 hover:bg-ink-50 transition-colors group"
            >
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: x.color }} aria-hidden="true" />
              <span className="text-[13px] text-ink-600 group-hover:text-ink-900 flex-1 truncate">{x.label}</span>
              <span className="text-[13px] font-semibold text-ink-800 tabular-nums">{x.value}</span>
              <span className="text-[11px] text-ink-400 tabular-nums w-9 text-right">{x.percent.toFixed(0)}%</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ============================================================
   AKTIVITAS
   ============================================================ */
const ACTION_LABEL = {
  create: 'menambahkan', update: 'memperbarui', delete: 'menghapus',
  login: 'masuk ke sistem', logout: 'keluar dari sistem',
  scan: 'memindai', export: 'mengekspor',
};
const ENTITY_LABEL = {
  asset: 'aset', asset_category: 'kode barang/aset', asset_type: 'kategori aset',
  location: 'lokasi', sub_location: 'sub lokasi', custom_field: 'bidang kustom',
  user: 'pengguna', qr_code: 'Kode QR', profile: 'profil',
  asset_export: 'daftar aset', category_import: 'kode barang/aset', location_import: 'lokasi',
};
const ACTION_STYLE = {
  create: { icon: 'fa-plus', tone: 'bg-brand-50 text-brand-600' },
  update: { icon: 'fa-pen', tone: 'bg-info-50 text-info-600' },
  delete: { icon: 'fa-trash-can', tone: 'bg-danger-50 text-danger-600' },
  scan: { icon: 'fa-qrcode', tone: 'bg-accent-50 text-accent-600' },
  login: { icon: 'fa-right-to-bracket', tone: 'bg-ink-100 text-ink-500' },
  logout: { icon: 'fa-right-from-bracket', tone: 'bg-ink-100 text-ink-500' },
  export: { icon: 'fa-file-export', tone: 'bg-warning-50 text-warning-600' },
};

function ActivityItem({ entry }) {
  const style = ACTION_STYLE[entry.action] || { icon: 'fa-circle-dot', tone: 'bg-ink-100 text-ink-500' };
  const action = ACTION_LABEL[entry.action] || entry.action;
  const entity = ENTITY_LABEL[entry.entity_type] || entry.entity_type;

  return (
    <li className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${style.tone}`}>
        <i className={`fas ${style.icon} text-[10px]`} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-ink-600 leading-snug">
          <span className="font-semibold text-ink-800">{entry.user_name || 'Sistem'}</span>{' '}
          {action} {entity}
          {entry.entity_id ? <span className="font-mono text-ink-400"> #{entry.entity_id}</span> : null}
        </p>
        <p className="text-[11px] text-ink-400 mt-0.5">
          {new Date(entry.created_at).toLocaleString('id-ID', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
          })}
        </p>
      </div>
    </li>
  );
}

/* ============================================================
   HALAMAN
   ============================================================ */
export default function Dashboard() {
  const { user, can } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axiosClient.get('/dashboard/summary')
      .then((res) => setData(res.data))
      .finally(() => setLoading(false));
  }, []);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 11) return 'Selamat pagi';
    if (h < 15) return 'Selamat siang';
    if (h < 19) return 'Selamat sore';
    return 'Selamat malam';
  })();

  if (loading || !data) {
    return (
      <Layout>
        <PageHeader eyebrow={greeting} title="Ringkasan Aset" description="Memuat data terbaru…" />
        <div className="space-y-5">
          <SkeletonCards count={4} />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <Card className="lg:col-span-8"><Skeleton className="h-4 w-40 mb-5" /><Skeleton className="h-56 w-full" /></Card>
            <Card className="lg:col-span-4"><Skeleton className="h-4 w-32 mb-5" /><Skeleton className="h-40 w-40 mx-auto rounded-full" /></Card>
          </div>
        </div>
      </Layout>
    );
  }

  const {
    totals, finance, attention, custody, warranty,
    byStatus, byCondition, byCategory, byLocation, byDepartment,
    assetsWithoutDepartment, warrantySoon, topHolders, staleAssets, recentActivity,
  } = data;

  const statusMap = Object.fromEntries(byStatus.map((x) => [x.status, x.total]));
  const conditionMap = Object.fromEntries(byCondition.map((x) => [x.condition, x.total]));
  const total = totals.totalAssets;

  /* "Perlu perhatian" yang benar-benar mendesak — dipakai sebagai angka KPI.
     readyToDeploy & rusakRingan sengaja TIDAK dihitung: keduanya informasi
     baik/netral, bukan masalah yang menuntut tindakan. */
  const urgentCount = attention.rusakBerat + attention.inTransit + attention.withoutLocation + attention.lost;

  const maxCategory = Math.max(1, ...byCategory.map((c) => c.total));
  const maxLocation = Math.max(1, ...byLocation.map((l) => l.total));
  const maxDepartment = Math.max(1, ...(byDepartment || []).map((d) => d.total));

  return (
    <Layout>
      <PageHeader
        eyebrow={greeting}
        title={user?.name ? `Ringkasan aset, ${user.name.split(' ')[0]}` : 'Ringkasan Aset'}
        description="Kondisi, sebaran, dan nilai seluruh aset IT perusahaan dalam satu tampilan."
        actions={
          <>
            {can('assets', 'create') && (
              <Button to="/assets/new" size="sm"><IconPlus className="h-3.5 w-3.5" /> Tambah Aset</Button>
            )}
            <Button to="/assets" variant="secondary" size="sm">Daftar Aset</Button>
          </>
        }
      />

      <div className="space-y-5">

        {/* ==================== KPI ==================== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Aset" value={total} icon={IconBox} tone="neutral"
            hint={`${totals.activeAssets} aktif · ${totals.soldAssets} terjual`}
            to="/assets"
          />
          <StatCard
            label="Nilai Buku"
            value={<span title={rupiahPenuh(finance.bookValue)}>{rupiahRingkas(finance.bookValue)}</span>}
            icon={IconWallet} tone="brand"
            hint={`Perolehan ${rupiahRingkas(finance.acquisitionValue)} setelah penyusutan`}
          />
          <StatCard
            label="Sedang Dipegang" value={custody.assignedAssets} icon={IconPulse} tone="info"
            hint={custody.activeHolders > 0
              ? `Oleh ${custody.activeHolders} orang`
              : 'Belum ada aset yang diserahkan'}
            progress={total ? (custody.assignedAssets / total) * 100 : 0}
          />
          <StatCard
            label="Perlu Perhatian" value={urgentCount} icon={IconAlert}
            tone={urgentCount > 0 ? 'danger' : 'neutral'}
            hint={urgentCount > 0 ? 'Rusak berat, hilang, transit, tanpa lokasi' : 'Semua aset dalam keadaan wajar'}
          />
        </div>

        {/* Aksi cepat khusus layar sempit */}
        <div className="flex sm:hidden gap-2 overflow-x-auto -mx-4 px-4 pb-1">
          {can('assets', 'create') && (
            <Button to="/assets/new" size="sm" className="shrink-0"><IconPlus className="h-3.5 w-3.5" /> Tambah Aset</Button>
          )}
          <Button to="/assets?status=idle" variant="secondary" size="sm" className="shrink-0">Menganggur</Button>
          <Button to="/cetak-barcode-massal" variant="secondary" size="sm" className="shrink-0">Cetak Label</Button>
        </div>

        {/* ============ PERLU PERHATIAN + STATUS ============ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Card className="lg:col-span-7" padded={false}>
            <CardHeader
              title="Perlu Perhatian"
              description="Klik salah satu baris untuk membuka daftar asetnya."
              bordered
            />
            <div className="p-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {ATTENTION_ITEMS.map((item) => (
                  <AttentionRow key={item.key} item={item} value={attention[item.key] || 0} />
                ))}
              </div>
            </div>
          </Card>

          <Card className="lg:col-span-5">
            <CardHeader title="Komposisi Status" description="Sebaran aset menurut siklus hidupnya." />
            {total > 0 ? (
              <StatusDonut statusMap={statusMap} total={total} />
            ) : (
              <EmptyState
                icon="fa-chart-pie"
                title="Belum ada aset"
                description="Tambahkan aset pertama untuk mulai melihat ringkasannya."
                action={can('assets', 'create') ? <Button to="/assets/new" size="sm">Tambah Aset</Button> : undefined}
                className="py-6"
              />
            )}
          </Card>
        </div>

        {/* ============ KONDISI + LOKASI ============ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Card className="lg:col-span-4">
            <CardHeader title="Kondisi Fisik" description="Kesehatan armada aset secara keseluruhan." />
            {total > 0 ? (
              <div className="space-y-4">
                {/* Satu batang bertumpuk lebih cepat dibaca daripada tiga batang terpisah */}
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-ink-100">
                  {['baik', 'rusak_ringan', 'rusak_berat'].map((key) => {
                    const value = conditionMap[key] || 0;
                    if (!value) return null;
                    const color = { baik: '#47b648', rusak_ringan: '#fca91c', rusak_berat: '#ef4444' }[key];
                    return (
                      <div
                        key={key}
                        style={{ width: `${(value / total) * 100}%`, backgroundColor: color }}
                        title={`${CONDITION_CONFIG[key].label}: ${value}`}
                      />
                    );
                  })}
                </div>

                <ul className="space-y-1">
                  {['baik', 'rusak_ringan', 'rusak_berat'].map((key) => {
                    const value = conditionMap[key] || 0;
                    const color = { baik: '#47b648', rusak_ringan: '#fca91c', rusak_berat: '#ef4444' }[key];
                    return (
                      <li key={key}>
                        <Link
                          to={`/assets?condition=${key}`}
                          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 -mx-2 hover:bg-ink-50 transition-colors group"
                        >
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />
                          <span className="text-[13px] text-ink-600 group-hover:text-ink-900 flex-1">
                            {CONDITION_CONFIG[key].label}
                          </span>
                          <span className="text-[13px] font-semibold text-ink-800 tabular-nums">{value}</span>
                          <span className="text-[11px] text-ink-400 tabular-nums w-9 text-right">
                            {total ? ((value / total) * 100).toFixed(0) : 0}%
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>

                {/* Nilai finansial yang terkait penjualan, hanya muncul kalau relevan */}
                {(finance.listedValue > 0 || finance.soldValue > 0) && (
                  <div className="pt-4 border-t border-ink-200/70 space-y-2">
                    {finance.listedValue > 0 && (
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-xs text-ink-500">Nilai ditawarkan</span>
                        <span className="text-[13px] font-semibold text-warning-700 tabular-nums">
                          {rupiahPenuh(finance.listedValue)}
                        </span>
                      </div>
                    )}
                    {finance.soldValue > 0 && (
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-xs text-ink-500">Total hasil penjualan</span>
                        <span className="text-[13px] font-semibold text-ink-700 tabular-nums">
                          {rupiahPenuh(finance.soldValue)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <EmptyState icon="fa-heart-pulse" title="Belum ada data kondisi" className="py-6" />
            )}
          </Card>

          <Card className="lg:col-span-8" padded={false}>
            <CardHeader
              title="Sebaran per Lokasi"
              description="Di mana aset berada, dan berapa yang bermasalah di sana."
              bordered
              action={can('locations', 'view') ? <Button to="/locations" variant="ghost" size="xs">Kelola</Button> : undefined}
            />
            <div className="p-5 sm:p-6">
              {byLocation.length > 0 ? (
                <ul className="space-y-3.5">
                  {byLocation.map((loc) => (
                    <li key={loc.locationId}>
                      <Link to={`/assets?locationId=${loc.locationId}`} className="group block">
                        <div className="flex items-baseline justify-between gap-3 mb-1.5">
                          <span className="text-[13px] font-medium text-ink-700 group-hover:text-brand-700 transition-colors truncate">
                            <span className="font-mono text-[11px] text-ink-400 mr-1.5">{loc.code}</span>
                            {loc.name}
                          </span>
                          <span className="text-[13px] tabular-nums shrink-0">
                            {loc.damaged > 0 && (
                              <span className="text-danger-600 text-[11px] mr-2">{loc.damaged} rusak</span>
                            )}
                            <span className="font-semibold text-ink-800">{loc.total}</span>
                          </span>
                        </div>
                        <div className="progress-track">
                          <div
                            className="progress-fill bg-info-500"
                            style={{ width: `${Math.max(3, (loc.total / maxLocation) * 100)}%` }}
                          />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon="fa-location-dot"
                  title="Belum ada aset berlokasi"
                  description="Aset yang sudah punya lokasi akan terkelompok di sini."
                  className="py-6"
                />
              )}
            </div>
          </Card>
        </div>

        <FollowUpCard />

        {/* ============ GARANSI + PEMEGANG ============ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Card className="lg:col-span-7" padded={false}>
            <CardHeader
              title="Garansi"
              description="Aset yang garansinya perlu diurus sebelum kedaluwarsa."
              bordered
            />
            <div className="p-5 sm:p-6">
              <div className="grid grid-cols-3 gap-3 mb-5">
                {[
                  { label: 'Sudah habis', value: warranty.expired, tone: 'text-danger-600 bg-danger-50' },
                  { label: '≤ 30 hari', value: warranty.expiring30, tone: 'text-warning-700 bg-warning-50' },
                  { label: '31–90 hari', value: warranty.expiring90, tone: 'text-info-700 bg-info-50' },
                ].map((x) => (
                  <div key={x.label} className={`rounded-xl px-3 py-3 text-center ${x.tone}`}>
                    <p className="text-2xl font-bold tabular-nums leading-none">{x.value}</p>
                    <p className="text-[11px] mt-1.5 opacity-80">{x.label}</p>
                  </div>
                ))}
              </div>

              {warrantySoon?.length > 0 ? (
                <ul className="divide-y divide-ink-100">
                  {warrantySoon.map((w) => (
                    <li key={w.id}>
                      <Link
                        to={`/assets/${w.id}`}
                        className="flex items-center gap-3 py-2.5 group"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium text-ink-800 group-hover:text-brand-600 transition-colors truncate">
                            {w.name}
                          </span>
                          <span className="block text-[11px] font-mono text-ink-400 truncate">{w.asset_code}</span>
                        </span>
                        <span className={`text-[11px] font-semibold tabular-nums shrink-0 ${
                          w.days_remaining < 0 ? 'text-danger-600' : w.days_remaining <= 30 ? 'text-warning-700' : 'text-ink-500'
                        }`}>
                          {w.days_remaining < 0
                            ? `Habis ${Math.abs(w.days_remaining)} hari lalu`
                            : `${w.days_remaining} hari lagi`}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-ink-400 text-center py-4">
                  {warranty.unknown > 0
                    ? `Tidak ada garansi yang segera habis. ${warranty.unknown} aset belum diisi tanggal garansinya.`
                    : 'Tidak ada garansi yang mendekati kedaluwarsa.'}
                </p>
              )}
            </div>
          </Card>

          <Card className="lg:col-span-5" padded={false}>
            <CardHeader
              title="Pemegang Aset"
              description="Siapa yang sedang memegang aset terbanyak."
              bordered
            />
            <div className="p-5 sm:p-6">
              {topHolders?.length > 0 ? (
                <>
                  <ul className="space-y-3">
                    {topHolders.map((h) => (
                      <li key={`${h.holder_name}-${h.department}`} className="flex items-center gap-3">
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                                     bg-gradient-to-br from-info-500 to-brand-500 text-white text-xs font-semibold"
                          aria-hidden="true"
                        >
                          {h.holder_name[0]?.toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium text-ink-800 truncate">{h.holder_name}</span>
                          {h.department && <span className="block text-[11px] text-ink-400 truncate">{h.department}</span>}
                        </span>
                        <span className="text-[13px] font-semibold text-ink-800 tabular-nums shrink-0">
                          {h.total} <span className="text-[11px] font-normal text-ink-400">aset</span>
                        </span>
                      </li>
                    ))}
                  </ul>

                  {custody.inUseWithoutHolder > 0 && (
                    <Link
                      to="/assets?status=dipakai"
                      className="mt-4 pt-4 border-t border-ink-200/70 flex items-start gap-2.5 text-xs
                                 text-warning-700 hover:text-warning-800 transition-colors group"
                    >
                      <i className="fas fa-triangle-exclamation mt-0.5 shrink-0" aria-hidden="true" />
                      <span className="leading-relaxed">
                        <strong>{custody.inUseWithoutHolder} aset</strong> berstatus Dipakai tapi belum
                        tercatat pemegangnya — serahkan resmi agar jejak custody-nya lengkap.
                      </span>
                    </Link>
                  )}
                </>
              ) : (
                <EmptyState
                  icon="fa-user-tag"
                  title="Belum ada aset yang diserahkan"
                  description="Buka detail aset lalu pilih “Serahkan Aset” untuk mulai mencatat pemegangnya."
                  className="py-6"
                />
              )}
            </div>
          </Card>
        </div>

        {/* ============ SEBARAN PER DEPARTEMEN ============ */}
        <Card padded={false}>
          <CardHeader
            title="Sebaran per Departemen"
            description="Divisi pemilik aset — format laporan yang paling sering diminta."
            bordered
            action={can('departments', 'view')
              ? <Button to="/departments" variant="ghost" size="xs">Kelola</Button>
              : undefined}
          />
          <div className="p-5 sm:p-6">
            {byDepartment?.length > 0 ? (
              <ul className="space-y-3.5">
                {byDepartment.map((d) => (
                  <li key={d.departmentId}>
                    <Link to={`/assets?departmentId=${d.departmentId}`} className="group block">
                      <div className="flex items-baseline justify-between gap-3 mb-1.5">
                        <span className="text-[13px] font-medium text-ink-700 group-hover:text-brand-700 transition-colors truncate">
                          <span className="font-mono text-[11px] text-ink-400 mr-1.5">{d.code}</span>
                          {d.name}
                        </span>
                        <span className="text-[13px] tabular-nums shrink-0">
                          {d.value > 0 && (
                            <span className="text-ink-400 text-[11px] mr-2">{rupiahRingkas(d.value)}</span>
                          )}
                          <span className="font-semibold text-ink-800">{d.total}</span>
                        </span>
                      </div>
                      <div className="progress-track">
                        <div
                          className="progress-fill bg-accent-500"
                          style={{ width: `${Math.max(3, (d.total / maxDepartment) * 100)}%` }}
                        />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon="fa-building-user"
                title="Belum ada aset berdepartemen"
                description="Isi kolom Departemen di form aset agar rekap per divisi bisa dibuat."
                className="py-6"
              />
            )}

            {assetsWithoutDepartment > 0 && (
              <Link
                to="/assets?departmentId=none"
                className="mt-4 pt-4 border-t border-ink-200/70 flex items-start gap-2.5 text-xs
                           text-warning-700 hover:text-warning-800 transition-colors"
              >
                <i className="fas fa-triangle-exclamation mt-0.5 shrink-0" aria-hidden="true" />
                <span className="leading-relaxed">
                  <strong>{assetsWithoutDepartment} aset</strong> belum punya departemen penanggung jawab —
                  aset ini tidak akan muncul di laporan per divisi mana pun.
                </span>
              </Link>
            )}
          </div>
        </Card>

        {/* ============ KATEGORI + AKTIVITAS ============ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Card className="lg:col-span-6" padded={false}>
            <CardHeader
              title="Sebaran per Kode Barang/Aset"
              description="Delapan kelompok barang terbanyak."
              bordered
              action={can('categories', 'view') ? <Button to="/categories" variant="ghost" size="xs">Kelola</Button> : undefined}
            />
            <div className="p-5 sm:p-6">
              {byCategory.length > 0 ? (
                <ul className="space-y-3.5">
                  {byCategory.map((c) => (
                    <li key={c.categoryId}>
                      <Link to={`/assets?categoryId=${c.categoryId}`} className="group block">
                        <div className="flex items-baseline justify-between gap-3 mb-1.5">
                          <span className="text-[13px] font-medium text-ink-700 group-hover:text-brand-700 transition-colors truncate">
                            {c.name}
                          </span>
                          <span className="text-[13px] tabular-nums shrink-0">
                            <span className="font-semibold text-ink-800">{c.total}</span>
                            <span className="text-ink-400"> · {total ? ((c.total / total) * 100).toFixed(0) : 0}%</span>
                          </span>
                        </div>
                        <div className="progress-track">
                          <div
                            className="progress-fill bg-gradient-to-r from-brand-500 to-info-500"
                            style={{ width: `${Math.max(3, (c.total / maxCategory) * 100)}%` }}
                          />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon="fa-tags" title="Belum ada kode barang terpakai" className="py-6" />
              )}
            </div>
          </Card>

          <Card className="lg:col-span-6" padded={false}>
            <CardHeader
              title="Aktivitas Terbaru"
              description="Perubahan terakhir di seluruh sistem."
              bordered
              action={can('audit_logs', 'view') ? <Button to="/audit-logs" variant="ghost" size="xs">Lihat semua</Button> : undefined}
            />
            <div className="p-5 sm:p-6">
              {recentActivity.length > 0 ? (
                <ul className="divide-y divide-ink-100">
                  {recentActivity.map((a, i) => <ActivityItem key={`${a.created_at}-${i}`} entry={a} />)}
                </ul>
              ) : (
                <EmptyState icon="fa-clock-rotate-left" title="Belum ada aktivitas" className="py-6" />
              )}
            </div>
          </Card>
        </div>

        {/* ============ PALING LAMA TIDAK DIPERBARUI ============ */}
        {staleAssets?.length > 0 && (
          <Card padded={false}>
            <CardHeader
              title="Paling Lama Tidak Diperbarui"
              description="Kandidat pertama untuk diperiksa saat stok opname — datanya belum tersentuh paling lama."
              bordered
            />
            <div className="overflow-x-auto scrollbar-slim">
              <table className="table-base min-w-[600px]">
                <thead>
                  <tr>
                    <th>Aset</th>
                    <th>Lokasi</th>
                    <th>Status</th>
                    <th>Terakhir Diperbarui</th>
                  </tr>
                </thead>
                <tbody>
                  {staleAssets.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <Link to={`/assets/${a.id}`} className="group block min-w-0">
                          <p className="font-semibold text-ink-800 group-hover:text-brand-600 transition-colors truncate">{a.name}</p>
                          <p className="text-[11px] text-ink-400 font-mono mt-0.5">{a.asset_code}</p>
                        </Link>
                      </td>
                      <td className="text-ink-600">{a.location_name || <span className="text-ink-300">—</span>}</td>
                      <td><StatusBadge status={a.status} size="sm" /></td>
                      <td className="text-ink-500 text-[13px] tabular-nums">
                        {new Date(a.updated_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
