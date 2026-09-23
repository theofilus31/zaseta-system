import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import Button, { SegmentedControl } from '../components/ui/Button.jsx';
import PricingCards from '../components/PricingCards.jsx';
import { TextField, TextareaField, FormError } from '../components/ui/Form.jsx';
import axiosClient from '../api/axiosClient.js';
import { useNotification } from '../context/NotificationContext.jsx';
import { PRODUCT_NAME, PRODUCT_TAGLINE, PRODUCT_SLOGAN, PRODUCT_ICON_URL } from '../constants/brand.js';

/**
 * ============================================================================
 *  LANDING PAGE — HALAMAN PEMASARAN PUBLIK (Fase 3 SaaS)
 * ============================================================================
 *  Berbeda dari halaman Masuk/Daftar dan seluruh halaman internal lain, di
 *  sini SENGAJA TIDAK memakai BrandingContext/BrandLogo — keduanya menarik
 *  merek satu TENANT tertentu (nama & logo satu perusahaan pelanggan, lihat
 *  publicController.resolvePublicTenantId), yang salah kalau ditampilkan di
 *  halaman pemasaran PRODUKNYA sendiri. Identitas produk di sini ("ZASETA")
 *  ditulis tetap di kode, terpisah dari identitas tenant mana pun.
 *
 *  Rebrand ZASETA (2026-08-24) — sumber: ZASETA_Logo_Guideline.pdf yang
 *  dikirim pengguna. Aset logo (ikon Z+Shield+Padlock, lockup penuh) ada di
 *  public/brand/. Warna PERSIS dari PDF §3 "Filosofi Warna":
 *    - Primary Green #1C6433 — SAMA PERSIS dengan brand-700 yang sudah ada
 *      di tailwind.config.js (warisan logo RMS) — kebetulan yang menguntungkan,
 *      jadi tombol/CTA/heading tetap pakai token brand-* yang sudah ada, TIDAK
 *      perlu token baru untuk warna utama.
 *    - Accent Green #7BCB2B — BARU, dipakai TERBATAS (persis pesan PDF-nya:
 *      "digunakan secara terbatas") sebagai glow/pulse dekoratif saja (lihat
 *      animasi lock-pulse di tailwind.config.js) — BUKAN warna teks/latar
 *      solid: kontras putih-di-atas-lime ~2:1, gagal WCAG AA (butuh 4.5:1
 *      teks / 3:1 grafis) kalau dipakai untuk badge/teks sungguhan.
 *    - Neutral Charcoal #3E4440 — BARU, dipakai sesekali untuk label kecil
 *      bergaya "ASSET MANAGEMENT SYSTEM" di logo asli (kontras terhadap putih
 *      aman, >10:1) — bukan pengganti skala ink-* yang sudah dipakai di
 *      seluruh aplikasi.
 *  Ornamen gembok (padlock) di dalam shield logo dijadikan motif motion di
 *  mockup dasbor hero (lihat DashboardMockup) — animasi lock-snap/lock-pulse
 *  di tailwind.config.js, dibangun dengan CSS/Tailwind biasa (bukan paket
 *  Framer Motion baru) supaya konsisten dengan animasi reveal-on-scroll yang
 *  sudah ada di halaman ini, tanpa menambah dependency.
 * ============================================================================
 */

const TONE_STYLES = {
  brand: 'bg-brand-50 text-brand-700',
  info: 'bg-info-50 text-info-700',
  accent: 'bg-accent-50 text-accent-700',
  warning: 'bg-warning-50 text-warning-700',
};

