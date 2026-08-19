import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NotificationHistoryDropdown from './NotificationHistoryDropdown.jsx';
import AttentionCenter from './AttentionCenter.jsx';
import { useUnsavedChangesContext } from '../../context/UnsavedChangesContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { BrandLogo } from '../../context/BrandingContext.jsx';

function useClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  return now;
}

export default function Topbar({ title, canGoBack = false, onMenuClick }) {
  const navigate = useNavigate();
  const now = useClock();
  const { requestNavigation, dirty } = useUnsavedChangesContext();
  const { can } = useAuth();

  const timeLabel = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const dateLabel = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const iconButton =
    'h-9 w-9 flex items-center justify-center rounded-lg text-ink-500 ' +
    'hover:bg-ink-100 hover:text-ink-700 transition-colors shrink-0';

  return (
    <header
      className="relative h-16 shrink-0 sticky top-0 z-30 flex items-center justify-between gap-3
                 border-b border-ink-200/70 bg-white/85 backdrop-blur-md px-4 sm:px-6"
    >
      {/* Garis aksen tipis — penanda konsisten dengan bar judul di PageHeader */}
      <span
        className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-brand-500/50 via-info-500/30 to-transparent"
        aria-hidden="true"
      />
      <div className="flex items-center gap-2 min-w-0">
        {/* Buka laci navigasi (layar sempit) */}
        <button onClick={onMenuClick} aria-label="Buka menu navigasi" className={`lg:hidden -ml-1 ${iconButton}`}>
          <i className="fas fa-bars text-base" aria-hidden="true" />
        </button>

        {/* Kembali — hanya muncul di halaman tanpa entri sidebar. Navigasinya
            dilewatkan requestNavigation() supaya isian form yang belum
            tersimpan tidak hilang begitu saja saat tombol ini ditekan. */}
        {canGoBack && (
          <button
            onClick={() => requestNavigation(() => navigate(-1))}
            aria-label="Kembali"
            title={dirty ? 'Kembali (ada perubahan belum disimpan)' : 'Kembali'}
            className={`hidden lg:flex -ml-1 relative ${iconButton}`}
          >
            <i className="fas fa-arrow-left text-sm" aria-hidden="true" />
            {/* Titik penanda: ada isian yang belum disimpan di halaman ini */}
            {dirty && (
              <span
                className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-warning-500 ring-2 ring-white"
                aria-hidden="true"
              />
            )}
          </button>
        )}

        {/* Logo ringkas menggantikan judul di layar sempit, karena sidebar tersembunyi */}
        <BrandLogo
          variant="icon"
          className="lg:hidden h-7 w-7 object-contain shrink-0 ml-1"
          fallbackClassName="lg:hidden h-7 w-7 text-xs shrink-0 ml-1"
        />

        <h1 className="hidden sm:block text-[15px] font-semibold text-ink-800 truncate ml-1">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {/* Jam & tanggal — konteks berguna saat mencatat mutasi aset */}
        <div className="hidden md:flex flex-col items-end leading-tight select-none">
          <span className="text-[13px] font-semibold text-ink-700 tabular-nums">{timeLabel}</span>
          <span className="text-[11px] text-ink-400">{dateLabel}</span>
        </div>

        <div className="hidden md:block h-6 w-px bg-ink-200" aria-hidden="true" />

        {(can('assets', 'view') || can('consumables', 'view') || can('requests', 'view')) && <AttentionCenter />}
        <NotificationHistoryDropdown />
      </div>
    </header>
  );
}
