import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { usePlatformAuth } from '../context/PlatformAuthContext.jsx';
import Card from './ui/Card.jsx';
import Button from './ui/Button.jsx';
import EmptyState from './ui/EmptyState.jsx';
import { MODULE_BY_KEY } from '../constants/modules.js';
import { useLayoutWidth } from '../context/LayoutWidthContext.jsx';

/* Komponen terpisah (bukan cuma sebuah `if` di tengah ProtectedRoute) supaya
   useLayoutWidth() — sebuah hook — hanya pernah dipanggil saat cabang ini
   BENAR-BENAR dipasang, bukan dipanggil bersyarat di dalam satu komponen
   yang sama (itu melanggar Rules of Hooks). Layout (sidebar + tab) sendiri
   sudah terpasang di App.jsx membungkus <Outlet/>, jadi di sini cukup
   render isinya saja. */
function AccessDenied({ module, action }) {
  useLayoutWidth('narrow');

  const label = MODULE_BY_KEY[module]?.label || module;
  const reason = action === 'view'
    ? `Akun Anda tidak diberi akses ke menu ${label}.`
    : `Akun Anda boleh melihat menu ${label}, tetapi tidak berwenang ${
        { create: 'menambah', edit: 'mengubah', delete: 'menghapus' }[action] || action
      } datanya.`;

  return (
    <Card className="mt-6">
      <EmptyState
        icon="fa-lock"
        tone="warning"
        title="Halaman ini tidak tersedia untuk Anda"
        description={`${reason} Hubungi administrator bila Anda merasa seharusnya punya akses.`}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button to="/dashboard" size="sm">Kembali ke Dasbor</Button>
            <Button to="/profile" variant="secondary" size="sm">Profil Saya</Button>
          </div>
        }
      />
    </Card>
  );
}

/**
 * Penjaga rute berbasis izin per-menu.
 *
 *   module   — kunci modul yang wajib boleh dilihat (lihat constants/modules.js)
 *   action   — aksi minimal yang dibutuhkan halaman ini; 'view' untuk halaman
 *              daftar/detail, 'create'/'edit' untuk halaman form
 *   platform — true untuk rute /platform/* (lintas tenant, Fase 5 SaaS).
 *              Sesi admin platform TERPISAH TOTAL dari sesi tenant sejak
 *              migration_separate_platform_admins.sql (lihat
 *              PlatformAuthContext.jsx) — tidak ada lagi satu objek sesi
 *              dengan satu flag yang dibaca dua arah seperti dulu, jadi
 *              cabangnya didelegasikan ke komponen terpisah di bawah
 *              (PlatformProtectedRoute) yang membaca sesi platform sendiri.
 *
 * Tanpa `module`, halaman hanya butuh pengguna yang sudah masuk (mis. Profil).
 *
 * Catatan: pembatasan di sini murni demi tampilan — supaya orang tidak mendarat
 * di halaman yang datanya pasti ditolak. Otorisasi sesungguhnya tetap dicek
 * backend pada setiap endpoint (middleware/auth.js → requirePermission /
 * authenticatePlatform), jadi melewati penjaga ini lewat devtools tidak
 * memberi akses apa pun.
 */
export default function ProtectedRoute({ children, module, action = 'view', platform = false }) {
  if (platform) return <PlatformProtectedRoute>{children}</PlatformProtectedRoute>;

  const { user, can } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  if (module && !can(module, action)) {
    return <AccessDenied module={module} action={action} />;
  }

  return children;
}

function PlatformProtectedRoute({ children }) {
  const { admin } = usePlatformAuth();

  if (!admin) return <Navigate to="/platform/login" replace />;

  return children;
}
