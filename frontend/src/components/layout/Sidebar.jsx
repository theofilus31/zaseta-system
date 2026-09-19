import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Boxes, Database, BarChart3, Settings2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTabs } from '../../context/TabsContext.jsx';
import { MODULES, MODULE_GROUPS, accessLabel } from '../../constants/modules.js';
import { NAV_ICONS, DEFAULT_NAV_ICON } from '../../constants/navIcons.js';
import { useBranding, BrandLogo } from '../../context/BrandingContext.jsx';
import { cn } from '../../utils/cn.js';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../ui/Accordion.jsx';
import { Avatar, AvatarFallback } from '../ui/Avatar.jsx';
import {
  Sidebar as SidebarPrimitive,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from '../ui/Sidebar.jsx';

/**
 * ============================================================================
 *  NAVIGASI UTAMA
 * ============================================================================
 *  Menu dikelompokkan menurut cara kerja sehari-hari, bukan menurut urutan
 *  tabel di database:
 *
 *   - Aset         : yang dibuka setiap hari oleh staf IT (data & alur kerja aset)
 *   - Data Acuan   : referensi yang jarang berubah (dipakai untuk menyusun kode aset)
 *   - Laporan      : melihat ke belakang — penyusutan & jejak perubahan
 *   - Administrasi : pengguna, sampah, pengaturan aplikasi, dan langganan
 *
 *  Empat kelompok kecil & fokus lebih mudah dipindai daripada tiga kelompok
 *  besar yang isinya campur aduk (dulu "Administrasi" memuat laporan, jejak
 *  aktivitas, DAN pengaturan sistem sekaligus).
 * ============================================================================
 */
/* Menu diturunkan langsung dari katalog modul, jadi menambah menu baru cukup
   dilakukan di constants/modules.js — sidebar, matriks izin di Manajemen
   Pengguna, dan penjaga rute semuanya ikut memakai sumber yang sama. */
export const navGroups = MODULE_GROUPS.map((group) => ({
  label: group,
  items: MODULES.filter((m) => m.group === group).map((m) => ({
    to: m.path,
    label: m.label,
    icon: m.icon,
    module: m.key,
  })),
})).filter((g) => g.items.length > 0);

/* Versi datar — dipakai Layout untuk mencari judul halaman aktif dan oleh
   BottomTabBar untuk menyusun tab di layar sempit. Panel admin platform
   (Fase 5 SaaS) TIDAK ikut di sini — dulu menu lintas-tenant ditumpuk di
   sidebar tenant ini (makanya panelnya kelihatan seperti "halaman tenant +
   satu menu tambahan"), sekarang punya kerangka & navigasi sendiri, lihat
   PlatformLayout.jsx + PlatformSidebar.jsx. Sidebar ini sendiri juga sudah
   TIDAK PERNAH dirender untuk admin platform — ProtectedRoute (lihat
   platform={true/false}) membalik akun is_platform_admin keluar dari semua
   rute tenant sebelum sempat sampai ke sini, jadi tidak perlu jembatan
   navigasi apa pun di komponen ini. */
export const navItems = navGroups.flatMap((g) => g.items);

/* Dasbor disematkan di atas akordeon, bukan ditumpuk sebagai isi kelompok
   "Aset" — halaman ringkasan yang dibuka langsung, bukan bagian dari alur
   kerja aset satu per satu. */
const PINNED_MODULE_KEYS = ['dashboard'];

/* Ikon kelompok (gaya lucide-react, dipakai persis seperti pola
   settings-sidebar-accordion) — terpisah dari ikon per-menu (Font Awesome,
   constants/modules.js) karena katalog modul dipakai bersama backend dan
   tidak semestinya membawa detail pustaka ikon frontend. */
const GROUP_ICONS = {
  Aset: Boxes,
  'Data Acuan': Database,
  Laporan: BarChart3,
  Administrasi: Settings2,
};

/* Sub-menu akordeon TIDAK pakai <NavLink> — menu diklik memanggil
   setActiveNav() (lihat useTabs()) supaya menukar isi TAB AKTIF, bukan
   membuka navigasi router lepas dari sistem tab. Status aktifnya dihitung
   manual dari lokasi sekarang, persis seperti yang dulu dilakukan NavLink. */
function AccordionNavButton({ active, icon: Icon, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors',
        active ? 'bg-white/10 text-white font-medium' : 'text-brand-200 hover:bg-white/5 hover:text-white'
      )}
    >
      <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-white' : 'text-brand-300'}`} aria-hidden="true" />
      <span className="truncate">{children}</span>
    </button>
  );
}

