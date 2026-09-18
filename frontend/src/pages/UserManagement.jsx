import React, { useEffect, useState } from 'react';
import axiosClient from '../api/axiosClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import PasswordInput from '../components/ui/PasswordInput.jsx';
import { Badge } from '../components/ui/StatusBadge.jsx';
import { TextField, SearchableSelect, FormError } from '../components/ui/Form.jsx';
import PermissionMatrix from '../components/users/PermissionMatrix.jsx';
import { MODULES } from '../constants/modules.js';

const EMPTY_FORM = { id: null, username: '', name: '', email: '', password: '', status: 'active', isAdmin: false };

export default function UserManagement() {
  const { user: currentUser, can } = useAuth();
  const { pushSuccess, pushError, pushLimitError } = useNotification();

  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [permissions, setPermissions] = useState({});
  const [isEdit, setIsEdit] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const canCreate = can('users', 'create');
  const canEdit = can('users', 'edit');
  const canDelete = can('users', 'delete');
  const readOnly = !canCreate && !canEdit;

  function load() {
    axiosClient.get('/users').then((res) => setUsers(res.data));
  }

  useEffect(() => { load(); }, []);

  /* Administrator selalu berakses penuh (aturan yang sama ditegakkan di
     backend), jadi matriksnya tidak perlu — dan tidak boleh — disunting. */
  const isAdminRole = form.isAdmin;

  async function startEdit(u) {
    setIsEdit(true);
    setForm({
      id: u.id, username: u.username, name: u.name, email: u.email,
      password: '', status: u.status, isAdmin: Boolean(u.is_admin),
    });
    setError('');
    // Yang menggulung adalah <main>, bukan window — lihat components/Layout.jsx
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });

    // Izin diambil per pengguna — daftar tidak membawanya demi ukuran respons
    try {
      const res = await axiosClient.get(`/users/${u.id}`);
      setPermissions(res.data.permissions || {});
    } catch {
      setPermissions({});
    }
  }

  function resetForm() {
    setIsEdit(false);
    setForm(EMPTY_FORM);
    setPermissions({});
    setError('');
  }

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!isAdminRole && Object.keys(permissions).length === 0) {
      setError('Pilih minimal satu menu yang boleh diakses pengguna ini.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        username: form.username, name: form.name, email: form.email,
        status: form.status, isAdmin: form.isAdmin,
        permissions,
      };

      if (isEdit) {
        // Kata sandi hanya dikirim kalau memang diisi — admin tetap bisa
        // mengatur ulang kata sandi pengguna langsung dari sini kapan saja.
        if (form.password) payload.password = form.password;
        await axiosClient.put(`/users/${form.id}`, payload);
        pushSuccess(`Pengguna "${form.name}" berhasil diperbarui.`);
      } else {
        // Kata sandi TIDAK dikirim — dibuatkan sistem dan langsung dikirim
        // ke surel pengguna baru, lihat pesan dari backend.
        const res = await axiosClient.post('/users', payload);
        pushSuccess(res.data.message || `Pengguna "${form.name}" berhasil ditambahkan.`);
      }
      resetForm();
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan pengguna.');
      // Batas paket (PLAN_LIMIT_REACHED) dapat tambahan CTA "Upgrade Plan"
      // di toast — pesan inline di atas saja tidak punya tempat untuk tombol.
      if (err.response?.data?.code === 'PLAN_LIMIT_REACHED') pushLimitError(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(u) {
    if (!confirm(`Hapus pengguna "${u.name}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    try {
      await axiosClient.delete(`/users/${u.id}`);
      if (form.id === u.id) resetForm();
      load();
      pushSuccess(`Pengguna "${u.name}" dihapus.`);
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal menghapus pengguna.');
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Administrasi"
        title="Manajemen Pengguna"
        description="Tentukan menu apa saja yang boleh dibuka tiap pengguna, dan di menu itu boleh melihat saja atau juga menambah, mengubah, dan menghapus."
      />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">

        {/* ==================== FORM ==================== */}
        {(canCreate || canEdit) && (
          <div className="xl:col-span-5 space-y-5 xl:sticky xl:top-20">
            <Card as="form" onSubmit={handleSubmit} className={isEdit ? 'ring-2 ring-brand-500/20' : ''}>
              <CardHeader
                title={isEdit ? 'Ubah Pengguna' : 'Tambah Pengguna'}
                description={isEdit ? `Sedang mengubah akun "${form.name}".` : undefined}
                icon={(p) => <i {...p} className="fas fa-user-shield text-xs" />}
              />

              <div className="space-y-4">
                <TextField
                  label="Nama Lengkap" name="name" required
                  value={form.name} onChange={handleChange}
                  placeholder="Mis. Budi Santoso"
                />

                <TextField
                  label="Nama Pengguna" name="username" required
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
                  className="font-mono"
                  autoCapitalize="none" autoCorrect="off"
                  placeholder="budi_santoso"
                  hint="Huruf kecil, angka, garis bawah (_), atau minus (-). Tanpa spasi dan titik."
                />

                <TextField
                  label="Surel" name="email" type="email" required
                  value={form.email} onChange={handleChange}
                  placeholder="budi@perusahaan.com"
                />

                {isEdit ? (
                  <PasswordInput
                    label="Kata Sandi Baru (opsional)"
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    autoComplete="new-password"
                    placeholder="Kosongkan jika tidak diganti"
                    hint="Biarkan kosong agar kata sandi lama tetap berlaku. Diisi hanya kalau Anda ingin mengatur ulang kata sandinya sendiri di sini."
                  />
                ) : (
                  <p className="flex gap-2.5 rounded-xl bg-info-50 px-3.5 py-3 text-xs text-info-700 leading-relaxed">
                    <i className="fas fa-circle-info mt-0.5 shrink-0" aria-hidden="true" />
                    Kata sandi tidak perlu ditentukan di sini — sistem membuatkan kata sandi awal secara
                    otomatis dan mengirimkannya langsung ke surel pengguna begitu akun ini disimpan.
                  </p>
                )}

                {/* Menggantikan dropdown peran bertingkat yang lama. Yang tersisa
                    hanya pembedaan yang benar-benar berpengaruh: akses penuh, atau
                    akses yang diatur lewat matriks di bawah. */}
                <div
                  className={`rounded-xl border px-4 py-3.5 transition-colors ${
                    form.isAdmin ? 'border-danger-200 bg-danger-50' : 'border-ink-200 bg-ink-50'
                  }`}
                >
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isAdmin}
                      onChange={(e) => setForm((f) => ({ ...f, isAdmin: e.target.checked }))}
                      className="mt-0.5 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink-800">
                        Administrator — akses penuh
                      </span>
                      <span className="block text-xs text-ink-500 mt-1 leading-relaxed">
                        Bisa membuka semua menu dan melakukan semua aksi, termasuk mengatur hak akses
                        pengguna lain. Biarkan tidak tercentang untuk menentukan aksesnya sendiri
                        lewat matriks di bawah.
                      </span>
                    </span>
                  </label>
                </div>

                <SearchableSelect
                  label="Status Akun" value={form.status}
                  onChange={(v) => setForm((f) => ({ ...f, status: v }))}
                  clearable={false} searchable={false}
                  options={[
                    { value: 'active', label: 'Aktif' },
                    { value: 'inactive', label: 'Nonaktif' },
                  ]}
                  getOptionLabel={(o) => o.label} getOptionValue={(o) => o.value}
                  placeholder="Pilih status…"
                />

                <FormError>{error}</FormError>

                <div className="flex gap-2">
                  <Button type="submit" loading={saving} className="flex-1">
                    {saving ? 'Menyimpan…' : isEdit ? 'Simpan Perubahan' : 'Simpan Pengguna'}
                  </Button>
                  {isEdit && (
                    <Button type="button" variant="secondary" onClick={resetForm}>Batal</Button>
                  )}
                </div>
              </div>
            </Card>

            {/* ---------- Matriks hak akses ---------- */}
            <Card>
              <CardHeader
                title="Hak Akses Menu"
                description="Centang menu yang boleh dibuka, lalu tentukan aksi yang diizinkan di dalamnya."
                icon={(p) => <i {...p} className="fas fa-shield-halved text-xs" />}

              />

              {isAdminRole ? (
                <div className="flex items-start gap-3 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3.5">
                  <i className="fas fa-crown mt-0.5 text-danger-600 shrink-0" aria-hidden="true" />
                  <div className="text-sm min-w-0">
                    <p className="font-semibold text-danger-800">Akun ini berakses penuh</p>
                    <p className="text-danger-700 mt-1 leading-relaxed text-[13px]">
                      Administrator tidak dibatasi matriks. Ini disengaja: kalau aksesnya ikut bergantung
                      pada centang di sini, satu kesalahan bisa mengunci semua orang keluar dari menu
                      Manajemen Pengguna tanpa ada cara memperbaikinya dari dalam aplikasi.
                      Hilangkan centang "Administrator" di atas untuk mengatur aksesnya per menu.
                    </p>
                  </div>
                </div>
              ) : (
                <PermissionMatrix value={permissions} onChange={setPermissions} />
              )}
            </Card>
          </div>
        )}

        {/* ==================== DAFTAR ==================== */}
        <div className={(canCreate || canEdit) ? 'xl:col-span-7' : 'xl:col-span-12'}>
          <Card padded={false} className="overflow-hidden">
            <CardHeader
              title="Daftar Pengguna"
              description={`${users.length} akun terdaftar`}
              bordered
            />

            {readOnly && (
              <p className="px-5 sm:px-6 py-3 text-xs text-ink-500 bg-ink-50 border-b border-ink-200/70">
                Akun Anda hanya berwenang melihat daftar pengguna.
              </p>
            )}

            {users.length === 0 ? (
              <EmptyState
                icon="fa-users"
                title="Belum ada pengguna"
                description="Tambahkan akun pertama melalui formulir di samping."
              />
            ) : (
              <div className="overflow-x-auto scrollbar-slim">
                <table className="table-base min-w-[720px]">
                  <thead>
                    <tr>
                      <th>Pengguna</th>
                      <th>Akses</th>
                      <th>Status</th>
                      {(canEdit || canDelete) && (
                        <th className="w-24 !text-right"><span className="sr-only">Aksi</span></th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const isSelf = u.id === currentUser.id;
                      const moduleCount = Number(u.module_count) || 0;

                      return (
                        <tr key={u.id} className={form.id === u.id ? 'is-selected' : ''}>
                          <td>
                            <div className="flex items-center gap-3 min-w-0">
                              <span
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                                           bg-gradient-to-br from-info-500 to-brand-500 text-white text-xs font-semibold"
                                aria-hidden="true"
                              >
                                {u.name?.[0]?.toUpperCase() || '?'}
                              </span>
                              <div className="min-w-0">
                                <p className="font-medium text-ink-800 truncate">
                                  {u.name}
                                  {isSelf && <span className="ml-1.5 text-[11px] font-normal text-ink-400">(Anda)</span>}
                                </p>
                                <p className="text-[11px] font-mono text-ink-400 truncate">{u.username}</p>
                              </div>
                            </div>
                          </td>

                          <td>
                            {u.is_admin ? (
                              <Badge tone="danger" size="sm">
                                <i className="fas fa-crown text-[9px] mr-1.5" aria-hidden="true" />
                                Akses penuh
                              </Badge>
                            ) : moduleCount === 0 ? (
                              <span className="text-[13px] text-danger-600">Tanpa akses</span>
                            ) : (
                              <span className="text-[13px] text-ink-600 tabular-nums">
                                {moduleCount} dari {MODULES.length} menu
                              </span>
                            )}
                          </td>

                          <td>
                            <Badge tone={u.status === 'active' ? 'brand' : 'neutral'} size="sm">
                              {u.status === 'active' ? 'Aktif' : 'Nonaktif'}
                            </Badge>
                          </td>

                          {(canEdit || canDelete) && (
                            <td className="text-right whitespace-nowrap">
                              {canEdit && (
                                <button
                                  onClick={() => startEdit(u)}
                                  title={`Ubah ${u.name}`} aria-label={`Ubah ${u.name}`}
                                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg
                                             text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                                >
                                  <i className="fas fa-pen text-[12px]" aria-hidden="true" />
                                </button>
                              )}
                              {/* Akun sendiri sengaja tidak bisa dihapus — mencegah
                                  admin terakhir mengunci dirinya keluar dari sistem. */}
                              {canDelete && !isSelf && (
                                <button
                                  onClick={() => handleDelete(u)}
                                  title={`Hapus ${u.name}`} aria-label={`Hapus ${u.name}`}
                                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg
                                             text-ink-300 hover:text-danger-600 hover:bg-danger-50 transition-colors"
                                >
                                  <i className="fas fa-trash-can text-[13px]" aria-hidden="true" />
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
