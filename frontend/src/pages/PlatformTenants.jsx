import React, { useEffect, useState } from 'react';
import PlatformLayout from '../components/PlatformLayout.jsx';
import platformAxiosClient from '../api/platformAxiosClient.js';
import { useNotification } from '../context/NotificationContext.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Card from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { Badge } from '../components/ui/StatusBadge.jsx';
import { SearchInput, SearchableSelect, DateField, TextField, FormError } from '../components/ui/Form.jsx';

/**
 * ============================================================================
 *  DAFTAR & KELOLA TENANT — KHUSUS ADMIN PLATFORM (Fase 5 SaaS)
 * ============================================================================
 *  Lintas tenant, dijaga sesi admin platform sendiri (authenticatePlatform,
 *  lihat migration_separate_platform_admins.sql). Dua aksi tersedia per
 *  tenant:
 *   - Tangguhkan/Aktifkan: mengubah tenants.status — SEMUA pengguna tenant
 *     itu langsung kehilangan/mendapat kembali akses (lihat middleware/auth.js).
 *   - Ubah Paket: koreksi manual DI LUAR alur pengajuan upgrade biasa (lihat
 *     BillingPage.jsx, dibayar lewat Pakasir) — dipakai untuk perbaikan
 *     data atau kesepakatan khusus, bukan jalur pembayaran normal.
 * ============================================================================
 */

const angka = (v) => Number(v).toLocaleString('id-ID');

const STATUS_TONE = { trial: 'warning', active: 'brand', suspended: 'danger' };
const STATUS_LABEL = { trial: 'Trial', active: 'Aktif', suspended: 'Ditangguhkan' };

