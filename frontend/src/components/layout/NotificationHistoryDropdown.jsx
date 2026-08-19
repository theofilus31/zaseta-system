import React, { useEffect, useRef, useState } from 'react';
import { useNotification } from '../../context/NotificationContext.jsx';
import EmptyState from '../ui/EmptyState.jsx';

function formatTime(iso) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const date = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
  return `${date} · ${time}`;
}

export default function NotificationHistoryDropdown() {
  const { history, clearHistory } = useNotification();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Riwayat notifikasi"
        aria-expanded={open}
        title="Riwayat notifikasi"
        className={`relative h-9 w-9 flex items-center justify-center rounded-lg transition-colors ${
          open ? 'bg-ink-100 text-ink-700' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-700'
        }`}
      >
        <i className="fas fa-bell text-[15px]" aria-hidden="true" />
        {history.length > 0 && (
          <span
            className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-danger-500
                       text-[9px] font-bold text-white flex items-center justify-center
                       ring-2 ring-white tabular-nums"
          >
            {history.length > 9 ? '9+' : history.length}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-[22rem] max-w-[88vw] bg-white rounded-2xl
                     border border-ink-200/70 shadow-overlay z-50 overflow-hidden animate-slide-down"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-ink-200/70">
            <div>
              <p className="text-[13px] font-semibold text-ink-800">Riwayat Kesalahan</p>
              <p className="text-[11px] text-ink-400 mt-0.5">
                {history.length > 0 ? `${history.length} catatan tersimpan` : 'Tidak ada catatan'}
              </p>
            </div>
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                className="text-[11px] font-medium text-ink-400 hover:text-danger-600 transition-colors shrink-0"
              >
                Hapus semua
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto scrollbar-slim">
            {history.length === 0 ? (
              <EmptyState
                icon="fa-bell-slash"
                title="Belum ada notifikasi"
                description="Kesalahan yang muncul saat memakai aplikasi akan tercatat di sini."
                className="py-10"
              />
            ) : (
              history.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 px-4 py-3 border-b border-ink-100 last:border-0
                             hover:bg-ink-50/70 transition-colors"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-danger-50 text-danger-500">
                    <i className="fas fa-circle-exclamation text-[11px]" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-ink-700 leading-snug break-words">{item.message}</p>
                    <p className="text-[11px] text-ink-400 mt-1 tabular-nums">{formatTime(item.time)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
