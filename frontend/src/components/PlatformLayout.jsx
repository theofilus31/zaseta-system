import React, { useEffect, useState } from 'react';
import PlatformSidebar, { PlatformSidebarDrawer } from './layout/PlatformSidebar.jsx';
import ErrorToast from './layout/ErrorToast.jsx';

/**
 * ============================================================================
 *  KERANGKA ADMIN PLATFORM (Fase 5 SaaS) — BUKAN Layout.jsx tenant
 * ============================================================================
 *  Dipakai oleh SELURUH halaman /platform/* menggantikan Layout.jsx biasa.
 *  Sengaja tanpa BottomTabBar (panel ini tidak dioptimalkan untuk kerja
 *  harian di ponsel) dan tanpa ZecodeWidget (chatbot panduan Zecode
 *  membahas menu aplikasi tenant, tidak relevan di layar lintas tenant).
 *
 *  `liveLabel` opsional — dipakai Dashboard untuk menunjukkan kapan data
 *  terakhir diambil ulang (lihat PlatformDashboard.jsx). Halaman lain cukup
 *  tidak mengirim prop ini.
 * ============================================================================
 */
export default function PlatformLayout({ children, title, liveLabel, width = 'default' }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add('app-shell-locked');
    return () => document.documentElement.classList.remove('app-shell-locked');
  }, []);

  const maxWidth = {
    default: 'max-w-[1400px]',
    narrow: 'max-w-3xl',
    full: 'max-w-none',
  }[width] || 'max-w-[1400px]';

  return (
    <div className="h-dvh overflow-hidden bg-ink-50 flex">
      <aside className="hidden lg:flex w-64 shrink-0">
        <PlatformSidebar />
      </aside>

      <PlatformSidebarDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <header className="h-16 shrink-0 sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-ink-200/70 bg-white px-4 sm:px-7">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Buka menu navigasi"
              className="lg:hidden -ml-1 h-9 w-9 flex items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-700 transition-colors shrink-0"
            >
              <i className="fas fa-bars text-base" aria-hidden="true" />
            </button>
            <h1 className="text-[15px] font-bold text-ink-800 truncate">{title}</h1>
          </div>

          {liveLabel && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-ink-500">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-live-pulse" aria-hidden="true" />
              {liveLabel}
            </div>
          )}
        </header>

        <main className="flex-1 overflow-y-auto overscroll-contain scrollbar-slim">
          <div className={`${maxWidth} mx-auto px-4 sm:px-6 py-5 sm:py-7`}>
            {children}
          </div>
        </main>
      </div>

      <ErrorToast />
    </div>
  );
}
