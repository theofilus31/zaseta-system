import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import axiosClient from '../api/axiosClient.js';
import PasswordInput from '../components/ui/PasswordInput.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import DotMap from '../components/ui/DotMap.jsx';
import { TextField, FormError } from '../components/ui/Form.jsx';
import GoogleSignInButton, { GOOGLE_AUTH_ENABLED } from '../components/GoogleSignInButton.jsx';
import { PRODUCT_NAME, PRODUCT_ICON_URL } from '../constants/brand.js';

/**
 * Halaman Masuk UNIVERSAL — bukan milik tenant mana pun (lihat catatan
 * PRODUCT_IDENTITY_ROUTES di BrandingContext.jsx, yang sudah mengunci judul
 * tab & favicon di sini ke ZASETA). Panel logo/tagline di halaman ini SENGAJA
 * tidak memakai BrandLogo/useBranding() — keduanya menebak satu tenant lewat
 * resolvePublicTenantId(), yang salah ditampilkan sebagai identitas produk di
 * pintu masuk bersama semua tenant. Sama seperti LandingPage.jsx, identitas
 * ZASETA di sini ditulis tetap lewat constants/brand.js.
 *
 * Halaman masuk KHUSUS satu tenant (mis. /rms/login) adalah komponen
 * terpisah yang justru MEMANG menampilkan merek tenant itu — jangan disatukan
 * dengan halaman ini.
 */
