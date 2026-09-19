import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './layout/Sidebar.jsx';
import TabBar from './layout/TabBar.jsx';
import BottomTabBar from './layout/BottomTabBar.jsx';
import ErrorToast from './layout/ErrorToast.jsx';
import ZecodeWidget from './zecode/ZecodeWidget.jsx';
import { cn } from '../utils/cn.js';
import { SidebarProvider, useSidebar } from './ui/Sidebar.jsx';
import { TabsProvider, useTabs } from '../context/TabsContext.jsx';
import { LayoutWidthProvider } from '../context/LayoutWidthContext.jsx';

/**
 * Dipasang SATU KALI membungkus <Outlet/> di App.jsx (bukan lagi oleh
 * masing-masing halaman) — supaya sidebar & tab ala Chrome tetap satu
 * instance yang sama selagi berpindah-pindah halaman, bukan dibongkar-pasang
 * ulang setiap klik (itu justru yang membuat isi tab-nya hilang lagi:
 * TabsProvider ikut ter-unmount sebelum sempat menyimpan perubahan). Halaman
 * yang butuh lebar panel selain bawaan memanggil useLayoutWidth() sendiri,
 * lihat context/LayoutWidthContext.jsx.
 */
export default function Layout() {
  /* Kunci gulungan dokumen selama kerangka ini terpasang, lalu lepaskan lagi
     saat berpindah ke halaman tanpa kerangka (Masuk / Pindai QR publik). */
  useEffect(() => {
    document.documentElement.classList.add('app-shell-locked');
    return () => document.documentElement.classList.remove('app-shell-locked');
  }, []);

  const [width, setWidth] = useState('default');

  return (
    <SidebarProvider>
      <TabsProvider>
        <LayoutWidthProvider setWidth={setWidth}>
          <LayoutShell width={width} />
        </LayoutWidthProvider>
      </TabsProvider>
    </SidebarProvider>
  );
}

/* Terpisah dari Layout supaya bisa memakai useSidebar()/useTabs() — kedua
   hook itu hanya boleh dipanggil di dalam pohon provider masing-masing,
   sedangkan Layout sendiri adalah yang memasangnya. */
function LayoutShell({ width }) {
  const { toggleSidebar } = useSidebar();
  const { tabs, activeTabId } = useTabs();
  const location = useLocation();

  /* Sudut kiri-atas panel konten dibiarkan siku HANYA saat tab pertama
     aktif — supaya menyatu rapi dengan sudut kiri-bawah sidebar, persis
     detail visual komponen aslinya. */
  const activeTabIndex = tabs.findIndex((t) => t.id === activeTabId);

  const maxWidth = {
    default: 'max-w-[1400px]',
    narrow: 'max-w-3xl',
    full: 'max-w-none',
  }[width] || 'max-w-[1400px]';

  return (
    /* h-dvh, bukan h-screen: di peramban ponsel 100vh menghitung tinggi
       layar TERMASUK bilah alamat yang bisa menyusut, sehingga kerangka jadi
       lebih tinggi dari area yang benar-benar terlihat.
       overflow-hidden mengunci dokumen: yang boleh menggulung hanya panel
       konten di bawah. */
    <div className="h-dvh overflow-hidden bg-ink-50 flex">

      {/* Satu instance saja — primitifnya sendiri yang memilih render sebagai
          kolom tetap (layar lebar) atau laci mengambang (layar sempit). */}
      <Sidebar />

      {/* Area konten utama */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <TabBar />

        {/* Panel konten mengambang dengan sudut membulat — tab yang aktif
            "menyatu" ke sini lewat lengkungan penutup di ChromeTab
            (TabBar.jsx). Tidak ada tombol Kembali terpisah lagi: sistem tab
            menggantikannya — buka lagi menu sidebar yang sesuai, atau tutup
            tabnya, untuk "kembali". Perubahan belum tersimpan pada form
            tetap dijaga lewat tombol Batal & peringatan tutup tab/muat
            ulang (lihat UnsavedChangesContext) — jalur itu tidak berubah. */}
        <main className="flex-1 overflow-hidden bg-ink-50 lg:pb-3 lg:pr-3">
          <div
            /* key={pathname} — sengaja MEMAKSA elemen ini (dan <Outlet/> di
               dalamnya) dipasang ulang tiap pindah halaman, supaya (a) posisi
               gulir selalu kembali ke atas dan (b) halaman itu sendiri tetap
               selalu mulai dari awal seperti sebelumnya (dulu ini otomatis
               terjadi karena SELURUH Layout ikut dibongkar-pasang per
               halaman). Yang TIDAK ikut terkena — sengaja — adalah sidebar,
               TabBar, dan provider di atasnya. */
            key={location.pathname}
            className={cn(
              'h-full overflow-y-auto overscroll-contain scrollbar-slim bg-white pb-20 lg:pb-0',
              'lg:rounded-br-3xl lg:rounded-bl-3xl lg:rounded-tr-3xl',
              activeTabIndex !== 0 && 'lg:rounded-tl-3xl'
            )}
          >
            <div className={`${maxWidth} mx-auto px-4 sm:px-6 py-5 sm:py-7`}>
              <Outlet />
            </div>
          </div>
        </main>

        <BottomTabBar onMoreClick={toggleSidebar} />
      </div>

      {/* Notifikasi mengambang di pojok kanan atas */}
      <ErrorToast />

      {/* Zecode — chatbot panduan statis; tombol mengambang di pojok kanan
          bawah, tersedia di semua halaman berkerangka untuk semua pengguna. */}
      <ZecodeWidget />
    </div>
  );
}
