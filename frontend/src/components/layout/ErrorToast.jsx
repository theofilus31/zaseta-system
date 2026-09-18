import React from 'react';
import { Link } from 'react-router-dom';
import { useNotification } from '../../context/NotificationContext.jsx';

/**
 * Notifikasi mengambang di pojok kanan atas.
 * Warnanya mengikuti jenis pesan — sebelumnya semua notifikasi (termasuk
 * "Profil berhasil diperbarui") tampil merah karena hanya ada satu gaya galat.
 */
const TONES = {
  error: {
    icon: 'fa-circle-exclamation',
    card: 'bg-white border-danger-200 ring-1 ring-danger-500/10',
    iconWrap: 'bg-danger-50 text-danger-600',
    bar: 'bg-danger-500',
    title: 'Terjadi kesalahan',
  },
  success: {
    icon: 'fa-circle-check',
    card: 'bg-white border-brand-200 ring-1 ring-brand-500/10',
    iconWrap: 'bg-brand-50 text-brand-600',
    bar: 'bg-brand-500',
    title: 'Berhasil',
  },
  info: {
    icon: 'fa-circle-info',
    card: 'bg-white border-info-200 ring-1 ring-info-500/10',
    iconWrap: 'bg-info-50 text-info-600',
    bar: 'bg-info-500',
    title: 'Informasi',
  },
};

export default function ErrorToast() {
  const { toast, dismissToast } = useNotification();

  if (!toast) return null;

  const tone = TONES[toast.type] || TONES.error;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-20 right-4 sm:right-6 z-[60] w-[calc(100%-2rem)] max-w-sm animate-slide-down"
    >
      <div className={`relative overflow-hidden rounded-2xl border shadow-raised ${tone.card}`}>
        {/* Garis warna tipis di tepi kiri sebagai penanda jenis pesan */}
        <span className={`absolute inset-y-0 left-0 w-1 ${tone.bar}`} aria-hidden="true" />

        <div className="flex items-start gap-3 pl-5 pr-3 py-3.5">
          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone.iconWrap}`}>
            <i className={`fas ${tone.icon} text-sm`} aria-hidden="true" />
          </span>

          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-ink-800">{tone.title}</p>
            <p className="text-[13px] text-ink-600 leading-snug mt-0.5 break-words">{toast.message}</p>
            {toast.action && (
              <Link
                to={toast.action.to}
                onClick={dismissToast}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                {toast.action.label}
                <i className="fas fa-arrow-right text-[10px]" aria-hidden="true" />
              </Link>
            )}
          </div>

          <button
            onClick={dismissToast}
            aria-label="Tutup notifikasi"
            className="shrink-0 h-7 w-7 flex items-center justify-center rounded-lg
                       text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors"
          >
            <i className="fas fa-xmark text-xs" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
