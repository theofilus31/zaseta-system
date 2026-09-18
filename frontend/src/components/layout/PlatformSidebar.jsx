import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import axiosClient from '../../api/axiosClient.js';
import ProductBrandMark from '../ProductBrandMark.jsx';

/**
 * ============================================================================
 *  NAVIGASI ADMIN PLATFORM (Fase 5 SaaS)
 * ============================================================================
 *  Sengaja BUKAN varian dari Sidebar.jsx tenant secara STRUKTUR — dulu panel
 *  admin platform cuma menumpang di sidebar tenant (satu grup menu
 *  ditambahkan di bawah), jadi kelihatan seperti "halaman tenant + satu menu
 *  tambahan" padahal ini konteks yang beda sama sekali (lintas tenant, dijaga
 *  users.is_platform_admin, BUKAN matriks izin per-menu biasa). Grup menu
 *  statis (bukan akordeon) dan identitas ZASETA sendiri (ProductBrandMark,
 *  bukan BrandLogo tenant) tetap dipertahankan sebagai penanda "kamu sedang
 *  keluar dari konteks satu perusahaan pelanggan".
 *
 *  Palet warnanya TIDAK lagi dibedakan — dulu shell ini abu netral
 *  (bg-ink-900) sengaja dijauhkan dari hijau brand tenant, tapi itu bikin
 *  seluruh sistem terasa dua produk berbeda alih-alih satu. Sekarang
 *  memakai bg-brand-950 + palet brand & white yang sama persis dengan
 *  Sidebar.jsx tenant, supaya temanya konsisten di seluruh sistem.
 * ============================================================================
 */
const NAV_GROUPS = [
  {
    label: 'Ringkasan',
    items: [{ to: '/platform/dashboard', label: 'Dashboard', icon: 'fa-gauge-high' }],
  },
  {
    label: 'Pelanggan',
    items: [
      { to: '/platform/tenants', label: 'Tenant', icon: 'fa-building' },
      { to: '/platform/users', label: 'Pengguna', icon: 'fa-users' },
      { to: '/platform/billing-requests', label: 'Permintaan Upgrade', icon: 'fa-file-invoice-dollar', badgeKey: 'pendingUpgrades' },
    ],
  },
  {
    label: 'Monetisasi',
    items: [
      { to: '/platform/revenue', label: 'Langganan & Pendapatan', icon: 'fa-chart-line' },
      { to: '/platform/plans', label: 'Katalog Paket', icon: 'fa-layer-group' },
    ],
  },
  {
    label: 'Sistem',
    items: [
      { to: '/platform/activity', label: 'Aktivitas Realtime', icon: 'fa-tower-broadcast' },
      { to: '/platform/audit-log', label: 'Log Audit Platform', icon: 'fa-shield-halved' },
      { to: '/platform/admins', label: 'Admin Platform', icon: 'fa-user-shield' },
      { to: '/platform/ip-whitelist', label: 'Daftar Putih IP', icon: 'fa-network-wired' },
    ],
  },
];

/* Path SENGAJA tidak ada yang jadi awalan path lain di daftar ini, sama
   seperti catatan di Sidebar.jsx tenant — dipakai PlatformLayout kalau
   suatu saat perlu turunkan judul dari URL. */
export const platformNavItems = NAV_GROUPS.flatMap((g) => g.items);

