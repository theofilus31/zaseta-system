import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import axiosClient from '../api/axiosClient.js';
import PasswordInput from '../components/ui/PasswordInput.jsx';
import Button from '../components/ui/Button.jsx';
import DotMap from '../components/ui/DotMap.jsx';
import { TextField, FormError } from '../components/ui/Form.jsx';
import ProductBrandMark from '../components/ProductBrandMark.jsx';
import GoogleSignInButton, { GOOGLE_AUTH_ENABLED } from '../components/GoogleSignInButton.jsx';
import { PRODUCT_NAME, PRODUCT_ICON_URL } from '../constants/brand.js';

/** Cuma untuk PRATINJAU nama/surel di layar ini -- BUKAN sumber kebenaran.
    Backend (authController.googleSignup) tetap memverifikasi ulang tanda
    tangan token yang sesungguhnya lewat verifyGoogleCredential(); nilai hasil
    decode kasar ini tidak pernah dikirim sebagai data terpisah ke server,
    cuma token JWT aslinya (credential) yang dikirim utuh. */
function decodeGoogleCredentialPreview(credential) {
  try {
    const base64 = credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(decodeURIComponent(escape(atob(base64))));
    return { name: payload.name || '', email: payload.email || '' };
  } catch {
    return { name: '', email: '' };
  }
}

const USERNAME_PATTERN = /^[a-z0-9_-]{3,50}$/;

/* Sama persis dengan backend/src/utils/tenantSlug.js — kalau aturannya
   berubah di sana, ubah juga di sini supaya pesan galat di form tidak
   menyesatkan (validasi SEBENARNYA tetap di server; ini cuma agar pendaftar
   tahu masalahnya SEBELUM menekan Daftar). */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_MIN = 2;
const SLUG_MAX = 30;

const SLUG_UNAVAILABLE_REASON = {
  reserved: 'Kode ini dipakai sistem — coba kode lain.',
  taken: 'Kode ini sudah dipakai perusahaan lain.',
  invalid_format: 'Format kode tidak valid.',
};

/**
 * Bungkus bersama layar "konfirmasi sesaat" pasca-daftar (VerifyEmailStep,
 * SignupSuccess) — sebelumnya keduanya cuma konten mengambang di tengah
 * bg-ink-50 TANPA pembatas visual apa pun (bukan kartu, bukan border),
 * jadi terasa kosong dan "tidak rapi" begitu ada elemen sepanjang label
 * OTP yang salah tampil (lihat catatan bug di TextField/inputClassName).
 * Sekarang keduanya berbagi satu kartu putih dengan border+shadow, sama
 * seperti pola pembungkus form di Login.jsx/Signup.jsx sendiri untuk layar
 * sempit — supaya seluruh alur daftar terasa satu identitas visual, bukan
 * dua gaya berbeda di dua langkah yang berurutan.
 */
function ConfirmationShell({ children }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-10 bg-gradient-to-br from-brand-50 to-info-100">
      <ProductBrandMark tone="light" className="mb-8" />
      <div className="w-full max-w-sm bg-white rounded-2xl border border-ink-200/70 shadow-overlay p-7 text-center">
        {children}
      </div>
    </div>
  );
}

/** "Langkah X dari 3" -- alur daftar sebenarnya tiga tahap (isi form, verifikasi
    surel, selesai) tapi sebelumnya tidak pernah terlihat sebagai satu alur
    bertahap sama sekali, terutama begitu pendaftar mendarat di layar OTP
    tanpa tahu masih ada langkah apa lagi setelahnya. */
