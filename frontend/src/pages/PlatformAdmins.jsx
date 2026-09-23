import React, { useEffect, useState } from 'react';
import PlatformLayout from '../components/PlatformLayout.jsx';
import platformAxiosClient from '../api/platformAxiosClient.js';
import { usePlatformAuth } from '../context/PlatformAuthContext.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { TextField, FormError } from '../components/ui/Form.jsx';

/**
 * ============================================================================
 *  KELOLA ADMIN PLATFORM — KHUSUS ADMIN PLATFORM (Fase 5 SaaS)
 * ============================================================================
 *  Sejak migration_separate_platform_admins.sql, admin platform hidup di
 *  tabel `platform_admins` sendiri (TERPISAH TOTAL dari `users` demi
 *  keamanan) — tidak ada lagi alur "beri akses ke pengguna tenant yang
 *  sudah ada" (dulu lewat pencarian lintas tenant + PATCH .../platform-admin)
 *  karena konsep itu sudah tidak berlaku sama sekali: akun admin platform
 *  SELALU dibuat baru langsung di tabel ini lewat "Tambah Admin Baru", tidak
 *  pernah "dipromosikan" dari akun tenant. Kata sandi awal dibuatkan sistem
 *  & dikirim ke surel, persis pola userController.createUser.
 *
 *  Backend menjaga admin platform AKTIF TERAKHIR tidak pernah bisa dihapus
 *  (lihat platformController.removePlatformAdmin) — supaya tidak ada
 *  keadaan di mana tidak ada siapa pun lagi yang bisa membuka panel ini.
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
      const res = await platformAxiosClient.post('/platform/admins', {
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
  const { admin } = usePlatformAuth();
  const { pushSuccess, pushError } = useNotification();

  const [admins, setAdmins] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [showNewAdmin, setShowNewAdmin] = useState(false);

  function loadAdmins() {
    platformAxiosClient.get('/platform/admins')
      .then((res) => setAdmins(res.data.admins))
      .catch((err) => pushError(err.response?.data?.message || 'Gagal memuat daftar admin platform.'));
  }

  useEffect(loadAdmins, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function removeAdmin(target) {
    if (!confirm(`Cabut akses admin platform dari ${target.name}?`)) return;

    setBusyId(target.id);
    try {
      const res = await platformAxiosClient.delete(`/platform/admins/${target.id}`);
      pushSuccess(res.data.message);
      loadAdmins();
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal mencabut akses admin platform.');
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

      <Card>
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
                  <p className="text-sm font-semibold text-ink-800 truncate">
                    {a.name} {a.id === admin?.id && <span className="text-xs font-normal text-ink-400">(Anda)</span>}
                  </p>
                  <p className="text-xs text-ink-400 truncate">{a.email} — @{a.username}</p>
                </div>
                <Button
                  size="xs"
                  variant="destructive"
                  loading={busyId === a.id}
                  disabled={admins.filter((x) => x.status === 'active').length === 1}
                  onClick={() => removeAdmin(a)}
                >
                  Cabut Akses
                </Button>
              </div>
            ))}
          </div>
        )}
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
