import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { MODULES, MODULE_GROUPS, accessLabel } from '../../constants/modules.js';
import { useBranding, BrandLogo } from '../../context/BrandingContext.jsx';

/**
 * ============================================================================
 *  NAVIGASI UTAMA
 * ============================================================================
 *  Menu dikelompokkan menurut cara kerja sehari-hari, bukan menurut urutan
 *  tabel di database:
 *
 *   - Operasional : yang dibuka setiap hari oleh staf IT
 *   - Master Data : acuan yang jarang berubah (dipakai untuk menyusun kode aset)
 *   - Administrasi: pengaturan pengguna
 *
 *  Tanpa pengelompokan, delapan menu berderet rata terasa sama penting semua
 *  dan pekerjaan harian tenggelam di antara menu pengaturan.
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
   BottomTabBar untuk menyusun tab di layar sempit. */
export const navItems = navGroups.flatMap((g) => g.items);

export default function Sidebar({ onNavigate }) {
  const { user, logout, can } = useAuth();
  const { appName, companyName } = useBranding();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  /* Menu yang tidak boleh dibuka pengguna ini tidak ditampilkan sama sekali —
     lebih jelas daripada menampilkannya lalu menolak saat diklik. */
  const visibleGroups = navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => can(item.module, 'view')) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="relative flex flex-col h-full w-full bg-white border-r border-ink-200/70">

      {/* ===== KEPALA: LOGO ===== */}
      {/* Tingginya disamakan dengan Topbar (h-16) supaya garis border sejajar */}
      <div className="relative h-16 px-5 flex items-center gap-3 border-b border-ink-200/70 shrink-0 overflow-hidden">
        {/* Cahaya lembut di belakang logo — dekoratif, memberi kesan "produk" tanpa ramai */}
        <div
          className="pointer-events-none absolute -z-10 -top-10 -left-8 h-28 w-28 rounded-full bg-brand-400/20 blur-2xl"
          aria-hidden="true"
        />
        <BrandLogo
          variant="icon"
          className="h-9 w-9 object-contain shrink-0"
          fallbackClassName="h-9 w-9 text-sm shrink-0"
        />
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-ink-900 tracking-tight leading-tight truncate">
            {appName}
          </p>
          <p className="text-[11px] text-ink-400 truncate">{companyName}</p>
        </div>
      </div>

      {/* ===== MENU ===== */}
      <nav className="flex-1 px-3 py-5 overflow-y-auto overscroll-contain scrollbar-slim space-y-6">
        {visibleGroups.map((group) => (
          <div key={group.label}>
            <p className="flex items-center gap-2 px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-400">
              <span className="h-1 w-1 rounded-full bg-ink-300" aria-hidden="true" />
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    [
                      'group relative flex items-center gap-3 px-3 py-2.5 rounded-xl',
                      'text-[13.5px] font-medium transition-all duration-150',
                      isActive
                        ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-brand-sm'
                        : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 hover:translate-x-0.5',
                    ].join(' ')
                  }
                >
                  {({ isActive }) => (
                    <>
                      <i
                        className={`fas ${item.icon} w-4 text-center text-[13px] shrink-0 transition-colors ${
                          isActive ? 'text-white' : 'text-ink-400 group-hover:text-ink-600'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="truncate">{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ===== KAKI: KARTU PENGGUNA ===== */}
      <div className="p-3 border-t border-ink-200/70 shrink-0">
        <div className="flex items-center gap-2 rounded-xl bg-ink-50 p-2 border border-ink-200/60">
          <button
            onClick={() => { navigate('/profile'); onNavigate?.(); }}
            title="Buka profil saya"
            className="flex items-center gap-2.5 flex-1 min-w-0 text-left rounded-lg px-1 py-1
                       hover:bg-white transition-colors"
          >
            <span
              className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-info-500 to-brand-500
                         flex items-center justify-center text-white font-semibold text-sm shadow-sm"
              aria-hidden="true"
            >
              {user?.name?.[0]?.toUpperCase() || '?'}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-semibold text-ink-800 truncate">{user?.name}</span>
              <span className="block text-[11px] text-ink-400 truncate">
                {accessLabel(user)}
              </span>
            </span>
          </button>

          <button
            onClick={handleLogout}
            title="Keluar"
            aria-label="Keluar"
            className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg
                       text-ink-400 hover:text-danger-600 hover:bg-danger-50 transition-colors"
          >
            <i className="fas fa-right-from-bracket text-[13px]" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   LACI SIDEBAR UNTUK LAYAR SEMPIT
   ========================================================= */
export function SidebarDrawer({ open, onClose }) {
  return (
    <div className={`fixed inset-0 z-40 lg:hidden ${open ? '' : 'pointer-events-none'}`}>
      <div
        className={`absolute inset-0 bg-ink-900/50 backdrop-blur-sm transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`absolute inset-y-0 left-0 w-72 max-w-[82vw] shadow-overlay
                    transition-transform duration-200 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <Sidebar onNavigate={onClose} />
      </div>
    </div>
  );
}
