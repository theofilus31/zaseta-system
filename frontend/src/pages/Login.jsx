import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import PasswordInput from '../components/ui/PasswordInput.jsx';
import Button from '../components/ui/Button.jsx';
import { TextField, FormError } from '../components/ui/Form.jsx';
import { useBranding, BrandLogo } from '../context/BrandingContext.jsx';

/* Nilai jual sistem, ditampilkan di panel kiri. Sengaja menyebut kemampuan
   yang benar-benar ada di aplikasi ini — bukan janji generik. */
const HIGHLIGHTS = [
  {
    icon: 'fa-qrcode',
    title: 'Lacak lewat Kode QR',
    text: 'Tempel label di aset, pindai untuk lihat detailnya tanpa perlu masuk.',
  },
  {
    icon: 'fa-sitemap',
    title: 'Kode aset otomatis',
    text: 'Tersusun sendiri dari Lokasi, Sub Lokasi, dan Kode Barang.',
  },
  {
    icon: 'fa-clock-rotate-left',
    title: 'Riwayat lengkap',
    text: 'Setiap perpindahan dan perubahan status aset tercatat.',
  },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { appName, companyName, tagline } = useBranding();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal masuk. Periksa nama pengguna dan kata sandi Anda.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-2 bg-white">

      {/* ================= PANEL KIRI — IDENTITAS & NILAI JUAL ================= */}
      {/* Disembunyikan di layar sempit supaya form langsung terlihat tanpa scroll */}
      <div className="hidden lg:flex relative flex-col justify-between overflow-hidden bg-ink-900 p-12">
        {/* Lapisan dekoratif: gradien brand + grid titik halus */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-brand-700 via-ink-900 to-info-900"
          aria-hidden="true"
        />
        <div
          className="absolute -top-32 -right-24 h-96 w-96 rounded-full bg-brand-500/25 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-info-500/20 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative">
          <BrandLogo
            variant="dark"
            className="h-11 w-auto object-contain"
            fallbackClassName="h-11 w-11 text-lg"
          />
        </div>

        <div className="relative max-w-md">
          <h2 className="text-[32px] leading-[1.15] font-bold text-white tracking-tight">
            Setiap aset punya tempat,
            <br />
            <span className="text-brand-300">dan jejaknya.</span>
          </h2>
          <p className="text-[15px] text-white/60 mt-4 leading-relaxed">
            {tagline || `Sistem inventaris aset ${companyName} — mencatat, memindahkan, dan menelusuri seluruh aset perusahaan dari satu tempat.`}
          </p>

          <ul className="mt-10 space-y-5">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="flex items-start gap-4">
                <span
                  className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
                             bg-white/10 text-brand-300 ring-1 ring-inset ring-white/15 backdrop-blur-sm"
                >
                  <i className={`fas ${h.icon} text-sm`} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{h.title}</p>
                  <p className="text-[13px] text-white/50 mt-0.5 leading-relaxed">{h.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] text-white/35">
          © {new Date().getFullYear()} {companyName}. Seluruh hak cipta dilindungi.
        </p>
      </div>

      {/* ===================== PANEL KANAN — FORM MASUK ===================== */}
      <div className="relative flex items-center justify-center px-4 py-12 sm:px-8 bg-ink-50 lg:bg-white dot-grid lg:bg-none">
        <div className="w-full max-w-[380px]">
          {/* Logo versi terang, hanya untuk layar sempit (panel kiri tersembunyi) */}
          <div className="lg:hidden flex justify-center mb-8">
            <BrandLogo
              variant="light"
              className="h-11 w-auto object-contain"
              fallbackClassName="h-11 w-11 text-lg"
            />
          </div>

          <div className="bg-white rounded-2xl border border-ink-200/70 shadow-card p-7 lg:border-0 lg:shadow-none lg:p-0">
            <div className="mb-7">
              <p className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-600 mb-3">
                {appName}
              </p>
              <div className="flex items-start gap-3">
                <span
                  className="mt-1 h-6 w-1 shrink-0 rounded-full bg-gradient-to-b from-brand-500 to-info-500"
                  aria-hidden="true"
                />
                <div>
                  <h1 className="text-2xl font-bold text-ink-900 tracking-tight">Selamat datang kembali</h1>
                  <p className="text-sm text-ink-500 mt-2">
                    Masuk dengan akun yang diberikan administrator.
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <TextField
                label="Nama Pengguna atau Surel"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                required
                autoFocus
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
                autoComplete="current-password"
                placeholder="••••••••"
              />

              <FormError>{error}</FormError>

              <Button type="submit" size="lg" block loading={loading} className="mt-2">
                {loading ? 'Memproses…' : 'Masuk'}
                {!loading && <i className="fas fa-arrow-right text-xs" aria-hidden="true" />}
              </Button>
            </form>

            <p className="text-xs text-ink-400 mt-6 leading-relaxed text-center">
              Lupa kata sandi? Hubungi administrator sistem untuk mengatur ulang.
            </p>
          </div>

          <p className="lg:hidden text-center text-[11px] text-ink-400 mt-8">
            © {new Date().getFullYear()} {companyName}.
          </p>
        </div>
      </div>
    </div>
  );
}