function ChangePlanModal({ tenant, plans, onClose, onSaved }) {
  const { pushSuccess, pushError } = useNotification();
  const [plan, setPlan] = useState(tenant.plan);
  const [expiresAt, setExpiresAt] = useState(tenant.planExpiresAt ? String(tenant.planExpiresAt).slice(0, 10) : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedPlan = plans.find((p) => p.id === plan);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const res = await platformAxiosClient.patch(`/platform/tenants/${tenant.id}/plan`, {
        plan,
        expiresAt: selectedPlan?.price ? (expiresAt || undefined) : undefined,
      });
      pushSuccess(`Paket ${tenant.companyName} diubah ke ${selectedPlan?.name || res.data.plan}.`);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengubah paket.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Ubah Paket — ${tenant.companyName}`}
      description="Perubahan berlaku langsung, di luar alur pengajuan upgrade biasa."
      icon="fa-credit-card"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Batal</Button>
          <Button size="sm" onClick={handleSave} loading={saving}>Simpan</Button>
        </>
      }
    >
      <div className="space-y-4">
        <SearchableSelect
          label="Paket"
          value={plan}
          onChange={setPlan}
          options={plans}
          getOptionLabel={(p) => p.name}
          getOptionValue={(p) => p.id}
          searchable={false}
          clearable={false}
        />
        {selectedPlan?.price > 0 && (
          <DateField
            label="Berlaku sampai (opsional)"
            hint="Kosongkan untuk tanpa batas waktu."
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        )}
        <FormError>{error}</FormError>
      </div>
    </Modal>
  );
}

/**
 * Konfirmasi "ketik ulang kode perusahaan" -- pola yang sama seperti GitHub
 * saat menghapus repo. Ireversibel (lihat platformController.deleteTenant:
 * seluruh data tenant ikut terhapus lewat ON DELETE CASCADE), jadi sengaja
 * dibuat lebih sulit dipicu tidak sengaja daripada Tangguhkan/Ubah Paket.
 */
function DeleteTenantModal({ tenant, onClose, onDeleted }) {
  const [confirmSlug, setConfirmSlug] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setError('');
    setDeleting(true);
    try {
      const res = await platformAxiosClient.delete(`/platform/tenants/${tenant.id}`, { data: { confirmSlug } });
      onDeleted(res.data.message);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus tenant.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal
      title={`Hapus Tenant — ${tenant.companyName}`}
      description="Tindakan ini TIDAK BISA DIBATALKAN. Seluruh aset, pengguna, dan riwayat tenant ini akan terhapus permanen."
      icon="fa-triangle-exclamation"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={deleting}>Batal</Button>
          <Button variant="destructive" size="sm" onClick={handleDelete} loading={deleting}>Hapus Permanen</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-600 leading-relaxed">
          Untuk konfirmasi, ketik kode perusahaan <strong className="font-mono text-ink-900">{tenant.slug}</strong> persis di bawah ini.
        </p>
        <TextField
          value={confirmSlug}
          onChange={(e) => setConfirmSlug(e.target.value)}
          placeholder={tenant.slug}
          autoFocus
          className="font-mono"
        />
        <FormError>{error}</FormError>
      </div>
    </Modal>
  );
}

export default function PlatformTenants() {
  const { pushSuccess, pushError } = useNotification();

  const [tenants, setTenants] = useState(null);
  const [plans, setPlans] = useState([]);
  const [search, setSearch] = useState('');
  const [planModalTenant, setPlanModalTenant] = useState(null);
  const [deleteModalTenant, setDeleteModalTenant] = useState(null);
  const [statusBusyId, setStatusBusyId] = useState(null);

  function load() {
    platformAxiosClient.get('/platform/tenants')
      .then((res) => setTenants(res.data.tenants))
      .catch((err) => pushError(err.response?.data?.message || 'Gagal memuat daftar tenant.'));
  }

  useEffect(() => {
    load();
    platformAxiosClient.get('/billing/plans').then((res) => setPlans(res.data.plans)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleStatus(tenant) {
    const nextStatus = tenant.status === 'suspended' ? 'active' : 'suspended';
    const confirmMsg = nextStatus === 'suspended'
      ? `Tangguhkan "${tenant.companyName}"? Seluruh pengguna tenant ini akan langsung kehilangan akses sampai diaktifkan kembali.`
      : `Aktifkan kembali "${tenant.companyName}"?`;
    if (!confirm(confirmMsg)) return;

    setStatusBusyId(tenant.id);
    try {
      await platformAxiosClient.patch(`/platform/tenants/${tenant.id}/status`, { status: nextStatus });
      pushSuccess(nextStatus === 'suspended' ? `${tenant.companyName} ditangguhkan.` : `${tenant.companyName} diaktifkan kembali.`);
      load();
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal mengubah status tenant.');
    } finally {
      setStatusBusyId(null);
    }
  }

  const needle = search.trim().toLowerCase();
  const filtered = (tenants || []).filter(
    (t) => !needle || t.companyName.toLowerCase().includes(needle) || t.slug.toLowerCase().includes(needle)
  );

  return (
    <PlatformLayout title="Tenant" width="full">
      <PageHeader
        eyebrow="Admin Platform"
        title="Tenant"
        description="Semua perusahaan terdaftar — pemakaian, paket, dan status langganan."
      />

      <div className="mb-4 max-w-sm">
        <SearchInput
          placeholder="Cari nama perusahaan atau slug…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {tenants === null && <Card><Skeleton className="h-64 w-full" /></Card>}

      {tenants && filtered.length === 0 && (
        <Card>
          <EmptyState
            icon="fa-building"
            title={needle ? 'Tidak ada yang cocok' : 'Belum ada tenant'}
            description={needle ? 'Coba kata kunci lain.' : 'Tenant baru akan muncul di sini begitu ada yang mendaftar.'}
          />
        </Card>
      )}

      {tenants && filtered.length > 0 && (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-ink-500 text-[11px] font-semibold uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3">Perusahaan</th>
                  <th className="text-left px-4 py-3">Admin</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Paket</th>
                  <th className="text-right px-4 py-3">Aset</th>
                  <th className="text-right px-4 py-3">Pengguna</th>
                  <th className="text-left px-4 py-3">Terdaftar</th>
                  <th className="text-right px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-ink-50/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink-800">{t.companyName}</p>
                      <p className="text-xs text-ink-400">{t.slug}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-500 max-w-[220px] truncate">{t.ownerContact || '—'}</td>
                    <td className="px-4 py-3"><Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge></td>
                    <td className="px-4 py-3">
                      <Badge tone="neutral">{plans.find((p) => p.id === t.plan)?.name || t.plan}</Badge>
                      {t.planExpiresAt && (
                        <p className="text-[11px] text-ink-400 mt-1">
                          s.d. {new Date(t.planExpiresAt).toLocaleDateString('id-ID', { dateStyle: 'medium' })}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{angka(t.assetCount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{angka(t.userCount)}</td>
                    <td className="px-4 py-3 text-xs text-ink-500 whitespace-nowrap">
                      {new Date(t.createdAt).toLocaleDateString('id-ID', { dateStyle: 'medium' })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="xs" variant="secondary" onClick={() => setPlanModalTenant(t)}>
                          Ubah Paket
                        </Button>
                        <Button
                          size="xs"
                          variant={t.status === 'suspended' ? 'primary' : 'destructive'}
                          loading={statusBusyId === t.id}
                          onClick={() => toggleStatus(t)}
                        >
                          {t.status === 'suspended' ? 'Aktifkan' : 'Tangguhkan'}
                        </Button>
                        <Button size="xs" variant="ghost" className="text-danger-600 hover:bg-danger-50" onClick={() => setDeleteModalTenant(t)}>
                          Hapus
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {planModalTenant && (
        <ChangePlanModal
          tenant={planModalTenant}
          plans={plans}
          onClose={() => setPlanModalTenant(null)}
          onSaved={() => { setPlanModalTenant(null); load(); }}
        />
      )}

      {deleteModalTenant && (
        <DeleteTenantModal
          tenant={deleteModalTenant}
          onClose={() => setDeleteModalTenant(null)}
          onDeleted={(message) => {
            setDeleteModalTenant(null);
            pushSuccess(message);
            load();
          }}
        />
      )}
    </PlatformLayout>
  );
}
