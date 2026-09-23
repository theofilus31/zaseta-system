import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { usePlatformAuth } from '../context/PlatformAuthContext.jsx';
import Card from './ui/Card.jsx';
import Button from './ui/Button.jsx';
import EmptyState from './ui/EmptyState.jsx';
import { MODULE_BY_KEY, FREE_LOCKED_MODULES } from '../constants/modules.js';
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

/* Sama alasannya dengan AccessDenied di atas — komponen terpisah supaya
   useLayoutWidth() tidak dipanggil bersyarat di dalam ProtectedRoute. */
function FeatureLocked({ module }) {
  useLayoutWidth('narrow');

  const label = MODULE_BY_KEY[module]?.label || module;

  return (
    <Card className="mt-6">
      <EmptyState
        icon="fa-lock"
        tone="warning"
        title={`${label} butuh paket berbayar`}
        description={`Fitur ini tidak tersedia di paket Free perusahaan Anda. Tingkatkan paket langganan untuk membuka ${label}.`}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button to="/billing" size="sm">Upgrade Plan</Button>
            <Button to="/dashboard" variant="secondary" size="sm">Kembali ke Dasbor</Button>
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
 * Setelah lolos izin per-menu, `module` yang masuk FREE_LOCKED_MODULES
 * (constants/modules.js) masih bisa diblokir SEKALI LAGI kalau tenant sedang
 * di paket Free — beda dari pengecekan izin di atas (siapa boleh apa DI
 * DALAM tenant), ini soal paket LANGGANANNYA tidak mencakup modul ini sama
 * sekali (lihat FeatureLocked di atas & FREE_LOCKED_MODULES di
 * backend/src/middleware/planLimits.js untuk penegakan sesungguhnya).
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

  if (module && user.plan === 'free' && FREE_LOCKED_MODULES.has(module)) {
    return <FeatureLocked module={module} />;
  }

  return children;
}

function PlatformProtectedRoute({ children }) {
  const { admin } = usePlatformAuth();

  if (!admin) return <Navigate to="/platform/login" replace />;

  return children;
}