function StepDots({ step, total = 3 }) {
  return (
    <div className="flex items-center justify-center gap-1.5 mb-5" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i + 1 === step ? 'w-6 bg-brand-500' : i + 1 < step ? 'w-1.5 bg-brand-300' : 'w-1.5 bg-ink-200'
          }`}
        />
      ))}
    </div>
  );
}

/**
 * Layar "masukkan kode verifikasi" — ditampilkan SETELAH signup() berhasil
 * tapi SEBELUM akunnya bisa dipakai (lihat catatan users.email_verified_at
 * dan authController.signup/verifySignupEmail). Polanya sama seperti
 * ForgotPasswordModal.handleReset di Login.jsx — kode 6 digit, tombol kirim
 * ulang, pesan galat generik "kode salah/kedaluwarsa".
 */
function VerifyEmailStep({ identifier, email, onVerified }) {
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
      const { tenantSlug } = await verifySignupEmail(identifier, otp.trim());
      onVerified(tenantSlug);
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
    <ConfirmationShell>
      <StepDots step={2} />

      <div className="h-14 w-14 rounded-2xl bg-info-50 text-info-600 flex items-center justify-center mb-4 mx-auto">
        <i className="fas fa-envelope-circle-check text-xl" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-black text-ink-900 tracking-tight">Verifikasi surel Anda</h1>
      <p className="text-sm text-ink-500 mt-2 leading-relaxed">Kami mengirim kode 6 digit ke</p>
      {/* Baris sendiri, bukan disisipkan di tengah kalimat -- surel bisa
          panjang dan dulu jadi terpotong aneh di tengah alamat kalau ikut
          mengalir sebagai bagian dari paragraf (lihat screenshot laporan). */}
      <p className="text-sm font-semibold text-ink-800 mt-1 break-all">{email}</p>
      <p className="text-sm text-ink-500 mt-1 leading-relaxed">Masukkan kodenya di bawah untuk mengaktifkan akun Anda.</p>

      <form onSubmit={handleVerify} className="mt-6 space-y-3">
        <TextField
          label="Kode OTP" required autoFocus
          inputMode="numeric" maxLength={6}
          value={otp}
          onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '')); setError(''); }}
          inputClassName="text-center font-mono text-lg tracking-[0.5em]"
          placeholder="123456"
        />
        <FormError>{error}</FormError>
        <Button type="submit" size="lg" block loading={verifying}>
          {verifying ? 'Memverifikasi…' : 'Verifikasi & Lanjutkan'}
        </Button>
        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className="block w-full text-center text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
        >
          {resending ? 'Mengirim…' : 'Belum dapat kode? Kirim ulang'}
        </button>
      </form>
    </ConfirmationShell>
  );
}

/**
 * Layar konfirmasi sesaat setelah daftar berhasil — menampilkan tautan masuk
 * KHUSUS tenant ini (/:slug/login, lihat TenantLogin.jsx / Fase 5 Tahap 2
 * SaaS) supaya pendaftar bisa menyimpannya SEBELUM lanjut ke dasbor.
 * Ditampilkan sebagai langkah terpisah (bukan cuma toast yang lewat begitu
 * saja) karena tautan ini penting disimpan — tidak ditampilkan ulang di mana
 * pun setelah langkah ini.
 */
function SignupSuccess({ companyName, tenantSlug, continueLabel, onContinue }) {
  const { pushError } = useNotification();
  const [copied, setCopied] = useState(false);
  const loginUrl = `${window.location.origin}/${tenantSlug}/login`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(loginUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      pushError(`Gagal menyalin tautan. Salin manual: ${loginUrl}`);
    }
  }

  return (
    <ConfirmationShell>
      <StepDots step={3} />

      <div className="h-14 w-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-4 mx-auto">
        <i className="fas fa-circle-check text-xl" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-black text-ink-900 tracking-tight">Ruang kerja {companyName} siap!</h1>
      <p className="text-sm text-ink-500 mt-2 leading-relaxed">
        Simpan tautan masuk khusus perusahaan Anda — cara tercepat tim Anda masuk lagi nanti.
      </p>

      <div className="mt-6">
        <div className="flex items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 p-2 pl-4">
          <span className="flex-1 min-w-0 truncate text-left text-[13px] font-mono text-ink-700">{loginUrl}</span>
          <Button size="sm" variant={copied ? 'primary' : 'secondary'} onClick={handleCopy}>
            <i className={`fas ${copied ? 'fa-check' : 'fa-copy'} text-xs`} aria-hidden="true" />
            {copied ? 'Disalin' : 'Salin'}
          </Button>
        </div>
      </div>

      <Button onClick={onContinue} size="lg" block className="mt-6">
        {continueLabel}
        <i className="fas fa-arrow-right text-xs" aria-hidden="true" />
      </Button>
    </ConfirmationShell>
  );
}

/**
 * Halaman Daftar UNIVERSAL — belum ada tenant sama sekali (justru sedang
 * dibuat di sini). Sama seperti Login.jsx, panel logo/tagline SENGAJA tidak
 * memakai BrandLogo/useBranding() (keduanya menebak satu tenant lewat
 * resolvePublicTenantId(), tidak relevan untuk pendaftar yang belum jadi
 * tenant mana pun) — identitas ZASETA di sini ditulis tetap lewat
 * constants/brand.js.
 */
export default function Signup() {
  const { signup, googleSignup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  /* Diisi dua cara: (1) datang langsung dari Login.jsx begitu surel Google-nya
     belum punya akun sama sekali (code NO_ACCOUNT_FOUND, kredensialnya ikut
     dibawa lewat state router supaya tidak perlu menekan tombol Google lagi
     di sini), atau (2) menekan sendiri tombol Google di form ini. Begitu
     terisi, field Nama/Surel/Nama Pengguna/Kata Sandi diganti kartu
     "masuk sebagai ..." -- lihat render di bawah. */
  const [googleProfile, setGoogleProfile] = useState(() => {
    const state = location.state;
    if (state?.googleCredential) {
      return { credential: state.googleCredential, name: state.googleName || '', email: state.googleEmail || '' };
    }
    return null;
  });

  // Sampai di sini gara-gara Login.jsx menemukan surel Google ini belum
  // punya akun ZASETA (code NO_ACCOUNT_FOUND) — dibedakan dari "pengguna
  // menekan sendiri tombol Google di form ini" supaya cuma kasus redirect
  // ini yang dapat banner penjelasan (memilih Google langsung di sini tidak
  // perlu dijelaskan lagi, penggunanya sudah tahu sedang mendaftar).
  const cameFromLoginRedirect = Boolean(location.state?.fromLoginRedirect);

  const [submitHovered, setSubmitHovered] = useState(false);
  const reducedMotion = useReducedMotion();

  // Paket berbayar yang dipilih dari section Harga (?plan=business, dst.) —
  // free/kosong berarti alur pendaftaran biasa. Dipakai untuk mengarahkan
  // ke halaman Langganan (dengan pengajuan pembayaran sudah terbuka) begitu
  // akun selesai dibuat, bukan ke dasbor seperti biasanya.
  const requestedPlanId = searchParams.get('plan');
  const requestedCycle = searchParams.get('cycle') === 'yearly' ? 'yearly' : 'monthly';
  const [requestedPlan, setRequestedPlan] = useState(null);

  useEffect(() => {
    if (!requestedPlanId || requestedPlanId === 'free') return;
    axiosClient.get('/billing/plans')
      .then((res) => {
        const plan = res.data.plans.find((p) => p.id === requestedPlanId && !p.custom);
        if (plan) setRequestedPlan(plan);
      })
      .catch(() => {});
  }, [requestedPlanId]);

  const [companyName, setCompanyName] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Diisi begitu signup() berhasil — beralih ke VerifyEmailStep dulu (akunnya
  // belum bisa dipakai), baru SignupSuccess setelah kode OTP-nya benar.
  const [pendingVerification, setPendingVerification] = useState(null);
  const [signupResult, setSignupResult] = useState(null);

  function handleGoogleCredential(credential) {
    setError('');
    setGoogleProfile({ credential, ...decodeGoogleCredentialPreview(credential) });
  }

  /* Pengecekan langsung ke server sambil mengetik — supaya pendaftar tahu
     kodenya sudah dipakai orang lain SEBELUM mengisi seluruh form, bukan
     baru tahu setelah menekan Daftar. `status`: idle | invalid | checking |
     available | unavailable. Validasi yang SEBENARNYA tetap di server (lihat
     handleSubmit) — ini murni kenyamanan pengetikan. */
  const [slugCheck, setSlugCheck] = useState({ status: 'idle', message: '' });

  useEffect(() => {
    const code = companyCode.trim();
    if (!code) { setSlugCheck({ status: 'idle', message: '' }); return undefined; }
    if (code.length < SLUG_MIN || code.length > SLUG_MAX || !SLUG_PATTERN.test(code)) {
      setSlugCheck({ status: 'invalid', message: `Huruf kecil/angka, minus di tengah saja, ${SLUG_MIN}-${SLUG_MAX} karakter.` });
      return undefined;
    }

    setSlugCheck({ status: 'checking', message: '' });
    const timer = setTimeout(() => {
      axiosClient.get('/public/check-slug', { params: { code } })
        .then((res) => {
          setSlugCheck(
            res.data.available
              ? { status: 'available', message: 'Kode ini tersedia.' }
              : { status: 'unavailable', message: SLUG_UNAVAILABLE_REASON[res.data.reason] || 'Kode ini tidak bisa dipakai.' }
          );
        })
        .catch(() => setSlugCheck({ status: 'idle', message: '' }));
    }, 400);
    return () => clearTimeout(timer);
  }, [companyCode]);

  const usernamePreview = companyCode.trim() && USERNAME_PATTERN.test(username)
    ? `${companyCode.trim()}-${username}`
    : null;

  function clientSideError() {
    if (!companyName.trim()) return 'Nama perusahaan wajib diisi.';
    if (!companyCode.trim()) return 'Kode perusahaan wajib diisi.';
    if (slugCheck.status === 'invalid') return slugCheck.message;
    if (slugCheck.status === 'unavailable') return slugCheck.message;
    // Lewat Google: nama/surel/nama pengguna/kata sandi tidak relevan lagi
    // (diambil dari token Google / diturunkan server, lihat googleSignup()).
    if (googleProfile) return '';
    if (!name.trim()) return 'Nama Anda wajib diisi.';
    if (!email.trim()) return 'Surel wajib diisi.';
    if (!USERNAME_PATTERN.test(username)) {
      return 'Nama pengguna hanya boleh huruf kecil, angka, garis bawah (_), tanda minus (-), minimal 3 karakter.';
    }
    if (password.length < 8) return 'Kata sandi minimal 8 karakter.';
    if (password !== confirmPassword) return 'Konfirmasi kata sandi tidak cocok dengan kata sandi di atas.';
    return '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const clientError = clientSideError();
    if (clientError) { setError(clientError); return; }

    setError('');
    setLoading(true);
    try {
      if (googleProfile) {
        // Sudah langsung terverifikasi & masuk (lihat authController.
        // googleSignup) -- tidak ada langkah OTP, langsung ke layar sukses.
        const { tenantSlug } = await googleSignup({
          credential: googleProfile.credential,
          companyName: companyName.trim(), companyCode: companyCode.trim(),
        });
        setSignupResult({ companyName: companyName.trim(), tenantSlug });
      } else {
        const { identifier } = await signup({
          companyName: companyName.trim(), companyCode: companyCode.trim(),
          name: name.trim(), email: email.trim(), username, password,
        });
        setPendingVerification({ identifier, email: email.trim(), companyName: companyName.trim() });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mendaftar. Coba lagi beberapa saat lagi.');
    } finally {
      setLoading(false);
    }
  }

  if (pendingVerification) {
    return (
      <VerifyEmailStep
        identifier={pendingVerification.identifier}
        email={pendingVerification.email}
        onVerified={(tenantSlug) => {
          setSignupResult({ companyName: pendingVerification.companyName, tenantSlug });
          setPendingVerification(null);
        }}
      />
    );
  }

  if (signupResult) {
    return (
      <SignupSuccess
        companyName={signupResult.companyName}
        tenantSlug={signupResult.tenantSlug}
        continueLabel={requestedPlan ? 'Lanjutkan ke Pembayaran' : 'Lanjutkan ke Dasbor'}
        onContinue={() => navigate(requestedPlan ? `/billing?upgrade=${requestedPlan.id}&cycle=${requestedCycle}` : '/dashboard')}
      />
    );
  }

  return (
    <div className="min-h-dvh w-full flex items-center justify-center bg-gradient-to-br from-brand-50 to-info-100 p-4 py-10">
      <motion.div
        initial={reducedMotion ? undefined : { opacity: 0, scale: 0.97 }}
        animate={reducedMotion ? undefined : { opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-5xl flex overflow-hidden rounded-2xl bg-white shadow-overlay"
      >
        {/* ================= PANEL KIRI — IDENTITAS (peta beranimasi) ================= */}
        {/* Disamakan persis dengan Login.jsx (lihat catatan di sana) — kartu
            mengambang + lencana bulat + judul + subteks tersentris, bukan lagi
            daftar 3 fitur + footer hak cipta yang tersebar atas-bawah. */}
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
            <motion.div
              initial={reducedMotion ? undefined : { opacity: 0, y: -12 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4 }}
              className="mb-6"
            >
              {/* Klik logo -> beranda (landing page), sama seperti Login.jsx */}
              <Link
                to="/"
                aria-label={`Ke beranda ${PRODUCT_NAME}`}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 ring-1 ring-inset ring-white/15 backdrop-blur-sm shadow-brand hover:bg-white/15 transition-colors"
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
              Mulai kelola aset perusahaan Anda
            </motion.h2>
            <motion.p
              initial={reducedMotion ? undefined : { opacity: 0, y: -12 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.4 }}
              className="text-sm text-white/60 max-w-xs leading-relaxed"
            >
              Buat ruang kerja perusahaan Anda sendiri — gratis dicoba, tanpa perlu kartu kredit.
            </motion.p>
          </div>
        </div>

        {/* ===================== PANEL KANAN — FORM DAFTAR ===================== */}
        <div className="w-full lg:w-1/2 p-8 md:p-10 flex flex-col justify-center bg-white">
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
            <h1 className="text-2xl md:text-3xl font-black text-ink-900 tracking-tight mb-1">Daftarkan perusahaan Anda</h1>
            <p className="text-ink-500 mb-6">Buat ruang kerja baru. Anda akan menjadi administrator pertamanya.</p>

            {requestedPlan && (
              <div className="mb-5 flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
                <i className="fas fa-credit-card mt-0.5 text-brand-600 shrink-0" aria-hidden="true" />
                <p className="text-[13px] text-brand-800 leading-relaxed">
                  Setelah akun dibuat, Anda akan diarahkan langsung ke pengajuan pembayaran paket{' '}
                  <strong>{requestedPlan.name}</strong>.
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextField
                  label="Nama Perusahaan"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                  autoFocus
                  placeholder="PT Contoh Sejahtera"
                />

                <TextField
                  label="Kode Perusahaan"
                  type="text"
                  value={companyCode}
                  onChange={(e) => setCompanyCode(e.target.value.toLowerCase())}
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="rms"
                  error={slugCheck.status === 'invalid' || slugCheck.status === 'unavailable' ? slugCheck.message : ''}
                  hint={
                    slugCheck.status === 'invalid' || slugCheck.status === 'unavailable' ? undefined
                      : slugCheck.status === 'checking' ? 'Memeriksa ketersediaan…'
                      : slugCheck.status === 'available' ? (
                        <span className="text-brand-600">
                          <i className="fas fa-circle-check text-[10px] mr-1" aria-hidden="true" />
                          {slugCheck.message}
                        </span>
                      ) : 'Jadi alamat masuk khusus perusahaan Anda, mis. "rms". Tidak bisa diganti setelah didaftarkan.'
                  }
                />
              </div>

              {googleProfile && cameFromLoginRedirect && (
                <div className="flex items-start gap-3 rounded-xl border border-info-200 bg-info-50 px-4 py-3.5">
                  <i className="fas fa-circle-info mt-0.5 text-info-600 shrink-0" aria-hidden="true" />
                  <p className="text-[13px] text-info-800 leading-relaxed">
                    Belum ada akun ZASETA dengan surel Google ini. Kalau menurut Anda seharusnya sudah terdaftar,
                    periksa kembali akun Google yang dipakai lewat tombol <strong>Ganti</strong> di bawah — atau
                    lengkapi data perusahaan untuk membuat ruang kerja baru.
                  </p>
                </div>
              )}

              {googleProfile ? (
                /* Nama & surel sudah diambil dari akun Google yang dipilih —
                   tidak perlu diketik ulang, dan tidak bisa diubah bebas di
                   sini (server memverifikasi ulang tokennya sendiri, lihat
                   authController.googleSignup). Nama pengguna diturunkan
                   otomatis dari surelnya di server, kata sandi tidak
                   diperlukan sama sekali (akun ini masuk lewat Google). */
                <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3.5">
                  <i className="fab fa-google text-lg text-brand-600 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-ink-800 truncate">{googleProfile.name || 'Akun Google'}</p>
                    <p className="text-xs text-ink-500 truncate">{googleProfile.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGoogleProfile(null)}
                    className="shrink-0 text-xs font-medium text-ink-400 hover:text-ink-600"
                  >
                    Ganti
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <TextField
                      label="Nama Anda"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      autoComplete="name"
                      placeholder="Nama lengkap"
                    />

                    <TextField
                      label="Surel"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      autoCapitalize="none"
                      placeholder="nama@perusahaan.com"
                    />
                  </div>

                  <TextField
                    label="Nama Pengguna"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    required
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    hint={
                      usernamePreview
                        ? <>Akan tersimpan sebagai <strong className="text-ink-600">{usernamePreview}</strong> — diberi awalan kode perusahaan.</>
                        : 'Huruf kecil, angka, garis bawah (_), atau minus (-). Minimal 3 karakter.'
                    }
                    placeholder="administrator"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <PasswordInput
                      label="Kata Sandi"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      hint="Minimal 8 karakter."
                      placeholder="••••••••"
                    />
                    <PasswordInput
                      label="Konfirmasi Kata Sandi"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      error={confirmPassword && password !== confirmPassword ? 'Tidak cocok.' : ''}
                      placeholder="••••••••"
                    />
                  </div>

                </>
              )}

              <FormError>{error}</FormError>

              <motion.div
                className="mt-2"
                whileHover={reducedMotion ? undefined : { scale: 1.01 }}
                whileTap={reducedMotion ? undefined : { scale: 0.98 }}
                onHoverStart={() => setSubmitHovered(true)}
                onHoverEnd={() => setSubmitHovered(false)}
              >
                <Button type="submit" size="lg" pill block loading={loading} className="relative overflow-hidden">
                  {loading ? 'Membuat ruang kerja…' : 'Daftar Sekarang'}
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

              {!googleProfile && GOOGLE_AUTH_ENABLED && (
                <>
                  <div className="flex items-center gap-3 !mt-5" aria-hidden="true">
                    <span className="h-px flex-1 bg-ink-200" />
                    <span className="text-xs font-medium text-ink-400">ATAU</span>
                    <span className="h-px flex-1 bg-ink-200" />
                  </div>

                  <GoogleSignInButton onCredential={handleGoogleCredential} text="signup_with" />
                </>
              )}
            </form>

            <p className="text-center text-sm text-ink-500 mt-6">
              Sudah punya akun?{' '}
              <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
                Masuk di sini
              </Link>
            </p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
