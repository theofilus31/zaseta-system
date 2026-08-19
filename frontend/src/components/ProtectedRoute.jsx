import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Layout from './Layout.jsx';
import Card from './ui/Card.jsx';
import Button from './ui/Button.jsx';
import EmptyState from './ui/EmptyState.jsx';
import { MODULE_BY_KEY } from '../constants/modules.js';

/**
 * Penjaga rute berbasis izin per-menu.
 *
 *   module  — kunci modul yang wajib boleh dilihat (lihat constants/modules.js)
 *   action  — aksi minimal yang dibutuhkan halaman ini; 'view' untuk halaman
 *             daftar/detail, 'create'/'edit' untuk halaman form
 *
 * Tanpa `module`, halaman hanya butuh pengguna yang sudah masuk (mis. Profil).
 *
 * Catatan: pembatasan di sini murni demi tampilan — supaya orang tidak mendarat
 * di halaman yang datanya pasti ditolak. Otorisasi sesungguhnya tetap dicek
 * backend pada setiap endpoint (middleware/auth.js → requirePermission), jadi
 * melewati penjaga ini lewat devtools tidak memberi akses apa pun.
 */
export default function ProtectedRoute({ children, module, action = 'view' }) {
  const { user, can } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  if (module && !can(module, action)) {
    const label = MODULE_BY_KEY[module]?.label || module;
    const reason = action === 'view'
      ? `Akun Anda tidak diberi akses ke menu ${label}.`
      : `Akun Anda boleh melihat menu ${label}, tetapi tidak berwenang ${
          { create: 'menambah', edit: 'mengubah', delete: 'menghapus' }[action] || action
        } datanya.`;

    return (
      <Layout width="narrow">
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
      </Layout>
    );
  }

  return children;
}
