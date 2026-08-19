import React, { useEffect } from 'react';

/**
 * Kerangka dialog bersama untuk seluruh modal (Impor CSV, Pindah Lokasi,
 * Tandai Dijual/Terjual). Sebelumnya tiap modal menyusun overlay, kartu, dan
 * tombol tutupnya sendiri — sekarang cukup satu tempat.
 *
 * Ditangani di sini: tutup dengan tombol Esc, klik latar, kunci scroll
 * halaman di belakang, dan atribut ARIA dialog.
 */

const WIDTHS = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

export default function Modal({
  title,
  description,
  icon,
  iconTone = 'brand',
  onClose,
  width = 'md',
  footer,
  children,
}) {
  // Esc untuk menutup + kunci scroll body selama dialog terbuka
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    document.addEventListener('keydown', handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const toneClass = {
    brand: 'bg-brand-50 text-brand-600',
    info: 'bg-info-50 text-info-600',
    warning: 'bg-warning-50 text-warning-600',
    danger: 'bg-danger-50 text-danger-600',
    accent: 'bg-accent-50 text-accent-600',
  }[iconTone] || 'bg-brand-50 text-brand-600';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Latar gelap — klik untuk menutup */}
      <div
        className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${WIDTHS[width] || WIDTHS.md} bg-white
                    rounded-t-2xl sm:rounded-2xl border border-ink-200/70 shadow-overlay
                    max-h-[92vh] flex flex-col animate-slide-up sm:animate-scale-in`}
      >
        {/* Kepala */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-ink-200/70 shrink-0">
          {icon && (
            <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
              <i className={`fas ${icon} text-sm`} aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-ink-800 leading-tight">{title}</h2>
            {description && (
              <p className="text-xs text-ink-400 mt-1 leading-relaxed">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="shrink-0 -mr-1 -mt-1 h-8 w-8 flex items-center justify-center rounded-lg
                       text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors"
          >
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </div>

        {/* Isi — bisa di-scroll kalau kepanjangan */}
        <div className="px-5 py-4 overflow-y-auto scrollbar-slim flex-1">{children}</div>

        {/* Kaki — tombol aksi */}
        {footer && (
          <div className="px-5 py-4 border-t border-ink-200/70 bg-ink-50/60 rounded-b-2xl shrink-0
                          flex flex-wrap items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
