import React, { useId } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

/**
 * Tombol serbaguna untuk seluruh aplikasi.
 *
 * - Kalau diberi prop `to`, dirender sebagai <Link> (navigasi router).
 * - Kalau diberi prop `href`, dirender sebagai <a> biasa.
 * - Selain itu dirender sebagai <button>.
 *
 * Varian sengaja dibatasi supaya hierarki aksi tetap terbaca:
 *   primary     → satu aksi utama per layar (hijau penuh)
 *   secondary   → aksi pendamping (putih, bergaris)
 *   subtle      → aksi tersier di dalam kartu/tabel (abu tenggelam)
 *   ghost       → aksi paling ringan, tanpa latar sampai di-hover
 *   destructive → menghapus / tidak bisa dibatalkan
 */

const VARIANTS = {
  primary:
    'bg-brand-700 text-white shadow-brand-sm hover:bg-brand-800 hover:shadow-brand ' +
    'active:bg-brand-900 active:shadow-brand-sm',
  secondary:
    'bg-white text-ink-700 border border-ink-200 shadow-sm hover:bg-ink-50 hover:border-ink-300 ' +
    'active:bg-ink-100',
  subtle:
    'bg-ink-100 text-ink-700 hover:bg-ink-200/80 active:bg-ink-200',
  ghost:
    'text-ink-600 hover:bg-ink-100 hover:text-ink-800 active:bg-ink-200/70',
  destructive:
    'bg-white text-danger-600 border border-danger-200 shadow-sm hover:bg-danger-50 hover:border-danger-300 ' +
    'active:bg-danger-100',
};

const SIZES = {
  xs: 'text-xs px-2.5 py-1.5 gap-1',
  sm: 'text-[13px] px-3.5 py-2 gap-1.5',
  md: 'text-sm px-4 py-2.5 gap-2',
  lg: 'text-[15px] px-5 py-3 gap-2',
  icon: 'h-9 w-9 p-0',
  'icon-sm': 'h-8 w-8 p-0',
};

/* Radius bawaan per ukuran — dipisah dari SIZES (bukan digabung dalam satu
   string) supaya prop `pill` bisa menggantinya dengan rounded-full tanpa
   dua kelas radius berbeda ikut menumpuk di className yang sama (cn() di
   sini cuma join string polos, bukan tailwind-merge — dua utility radius
   sekaligus akan rebutan menang tergantung urutan di stylesheet, bukan
   urutan className). */
const ROUNDED = {
  xs: 'rounded-lg', sm: 'rounded-lg', md: 'rounded-xl', lg: 'rounded-xl', icon: 'rounded-lg', 'icon-sm': 'rounded-lg',
};

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4z" />
    </svg>
  );
}

export default function Button({
  variant = 'primary',
  size = 'md',
  to,
  href,
  className = '',
  disabled = false,
  loading = false,
  block = false,
  pill = false,
  children,
  ...props
}) {
  const isDisabled = disabled || loading;

  const classes = [
    'inline-flex items-center justify-center font-medium whitespace-nowrap',
    'transition-[background-color,border-color,box-shadow,transform] duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2',
    VARIANTS[variant] || VARIANTS.primary,
    SIZES[size] || SIZES.md,
    pill ? 'rounded-full' : (ROUNDED[size] || ROUNDED.md),
    block ? 'w-full' : '',
    isDisabled ? 'opacity-55 pointer-events-none saturate-50' : '',
    className,
  ].join(' ');

  const content = (
    <>
      {loading && <Spinner />}
      {children}
    </>
  );

  if (to && !isDisabled) {
    return <Link to={to} className={classes} {...props}>{content}</Link>;
  }

  if (href && !isDisabled) {
    return <a href={href} className={classes} {...props}>{content}</a>;
  }

  return (
    <button className={classes} disabled={isDisabled} {...props}>
      {content}
    </button>
  );
}

/**
 * Sekelompok tombol yang menempel jadi satu segmen — dipakai untuk pilihan
 * ukuran label di halaman cetak QR, dan sakelar siklus tagihan di halaman
 * Harga/Langganan (lihat PricingCards.jsx/BillingPage.jsx).
 *
 * Latar putih di belakang opsi aktif ikut meluncur (framer-motion layoutId)
 * alih-alih meloncat langsung — `useId()` membuat layoutId-nya unik PER
 * INSTANCE komponen ini, supaya dua SegmentedControl yang tampil bersamaan
 * di layar yang sama (mis. panel bandingkan paket + modal pengajuan di
 * BillingPage.jsx) tidak ikut saling beranimasi satu sama lain.
 */
export function SegmentedControl({ options, value, onChange, size = 'sm', className = '' }) {
  const groupId = useId();
  return (
    <div className={`inline-flex items-center gap-1 rounded-xl bg-ink-100 p-1 ${className}`}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={[
              'relative rounded-lg font-medium transition-colors duration-150',
              size === 'xs' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
              active ? 'text-ink-800' : 'text-ink-500 hover:text-ink-700',
            ].join(' ')}
          >
            {active && (
              <motion.span
                layoutId={`${groupId}-pill`}
                className="absolute inset-0 rounded-lg bg-white shadow-sm"
                transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              />
            )}
            <span className="relative">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