const FEATURES = [
  {
    icon: 'fa-qrcode',
    tone: 'brand',
    title: 'Lacak lewat Kode QR',
    text: 'Tempel label di tiap aset. Cukup pindai untuk melihat detail lengkapnya, bahkan tanpa perlu masuk aplikasi.',
  },
  {
    icon: 'fa-sitemap',
    tone: 'info',
    title: 'Kode aset tersusun otomatis',
    text: 'Kode unik tiap aset tersusun sendiri dari lokasi, sub lokasi, dan kode barang — tidak perlu diketik manual.',
  },
  {
    icon: 'fa-right-left',
    tone: 'accent',
    title: 'Serah terima & permintaan aset',
    text: 'Catat siapa memegang apa, proses permintaan aset karyawan, lengkap dengan berita acara serah terima.',
  },
  {
    icon: 'fa-clipboard-check',
    tone: 'warning',
    title: 'Stok opname digital',
    text: 'Pemeriksaan fisik aset dan barang habis pakai, beserta laporan selisihnya, tanpa kertas.',
  },
  {
    icon: 'fa-user-shield',
    tone: 'brand',
    title: 'Hak akses per pengguna',
    text: 'Atur sendiri siapa boleh melihat, menambah, mengubah, atau menghapus data di tiap menu.',
  },
  {
    icon: 'fa-clock-rotate-left',
    tone: 'info',
    title: 'Riwayat & audit lengkap',
    text: 'Setiap perubahan status, lokasi, dan data aset tercatat — mudah ditelusuri kapan pun dibutuhkan.',
  },
  {
    icon: 'fa-chart-line',
    tone: 'accent',
    title: 'Laporan penyusutan',
    text: 'Nilai buku dan penyusutan tiap aset dihitung otomatis, siap dipakai untuk laporan keuangan.',
  },
  {
    icon: 'fa-robot',
    tone: 'warning',
    title: 'Zecode, asisten panduan',
    text: 'Bingung cara memakai sebuah fitur? Tanya Zecode lewat obrolan — jawabannya langsung muncul, tanpa perlu membuka manual.',
  },
];

const STEPS = [
  {
    number: '1',
    title: 'Daftar & buat ruang kerja',
    text: 'Isi nama perusahaan dan buat akun administrator pertama Anda — langsung aktif, tanpa kartu kredit.',
  },
  {
    number: '2',
    title: 'Atur lokasi & kategori aset',
    text: 'Susun lokasi, sub lokasi, dan kode barang sesuai struktur perusahaan Anda sendiri.',
  },
  {
    number: '3',
    title: 'Kelola dari satu tempat',
    text: 'Tambah aset, cetak label QR, dan pantau semuanya — tim Anda ikut diundang sesuai hak aksesnya masing-masing.',
  },
];

const TRUST_ITEMS = [
  { icon: 'fa-building-shield', text: 'Data tiap perusahaan terisolasi penuh' },
  { icon: 'fa-user-shield', text: 'Hak akses granular per pengguna' },
  { icon: 'fa-clock-rotate-left', text: 'Jejak audit tercatat otomatis' },
  { icon: 'fa-shield-halved', text: 'Login & OTP dilindungi rate-limit' },
];

/** Animasi reveal-saat-scroll ringan, menghormati prefers-reduced-motion. */
function useRevealed() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
      setVisible(true);
      return undefined;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.unobserve(el);
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return [ref, visible];
}

function Reveal({ children, index = 0, className = '' }) {
  const [ref, visible] = useRevealed();
  return (
    <div
      ref={ref}
      className={`transition-all duration-500 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3.5'} ${className}`}
      style={{ transitionDelay: `${index * 70}ms` }}
    >
      {children}
    </div>
  );
}

/**
 * Dipakai LandingPage MAUPUN PricingPage (../pages/PricingPage.jsx) — satu-
 * satunya tempat markup header/footer publik didefinisikan, supaya kedua
 * halaman pemasaran ini tidak diam-diam melenceng satu sama lain.
 */