/* Dibangun di atas primitif ui/Sidebar.jsx (port dari komponen Sidebar
   TailGrids) — satu instance saja, primitifnya sendiri yang memilih render
   sebagai kolom tetap atau laci mengambang sesuai lebar layar. Isi menunya
   sendiri (mode lebar) dibangun dari ui/Accordion.jsx (port dari pola
   settings-sidebar-accordion shadcn/ui): tiap kelompok jadi satu bagian yang
   bisa dibuka/tutup, supaya menu yang jarang dibuka tidak ikut memenuhi
   layar terus-menerus. */
export default function Sidebar() {
  const { user, logout, can } = useAuth();
  const { appName, companyName } = useBranding();
  const navigate = useNavigate();
  const location = useLocation();
  const { setActiveNav } = useTabs();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === 'collapsed' && !isMobile;

  /* Sama dengan pencocokan yang dipakai TabsContext (resolveRoute) — jadi
     item ini tetap tersorot aktif walau tab yang dipakai kembali sedang
     menampilkan sub-halamannya (mis. /assets/123 saat berada di tab
     "Daftar Aset"). */
  function isItemActive(item) {
    return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
  }

  function goTo(item) {
    setActiveNav(item.module);
    closeOnMobile();
  }

  function closeOnMobile() {
    if (isMobile) setOpenMobile(false);
  }

  function handleLogout() {
    logout();
    navigate('/login');
    closeOnMobile();
  }

  /* Menu yang tidak boleh dibuka pengguna ini tidak ditampilkan sama sekali —
     lebih jelas daripada menampilkannya lalu menolak saat diklik. */
  const visibleGroups = navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => can(item.module, 'view')) }))
    .filter((group) => group.items.length > 0);

  const pinnedItems = visibleGroups.flatMap((g) => g.items).filter((item) => PINNED_MODULE_KEYS.includes(item.module));
  const accordionGroups = visibleGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => !PINNED_MODULE_KEYS.includes(item.module)) }))
    .filter((group) => group.items.length > 0);

  /* Kelompok yang dibuka pertama kali — yang memuat halaman aktif sekarang,
     supaya pengguna tidak mendarat di menu tertutup. Cuma dihitung sekali
     saat sidebar pertama dipasang (prop defaultValue Accordion memang
     begitu — dibiarkan tidak terkendali setelahnya, supaya kelompok yang
     dibuka/tutup manual oleh pengguna tidak dipaksa berubah tiap pindah
     halaman). */
  const [defaultOpenGroups] = useState(() => {
    const match = accordionGroups.find((g) => g.items.some((item) => location.pathname.startsWith(item.to)));
    return match ? [match.label] : accordionGroups[0] ? [accordionGroups[0].label] : [];
  });

  return (
    /* Latar gelap (brand-950) — warna yang sama dipakai panel kiri halaman
       Masuk — supaya sidebar terasa sebagai "bingkai produk" yang jelas
       beda dari kanvas putih halaman konten, bukan menyatu dengannya. */
    <SidebarPrimitive className="bg-brand-950 border-r border-white/10">
      {/* ===== KEPALA: LOGO ===== */}
      {/* Tingginya disamakan dengan TabBar (h-16) supaya garis border sejajar.
          Mode ciut sengaja punya susunan SENDIRI (tombol perluas di tengah,
          tanpa logo) — kolomnya cuma 60px (--sidebar-width-icon), tidak
          cukup muat logo + nama + tombol berjajar seperti mode lebar. Dulu
          ketiganya dipaksa satu baris memakai padding yang sama, jadi tombol
          "perluas"-nya terdorong ke luar area yang kelihatan (tidak bisa
          diklik sama sekali begitu diciutkan). */}
      <SidebarHeader className="relative h-16 border-b border-white/10 overflow-hidden">
        {/* Cahaya lembut di belakang logo — dekoratif, memberi kesan "produk" tanpa ramai */}
        <div
          className="pointer-events-none absolute -z-10 -top-10 -left-8 h-28 w-28 rounded-full bg-brand-400/20 blur-2xl"
          aria-hidden="true"
        />
        {collapsed && !isMobile ? (
          <div className="flex h-full items-center justify-center">
            <SidebarTrigger />
          </div>
        ) : (
          <div className="flex h-full items-center gap-3 px-5">
            <BrandLogo
              variant="icon"
              className="h-9 w-9 object-contain shrink-0"
              fallbackClassName="h-9 w-9 text-sm shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold text-white tracking-tight leading-tight truncate">
                {appName}
              </p>
              <p className="text-[11px] text-brand-300 truncate">{companyName}</p>
            </div>
            {/* Ciutkan — hanya berarti di layar lebar */}
            {!isMobile && <SidebarTrigger className="ml-auto" />}
          </div>
        )}
      </SidebarHeader>

      {/* ===== MENU ===== */}
      {collapsed ? (
        /* Mode ciut: akordeon tidak berarti tanpa label, jadi kembali ke
           daftar ikon rata — garis tipis memisahkan bekas kelompoknya. */
        <SidebarContent className="px-3 py-4">
          <SidebarMenu className="space-y-0.5">
            {pinnedItems.map((item) => {
              const Icon = NAV_ICONS[item.module] || DEFAULT_NAV_ICON;
              return (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton active={isItemActive(item)} tooltip={item.label} onClick={() => goTo(item)}>
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
            {accordionGroups.map((group) => (
              <React.Fragment key={group.label}>
                <div className="my-2 border-t border-white/10" aria-hidden="true" />
                {group.items.map((item) => {
                  const Icon = NAV_ICONS[item.module] || DEFAULT_NAV_ICON;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton active={isItemActive(item)} tooltip={item.label} onClick={() => goTo(item)}>
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </React.Fragment>
            ))}
          </SidebarMenu>
        </SidebarContent>
      ) : (
        <SidebarContent className="px-3 py-4">
          {pinnedItems.length > 0 && (
            <SidebarMenu className="space-y-0.5 mb-3">
              {pinnedItems.map((item) => {
                const Icon = NAV_ICONS[item.module] || DEFAULT_NAV_ICON;
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton active={isItemActive(item)} onClick={() => goTo(item)}>
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          )}

          <Accordion type="multiple" defaultValue={defaultOpenGroups} className="space-y-1">
            {accordionGroups.map((group) => {
              const GroupIcon = GROUP_ICONS[group.label];
              return (
                <AccordionItem key={group.label} value={group.label}>
                  <AccordionTrigger className="rounded-lg px-2.5 py-2 hover:bg-white/5" chevronClassName="text-brand-300">
                    <div className="flex items-center gap-2.5">
                      {GroupIcon && <GroupIcon className="size-4 text-brand-300" aria-hidden="true" />}
                      <span className="font-medium text-[13px] text-brand-100">{group.label}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="flex flex-col gap-0.5 pl-6">
                      {group.items.map((item) => (
                        <li key={item.to}>
                          <AccordionNavButton
                            active={isItemActive(item)}
                            icon={NAV_ICONS[item.module] || DEFAULT_NAV_ICON}
                            onClick={() => goTo(item)}
                          >
                            {item.label}
                          </AccordionNavButton>
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </SidebarContent>
      )}

      {/* ===== KAKI: KARTU PENGGUNA ===== */}
      <SidebarFooter className="p-3 border-t border-white/10">
        <div
          className={`flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 ${
            collapsed ? 'flex-col p-1.5' : 'p-2'
          }`}
        >
          <button
            onClick={() => { navigate('/profile'); closeOnMobile(); }}
            title="Buka profil saya"
            className={`flex items-center gap-2.5 min-w-0 text-left rounded-lg hover:bg-white/10 transition-colors ${
              collapsed ? 'justify-center p-1' : 'flex-1 px-1 py-1'
            }`}
          >
            <Avatar className="h-9 w-9 shrink-0 shadow-sm" aria-hidden="true">
              <AvatarFallback className="bg-gradient-to-br from-info-500 to-brand-500 text-sm font-semibold text-white">
                {user?.name?.[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">{user?.name}</span>
                  {/* Paket tenant saat ini (Free/Starter/Business/Enterprise)
                      -- lihat middleware/auth.js (planName diturunkan dari
                      tenants.plan lewat config/plans.js), disegarkan otomatis
                      tiap kali AuthContext memanggil /auth/me. */}
                  {user?.planName && (
                    <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-200 bg-white/10">
                      {user.planName}
                    </span>
                  )}
                </span>
                <span className="block text-[11px] text-brand-300 truncate">
                  {accessLabel(user)}
                </span>
              </span>
            )}
          </button>

          {/* Garis pemisah tipis — supaya tombol ini terbaca sebagai aksi
              tersendiri (keluar), bukan bagian dari kartu profil di
              sampingnya. Warna diam sengaja NETRAL (putih pudar), bukan ikut
              hijau seperti ikon menu lain — supaya beda dari navigasi biasa
              bahkan sebelum disentuh, baru berubah merah saat di-hover. */}
          <div className={`shrink-0 bg-white/10 ${collapsed ? 'h-px w-6 my-0.5' : 'h-8 w-px'}`} aria-hidden="true" />

          <button
            onClick={handleLogout}
            title="Keluar"
            aria-label="Keluar"
            className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg
                       text-white/50 hover:text-danger-300 hover:bg-danger-500/10 transition-colors"
          >
            <i className="fas fa-right-from-bracket text-[13px]" aria-hidden="true" />
          </button>
        </div>
      </SidebarFooter>
    </SidebarPrimitive>
  );
}
