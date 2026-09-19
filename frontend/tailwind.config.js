/** @type {import('tailwindcss').Config} */

/**
 * ============================================================================
 *  DESIGN TOKEN — IT ASSET INVENTORY (PT RUKUN MITRA SEJATI)
 * ============================================================================
 *  Palet diturunkan langsung dari logo RMS: hijau (daun kanan), biru (daun
 *  kiri), dan kuning (titik) — sejak redesign "Registry", nada 500-900 tiap
 *  warna diperdalam/diredupkan (lebih ke arah forest/terracotta/emas/plum)
 *  supaya terasa lebih elegan, bukan candy-bright. Hijau tetap jadi warna
 *  aksi utama; biru & kuning dipakai konsisten untuk status dan penekanan
 *  sekunder — tidak pernah untuk tombol aksi utama, supaya hierarki tetap
 *  terbaca.
 *
 *  Aturan pakai singkat:
 *  - brand   → aksi utama, item navigasi aktif, status "Menganggur/tersedia"
 *  - info    → informasi netral, status "Dipakai", tautan sekunder
 *  - warning → butuh perhatian, status "Dijual", kondisi Rusak Ringan
 *  - danger  → aksi destruktif, kondisi Rusak Berat
 *  - accent  → status "Dipindahkan" (ungu, sengaja di luar warna logo agar
 *              langsung terbaca sebagai kondisi transisi)
 *  - ink     → SELURUH teks, garis, dan permukaan netral.
 *              Jangan pakai gray-* bawaan Tailwind lagi di kode baru.
 * ============================================================================
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Lato', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },

      colors: {
        // ===== HIJAU RMS — warna aksi utama (diperdalam untuk kesan lebih premium) =====
        brand: {
          50: '#f0f9f0',
          100: '#ddf3dd',
          200: '#bde7be',
          300: '#8fd591',
          400: '#54b95d',
          500: '#2f9c4f', // hijau utama, diturunkan dari logo tapi lebih dalam
          600: '#237d3f',
          700: '#1c6433',
          800: '#164f29',
          900: '#0f3b1e',
          950: '#0a2814',
        },

        // ===== BIRU RMS — informasi & status "Dipakai" (diperdalam) =====
        info: {
          50: '#eef7fc',
          100: '#d9ecf7',
          200: '#b9dcf1',
          300: '#8cc4e6',
          400: '#4a90c4',
          500: '#2f6fa8', // biru sekunder, diturunkan dari logo tapi lebih dalam
          600: '#255d8d',
          700: '#1d4b71',
          800: '#173d5c',
          900: '#12314a',
        },

        // ===== KUNING/ORANYE RMS — perhatian & status "Dijual" (lebih ke arah emas) =====
        warning: {
          50: '#fffaf0',
          100: '#fbeecd',
          200: '#f6dda0',
          300: '#eec873',
          400: '#dfa843',
          500: '#c98a1a', // emas hangat, menggantikan oranye terang
          600: '#a9700f',
          700: '#875a0c',
          800: '#6d480a',
          900: '#593b08',
        },

        // ===== MERAH — aksi destruktif & kondisi rusak berat (terakota, tidak candy-bright) =====
        danger: {
          50: '#fdf2f0',
          100: '#f8ddd7',
          200: '#f0c1b7',
          300: '#e39d8d',
          400: '#d06c56',
          500: '#c0432f',
          600: '#a13624',
          700: '#832c1d',
          800: '#6a2418',
          900: '#571f14',
        },

        // ===== UNGU — status "Dipindahkan" (plum senyap, bukan ungu terang) =====
        accent: {
          50: '#f7f2fb',
          100: '#ecdff5',
          200: '#dabdea',
          300: '#c194da',
          400: '#a86dc5',
          500: '#8b4fb0',
          600: '#723e91',
          700: '#5b3173',
          800: '#48275c',
          900: '#3a1f4a',
        },

        /* ===== NETRAL ("ink") =====
           Skala slate yang sedikit dipertajam. Semua teks, garis, dan
           permukaan abu-abu di aplikasi ini mengambil warna dari sini. */
        ink: {
          50: '#f8fafc',  // kanvas halaman
          100: '#f1f5f9', // permukaan tenggelam (header tabel, input)
          200: '#e2e8f0', // garis/pembatas
          300: '#cbd5e1', // garis input, ikon nonaktif
          400: '#94a3b8', // teks placeholder & keterangan
          500: '#64748b', // teks sekunder
          600: '#475569', // teks isi
          700: '#334155', // teks penekanan
          800: '#1c2534', // judul — sedikit lebih dalam dari slate biasa
          900: '#0b111c', // judul tertinggi / overlay
        },

        /* ===== TOKEN SHADCN/UI (awalan sc-) =====
           Dipakai HANYA oleh components/ui/*.tsx baru (card.tsx, button.tsx,
           badge.tsx, avatar.tsx, line-charts-9.tsx). Diberi awalan `sc-`
           supaya TIDAK menimpa `accent` di atas (proyek ini sudah memakai
           nama itu untuk status "Dipindahkan") -- lihat catatan lengkap di
           src/styles/shadcn-theme.css. */
        'sc-background': 'var(--sc-background)',
        'sc-foreground': 'var(--sc-foreground)',
        'sc-card': 'var(--sc-card)',
        'sc-card-foreground': 'var(--sc-card-foreground)',
        'sc-popover': 'var(--sc-popover)',
        'sc-popover-foreground': 'var(--sc-popover-foreground)',
        'sc-primary': 'var(--sc-primary)',
        'sc-primary-foreground': 'var(--sc-primary-foreground)',
        'sc-secondary': 'var(--sc-secondary)',
        'sc-secondary-foreground': 'var(--sc-secondary-foreground)',
        'sc-muted': 'var(--sc-muted)',
        'sc-muted-foreground': 'var(--sc-muted-foreground)',
        'sc-accent': 'var(--sc-accent)',
        'sc-accent-foreground': 'var(--sc-accent-foreground)',
        'sc-destructive': 'var(--sc-destructive)',
        'sc-destructive-foreground': 'var(--sc-destructive-foreground)',
        'sc-border': 'var(--sc-border)',
        'sc-input': 'var(--sc-input)',
        'sc-ring': 'var(--sc-ring)',
      },

      boxShadow: {
        /* Bayangan kartu: dua lapis tipis, meniru cahaya lembut dari atas.
           Sengaja netral (slate), bukan hijau, supaya tidak terlihat "berwarna". */
        card: '0 1px 2px 0 rgb(11 17 28 / 0.04), 0 1px 3px 0 rgb(11 17 28 / 0.06)',
        'card-hover': '0 12px 28px -12px rgb(11 17 28 / 0.18), 0 4px 10px -6px rgb(11 17 28 / 0.08)',
        raised: '0 4px 12px -2px rgb(11 17 28 / 0.08), 0 2px 6px -2px rgb(11 17 28 / 0.05)',
        overlay: '0 24px 48px -12px rgb(11 17 28 / 0.25)',
        /* Bayangan berwarna, khusus elemen brand yang sedang aktif */
        brand: '0 4px 14px -4px rgb(35 125 63 / 0.45)',
        'brand-sm': '0 2px 8px -2px rgb(35 125 63 / 0.35)',
      },

      borderRadius: {
        '4xl': '1.75rem',
      },

      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        /* Indikator "live" di mockup dasbor landing page (lihat LandingPage.jsx) */
        'live-pulse': {
          '0%': { boxShadow: '0 0 0 0 rgb(47 156 79 / 0.5)' },
          '70%': { boxShadow: '0 0 0 9px rgb(47 156 79 / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(47 156 79 / 0)' },
        },
        'chip-glow': {
          '0%, 100%': { boxShadow: '0 14px 30px -12px rgb(35 125 63 / 0.35), 0 0 0 1px rgb(47 156 79 / 0.08)' },
          '50%': { boxShadow: '0 16px 34px -10px rgb(35 125 63 / 0.5), 0 0 0 4px rgb(47 156 79 / 0.16)' },
        },
        'badge-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '.35' },
        },
        /* Ornamen gembok ZASETA (lihat LandingPage.jsx) — ikon "mengunci"
           saat masuk ke layar (lock-snap), lalu berdenyut pelan di warna
           aksen lime brand (lock-pulse, #7BCB2B — "Accent Green" pada
           panduan logo ZASETA). */
        'lock-snap': {
          '0%': { transform: 'scale(0.4) rotate(-25deg)', opacity: '0' },
          '55%': { transform: 'scale(1.15) rotate(8deg)', opacity: '1' },
          '80%': { transform: 'scale(0.95) rotate(-3deg)' },
          '100%': { transform: 'scale(1) rotate(0deg)' },
        },
        'lock-pulse': {
          '0%': { boxShadow: '0 0 0 0 rgb(123 203 43 / 0.55)' },
          '70%': { boxShadow: '0 0 0 8px rgb(123 203 43 / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(123 203 43 / 0)' },
        },
        /* Tinggi konten Accordion (ui/Accordion.jsx) diukur otomatis oleh
           Radix lewat custom property --radix-accordion-content-height. */
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },

      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-down': 'slide-down 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slide-up 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scale-in 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        'live-pulse': 'live-pulse 2s ease-out infinite',
        'chip-glow': 'chip-glow 2.2s ease-in-out infinite',
        'badge-pulse': 'badge-pulse 1.3s ease-in-out infinite',
        'lock-snap': 'lock-snap 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'lock-pulse': 'lock-pulse 2.4s ease-out infinite',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [],
};
