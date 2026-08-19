import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Kartu KPI untuk Dasbor.
 *
 * Kalau diberi prop `to`, seluruh kartu jadi tautan — dipakai supaya angka di
 * dasbor langsung bisa diklik menuju daftar aset yang sudah terfilter, bukan
 * cuma jadi pajangan.
 */

const TONES = {
  brand:   { icon: 'bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-brand-sm',     bar: 'from-brand-500 to-brand-600',     value: 'text-ink-900' },
  info:    { icon: 'bg-gradient-to-br from-info-500 to-info-600 text-white shadow-sm',             bar: 'from-info-500 to-info-600',       value: 'text-ink-900' },
  warning: { icon: 'bg-gradient-to-br from-warning-400 to-warning-500 text-white shadow-sm',       bar: 'from-warning-400 to-warning-500', value: 'text-ink-900' },
  danger:  { icon: 'bg-gradient-to-br from-danger-500 to-danger-600 text-white shadow-sm',         bar: 'from-danger-500 to-danger-600',   value: 'text-ink-900' },
  accent:  { icon: 'bg-gradient-to-br from-accent-500 to-accent-600 text-white shadow-sm',         bar: 'from-accent-500 to-accent-600',   value: 'text-ink-900' },
  neutral: { icon: 'bg-gradient-to-br from-ink-600 to-ink-800 text-white shadow-sm',                bar: 'from-ink-500 to-ink-700',         value: 'text-ink-900' },
};

export default function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'brand',
  hint,
  progress,
  to,
  className = '',
}) {
  const t = TONES[tone] || TONES.brand;
  const Tag = to ? Link : 'div';
  const tagProps = to ? { to } : {};

  return (
    <Tag
      {...tagProps}
      className={[
        'stat-card group relative block overflow-hidden bg-white rounded-2xl border border-ink-200/70 shadow-card p-5',
        to ? 'hover:border-brand-300 cursor-pointer' : '',
        className,
      ].join(' ')}
    >
      {/* Garis aksen tipis di tepi atas — terlihat samar, menguat saat hover */}
      <span
        className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${t.bar} opacity-40 group-hover:opacity-100 transition-opacity duration-200`}
        aria-hidden="true"
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink-500 truncate">{label}</p>
          <p className={`text-[28px] leading-none font-bold mt-2 tabular-nums ${t.value}`}>{value}</p>
        </div>
        {Icon && (
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${t.icon}`}>
            <Icon className="h-[22px] w-[22px]" />
          </span>
        )}
      </div>

      {hint && <p className="text-xs text-ink-400 mt-2.5 truncate">{hint}</p>}

      {typeof progress === 'number' && (
        <div className="mt-4">
          <div className="progress-track">
            <div
              className={`progress-fill bg-gradient-to-r ${t.bar}`}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
          <p className="text-[11px] text-ink-400 mt-1.5 tabular-nums">
            {progress.toFixed(progress % 1 === 0 ? 0 : 1)}% dari total aset
          </p>
        </div>
      )}
    </Tag>
  );
}