export default function PlatformSidebar({ onNavigate }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  /* Badge jumlah permintaan upgrade yang MENUNGGU — dipoll tiap 30 detik
     (interval sama seperti PlatformDashboard.jsx) supaya admin platform
     langsung sadar ada yang perlu ditindaklanjuti tanpa harus buka menunya
     dulu. Sidebar ini REMOUNT setiap pindah halaman platform (setiap
     halaman platform merender <PlatformLayout> sendiri-sendiri, bukan satu
     layout persisten via nested route), jadi query ini ikut jalan lagi tiap
     navigasi — cukup ringan (satu query kecil, khusus admin platform) untuk
     tidak jadi masalah nyata. Gagal diam-diam (badge cuma hiasan, bukan
     data kritis) supaya tidak mengganggu navigasi kalau permintaannya gagal.
     `?status=all` di badgeKey lain (kalau nanti ditambah) HARUS tetap
     'pending' di sini — badge ini cuma berarti "butuh ditindaklanjuti". */
  const [pendingUpgrades, setPendingUpgrades] = useState(0);
  useEffect(() => {
    let cancelled = false;
    function load() {
      axiosClient.get('/billing/upgrade-requests', { params: { status: 'pending' } })
        .then((res) => { if (!cancelled) setPendingUpgrades(res.data.requests.length); })
        .catch(() => {});
    }
    load();
    const interval = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);
  const badgeCounts = { pendingUpgrades };

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="relative flex flex-col h-full w-full bg-brand-950 border-r border-white/10">
      {/* ===== KEPALA: IDENTITAS ZASETA (bukan merek tenant) ===== */}
      <div className="relative h-16 px-5 flex items-center border-b border-white/10 shrink-0 overflow-hidden">
        <div
          className="pointer-events-none absolute -z-10 -top-10 -left-8 h-28 w-28 rounded-full bg-brand-400/20 blur-2xl"
          aria-hidden="true"
        />
        <ProductBrandMark tone="dark" />
      </div>

      <div className="px-5 pt-4 pb-1 shrink-0">
        <div className="flex items-center gap-2 rounded-lg bg-brand-500/15 border border-brand-400/25 px-2.5 py-1.5">
          <i className="fas fa-lock text-[11px] text-brand-400" aria-hidden="true" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-brand-300">Mode Admin Platform</span>
        </div>
      </div>

      {/* ===== MENU ===== */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto overscroll-contain scrollbar-slim space-y-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="flex items-center gap-2 px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-brand-100">
              <span className="h-1 w-1 rounded-full bg-brand-300" aria-hidden="true" />
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
                      'group relative flex items-center gap-3 px-3 py-2.5 rounded-lg',
                      'text-[13.5px] transition-colors duration-150',
                      isActive
                        ? 'bg-white/10 text-white font-semibold'
                        : 'text-brand-200 font-medium hover:bg-white/5 hover:text-white',
                    ].join(' ')
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span
                          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-brand-400"
                          aria-hidden="true"
                        />
                      )}
                      <i
                        className={`fas ${item.icon} w-4 text-center text-[13px] shrink-0 transition-colors ${
                          isActive ? 'text-white' : 'text-brand-300 group-hover:text-white'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="truncate flex-1">{item.label}</span>
                      {item.badgeKey && badgeCounts[item.badgeKey] > 0 && (
                        <span
                          className="shrink-0 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-bold text-white tabular-nums"
                          title={`${badgeCounts[item.badgeKey]} menunggu ditindaklanjuti`}
                        >
                          {badgeCounts[item.badgeKey]}
                        </span>
                      )}
                      {item.isNew && (
                        <span className="shrink-0 text-[9px] font-extrabold tracking-wide text-brand-300 bg-brand-400/15 border border-brand-400/25 rounded px-1.5 py-0.5">
                          BARU
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ===== KAKI: PENGGUNA ===== */}
      {/* Sengaja TIDAK ada tautan "kembali ke aplikasi" atau ke /profile —
          akun admin platform memang dibatasi hanya di panel ini (lihat
          ProtectedRoute platform={true/false} di App.jsx). Untuk ganti kata
          sandi sendiri, panel ini punya halamannya sendiri: /platform/account
          (PlatformAccount.jsx), bukan menumpang ke /profile tenant. */}
      <div className="p-3 border-t border-white/10 shrink-0">
        <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 p-2">
          <button
            onClick={() => { navigate('/platform/account'); onNavigate?.(); }}
            title="Buka Akun Saya"
            className="flex items-center gap-2.5 flex-1 min-w-0 text-left rounded-lg px-1 py-1 hover:bg-white/10 transition-colors"
          >
            <span
              className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-info-500 to-brand-500
                         flex items-center justify-center text-white font-semibold text-sm shadow-sm"
              aria-hidden="true"
            >
              {user?.name?.[0]?.toUpperCase() || '?'}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-semibold text-white truncate">{user?.name}</span>
              <span className="block text-[11px] text-brand-300 truncate">Admin Platform</span>
            </span>
          </button>

          <div className="shrink-0 h-8 w-px bg-white/10" aria-hidden="true" />

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
      </div>
    </div>
  );
}

/* =========================================================
   LACI SIDEBAR UNTUK LAYAR SEMPIT — sama seperti SidebarDrawer tenant.
   ========================================================= */
export function PlatformSidebarDrawer({ open, onClose }) {
  return (
    <div className={`fixed inset-0 z-40 lg:hidden ${open ? '' : 'pointer-events-none'}`}>
      <div
        className={`absolute inset-0 bg-ink-900/60 backdrop-blur-sm transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`absolute inset-y-0 left-0 w-72 max-w-[82vw] shadow-overlay
                    transition-transform duration-200 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <PlatformSidebar onNavigate={onClose} />
      </div>
    </div>
  );
}
