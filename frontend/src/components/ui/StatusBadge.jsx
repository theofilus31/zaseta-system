import React from 'react';

/**
 * Satu-satunya sumber kebenaran untuk warna & label status aset di seluruh
 * aplikasi (tabel, kartu, dasbor, halaman pindai publik).
 * Kalau perlu ganti warna atau menambah status baru, cukup ubah di sini.
 *
 * `chart` dipakai oleh donut & legenda di Dasbor — nilainya harus warna solid
 * (bukan class) karena dipakai langsung sebagai atribut `stroke` di SVG.
 */
export const STATUS_CONFIG = {
  // Dipakai — biru: aktif digunakan, kondisi paling normal
  dipakai: {
    label: 'Dipakai',
    icon: 'fa-circle-check',
    chart: '#2f6fa8',
    className: 'bg-info-50 text-info-700 ring-info-500/20',
    dot: 'bg-info-500',
  },
  // Menganggur — hijau: tersedia, siap dialokasikan
  idle: {
    label: 'Menganggur',
    icon: 'fa-box-open',
    chart: '#2f9c4f',
    className: 'bg-brand-50 text-brand-700 ring-brand-500/20',
    dot: 'bg-brand-500',
  },
  // Dijual — kuning: sedang ditawarkan, butuh perhatian
  dijual: {
    label: 'Dijual',
    icon: 'fa-tag',
    chart: '#c98a1a',
    className: 'bg-warning-50 text-warning-700 ring-warning-500/25',
    dot: 'bg-warning-500',
  },
  // Terjual — netral: sudah keluar dari inventaris aktif
  terjual: {
    label: 'Terjual',
    icon: 'fa-hand-holding-dollar',
    chart: '#94a3b8',
    className: 'bg-ink-100 text-ink-600 ring-ink-400/20',
    dot: 'bg-ink-400',
  },
  // Hilang — merah: raib/dicuri, masih dicari pertanggungjawabannya
  hilang: {
    label: 'Hilang',
    icon: 'fa-circle-question',
    chart: '#a13624',
    className: 'bg-danger-50 text-danger-700 ring-danger-500/25',
    dot: 'bg-danger-600',
  },
  // Dihapuskan — abu tua: resmi dikeluarkan dari inventaris (musnah/afkir/hibah)
  dihapuskan: {
    label: 'Dihapuskan',
    icon: 'fa-ban',
    chart: '#475569',
    className: 'bg-ink-200/70 text-ink-700 ring-ink-500/20',
    dot: 'bg-ink-600',
  },
  // Dipindahkan — ungu: sedang transisi antar lokasi
  dipindah: {
    label: 'Dipindahkan',
    icon: 'fa-location-dot',
    chart: '#8b4fb0',
    className: 'bg-accent-50 text-accent-700 ring-accent-500/20',
    dot: 'bg-accent-500',
  },
};

const FALLBACK = {
  label: 'Tidak diketahui',
  icon: 'fa-circle-question',
  chart: '#94a3b8',
  className: 'bg-ink-100 text-ink-600 ring-ink-400/20',
  dot: 'bg-ink-400',
};

const SIZES = {
  sm: 'text-[11px] px-2 py-0.5 gap-1.5',
  md: 'text-xs px-2.5 py-1 gap-1.5',
  lg: 'text-sm px-3 py-1.5 gap-2',
};

export default function StatusBadge({ status, size = 'md', className = '' }) {
  const cfg = STATUS_CONFIG[status] || { ...FALLBACK, label: status || FALLBACK.label };

  return (
    <span
      className={[
        'inline-flex items-center rounded-full font-medium whitespace-nowrap ring-1 ring-inset',
        SIZES[size] || SIZES.md,
        cfg.className,
        className,
      ].join(' ')}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot}`} aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

/* ==========================================================================
   KONDISI FISIK ASET — dipisah dari status karena artinya berbeda:
   status = posisi aset dalam siklus hidup, kondisi = keadaan fisiknya.
   ========================================================================== */
export const CONDITION_CONFIG = {
  baik:         { label: 'Baik',         className: 'bg-brand-50 text-brand-700 ring-brand-500/20' },
  rusak_ringan: { label: 'Rusak Ringan', className: 'bg-warning-50 text-warning-700 ring-warning-500/25' },
  rusak_berat:  { label: 'Rusak Berat',  className: 'bg-danger-50 text-danger-700 ring-danger-500/20' },
};

export function ConditionBadge({ condition, size = 'md', className = '' }) {
  if (!condition) return <span className="text-ink-300">—</span>;

  const cfg = CONDITION_CONFIG[condition] || {
    label: condition,
    className: 'bg-ink-100 text-ink-600 ring-ink-400/20',
  };

  return (
    <span
      className={[
        'inline-flex items-center rounded-full font-medium whitespace-nowrap ring-1 ring-inset',
        SIZES[size] || SIZES.md,
        cfg.className,
        className,
      ].join(' ')}
    >
      {cfg.label}
    </span>
  );
}

/* ==========================================================================
   LENCANA SERBAGUNA — untuk peran pengguna, tipe bidang kustom, dll.
   ========================================================================== */
const BADGE_TONES = {
  neutral: 'bg-ink-100 text-ink-600 ring-ink-400/20',
  brand: 'bg-brand-50 text-brand-700 ring-brand-500/20',
  info: 'bg-info-50 text-info-700 ring-info-500/20',
  warning: 'bg-warning-50 text-warning-700 ring-warning-500/25',
  danger: 'bg-danger-50 text-danger-700 ring-danger-500/20',
  accent: 'bg-accent-50 text-accent-700 ring-accent-500/20',
};

export function Badge({ tone = 'neutral', size = 'md', mono = false, className = '', children }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full font-medium whitespace-nowrap ring-1 ring-inset',
        SIZES[size] || SIZES.md,
        BADGE_TONES[tone] || BADGE_TONES.neutral,
        mono ? 'font-mono' : '',
        className,
      ].join(' ')}
    >
      {children}
    </span>
  );
}
