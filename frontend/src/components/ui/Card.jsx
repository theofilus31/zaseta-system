import React from 'react';

/**
 * Satu resep "permukaan" yang dipakai bersama: kartu KPI, wadah tabel,
 * section form, panel detail — semua memakai komponen ini supaya UI terasa
 * satu sistem, bukan halaman yang ditempel-tempel.
 */
export default function Card({
  as: Tag = 'div',
  className = '',
  padded = true,
  interactive = false,
  children,
  ...props
}) {
  return (
    <Tag
      className={[
        'bg-white rounded-2xl border border-ink-200/70 shadow-card',
        padded ? 'p-5 sm:p-6' : '',
        interactive ? 'transition-[box-shadow,border-color] duration-200 hover:shadow-card-hover hover:border-brand-200' : '',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </Tag>
  );
}

/**
 * Kepala kartu: judul + keterangan opsional di kiri, aksi di kanan.
 * `bordered` dipakai kalau isi kartu berupa tabel yang menempel ke tepi —
 * garis bawah memisahkan kepala dari isi dengan rapi.
 */
export function CardHeader({ title, description, action, icon: Icon, bordered = false, className = '' }) {
  return (
    <div
      className={[
        'flex items-start justify-between gap-4',
        bordered ? 'px-5 sm:px-6 py-4 border-b border-ink-200/70' : 'mb-5',
        className,
      ].join(' ')}
    >
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink-800 leading-tight">{title}</h2>
          {description && (
            <p className="text-xs text-ink-400 mt-1 leading-relaxed">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Isi kartu ketika kepala memakai `bordered` (padding diatur terpisah). */
export function CardBody({ className = '', children }) {
  return <div className={`p-5 sm:p-6 ${className}`}>{children}</div>;
}

/** Kaki kartu — biasanya berisi tombol simpan/batal. */
export function CardFooter({ className = '', children }) {
  return (
    <div className={`px-5 sm:px-6 py-4 border-t border-ink-200/70 bg-ink-50/50 rounded-b-2xl ${className}`}>
      {children}
    </div>
  );
}