export function NavBar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={[
        'sticky top-0 z-30 border-b border-ink-200/70 bg-white/85 backdrop-blur-sm transition-shadow duration-200',
        scrolled ? 'shadow-[0_1px_2px_rgba(11,17,28,.05),0_6px_14px_-10px_rgba(11,17,28,.10)]' : '',
      ].join(' ')}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/brand/zaseta-icon.png" alt="" className="h-9 w-9 object-contain" aria-hidden="true" />
          <span className="leading-tight">
            <span className="block text-lg font-black tracking-tight text-ink-900">{PRODUCT_NAME}</span>
            <span className="hidden text-[10px] font-bold uppercase tracking-[0.14em] text-[#3E4440]/70 sm:block">
              {PRODUCT_TAGLINE}
            </span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link to="/harga" className="hidden sm:inline-flex items-center px-3 py-2 text-[13.5px] font-medium text-ink-600 hover:text-ink-900 transition-colors">
            Harga
          </Link>
          <Button to="/login" variant="ghost" size="sm">Masuk</Button>
          <Button to="/signup" variant="primary" size="sm">Daftar Gratis</Button>
        </nav>
      </div>
    </header>
  );
}

/** Mockup dasbor aset di sisi kanan hero, lengkap dengan 3 chip melayang. */
function DashboardMockup() {
  /* Chip "X perusahaan bergabung" — SATU-SATUNYA angka nyata di antara
     chip-chip mockup ini (sisanya, termasuk seisi "Dasbor Aset" di bawah,
     memang data ilustrasi tetap). Diam-diam disembunyikan kalau gagal
     dimuat (mis. API sedang turun) daripada menampilkan 0 yang menyesatkan
     atau merusak tampilan hero dengan galat. */
  const [tenantCount, setTenantCount] = useState(null);
  useEffect(() => {
    axiosClient.get('/public/tenant-count')
      .then((res) => setTenantCount(res.data.count))
      .catch(() => {});
  }, []);

  return (
    <div className="relative mx-auto max-w-md lg:max-w-none">
      <div className="rounded-[20px] border border-ink-200/80 bg-white p-5 shadow-overlay">
        <div className="mb-4 flex items-center justify-between gap-2.5">
          <span className="truncate text-xs font-bold text-ink-700">Dasbor Aset — PT Contoh Sejahtera</span>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700">
            <i className="fas fa-check text-[9px]" aria-hidden="true" />
            Tersinkron
          </span>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2.5">
          <div className="relative overflow-hidden rounded-2xl border border-ink-200 p-3">
            <span className="absolute inset-x-0 top-0 h-0.5 bg-brand-500 opacity-55" aria-hidden="true" />
            <p className="text-[10px] font-bold text-ink-500">Total Aset</p>
            <p className="mt-1 text-[19px] font-black text-ink-900">482</p>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-ink-200 p-3">
            <span className="absolute inset-x-0 top-0 h-0.5 bg-info-500 opacity-55" aria-hidden="true" />
            <p className="text-[10px] font-bold text-ink-500">Dipakai</p>
            <p className="mt-1 text-[19px] font-black text-ink-900">311</p>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-ink-200 p-3">
            <span className="absolute inset-x-0 top-0 h-0.5 bg-warning-500 opacity-55" aria-hidden="true" />
            <p className="text-[10px] font-bold text-ink-500">Perlu Ditindak</p>
            <p className="mt-1 text-[19px] font-black text-ink-900">14</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-ink-200">
          {[
            { name: 'Laptop Dell Latitude 5420', status: 'Dipakai', tone: 'info' },
            { name: 'Kamera CCTV Lobi Utama', status: 'Menganggur', tone: 'brand' },
            { name: 'Proyektor Epson EB-X06', status: 'Dipindahkan', tone: 'accent' },
          ].map((row, i, arr) => (
            <div
              key={row.name}
              className={`flex items-center justify-between gap-2.5 px-3 py-2.5 text-xs ${i < arr.length - 1 ? 'border-b border-ink-100' : ''}`}
            >
              <span className="flex min-w-0 items-center gap-2 font-bold text-ink-700">
                <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                  <i className="fas fa-boxes-stacked text-[11px]" aria-hidden="true" />
                </span>
                <span className="truncate">{row.name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold ${TONE_STYLES[row.tone]}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${row.tone === 'info' ? 'bg-info-500' : row.tone === 'accent' ? 'bg-accent-500' : 'bg-brand-500'}`} />
                  {row.status}
                </span>
                {/* Ornamen gembok ZASETA — tiap aset "dikunci" begitu masuk layar,
                    menerjemahkan ikon padlock di logo jadi motion nyata di sini
                    (lihat catatan rebrand di kepala berkas). */}
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-700 text-white motion-safe:animate-lock-snap"
                  style={{ animationDelay: `${300 + i * 180}ms` }}
                  title="Data aset terkunci & tercatat"
                >
                  <i className="fas fa-lock text-[9px]" aria-hidden="true" />
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* chip 1 — pemindaian QR */}
      <div className="absolute -top-8 -left-2 flex items-center gap-2 whitespace-nowrap rounded-2xl border border-ink-200 bg-white px-3 py-2 text-[11px] font-bold text-ink-800 shadow-card-hover sm:-top-11 sm:-left-8 sm:px-3.5 sm:py-2.5 sm:text-xs">
        <span className="flex h-6 w-6 items-center justify-center rounded-[9px] bg-brand-500 text-white sm:h-7 sm:w-7">
          <i className="fas fa-check text-[11px]" aria-hidden="true" />
        </span>
        Kode QR terpindai
      </div>

      {/* chip 2 — pengingat */}
      <div className="absolute -bottom-8 -right-2 flex items-center gap-2 whitespace-nowrap rounded-2xl border border-ink-200 bg-white px-3 py-2 text-[11px] font-bold text-ink-800 shadow-card-hover sm:-bottom-11 sm:-right-8 sm:px-3.5 sm:py-2.5 sm:text-xs">
        <span className="flex h-6 w-6 items-center justify-center rounded-[9px] bg-warning-500 text-white sm:h-7 sm:w-7">
          <i className="fas fa-bell text-[11px]" aria-hidden="true" />
        </span>
        3 pengingat aktif
      </div>

      {/* chip 3 — bukti sosial (jumlah perusahaan terdaftar), sengaja dibuat
          paling menonjol (glow) -- SATU-SATUNYA chip berisi angka nyata,
          lihat fetch tenantCount di atas. Disembunyikan sampai angkanya
          datang, supaya tidak sempat menampilkan angka kosong/salah. */}
      {tenantCount !== null && (
        <div className="absolute -top-9 -right-2 flex items-center gap-2 whitespace-nowrap rounded-2xl border border-brand-500/40 bg-brand-50 px-3 py-2 shadow-[0_14px_30px_-12px_rgba(35,125,63,.35),0_0_0_1px_rgba(47,156,79,.08)] motion-safe:animate-chip-glow sm:-top-12 sm:-right-8 sm:px-3.5 sm:py-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-brand-600 text-white sm:h-[30px] sm:w-[30px]">
            <i className="fas fa-building text-xs" aria-hidden="true" />
          </span>
          <span className="text-[11px] font-extrabold text-ink-800 sm:text-[13px]">
            <b className="font-black text-brand-600">{tenantCount}</b> perusahaan bergabung
          </span>
        </div>
      )}

      <HeroLockCluster />
    </div>
  );
}

const ORBIT_ASSETS = [
  { icon: 'fa-laptop', bg: 'bg-info-600', left: -96, top: -78, float: 2.6 },
  { icon: 'fa-video', bg: 'bg-accent-600', left: -108, top: 2, float: 3.1 },
  { icon: 'fa-box', bg: 'bg-warning-600', left: -66, top: 66, float: 2.9 },
];

/**
 * Klaster ilustrasi bermotion di pojok kiri-bawah mockup — satu-satunya sudut
 * yang masih kosong (3 chip lain sudah memakai 3 sudut yang lain, lihat
 * komentar di atas). Menerjemahkan ornamen "Z + Shield + Padlock" ZASETA jadi
 * gerakan nyata: logo mengambang, gembok yang "terkunci" dengan pantulan pegas
 * (fa-lock-open → fa-lock, bukan geometri SVG kustom — jauh lebih tahan
 * banting lintas peramban daripada memutar path di sekitar titik pivot
 * sembarang), dan ikon-ikon aset (laptop/kamera/kotak) yang melayang pelan di
 * sekelilingnya. Dibangun dengan framer-motion (bukan skill /framer — itu
 * untuk situs Framer.com sungguhan, tidak berlaku di sini, lihat catatan
 * rebrand di kepala berkas).
 */
function HeroLockCluster() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="pointer-events-none absolute -bottom-2 left-0 h-0 w-0 sm:-bottom-6 sm:-left-6" aria-hidden="true">
      {/* cahaya ambien lembut di belakang klaster */}
      <div
        className="absolute rounded-full bg-gradient-to-br from-brand-300/35 to-[#7BCB2B]/25 blur-2xl"
        style={{ left: -110, top: -110, width: 220, height: 220 }}
      />

      {/* ikon aset melayang */}
      {ORBIT_ASSETS.map((a, i) => (
        <motion.span
          key={a.icon}
          className={`absolute hidden h-8 w-8 items-center justify-center rounded-xl text-white shadow-lg lg:flex lg:h-9 lg:w-9 ${a.bg}`}
          style={{ left: a.left, top: a.top }}
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.3 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 + i * 0.15, type: 'spring', stiffness: 220, damping: 15 }}
        >
          <motion.i
            className={`fas ${a.icon} text-xs`}
            aria-hidden="true"
            animate={shouldReduceMotion ? {} : { y: [0, -5, 0] }}
            transition={{ duration: a.float, repeat: Infinity, ease: 'easeInOut', delay: 1 + i * 0.3 }}
          />
        </motion.span>
      ))}

      {/* lencana logo ZASETA, mengambang pelan.
          PENTING: pembungkus ini WAJIB punya ukuran eksplisit (h-9 w-9 ...) —
          lubang render sesungguhnya (ketahuan lewat getBoundingClientRect
          saat verifikasi mobile, bukan soal animasi/framer-motion sama
          sekali): tanpa ukuran eksplisit, div ini "auto"-width (shrink-to-fit,
          wajar untuk position:absolute tanpa width), sementara reset bawaan
          Tailwind memberi <img> itu sendiri `max-width:100%` — 100% dari
          kontainer yang lebarnya masih dihitung "auto" beresolusi ke 0,
          gambarnya ke-render 0px lebar. Begitu wrapper diberi lebar pasti,
          masalahnya hilang total. */}
      <motion.div
        className="absolute left-0 -top-12 h-9 w-9 sm:-left-[18px] sm:-top-[104px] sm:h-10 sm:w-10"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.35 }}
      >
        <motion.img
          src="/brand/zaseta-icon.png"
          alt=""
          className="h-9 w-9 object-contain drop-shadow-lg sm:h-10 sm:w-10"
          animate={{ y: shouldReduceMotion ? 0 : [0, -7, 0], rotate: shouldReduceMotion ? 0 : [0, -4, 4, 0] }}
          transition={{ duration: shouldReduceMotion ? 0 : 5, repeat: shouldReduceMotion ? 0 : Infinity, ease: 'easeInOut', delay: 1 }}
        />
      </motion.div>

      {/* gembok pusat — "terkunci" dengan pantulan pegas begitu hero termuat */}
      <motion.div
        className="absolute -left-2 -top-2 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-overlay ring-4 ring-white sm:-left-[34px] sm:-top-[34px] sm:h-16 sm:w-16"
        initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.2 }}
      >
        <span className="relative flex h-7 w-7 items-center justify-center sm:h-8 sm:w-8">
          <motion.i
            className="fas fa-lock-open absolute inset-0 flex items-center justify-center text-2xl text-brand-700"
            aria-hidden="true"
            initial={shouldReduceMotion ? false : { opacity: 1, scale: 1 }}
            animate={{ opacity: 0, scale: 0.7 }}
            transition={{ delay: 0.55, duration: 0.2 }}
          />
          <motion.i
            className="fas fa-lock absolute inset-0 flex items-center justify-center text-2xl text-brand-700"
            aria-hidden="true"
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.6, rotate: -18 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ delay: 0.6, type: 'spring', stiffness: 300, damping: 12 }}
          />
        </span>
        <motion.span
          className="absolute inset-0 rounded-full border-2 border-brand-500/50"
          animate={shouldReduceMotion ? {} : { scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut', delay: 1.1 }}
        />
      </motion.div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="absolute inset-0 -z-10"
        style={{ background: 'linear-gradient(180deg, #f4faf6 0%, #ffffff 55%)' }}
        aria-hidden="true"
      />
      <div
        className="absolute -top-24 right-[-8%] -z-10 h-96 w-96 rounded-full bg-brand-200/45 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-32 left-[-6%] -z-10 h-80 w-80 rounded-full bg-info-200/40 blur-3xl"
        aria-hidden="true"
      />
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
        <div className="text-center lg:text-left">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-[12px] font-bold uppercase tracking-wider text-brand-700">
            <i className="fas fa-shield-halved text-[10px]" aria-hidden="true" />
            {PRODUCT_NAME} — {PRODUCT_TAGLINE}
          </p>
          <h1 className="mx-auto mt-5 max-w-3xl text-[34px] leading-[1.15] font-black tracking-tight text-ink-900 sm:text-5xl sm:leading-[1.1] lg:mx-0">
            Aset perusahaan Anda,
            <br />
            <span className="text-brand-600">{PRODUCT_SLOGAN.toLowerCase()}.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-ink-500 sm:text-base lg:mx-0">
            Dari pembelian sampai penghapusan — kelola aset, serah terima, stok barang habis pakai, dan
            permintaan karyawan dari satu tempat. Ruang kerja sendiri untuk perusahaan Anda, terkunci rapat
            dan siap dipakai dalam hitungan menit.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            <Button to="/signup" size="lg">
              Daftar Gratis
              <i className="fas fa-arrow-right text-xs" aria-hidden="true" />
            </Button>
            <Button href="#fitur" variant="secondary" size="lg">
              Lihat Fitur
            </Button>
          </div>
          <div className="mt-5 flex flex-col items-center gap-2 sm:flex-row sm:justify-center lg:justify-start">
            <p className="flex items-center gap-1.5 text-xs text-ink-400">
              <i className="fas fa-check text-brand-500" aria-hidden="true" />
              Gratis dicoba. Tanpa kartu kredit.
            </p>
            <span className="hidden h-3 w-px bg-ink-200 sm:block" aria-hidden="true" />
            <p className="flex items-center gap-1.5 text-xs text-ink-400">
              <span className="relative flex h-4 w-4 items-center justify-center rounded-full bg-brand-700 text-white motion-safe:animate-lock-pulse">
                <i className="fas fa-lock text-[7px]" aria-hidden="true" />
              </span>
              Data terkunci — hanya tim Anda yang bisa mengakses.
            </p>
          </div>
        </div>

        <DashboardMockup />
      </div>
    </section>
  );
}

function TrustStrip() {
  return (
    <section className="border-y border-ink-200/70 bg-ink-50">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 px-4 py-7 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        {TRUST_ITEMS.map((item, i) => (
          <Reveal key={item.text} index={i} className="flex items-center gap-2.5 text-[13px] font-bold text-ink-700">
            <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-info-50 text-info-700">
              <i className={`fas ${item.icon} text-[13px]`} aria-hidden="true" />
            </span>
            {item.text}
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="fitur" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-600">Fitur</p>
        <h2 className="text-2xl font-black tracking-tight text-ink-900 sm:text-[32px]">
          Semua yang dibutuhkan tim aset Anda
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-500 sm:text-base">
          Dibangun untuk pekerjaan sehari-hari tim IT dan GA — bukan sekadar daftar Excel yang dipindah ke web.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} index={i}>
            <div className="h-full rounded-2xl border border-ink-200/70 bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-[3px] hover:border-ink-300/60 hover:shadow-card-hover">
              <span className={`flex h-[42px] w-[42px] items-center justify-center rounded-xl ${TONE_STYLES[f.tone]}`}>
                <i className={`fas ${f.icon} text-base`} aria-hidden="true" />
              </span>
              <p className="mt-4 text-[14.5px] font-bold text-ink-900">{f.title}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">{f.text}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="bg-ink-50 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-600">Cara Kerja</p>
          <h2 className="text-2xl font-black tracking-tight text-ink-900 sm:text-[32px]">
            Mulai dalam tiga langkah
          </h2>
        </div>

        <div className="relative mt-12 grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div
            className="absolute top-5 right-[16.6%] left-[16.6%] hidden h-px sm:block"
            style={{ backgroundImage: 'repeating-linear-gradient(to right, #cbd5e1 0 6px, transparent 6px 12px)' }}
            aria-hidden="true"
          />
          {STEPS.map((s, i) => (
            <Reveal key={s.number} index={i} className="relative text-center sm:text-left">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-700 text-sm font-black text-white">
                {s.number}
              </span>
              <p className="mt-4 text-base font-bold text-ink-900">{s.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{s.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Kartu paketnya sendiri (fetch + tampilan) ada di komponen bersama
 *  ../components/PricingCards.jsx — dipakai sama persis oleh halaman
 *  /harga (PricingPage.jsx) supaya harga di sini tidak pernah menyimpang. */
function Pricing() {
  return (
    <section id="harga" className="scroll-mt-20 py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-600">Harga</p>
          <h2 className="text-2xl font-black tracking-tight text-ink-900 sm:text-[32px]">
            Paket yang tumbuh bersama aset Anda
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-500 sm:text-base">
            Mulai gratis, upgrade kapan saja lewat menu Langganan begitu tim atau daftar aset Anda bertambah besar.
          </p>
        </div>

        <PricingCards className="mt-12" />
      </div>
    </section>
  );
}

function CtaBanner() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <Reveal>
        <div
          className="relative overflow-hidden rounded-3xl px-6 py-14 text-center sm:px-16"
          style={{ background: 'linear-gradient(165deg, #0a2814 0%, #0d1a12 46%, #0b111c 100%)' }}
        >
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '26px 26px' }}
            aria-hidden="true"
          />
          <h2 className="relative text-2xl font-black tracking-tight text-white sm:text-[32px]">
            Siap kelola aset dengan {PRODUCT_NAME}?
          </h2>
          <p className="relative mx-auto mt-3 max-w-md text-sm text-white/60 sm:text-base">
            Buat ruang kerja perusahaan Anda sendiri — gratis dicoba, siap dipakai hari ini juga.
          </p>
          <div className="relative mt-8">
            <Button to="/signup" size="lg">
              Daftar Gratis Sekarang
              <i className="fas fa-arrow-right text-xs" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

const CONTACT_CATEGORIES = [
  { value: 'saran', label: 'Saran & Kritik' },
  { value: 'kerjasama', label: 'Ajak Kerja Sama' },
  { value: 'lainnya', label: 'Lainnya' },
];

/**
 * Form "Hubungi Kami" — saran/kritik untuk pengembangan produk, atau ajakan
 * kerja sama bisnis. Dikirim ke POST /api/public/contact (publik, tanpa
 * auth) yang meneruskannya lewat surel ke admin platform (lihat
 * publicController.submitContact & utils/mailer.sendContactMessage di
 * backend) — TIDAK disimpan ke database mana pun, murni surel.
 *
 * `website` adalah honeypot anti-bot: field tersembunyi yang manusia tidak
 * akan pernah isi, sama seperti PublicRequestPage.jsx.
 */
function Contact() {
  const { pushSuccess } = useNotification();
  const [form, setForm] = useState({ name: '', email: '', category: 'saran', message: '', website: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      await axiosClient.post('/public/contact', form);
      setSent(true);
      pushSuccess('Pesan terkirim. Terima kasih!');
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengirim pesan. Coba lagi.');
    } finally {
      setSending(false);
    }
  }

  return (
    <section id="kontak" className="scroll-mt-20 mx-auto max-w-2xl px-4 py-20 sm:px-6">
      <div className="text-center mb-10">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-600">Hubungi Kami</p>
        <h2 className="text-2xl font-black tracking-tight text-ink-900 sm:text-[32px]">
          Punya saran, kritik, atau ide kerja sama?
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-500 sm:text-base">
          Kirim pesan langsung ke kami — untuk masukan pengembangan produk, atau ajakan kerja sama bisnis.
        </p>
      </div>

      <div className="rounded-2xl border border-ink-200/70 bg-white p-6 shadow-card sm:p-8">
        {sent ? (
          <div className="py-8 text-center">
            <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <i className="fas fa-check text-xl" aria-hidden="true" />
            </span>
            <p className="text-[15px] font-bold text-ink-900">Pesan terkirim</p>
            <p className="mt-1.5 text-sm text-ink-500">Terima kasih — kami akan membalas ke surel Anda secepatnya.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                label="Nama" name="name" required
                value={form.name} onChange={handleChange}
                placeholder="Nama Anda"
              />
              <TextField
                label="Surel" name="email" type="email" required
                value={form.email} onChange={handleChange}
                placeholder="nama@perusahaan.com"
              />
            </div>

            <div>
              <label className="label">Perihal</label>
              <SegmentedControl
                options={CONTACT_CATEGORIES}
                value={form.category}
                onChange={(value) => setForm((f) => ({ ...f, category: value }))}
              />
            </div>

            <TextareaField
              label="Pesan" name="message" required rows={4}
              value={form.message} onChange={handleChange}
              placeholder="Tulis saran, kritik, atau penawaran kerja sama Anda di sini..."
            />

            {/* Honeypot — tersembunyi dari manusia, bot pengisi form otomatis biasanya mengisi semua field. */}
            <input
              type="text" name="website" value={form.website} onChange={handleChange}
              tabIndex="-1" autoComplete="off" className="hidden" aria-hidden="true"
            />

            <FormError>{error}</FormError>

            <Button type="submit" loading={sending} block>
              {sending ? 'Mengirim…' : 'Kirim Pesan'}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-ink-200/70">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
        <div className="flex items-center gap-2">
          <img src="/brand/zaseta-icon.png" alt="" className="h-7 w-7 object-contain" aria-hidden="true" />
          <span className="text-sm font-bold text-ink-800">{PRODUCT_NAME}</span>
        </div>
        <p className="text-xs text-ink-400">© {new Date().getFullYear()} {PRODUCT_NAME}. Seluruh hak cipta dilindungi.</p>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-ink-500">
          <Link to="/harga" className="hover:text-ink-800">Harga</Link>
          <Link to="/login" className="hover:text-ink-800">Masuk</Link>
          <Link to="/signup" className="hover:text-ink-800">Daftar</Link>
          <Link to="/kebijakan-privasi" className="hover:text-ink-800">Kebijakan Privasi</Link>
          <Link to="/syarat-ketentuan" className="hover:text-ink-800">Syarat &amp; Ketentuan</Link>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-white">
      <NavBar />
      <Hero />
      <TrustStrip />
      <Features />
      <HowItWorks />
      <Pricing />
      <CtaBanner />
      <Contact />
      <Footer />
    </div>
  );
}
