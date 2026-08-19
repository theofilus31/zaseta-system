import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Kepala halaman: judul, keterangan, dan tombol aksi.
 *
 * Sebelumnya setiap halaman menulis <h1> dengan ukuran & bobot yang
 * berbeda-beda (`text-xl font-medium` di satu tempat, `font-semibold` di
 * tempat lain). Komponen ini menyamakannya, sekaligus menyediakan slot
 * eyebrow/tautan kembali yang konsisten.
 */
export default function PageHeader({
  title,
  description,
  eyebrow,
  backTo,
  backLabel = 'Kembali',
  actions,
  className = '',
}) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-4 mb-6 ${className}`}>
      <div className="min-w-0 flex-1">
        {backTo && (
          <Link
            to={backTo}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500
                       hover:text-brand-600 transition-colors mb-2"
          >
            <i className="fas fa-arrow-left text-[10px]" aria-hidden="true" />
            {backLabel}
          </Link>
        )}

        {/* Bar aksen gradien kecil di samping judul — penanda visual konsisten
            di seluruh halaman, menggantikan judul polos tanpa penekanan. */}
        <div className="flex items-start gap-3">
          <span
            className="mt-1 h-6 sm:h-7 w-1 shrink-0 rounded-full bg-gradient-to-b from-brand-500 to-info-500"
            aria-hidden="true"
          />
          <div className="min-w-0">
            {eyebrow && (
              <p className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-600 mb-1.5">
                {eyebrow}
              </p>
            )}

            <h1 className="text-[22px] sm:text-2xl font-bold text-ink-900 leading-tight truncate">
              {title}
            </h1>

            {description && (
              <p className="text-sm text-ink-500 mt-1.5 leading-relaxed max-w-2xl">{description}</p>
            )}
          </div>
        </div>
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}

/**
 * Panel dua kolom "form di kiri, tabel di kanan" yang dipakai semua halaman
 * master data (Kode Barang, Kategori Aset, Bidang Kustom, Pengguna).
 * Dibuat sebagai komponen supaya proporsi & jaraknya seragam.
 */
export function MasterDataLayout({ form, table }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <div className="lg:col-span-4 lg:sticky lg:top-20">{form}</div>
      <div className="lg:col-span-8">{table}</div>
    </div>
  );
}
