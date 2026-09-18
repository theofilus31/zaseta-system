import React, { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import PasswordInput from '../components/ui/PasswordInput.jsx';
import Button from '../components/ui/Button.jsx';
import DotMap from '../components/ui/DotMap.jsx';
import { TextField, FormError } from '../components/ui/Form.jsx';
import { useBranding, BrandLogo } from '../context/BrandingContext.jsx';
import { ForgotPasswordModal } from './Login.jsx';
import ProductBrandMark from '../components/ProductBrandMark.jsx';
import GoogleSignInButton, { GOOGLE_AUTH_ENABLED } from '../components/GoogleSignInButton.jsx';

/**
 * ============================================================================
 *  HALAMAN MASUK KHUSUS SATU TENANT (Fase 5 Tahap 2 SaaS) — /:slug/login
 * ============================================================================
 *  Kebalikan dari Login.jsx (universal, identitas ZASETA tetap): halaman ini
 *  justru MEMANG menampilkan merek TENANT sesuai kode perusahaan di URL —
 *  BrandingContext.jsx sudah tahu mengambil merek lewat `?slug=` alih-alih
 *  menebak (lihat TENANT_LOGIN_PATTERN di sana), jadi cukup pakai
 *  useBranding()/BrandLogo seperti biasa di sini.
 *
 *  Login-nya sendiri dikirim dengan `slug` (lihat AuthContext.login) supaya
 *  backend mencari akunnya LANGSUNG di dalam tenant ini saja — bukan mencoba
 *  semua tenant seperti alur /login biasa.
 *
 *  Kerangka kartu-mengambang + peta beranimasi di sini SENGAJA disamakan
 *  persis dengan Login.jsx (lihat catatan di sana) supaya kesan pertama
 *  konsisten dari pintu masuk umum maupun pintu masuk khusus tenant — cuma
 *  identitasnya yang beda (merek TENANT di sini, bukan ZASETA).
 * ============================================================================
 */
export default function TenantLogin() {
  const { slug } = useParams();
  const { login, googleLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { pushSuccess } = useNotification();
  const { companyName, appName, loading: brandingLoading, notFound, logoUrl } = useBranding();
  const reducedMotion = useReducedMotion();

  // Diisi dari Login.jsx (halaman umum, Fase 5 Tahap 3 SaaS) kalau
  // pendaftar sampai di sini lewat pengalihan otomatis — supaya tidak perlu
  // mengetik ulang nama pengguna yang sudah diketiknya di sana.
  const [username, setUsername] = useState(() => location.state?.prefillUsername || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [submitHovered, setSubmitHovered] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const loggedInUser = await login(username, password, slug);
      navigate(loggedInUser?.is_platform_admin ? '/platform/dashboard' : '/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal masuk. Periksa nama pengguna dan kata sandi Anda.');
    } finally {
      setLoading(false);
    }
  }

  /* Beda dari Login.jsx (universal): halaman ini KHUSUS satu tenant, jadi
     surel Google yang tidak ditemukan TIDAK diarahkan ke /signup (itu
     membuat PERUSAHAAN BARU) — cukup tampilkan galat, pemiliknya perlu
     diundang lewat Manajemen Pengguna oleh admin tim ini. */
  async function handleGoogleCredential(credential) {
    setError('');
    setLoading(true);
    try {
      const loggedInUser = await googleLogin(credential, slug);
      navigate(loggedInUser?.is_platform_admin ? '/platform/dashboard' : '/dashboard');
    } catch (err) {
      const data = err.response?.data;
      if (data?.code === 'NO_ACCOUNT_FOUND') {
        setError(`Belum ada akun ${companyName || 'di sini'} dengan surel Google ini. Hubungi administrator tim Anda untuk didaftarkan.`);
        return;
      }
      setError(data?.message || 'Gagal masuk dengan Google. Coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  if (brandingLoading) {
    return <div className="min-h-dvh bg-white" />;
  }

  if (notFound) {
    return (
      <div className="min-h-dvh w-full flex items-center justify-center bg-gradient-to-br from-brand-50 to-info-100 p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-ink-200/70 shadow-overlay p-7 text-center">
          <ProductBrandMark tone="light" className="mb-8 justify-center" />
          <div className="h-14 w-14 rounded-2xl bg-danger-50 text-danger-500 flex items-center justify-center mb-4 mx-auto">
            <i className="fas fa-building-circle-xmark text-xl" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-black text-ink-900 tracking-tight">Perusahaan tidak ditemukan</h1>
          <p className="text-sm text-ink-500 mt-2 leading-relaxed">
            Kode perusahaan <strong className="text-ink-700">"{slug}"</strong> tidak terdaftar. Periksa kembali
            tautan masuk yang Anda terima, atau masuk lewat halaman umum.
          </p>
          <div className="flex items-center justify-center gap-3 mt-6">
            <Button to="/login" variant="secondary">Halaman Masuk Umum</Button>
            <Button to="/">Ke Beranda</Button>
          </div>
        </div>
      </div>
    );
  }

  const tenantLogoUrl = logoUrl('dark');

  return (
    <div className="min-h-dvh w-full flex items-center justify-center bg-gradient-to-br from-brand-50 to-info-100 p-4">
      <motion.div
        initial={reducedMotion ? undefined : { opacity: 0, scale: 0.97 }}
        animate={reducedMotion ? undefined : { opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-5xl flex overflow-hidden rounded-2xl bg-white shadow-overlay"
      >
        {/* ================= PANEL KIRI — IDENTITAS TENANT (peta beranimasi) ================= */}
        <div
          className="hidden lg:flex w-1/2 relative flex-col items-center justify-center overflow-hidden p-10"
          style={{ background: 'linear-gradient(165deg, #0a2814 0%, #0d1a12 46%, #0b111c 100%)' }}
        >
          <div className="absolute inset-0 opacity-40" aria-hidden="true">
            <DotMap />
          </div>
          <div className="absolute -top-32 -right-24 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" aria-hidden="true" />
          <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-info-500/15 blur-3xl" aria-hidden="true" />

          <div className="relative z-10 flex flex-col items-center text-center px-4">
            <motion.span
              initial={reducedMotion ? undefined : { opacity: 0, y: -12 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4 }}
              className="mb-6 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-white/10 ring-1 ring-inset ring-white/15 backdrop-blur-sm shadow-brand"
            >
              <BrandLogo variant="dark" className="h-8 w-8 object-contain" fallbackClassName="h-14 w-14 text-2xl" />
            </motion.span>
            <motion.h2
              initial={reducedMotion ? undefined : { opacity: 0, y: -12 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.4 }}
              className="text-3xl font-black tracking-tight text-white mb-2"
            >
              {companyName || appName}
            </motion.h2>
            <motion.p
              initial={reducedMotion ? undefined : { opacity: 0, y: -12 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.4 }}
              className="text-sm text-white/60 max-w-xs leading-relaxed"
            >
              Masuk dengan akun yang diberikan administrator tim Anda.
            </motion.p>
          </div>
        </div>

        {/* ===================== PANEL KANAN — FORM MASUK ===================== */}
        <div className="w-full lg:w-1/2 p-8 md:p-10 flex flex-col justify-center bg-white">
          <div className="lg:hidden flex justify-center mb-6">
            <BrandLogo variant="light" className="h-11 w-auto object-contain" fallbackClassName="h-11 w-11 text-lg" />
          </div>

          <motion.div
            initial={reducedMotion ? undefined : { opacity: 0, y: 12 }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <p className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-600 mb-3">
              {companyName || appName}
            </p>
            <h1 className="text-2xl md:text-3xl font-black text-ink-900 tracking-tight mb-1">Selamat datang kembali</h1>
            <p className="text-ink-500 mb-8">Masuk dengan akun yang diberikan administrator.</p>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <TextField
                label="Nama Pengguna atau Surel"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                required
                autoFocus={!location.state?.prefillUsername}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="nama.pengguna"
              />

              <PasswordInput
                label="Kata Sandi"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus={Boolean(location.state?.prefillUsername)}
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
              Bukan tim {companyName || 'ini'}?{' '}
              <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
                Masuk lewat halaman umum
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
    </div>
  );
}
