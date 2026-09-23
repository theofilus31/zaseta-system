import React, { useState } from 'react';
import PlatformLayout from '../components/PlatformLayout.jsx';
import platformAxiosClient from '../api/platformAxiosClient.js';
import { usePlatformAuth } from '../context/PlatformAuthContext.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import PasswordInput from '../components/ui/PasswordInput.jsx';
import { TextField, FormError } from '../components/ui/Form.jsx';

/**
 * ============================================================================
 *  AKUN SAYA — KHUSUS ADMIN PLATFORM (Fase 5 SaaS)
 * ============================================================================
 *  Satu-satunya jalan admin platform mengganti nama/nama pengguna/surel/kata
 *  sandi sendiri lewat web. Sejak migration_separate_platform_admins.sql,
 *  akun ini hidup di tabel `platform_admins` sendiri (TIDAK PUNYA baris
 *  `users` sama sekali) — tidak bisa lagi menumpang endpoint /api/profile
 *  tenant, jadi dipakai endpoint sendiri: /api/platform-auth/profile (PUT /,
 *  PUT /username, POST /email/otp/request, POST /email/otp/verify), lihat
 *  controllers/platformProfileController.js. Semuanya dijaga
 *  `authenticatePlatform` — tidak ada lagi pertimbangan izin per-menu di
 *  sini, admin platform selalu berakses penuh ke akunnya sendiri.
 * ============================================================================
 */

/** Penanda "langkah 1/2" di alur ganti surel -- dua langkahnya (kirim kode,
    lalu verifikasi) tidak terlihat sebagai satu alur bertahap tanpa ini,
    terutama untuk yang baru pertama kali menjalankannya. */