export default function Login() {
  const { login, googleLogin } = useAuth();
  const navigate = useNavigate();
  const { pushSuccess, pushInfo } = useNotification();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [checkingTenant, setCheckingTenant] = useState(false);
  const [submitHovered, setSubmitHovered] = useState(false);
  const reducedMotion = useReducedMotion();
  // Diisi kalau login gagal karena surel belum diverifikasi (lihat
  // authController.login, code EMAIL_NOT_VERIFIED) -- lihat VerifyEmailModal
  // di bawah, bukan cuma pesan galat generik.
  const [needsVerification, setNeedsVerification] = useState(null);

  /**
   * Fase 5 Tahap 3 SaaS — begitu selesai mengetik nama pengguna (blur), cek
   * apakah nama pengguna ini dikenali milik SATU tenant tertentu (nama
   * pengguna sekarang selalu berawalan kode perusahaan, lihat
   * authController.signup) — kalau iya, langsung diarahkan ke halaman masuk
   * KHUSUS tenant itu (/:slug/login) supaya lain kali langsung ke tautan
   * yang benar, bukan lewat halaman umum ini lagi.
   *
   * Sengaja dilewati untuk surel (mengandung "@") — surel tidak membawa kode
   * perusahaan, dan endpoint /public/resolve-username memang sengaja tidak
   * mencocokkan lewat surel (lihat komentar di publicController.js).
   * Kegagalan pengecekan ini (jaringan, dll.) DIAM-DIAM diabaikan — ini
   * murni kenyamanan, bukan bagian penting dari alur masuk; halaman ini
   * tetap berfungsi seperti biasa kalau pengecekannya tidak sempat/gagal.
   */
  async function handleUsernameBlur() {
    const value = username.trim();
    if (!value || value.includes('@')) return;

    setCheckingTenant(true);
    try {
      const res = await axiosClient.get('/public/resolve-username', { params: { username: value } });
      if (res.data.slug) {
        navigate(`/${res.data.slug}/login`, { state: { prefillUsername: value } });
      }
    } catch {
      // Diam-diam abaikan — lihat catatan fungsi di atas.
    } finally {
      setCheckingTenant(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const loggedInUser = await login(username, password);
      // Admin platform langsung ke panelnya sendiri, bukan Dasbor tenant --
      // supaya tidak ada "halaman seperti tenant" yang muncul dulu sebelum
      // panel admin (lihat PlatformLayout.jsx / PlatformSidebar.jsx).
      navigate(loggedInUser?.is_platform_admin ? '/platform/dashboard' : '/dashboard');
    } catch (err) {
      if (err.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
        setNeedsVerification({ identifier: err.response.data.identifier || username });
        return;
      }
      setError(err.response?.data?.message || 'Gagal masuk. Periksa nama pengguna dan kata sandi Anda.');
    } finally {
      setLoading(false);
    }
  }

  /* Belum ada akun ZASETA dengan surel Google ini (code NO_ACCOUNT_FOUND,
     lihat authController.googleLogin) -- diarahkan ke Daftar dengan nama &
     surel Google-nya sudah terisi, TANPA perlu menekan tombol Google lagi
     di sana (kredensialnya ikut dibawa lewat state router, dipakai langsung
     oleh Signup.jsx untuk googleSignup()). */
  async function handleGoogleCredential(credential) {
    setError('');
    setLoading(true);
    try {
      const loggedInUser = await googleLogin(credential);
      navigate(loggedInUser?.is_platform_admin ? '/platform/dashboard' : '/dashboard');
    } catch (err) {
      const data = err.response?.data;
      if (data?.code === 'NO_ACCOUNT_FOUND') {
        pushInfo(`Belum ada akun ${PRODUCT_NAME} dengan surel Google ${data.googleEmail || 'ini'}. Lengkapi data perusahaan untuk membuat ruang kerja baru.`);
        navigate('/signup', { state: { googleCredential: credential, googleName: data.googleName, googleEmail: data.googleEmail, fromLoginRedirect: true } });
        return;
      }
      if (data?.code === 'EMAIL_NOT_VERIFIED') {
        setNeedsVerification({ identifier: data.identifier });
        return;
      }
      setError(data?.message || 'Gagal masuk dengan Google. Coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh w-full flex items-center justify-center bg-gradient-to-br from-brand-50 to-info-100 p-4">
      <motion.div
        initial={reducedMotion ? undefined : { opacity: 0, scale: 0.97 }}
        animate={reducedMotion ? undefined : { opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-5xl flex overflow-hidden rounded-2xl bg-white shadow-overlay"
      >
        {/* ================= PANEL KIRI — IDENTITAS (peta beranimasi) ================= */}
        {/* Disembunyikan di layar sempit supaya form langsung terlihat tanpa scroll */}
        <div
          className="hidden lg:flex w-1/2 relative flex-col items-center justify-center overflow-hidden p-10"
          style={{ background: 'linear-gradient(165deg, #0a2814 0%, #0d1a12 46%, #0b111c 100%)' }}
        >
          {/* Lapisan dekoratif: peta titik beranimasi (rute hijau-biru, senada
              dua warna daun logo RMS — lihat DotMap.jsx) + pendar brand di
              belakangnya. */}
          <div className="absolute inset-0 opacity-40" aria-hidden="true">
            <DotMap />
          </div>
          <div className="absolute -top-32 -right-24 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" aria-hidden="true" />
          <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-info-500/15 blur-3xl" aria-hidden="true" />

          <div className="relative z-10 flex flex-col items-center text-center px-4">
            <motion.div
              initial={reducedMotion ? undefined : { opacity: 0, y: -12 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4 }}
            >
              {/* Klik logo -> beranda (landing page) — bukan cuma dekorasi diam */}
              <Link
                to="/"
                aria-label={`Ke beranda ${PRODUCT_NAME}`}
                className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-white/10 ring-1 ring-inset ring-white/15 backdrop-blur-sm shadow-brand hover:bg-white/15 transition-colors"
              >
                <img src={PRODUCT_ICON_URL} alt="" className="h-8 w-8 object-contain" aria-hidden="true" />
              </Link>
            </motion.div>
            <motion.h2
              initial={reducedMotion ? undefined : { opacity: 0, y: -12 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.4 }}
              className="text-3xl font-black tracking-tight text-white mb-2"
            >
              {PRODUCT_NAME}
            </motion.h2>
            <motion.p
              initial={reducedMotion ? undefined : { opacity: 0, y: -12 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.4 }}
              className="text-sm text-white/60 max-w-xs leading-relaxed"
            >
              Masuk untuk mencatat, memindahkan, dan menelusuri seluruh aset perusahaan Anda dari satu tempat.
            </motion.p>
          </div>
        </div>

        {/* ===================== PANEL KANAN — FORM MASUK ===================== */}
        <div className="w-full lg:w-1/2 p-8 md:p-10 flex flex-col justify-center bg-white">
          {/* Logo, hanya untuk layar sempit (panel kiri tersembunyi) — klik -> beranda */}
          <div className="lg:hidden flex justify-center mb-6">
            <Link to="/">
              <img src={PRODUCT_ICON_URL} alt={PRODUCT_NAME} className="h-11 w-auto object-contain" />
            </Link>
          </div>

          <motion.div
            initial={reducedMotion ? undefined : { opacity: 0, y: 12 }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <p className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-600 mb-3">
              {PRODUCT_NAME}
            </p>
            <h1 className="text-2xl md:text-3xl font-black text-ink-900 tracking-tight mb-1">Selamat datang kembali</h1>
            <p className="text-ink-500 mb-8">Masuk dengan akun yang diberikan administrator.</p>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <TextField
                label="Nama Pengguna atau Surel"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                onBlur={handleUsernameBlur}
                required
                autoFocus
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="nama.pengguna"
                hint={checkingTenant ? 'Memeriksa perusahaan Anda…' : undefined}
              />

              <PasswordInput
                label="Kata Sandi"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
              />

              <FormError>{error}</FormError>

              <motion.div
                whileHover={reducedMotion ? undefined : { scale: 1.01 }}
                whileTap={reducedMotion ? undefined : { scale: 0.98 }}
                onHoverStart={() => setSubmitHovered(true)}
                onHoverEnd={() => setSubmitHovered(false)}
              >
                <Button type="submit" size="lg" pill block loading={loading} className="relative overflow-hidden">
                  {loading ? 'Memproses…' : 'Masuk'}
                  {!loading && <i className="fas fa-arrow-right text-xs" aria-hidden="true" />}
                  {/* Kilau tipis saat hover — cuma dekorasi, dihormati prefers-reduced-motion */}
                  {submitHovered && !reducedMotion && (
                    <motion.span
                      initial={{ left: '-100%' }}
                      animate={{ left: '100%' }}
                      transition={{ duration: 1, ease: 'easeInOut' }}
                      className="absolute top-0 bottom-0 left-0 w-20 bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none"
                      style={{ filter: 'blur(8px)' }}
                      aria-hidden="true"
                    />
                  )}
                </Button>
              </motion.div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setShowForgot(true)}
                  className="text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  Lupa kata sandi?
                </button>
              </div>
            </form>

            {GOOGLE_AUTH_ENABLED && (
              <>
                <div className="flex items-center gap-3 my-5" aria-hidden="true">
                  <span className="h-px flex-1 bg-ink-200" />
                  <span className="text-xs font-medium text-ink-400">ATAU</span>
                  <span className="h-px flex-1 bg-ink-200" />
                </div>

                <GoogleSignInButton onCredential={handleGoogleCredential} text="signin_with" />
              </>
            )}

            <p className="text-center text-sm text-ink-500 mt-6">
              Perusahaan Anda belum terdaftar?{' '}
              <Link to="/signup" className="font-semibold text-brand-600 hover:text-brand-700">
                Daftar di sini
              </Link>
            </p>
          </motion.div>
        </div>
      </motion.div>

      {showForgot && (
        <ForgotPasswordModal
          initialIdentifier={username}
          onClose={() => setShowForgot(false)}
          onDone={(message, identifier) => {
            setShowForgot(false);
            pushSuccess(message);
            setUsername(identifier);
            setPassword('');
          }}
        />
      )}

      {needsVerification && (
        <VerifyEmailModal
          identifier={needsVerification.identifier}
          onClose={() => setNeedsVerification(null)}
          onVerified={(loggedInUser) => {
            setNeedsVerification(null);
            navigate(loggedInUser?.is_platform_admin ? '/platform/dashboard' : '/dashboard');
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Alur "Lupa Kata Sandi", dua langkah:
 *   1. Minta kode — kode 6 digit dikirim ke surel yang SUDAH terdaftar di
 *      akun (bukan alamat yang diketik di sini), supaya tidak bisa dipakai
 *      mengirim kode ke surel siapa pun secara bebas.
 *   2. Masukkan kode + kata sandi baru.
 * Pesan dari langkah 1 sengaja sama persis baik akunnya ditemukan maupun
 * tidak — lihat authController.forgotPassword.
 */
export function ForgotPasswordModal({ initialIdentifier, onClose, onDone }) {
  const [step, setStep] = useState('request'); // 'request' | 'reset'
  const [identifier, setIdentifier] = useState(initialIdentifier || '');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRequest(e) {
    e.preventDefault();
    if (!identifier.trim()) { setError('Nama pengguna atau surel wajib diisi.'); return; }

    setError('');
    setLoading(true);
    try {
      const res = await axiosClient.post('/auth/forgot-password', { identifier: identifier.trim() });
      setInfo(res.data.message);
      setStep('reset');
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengirim kode. Coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    if (!otp.trim()) { setError('Kode OTP wajib diisi.'); return; }
    if (newPassword.length < 8) { setError('Kata sandi minimal 8 karakter.'); return; }
    if (newPassword !== confirmPassword) { setError('Konfirmasi kata sandi tidak cocok dengan kata sandi baru.'); return; }

    setError('');
    setLoading(true);
    try {
      const res = await axiosClient.post('/auth/reset-password', {
        identifier: identifier.trim(), otp: otp.trim(), newPassword,
      });
      onDone(res.data.message, identifier.trim());
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengatur ulang kata sandi.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="Lupa Kata Sandi"
      description={
        step === 'request'
          ? 'Kode reset akan dikirim ke surel yang sudah terdaftar di akun Anda.'
          : `Masukkan kode 6 digit yang dikirim ke surel akun "${identifier}".`
      }
      icon="fa-key"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>Batal</Button>
          <Button type="submit" form={step === 'request' ? 'forgot-request-form' : 'forgot-reset-form'} loading={loading}>
            {step === 'request' ? 'Kirim Kode' : 'Atur Ulang Kata Sandi'}
          </Button>
        </>
      }
    >
      {step === 'request' ? (
        <form id="forgot-request-form" onSubmit={handleRequest} className="space-y-4">
          <p className="text-sm text-ink-500 leading-relaxed">
            Masukkan nama pengguna atau surel akun Anda. Kalau akunnya terdaftar, kami kirim kode 6 digit ke
            alamat surel yang sudah terdaftar di akun itu — bukan ke alamat yang Anda ketik di sini.
          </p>
          <TextField
            label="Nama Pengguna atau Surel" required autoFocus
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoCapitalize="none" autoCorrect="off"
            placeholder="nama.pengguna"
          />
          <FormError>{error}</FormError>
        </form>
      ) : (
        <form id="forgot-reset-form" onSubmit={handleReset} className="space-y-4">
          {info && (
            <p className="flex gap-2.5 rounded-xl bg-info-50 px-3.5 py-3 text-xs text-info-700 leading-relaxed">
              <i className="fas fa-circle-info mt-0.5 shrink-0" aria-hidden="true" />
              {info}
            </p>
          )}

          <TextField
            label="Kode OTP" required autoFocus
            inputMode="numeric" maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            placeholder="123456"
            inputClassName="font-mono tracking-[0.4em] text-center"
          />

          <PasswordInput
            label="Kata Sandi Baru" required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            hint="Minimal 8 karakter."
            autoComplete="new-password"
          />

          <PasswordInput
            label="Konfirmasi Kata Sandi Baru" required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={confirmPassword && newPassword !== confirmPassword ? 'Tidak cocok dengan kata sandi baru.' : ''}
            autoComplete="new-password"
          />

          <button
            type="button"
            onClick={() => { setStep('request'); setOtp(''); setError(''); }}
            className="text-xs text-ink-400 hover:text-ink-600"
          >
            <i className="fas fa-arrow-left text-[10px] mr-1" aria-hidden="true" />
            Belum dapat kode, atau salah akun? Kirim ulang
          </button>

          <FormError>{error}</FormError>
        </form>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Ditampilkan otomatis begitu login() menolak dengan code EMAIL_NOT_VERIFIED
 * (lihat authController.login) -- akun ini hasil pendaftaran mandiri yang
 * surelnya belum dikonfirmasi (lihat Signup.jsx/VerifyEmailStep, alur
 * OTP-nya sama persis, cuma versi modal di sini karena dipicu dari tengah
 * proses Masuk, bukan dari layar Daftar).
 */
function VerifyEmailModal({ identifier, onClose, onVerified }) {
  const { verifySignupEmail, resendSignupVerification } = useAuth();
  const { pushSuccess, pushError } = useNotification();
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleVerify(e) {
    e.preventDefault();
    if (!otp.trim()) { setError('Kode OTP wajib diisi.'); return; }
    setError('');
    setVerifying(true);
    try {
      const { user } = await verifySignupEmail(identifier, otp.trim());
      onVerified(user);
    } catch (err) {
      setError(err.response?.data?.message || 'Kode OTP salah atau sudah kedaluwarsa.');
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    setResending(true);
    try {
      const message = await resendSignupVerification(identifier);
      pushSuccess(message);
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal mengirim ulang kode.');
    } finally {
      setResending(false);
    }
  }

  return (
    <Modal
      title="Verifikasi Surel"
      description="Akun ini belum diverifikasi. Masukkan kode 6 digit yang dikirim ke surel akun Anda saat mendaftar."
      icon="fa-envelope-circle-check"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={verifying}>Batal</Button>
          <Button type="submit" form="verify-email-form" loading={verifying}>Verifikasi & Masuk</Button>
        </>
      }
    >
      <form id="verify-email-form" onSubmit={handleVerify} className="space-y-4">
        <TextField
          label="Kode OTP" required autoFocus
          inputMode="numeric" maxLength={6}
          value={otp}
          onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '')); setError(''); }}
          placeholder="123456"
          inputClassName="font-mono tracking-[0.4em] text-center"
        />
        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className="text-xs text-brand-600 hover:text-brand-700 disabled:opacity-50"
        >
          {resending ? 'Mengirim…' : 'Belum dapat kode? Kirim ulang'}
        </button>
        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}
