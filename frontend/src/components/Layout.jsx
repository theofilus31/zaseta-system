import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar, { SidebarDrawer, navItems } from './layout/Sidebar.jsx';
import Topbar from './layout/Topbar.jsx';
import BottomTabBar from './layout/BottomTabBar.jsx';
import ErrorToast from './layout/ErrorToast.jsx';
import ZecodeWidget from './zecode/ZecodeWidget.jsx';

export default function Layout({ children, width = 'default' }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  /* Kunci gulungan dokumen selama kerangka ini terpasang, lalu lepaskan lagi
     saat berpindah ke halaman tanpa kerangka (Masuk / Pindai QR publik). */
  useEffect(() => {
    document.documentElement.classList.add('app-shell-locked');
    return () => document.documentElement.classList.remove('app-shell-locked');
  }, []);

  /* Judul di Topbar diambil dari menu yang cocok dengan URL sekarang.
     Dulu ini membaca `window.location.pathname` langsung — nilainya tidak ikut
     berubah saat navigasi antar halaman karena React tidak me-render ulang
     komponen ini. `useLocation()` memastikan judulnya selalu ikut berpindah. */
  const activeNav = navItems.find((item) => location.pathname.startsWith(item.to));

  /* Tombol Kembali hanya relevan di halaman yang TIDAK punya entri sidebar —
     detail aset, form tambah/ubah, cetak QR, profil. Di halaman yang sudah
     ada menunya (Dasbor, Daftar Aset, dst.) tombol itu cuma jadi jalan
     memutar, karena menu sidebar-nya sendiri sudah jadi jalan langsung.

     Perbandingannya harus PERSIS, bukan startsWith: "/assets/12" berawalan
     sama dengan menu "/assets", padahal halaman detail justru salah satu
     tempat yang paling butuh tombol Kembali. */
  const isSidebarPage = navItems.some((item) => item.to === location.pathname);

  const maxWidth = {
    default: 'max-w-[1400px]',
    narrow: 'max-w-3xl',
    full: 'max-w-none',
  }[width] || 'max-w-[1400px]';

  return (
    /* h-dvh, bukan h-screen: di peramban ponsel 100vh menghitung tinggi
       layar TERMASUK bilah alamat yang bisa menyusut, sehingga kerangka jadi
       lebih tinggi dari area yang benar-benar terlihat.
       overflow-hidden mengunci dokumen: yang boleh menggulung hanya <main>. */
    <div className="h-dvh overflow-hidden bg-ink-50 flex">

      {/* Sidebar tetap di layar lebar */}
      <aside className="hidden lg:flex w-64 shrink-0">
        <Sidebar />
      </aside>

      {/* Laci sidebar di layar sempit */}
      <SidebarDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Area konten utama */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Topbar
          title={activeNav?.label || ''}
          canGoBack={!isSidebarPage}
          onMenuClick={() => setDrawerOpen(true)}
        />

        {/* overscroll-contain menghentikan "scroll chaining": tanpa ini, begitu
            gulungan di sini mentok di ujung atas/bawah, sisanya diteruskan ke
            dokumen dan seluruh kerangka aplikasi ikut bergeser. */}
        <main className="flex-1 overflow-y-auto overscroll-contain scrollbar-slim pb-20 lg:pb-0">
          <div className={`${maxWidth} mx-auto px-4 sm:px-6 py-5 sm:py-7`}>
            {children}
          </div>
        </main>

        <BottomTabBar onMoreClick={() => setDrawerOpen(true)} />
      </div>

      {/* Notifikasi mengambang di pojok kanan atas */}
      <ErrorToast />

      {/* Zecode — tombol mengambang di pojok kanan bawah, tersedia di semua
          halaman berkerangka (menyembunyikan dirinya sendiri kalau
          pengguna tidak punya izin zecode.view). */}
      <ZecodeWidget />
    </div>
  );
}
