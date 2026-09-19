import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosClient from '../api/axiosClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import { useLayoutWidth } from '../context/LayoutWidthContext.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import PasswordInput from '../components/ui/PasswordInput.jsx';
import { Badge } from '../components/ui/StatusBadge.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { TextField, FormError } from '../components/ui/Form.jsx';
import { accessLabel, accessTone } from '../constants/modules.js';

/** Baris "nilai + tombol aksi" untuk data yang tidak diedit langsung di form. */
function ReadonlyRow({ value, mono = false, action }) {
  return (
    <div className="flex items-center gap-3">
      <p className={`flex-1 min-w-0 truncate rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-2.5 text-sm text-ink-700 ${mono ? 'font-mono' : ''}`}>
        {value}
      </p>
      {action}
    </div>
  );
}

export default function Profile() {
  useLayoutWidth('narrow');
  const { user, setUser, can } = useAuth();
  const { pushError, pushSuccess } = useNotification();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '', email: '', username: '',
    currentPassword: '', newPassword: '', confirmPassword: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /* false = akun daftar lewat Google yang belum pernah membuat kata sandi:
     tidak ada "kata sandi saat ini" untuk diisi. */
  const [passwordIsSet, setPasswordIsSet] = useState(true);

  /* Mengubah nama pengguna termasuk menyunting data akun, jadi mengikuti izin
     menu Manajemen Pengguna — bukan lagi semata-mata karena berperan admin. */
  const isAdmin = can('users', 'edit');

  // Admin: ganti nama pengguna
  const [usernameEditMode, setUsernameEditMode] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');

  // Ganti surel — alur OTP
  const [emailStep, setEmailStep] = useState('idle'); // idle | editing | otp
  const [newEmail, setNewEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [emailError, setEmailError] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  function loadProfile() {
    return axiosClient.get('/profile')
      .then((res) => {
        const data = res.data;
        setForm((f) => ({
          ...f,
          name: data.name || '',
          email: data.email || '',
          username: data.username || '',
          currentPassword: '', newPassword: '', confirmPassword: '',
        }));
        setNewUsername(data.username || '');
        setPasswordIsSet(data.passwordIsSet !== false);
      })
      .catch((err) => pushError(err.response?.data?.message || 'Gagal memuat profil.'));
  }

  useEffect(() => {
    setLoading(true);
    loadProfile().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (form.newPassword && form.newPassword !== form.confirmPassword) {
      pushError('Konfirmasi kata sandi tidak cocok.');
      return;
    }
    if (form.newPassword && form.newPassword.length < 8) {
      pushError('Kata sandi minimal 8 karakter.');
      return;
    }

    setSaving(true);
    const payload = { name: form.name };
    if (form.newPassword || (passwordIsSet && form.currentPassword)) {
      payload.currentPassword = form.currentPassword;
      payload.newPassword = form.newPassword;
    }

    try {
      const res = await axiosClient.put('/profile', payload);
      const updatedUser = { ...user, ...res.data.user };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      /* Ganti kata sandi mencabut semua token lama di server (lihat
         middleware/auth.js) — token baru dari respons ini menggantikan yang
         lama di sini, supaya sesi yang sedang berjalan tidak tiba-tiba
         ditolak pada permintaan berikutnya. */
      if (res.data.token) {
        localStorage.setItem('token', res.data.token);
      }
      setForm((f) => ({ ...f, currentPassword: '', newPassword: '', confirmPassword: '' }));
      if (payload.newPassword) setPasswordIsSet(true);
      pushSuccess(!passwordIsSet && payload.newPassword ? 'Kata sandi berhasil dibuat. Sekarang Anda bisa masuk dengan kata sandi maupun Google.' : 'Profil berhasil diperbarui.');
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal menyimpan profil.');
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- Alur ganti surel (OTP) ---------------- */
  function startEmailEdit() {
    setEmailStep('editing');
    setNewEmail('');
    setOtpCode('');
    setEmailError('');
  }

  function cancelEmailEdit() {
    setEmailStep('idle');
    setNewEmail('');
    setOtpCode('');
    setEmailError('');
  }

  async function handleRequestOtp(e) {
    e.preventDefault();
    setEmailError('');
    if (!newEmail) { setEmailError('Alamat surel baru wajib diisi.'); return; }

    setSendingOtp(true);
    try {
      await axiosClient.post('/profile/email/otp/request', { newEmail });
      setEmailStep('otp');
      pushSuccess(`Kode OTP dikirim ke ${newEmail}. Cek kotak masuk atau folder spam.`);
    } catch (err) {
      setEmailError(err.response?.data?.message || 'Gagal mengirim kode OTP.');
    } finally {
      setSendingOtp(false);
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    setEmailError('');
    if (!otpCode) { setEmailError('Kode OTP wajib diisi.'); return; }

    setVerifyingOtp(true);
    try {
      const res = await axiosClient.post('/profile/email/otp/verify', { otp: otpCode });
      const updatedUser = { ...user, ...res.data.user };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setForm((f) => ({ ...f, email: res.data.user.email }));
      cancelEmailEdit();
      pushSuccess('Surel berhasil diperbarui.');
    } catch (err) {
      setEmailError(err.response?.data?.message || 'Kode OTP salah atau sudah kedaluwarsa.');
    } finally {
      setVerifyingOtp(false);
    }
  }

  /* ---------------- Admin: ganti nama pengguna ---------------- */
  async function handleUpdateUsername() {
    if (!newUsername || newUsername === form.username) {
      setUsernameEditMode(false);
      return;
    }
    if (!/^[a-z0-9_-]{3,50}$/.test(newUsername)) {
      setUsernameError('Hanya huruf kecil, angka, garis bawah (_), dan tanda minus (-). Minimal 3 karakter.');
      return;
    }

    setUsernameError('');
    try {
      await axiosClient.put('/profile/username', { userId: user.id, username: newUsername });
      const updatedUser = { ...user, username: newUsername };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setForm((f) => ({ ...f, username: newUsername }));
      setUsernameEditMode(false);
      pushSuccess('Nama pengguna berhasil diperbarui.');
    } catch (err) {
      setUsernameError(err.response?.data?.message || 'Gagal memperbarui nama pengguna.');
    }
  }

  if (loading) {
    return (
      <>
        <Skeleton className="h-7 w-48 mb-6" />
        <div className="space-y-5">
          <Card><Skeleton className="h-24 w-full" /></Card>
          <Card><Skeleton className="h-32 w-full" /></Card>
          <Card><Skeleton className="h-40 w-full" /></Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Profil Saya" description="Kelola identitas dan keamanan akun Anda." />

      {/* ---------- Kartu identitas ---------- */}
      <Card className="mb-5">
        <div className="flex items-center gap-4">
          <span
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl
                       bg-gradient-to-br from-info-500 to-brand-500 text-2xl font-bold text-white shadow-raised"
            aria-hidden="true"
          >
            {form.name?.[0]?.toUpperCase() || '?'}
          </span>
          <div className="min-w-0">
            <p className="text-lg font-bold text-ink-900 truncate">{form.name}</p>
            <p className="text-sm text-ink-400 font-mono truncate">{form.username}</p>
            <Badge tone={accessTone(user)} size="sm" className="mt-2">
              {accessLabel(user)}
            </Badge>
          </div>
        </div>
      </Card>

      {/* ---------- Nama pengguna ---------- */}
      <Card className="mb-5">
        <CardHeader
          title="Nama Pengguna"
          description="Dipakai untuk masuk ke sistem."
          icon={(p) => <i {...p} className="fas fa-at text-xs" />}
        />

        {usernameEditMode ? (
          <div className="space-y-3">
            <TextField
              value={newUsername}
              onChange={(e) => { setNewUsername(e.target.value.toLowerCase()); setUsernameError(''); }}
              error={usernameError}
              className="font-mono"
              placeholder="nama.pengguna.baru"
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleUpdateUsername}>Simpan</Button>
              <Button
                size="sm" variant="secondary"
                onClick={() => { setUsernameEditMode(false); setNewUsername(form.username); setUsernameError(''); }}
              >
                Batal
              </Button>
            </div>
          </div>
        ) : (
          <ReadonlyRow
            value={form.username}
            mono
            action={isAdmin ? (
              <Button size="sm" variant="secondary" onClick={() => setUsernameEditMode(true)}>Ubah</Button>
            ) : undefined}
          />
        )}

        {!isAdmin && (
          <p className="hint">Nama pengguna hanya dapat diubah oleh Administrator.</p>
        )}
      </Card>

      {/* ---------- Surel (alur OTP) ---------- */}
      <Card className="mb-5">
        <CardHeader
          title="Surel untuk Masuk"
          description="Alternatif nama pengguna saat masuk. Penggantian diverifikasi lewat kode OTP yang dikirim ke alamat baru."
          icon={(p) => <i {...p} className="fas fa-envelope text-xs" />}
        />

        {emailStep === 'idle' && (
          <ReadonlyRow
            value={form.email}
            action={<Button size="sm" variant="secondary" onClick={startEmailEdit}>Ganti</Button>}
          />
        )}

        {emailStep === 'editing' && (
          <form onSubmit={handleRequestOtp} className="space-y-3">
            <TextField
              label="Surel Baru" type="email" required autoFocus
              value={newEmail}
              onChange={(e) => { setNewEmail(e.target.value); setEmailError(''); }}
              placeholder="email.baru@perusahaan.com"
            />
            <FormError>{emailError}</FormError>
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={sendingOtp}>
                {sendingOtp ? 'Mengirim…' : 'Kirim Kode OTP'}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={cancelEmailEdit}>Batal</Button>
            </div>
          </form>
        )}

        {emailStep === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="space-y-3">
            <div className="rounded-xl bg-info-50 border border-info-200 px-3.5 py-3 text-xs text-info-800 leading-relaxed">
              <p>Kode OTP telah dikirim ke:</p>
              <p className="font-semibold break-all mt-0.5">{newEmail}</p>
              <p className="mt-1.5">Masukkan 6 digit kode tersebut di bawah ini.</p>
            </div>
            <TextField
              label="Kode OTP" required autoFocus
              inputMode="numeric" maxLength={6}
              value={otpCode}
              onChange={(e) => { setOtpCode(e.target.value.replace(/\D/g, '')); setEmailError(''); }}
              inputClassName="text-center font-mono text-lg tracking-[0.5em]"
              placeholder="123456"
            />
            <FormError>{emailError}</FormError>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" loading={verifyingOtp}>
                {verifyingOtp ? 'Memverifikasi…' : 'Verifikasi & Simpan'}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={handleRequestOtp} disabled={sendingOtp}>
                Kirim Ulang
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={cancelEmailEdit}>Batal</Button>
            </div>
          </form>
        )}
      </Card>

      {/* ---------- Nama & kata sandi ---------- */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <Card>
          <CardHeader
            title="Informasi Dasar"
            icon={(p) => <i {...p} className="fas fa-id-card text-xs" />}
          />
          <TextField label="Nama Lengkap" name="name" required value={form.name} onChange={handleChange} />
        </Card>

        <Card>
          <CardHeader
            title={passwordIsSet ? 'Ganti Kata Sandi' : 'Buat Kata Sandi'}
            description={passwordIsSet
              ? 'Kosongkan seluruhnya jika tidak ingin mengganti kata sandi.'
              : 'Akun ini didaftarkan lewat Google, jadi belum punya kata sandi. Buat satu bila ingin bisa masuk tanpa Google — kosongkan jika tidak perlu.'}
            icon={(p) => <i {...p} className="fas fa-key text-xs" />}
          />
          <div className="space-y-4">
            {passwordIsSet && (
              <PasswordInput
                label="Kata Sandi Saat Ini" name="currentPassword"
                value={form.currentPassword} onChange={handleChange}
                autoComplete="current-password"
                placeholder="Masukkan kata sandi saat ini"
              />
            )}
            <PasswordInput
              label="Kata Sandi Baru" name="newPassword"
              value={form.newPassword} onChange={handleChange}
              autoComplete="new-password"
              placeholder="Minimal 8 karakter"
            />
            <PasswordInput
              label="Konfirmasi Kata Sandi Baru" name="confirmPassword"
              value={form.confirmPassword} onChange={handleChange}
              autoComplete="new-password"
              placeholder="Ketik ulang kata sandi baru"
              error={
                form.confirmPassword && form.newPassword !== form.confirmPassword
                  ? 'Konfirmasi kata sandi tidak cocok.'
                  : undefined
              }
            />
          </div>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" loading={saving}>
            {saving ? 'Menyimpan…' : 'Simpan Profil'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>Batal</Button>
        </div>
      </form>
    </>
  );
}
