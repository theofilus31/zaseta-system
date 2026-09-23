import React, { useEffect, useState } from 'react';
import PlatformLayout from '../components/PlatformLayout.jsx';
import platformAxiosClient from '../api/platformAxiosClient.js';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pagination from '../components/ui/Pagination.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { Badge } from '../components/ui/StatusBadge.jsx';
import { SkeletonRows } from '../components/ui/Skeleton.jsx';
import { SearchInput } from '../components/ui/Form.jsx';

/**
 * ============================================================================
 *  PENGGUNA — DIREKTORI LINTAS TENANT (KHUSUS ADMIN PLATFORM, Fase 5 SaaS)
 * ============================================================================
 *  Beda dari kartu "Beri Akses ke Pengguna Tenant" di PlatformAdmins.jsx
 *  (pencarian minimal 2 huruf, maksimal 20 baris, khusus untuk memberi/
 *  mencabut akses admin platform) — halaman ini murni untuk MELIHAT semua
 *  pengguna di semua tenant, dipaginasi penuh (platformController.listAllUsers).
 * ============================================================================
 */

function timeAgo(iso) {
  if (!iso) return 'Belum pernah masuk';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Baru saja';
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} hari lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { dateStyle: 'medium' });
}

export default function PlatformUsers() {
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      platformAxiosClient.get('/platform/users', { params: { q: search, page, limit: 20 } })
        .then((res) => { setUsers(res.data.users); setPagination(res.data.pagination); })
        .finally(() => setLoading(false));
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, page]);

  return (
    <PlatformLayout title="Pengguna" width="full">
      <PageHeader
        eyebrow="Admin Platform"
        title="Pengguna"
        description="Direktori seluruh pengguna terdaftar, lintas tenant."
      />

      <div className="mb-4 max-w-sm">
        <SearchInput
          placeholder="Cari nama, surel, atau nama pengguna…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      <Card padded={false} className="overflow-hidden">
        <CardHeader title="Semua Pengguna" description={`${pagination.total} pengguna terdaftar.`} bordered />
        <div className="overflow-x-auto scrollbar-slim">
          {loading ? (
            <SkeletonRows rows={10} cols={6} />
          ) : users.length === 0 ? (
            <EmptyState icon="fa-users" title="Tidak ada pengguna yang cocok" description="Coba kata kunci lain." />
          ) : (
            <table className="table-base min-w-[860px]">
              <thead>
                <tr>
                  <th>Pengguna</th>
                  <th>Tenant</th>
                  <th>Peran</th>
                  <th>Status</th>
                  <th>Login Terakhir</th>
                  <th>Terdaftar</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="min-w-[220px]">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-info-500 to-brand-500 text-white text-[11px] font-semibold" aria-hidden="true">
                          {u.name?.[0]?.toUpperCase() || '?'}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="block text-[13px] font-semibold text-ink-800 truncate">{u.name}</span>
                          </span>
                          <span className="block text-[11px] text-ink-400 truncate">{u.email}</span>
                        </span>
                      </div>
                    </td>
                    <td className="text-[13px] text-ink-600 max-w-[180px] truncate">{u.tenantName}</td>
                    <td className="text-[13px] text-ink-600 capitalize">{u.role}</td>
                    <td>
                      <Badge tone={u.status === 'active' ? 'brand' : 'neutral'} size="sm">
                        {u.status === 'active' ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                    </td>
                    <td className="text-[12px] text-ink-500 whitespace-nowrap">{timeAgo(u.lastLoginAt)}</td>
                    <td className="text-[12px] text-ink-500 whitespace-nowrap">
                      {new Date(u.createdAt).toLocaleDateString('id-ID', { dateStyle: 'medium' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <Pagination page={page} totalPages={pagination.totalPages} totalItems={pagination.total} onChange={setPage} />
    </PlatformLayout>
  );
}