function StepIndicator({ step }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-400" aria-hidden="true">
      <span>Langkah {step} dari 2</span>
      <span className="flex items-center gap-1 ml-1">
        <span className={`h-1.5 w-4 rounded-full ${step >= 1 ? 'bg-brand-500' : 'bg-ink-200'}`} />
        <span className={`h-1.5 w-4 rounded-full ${step >= 2 ? 'bg-brand-500' : 'bg-ink-200'}`} />
      </span>
    </div>
  );
}
export default function PlatformAccount() {
  const { admin, setAdmin } = usePlatformAuth();
  const { pushSuccess, pushError } = useNotification();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // Ganti nama
  const [nameEditMode, setNameEditMode] = useState(false);
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Ganti nama pengguna — lewat PUT /api/platform-auth/profile/username,
  // SELALU untuk diri sendiri (beda dari Profile.jsx tenant yang bisa
  // mengubah username orang lain) — dijaga authenticatePlatform saja.
  const [usernameEditMode, setUsernameEditMode] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);

  // Ganti surel — alur OTP (sama seperti Profile.jsx tenant)
  const [emailStep, setEmailStep] = useState('idle'); // idle | editing | otp
  const [newEmail, setNewEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [emailError, setEmailError] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  async function handleSubmitPassword(e) {
    e.preventDefault();
    setPasswordError('');

    if (!currentPassword || !newPassword) {
      setPasswordError('Kata sandi saat ini dan kata sandi baru wajib diisi.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('Kata sandi baru minimal 8 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Konfirmasi kata sandi tidak cocok dengan kata sandi baru.');
      return;
    }

    setSavingPassword(true);
    try {
      const res = await platformAxiosClient.put('/platform-auth/profile', { name: admin.name, currentPassword, newPassword });
      const updatedAdmin = { ...admin, ...res.data.admin };
      setAdmin(updatedAdmin);
      localStorage.setItem('platformAdmin', JSON.stringify(updatedAdmin));
      // Ganti kata sandi mencabut semua token lama di server -- token baru
      // dari respons ini menggantikannya supaya sesi ini sendiri tidak putus.
      if (res.data.token) {
        localStorage.setItem('platformToken', res.data.token);
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      pushSuccess('Kata sandi berhasil diganti.');
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal mengganti kata sandi.');
    } finally {
      setSavingPassword(false);
    }
  }

  function startNameEdit() {
    setNewName(admin?.name || '');
    setNameError('');
    setNameEditMode(true);
  }

  function cancelNameEdit() {
    setNameEditMode(false);
    setNameError('');
  }

  async function handleSubmitName(e) {
    e.preventDefault();
    setNameError('');

    const trimmed = newName.trim();
    if (!trimmed) {
      setNameError('Nama wajib diisi.');
      return;
    }
    if (trimmed === admin.name) {
      setNameEditMode(false);
      return;
    }

    setSavingName(true);
    try {
      const res = await platformAxiosClient.put('/platform-auth/profile', { name: trimmed });
      const updatedAdmin = { ...admin, ...res.data.admin };
      setAdmin(updatedAdmin);
      localStorage.setItem('platformAdmin', JSON.stringify(updatedAdmin));
      setNameEditMode(false);
      pushSuccess('Nama berhasil diperbarui.');
    } catch (err) {
      setNameError(err.response?.data?.message || 'Gagal memperbarui nama.');
    } finally {
      setSavingName(false);
    }
  }

  function startUsernameEdit() {
    setNewUsername(admin?.username || '');
    setUsernameError('');
    setUsernameEditMode(true);
  }

  function cancelUsernameEdit() {
    setUsernameEditMode(false);
    setUsernameError('');
  }

  async function handleSubmitUsername(e) {
    e.preventDefault();
    setUsernameError('');

    const trimmed = newUsername.trim().toLowerCase();
    if (!/^[a-z0-9_-]{3,50}$/.test(trimmed)) {
      setUsernameError('Hanya huruf kecil, angka, garis bawah (_), dan tanda minus (-). Minimal 3 karakter.');
      return;
    }
    if (trimmed === admin.username) {
      setUsernameEditMode(false);
      return;
    }

    setSavingUsername(true);
    try {
      await platformAxiosClient.put('/platform-auth/profile/username', { username: trimmed });
      const updatedAdmin = { ...admin, username: trimmed };
      setAdmin(updatedAdmin);
      localStorage.setItem('platformAdmin', JSON.stringify(updatedAdmin));
      setUsernameEditMode(false);
      pushSuccess('Nama pengguna berhasil diperbarui.');
    } catch (err) {
      setUsernameError(err.response?.data?.message || 'Gagal memperbarui nama pengguna.');
    } finally {
      setSavingUsername(false);
    }
  }

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
      await platformAxiosClient.post('/platform-auth/profile/email/otp/request', { newEmail });
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
      const res = await platformAxiosClient.post('/platform-auth/profile/email/otp/verify', { otp: otpCode });
      const updatedAdmin = { ...admin, ...res.data.admin };
      setAdmin(updatedAdmin);
      localStorage.setItem('platformAdmin', JSON.stringify(updatedAdmin));
      cancelEmailEdit();
      pushSuccess('Surel berhasil diperbarui.');
    } catch (err) {
      setEmailError(err.response?.data?.message || 'Kode OTP salah atau sudah kedaluwarsa.');
    } finally {
      setVerifyingOtp(false);
    }
  }

  return (
    <PlatformLayout title="Akun Saya" width="narrow">
      <PageHeader
        eyebrow="Admin Platform"
        title="Akun Saya"
        description="Kelola surel dan kata sandi akun admin platform ini."
      />

      <Card className="mb-6">
        <CardHeader title="Identitas" />
        {nameEditMode ? (
          <form onSubmit={handleSubmitName} className="space-y-3 max-w-sm">
            <TextField
              label="Nama" required autoFocus
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setNameError(''); }}
            />
            <FormError>{nameError}</FormError>
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={savingName}>Simpan</Button>
              <Button type="button" size="sm" variant="secondary" onClick={cancelNameEdit}>Batal</Button>
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-ink-400 mb-1">Nama</p>
              <p className="text-sm font-semibold text-ink-800 truncate">{admin?.name}</p>
            </div>
            <Button size="sm" variant="secondary" onClick={startNameEdit}>Ganti</Button>
          </div>
        )}
      </Card>

      <Card className="mb-6">
        <CardHeader title="Nama Pengguna" description="Dipakai untuk masuk ke sistem." />
        {usernameEditMode ? (
          <form onSubmit={handleSubmitUsername} className="space-y-3 max-w-sm">
            <TextField
              value={newUsername}
              onChange={(e) => { setNewUsername(e.target.value.toLowerCase()); setUsernameError(''); }}
              error={usernameError}
              className="font-mono"
              placeholder="nama.pengguna.baru"
              autoFocus
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={savingUsername}>Simpan</Button>
              <Button type="button" size="sm" variant="secondary" onClick={cancelUsernameEdit}>Batal</Button>
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-3">
            <p className="flex-1 min-w-0 truncate rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-2.5 text-sm font-mono text-ink-700">
              {admin?.username}
            </p>
            <Button size="sm" variant="secondary" onClick={startUsernameEdit}>Ganti</Button>
          </div>
        )}
      </Card>

      <Card className="mb-6">
        <CardHeader
          title="Surel untuk Masuk"
          description="Alternatif nama pengguna saat masuk. Penggantian diverifikasi lewat kode OTP yang dikirim ke alamat baru."
        />

        {emailStep === 'idle' && (
          <div className="flex items-center gap-3">
            <p className="flex-1 min-w-0 truncate rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-2.5 text-sm text-ink-700">
              {admin?.email}
            </p>
            <Button size="sm" variant="secondary" onClick={startEmailEdit}>Ganti</Button>
          </div>
        )}

        {emailStep === 'editing' && (
          <form onSubmit={handleRequestOtp} className="space-y-3 max-w-sm">
            <StepIndicator step={1} />
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
          <form onSubmit={handleVerifyOtp} className="space-y-3 max-w-sm">
            <StepIndicator step={2} />
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

      <Card>
        <CardHeader title="Ganti Kata Sandi" description="Wajib memasukkan kata sandi saat ini." />
        <form onSubmit={handleSubmitPassword} className="space-y-4 max-w-sm">
          <PasswordInput
            label="Kata Sandi Saat Ini"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <PasswordInput
            label="Kata Sandi Baru"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            hint="Minimal 8 karakter."
            required
          />
          <PasswordInput
            label="Konfirmasi Kata Sandi Baru"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            error={confirmPassword && newPassword !== confirmPassword ? 'Tidak cocok dengan kata sandi baru.' : ''}
            required
          />
          <FormError>{passwordError}</FormError>
          <Button type="submit" loading={savingPassword}>Simpan Kata Sandi</Button>
        </form>
      </Card>
    </PlatformLayout>
  );
}
