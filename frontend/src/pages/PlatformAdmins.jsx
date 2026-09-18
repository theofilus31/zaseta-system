import React, { useEffect, useState } from 'react';
import PlatformLayout from '../components/PlatformLayout.jsx';
import axiosClient from '../api/axiosClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { SearchInput, TextField, FormError } from '../components/ui/Form.jsx';

/**
 * ============================================================================
 *  KELOLA ADMIN PLATFORM — KHUSUS ADMIN PLATFORM (Fase 5 SaaS)
 * ============================================================================
 *  Lintas tenant. Memberi/mencabut `users.is_platform_admin` — akses yang
 *  sama dipakai requirePlatformAdmin di seluruh /platform/* (lihat
 *  middleware/auth.js). Pencarian pengguna LINTAS TENANT (bukan cuma tenant
 *  sendiri) karena admin platform bisa jadi siapa saja di perusahaan mana pun
 *  yang dipercaya — backend menjaga supaya akses admin platform TERAKHIR
 *  tidak pernah bisa dicabut (lihat platformController.setPlatformAdmin).
 *
 *  Selain "beri akses ke pengguna tenant yang sudah ada", ada juga
 *  "Tambah Admin Baru" — bikin akun admin platform langsung dari nol
 *  (platformController.createPlatformAdmin), tanpa perlu tenant/pengguna
 *  yang sudah ada lebih dulu. Kata sandi awal dibuatkan sistem & dikirim ke
 *  surel, persis pola userController.createUser.
 * ============================================================================
 */

function NewAdminModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', username: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSave() {
    setError('');
    if (!form.name.trim() || !form.email.trim() || !form.username.trim()) {
      setError('Nama, surel, dan nama pengguna wajib diisi.');
      return;
    }
    setSaving(true);
    try {
      const res = await axiosClient.post('/platform/admins', {
        name: form.name.trim(),
        email: form.email.trim(),
        username: form.username.trim().toLowerCase(),
      });
      onCreated(res.data.message);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menambahkan admin platform.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Tambah Admin Platform Baru"
      description="Kata sandi awal dibuatkan sistem dan dikirim ke surel yang diisi — bukan ditentukan di sini."
      icon="fa-user-shield"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Batal</Button>
          <Button size="sm" onClick={handleSave} loading={saving}>Tambah</Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="Nama" name="name" value={form.name} onChange={handleChange} autoFocus required />
        <TextField label="Surel" name="email" type="email" value={form.email} onChange={handleChange} required />
        <TextField
          label="Nama Pengguna"
          name="username"
          value={form.username}
          onChange={handleChange}
          hint="Huruf kecil, angka, garis bawah (_), atau minus (-), minimal 3 karakter."
          required
        />
        <FormError>{error}</FormError>
      </div>
    </Modal>
  );
}

export default function PlatformAdmins() {
  const { user } = useAuth();
  const { pushSuccess, pushError } = useNotification();

  const [admins, setAdmins] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [showNewAdmin, setShowNewAdmin] = useState(false);

  function loadAdmins() {
    axiosClient.get('/platform/admins')
      .then((res) => setAdmins(res.data.admins))
      .catch((err) => pushError(err.response?.data?.message || 'Gagal memuat daftar admin platform.'));
  }

  useEffect(loadAdmins, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return undefined; }

    setSearching(true);
    const timer = setTimeout(() => {
      axiosClient.get('/platform/users/search', { params: { q } })
        .then((res) => setResults(res.data.users))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function setPlatformAdmin(targetUser, grant) {
    const confirmMsg = grant
      ? `Beri akses admin platform ke ${targetUser.name} (${targetUser.tenantName})?`
      : `Cabut akses admin platform dari ${targetUser.name} (${targetUser.tenantName})?`;
    if (!confirm(confirmMsg)) return;

    setBusyId(targetUser.id);
    try {
      await axiosClient.patch(`/platform/users/${targetUser.id}/platform-admin`, { grant });
      pushSuccess(grant ? `${targetUser.name} sekarang jadi admin platform.` : `Akses admin platform ${targetUser.name} dicabut.`);
      loadAdmins();
      setResults((prev) => prev.map((r) => (r.id === targetUser.id ? { ...r, isPlatformAdmin: grant } : r)));
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal mengubah akses admin platform.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PlatformLayout title="Admin Platform" width="narrow">
      <PageHeader
        eyebrow="Admin Platform"
        title="Admin Platform"
        description="Siapa saja yang punya akses lintas tenant untuk mengelola billing, tenant, dan panel ini."
        actions={<Button size="sm" onClick={() => setShowNewAdmin(true)}>
          <i className="fas fa-plus text-xs" aria-hidden="true" />
          Tambah Admin Baru
        </Button>}
      />

      <Card className="mb-6">
        <CardHeader title="Admin Platform Saat Ini" />
        {admins === null && <Skeleton className="h-32 w-full" />}
        {admins && admins.length === 0 && (
          <EmptyState icon="fa-user-shield" title="Belum ada admin platform" />
        )}
        {admins && admins.length > 0 && (
          <div className="space-y-2">
            {admins.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-ink-200/70 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-800 truncate">{a.name}</p>
                  <p className="text-xs text-ink-400 truncate">{a.email} — {a.tenantName}</p>
                </div>
                <Button
                  size="xs"
                  variant="destructive"
                  loading={busyId === a.id}
                  disabled={a.id === user.id && admins.length === 1}
                  onClick={() => setPlatformAdmin({ id: a.id, name: a.name, tenantName: a.tenantName }, false)}
                >
                  Cabut Akses
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Beri Akses ke Pengguna Tenant"
          description="Untuk pengguna yang SUDAH punya akun tenant — cari lewat nama, surel, atau nama pengguna. Untuk orang baru, pakai tombol Tambah Admin Baru di atas."
        />
        <SearchInput
          placeholder="Ketik minimal 2 huruf…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="mt-3 space-y-2">
          {searching && <Skeleton className="h-14 w-full" />}
          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <p className="text-sm text-ink-400 text-center py-4">Tidak ada pengguna yang cocok.</p>
          )}
          {!searching && results.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-ink-200/70 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-800 truncate">{r.name}</p>
                <p className="text-xs text-ink-400 truncate">{r.email} — {r.tenantName}</p>
              </div>
              {r.isPlatformAdmin ? (
                <span className="text-xs font-medium text-brand-600 shrink-0">Sudah admin platform</span>
              ) : (
                <Button size="xs" loading={busyId === r.id} onClick={() => setPlatformAdmin(r, true)}>
                  Beri Akses
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>

      {showNewAdmin && (
        <NewAdminModal
          onClose={() => setShowNewAdmin(false)}
          onCreated={(message) => {
            setShowNewAdmin(false);
            pushSuccess(message);
            loadAdmins();
          }}
        />
      )}
    </PlatformLayout>
  );
}
