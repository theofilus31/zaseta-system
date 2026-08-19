/** @type {import('tailwindcss').Config} */

/**
 * ============================================================================
 *  DESIGN TOKEN — IT ASSET INVENTORY (PT RUKUN MITRA SEJATI)
 * ============================================================================
 *  Palet diturunkan langsung dari logo RMS: hijau (daun kanan), biru (daun
 *  kiri), dan kuning (titik). Hijau tetap jadi warna aksi utama; biru & kuning
 *  dipakai konsisten untuk status dan penekanan sekunder — tidak pernah untuk
 *  tombol aksi utama, supaya hierarki tetap terbaca.
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
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },

      colors: {
        // ===== HIJAU RMS — warna aksi utama =====
        brand: {
          50: '#f0f9f0',
          100: '#ddf3dd',
          200: '#bde7be',
          300: '#93d795',
          400: '#55c556',
          500: '#47b648', // hijau utama (logo)
          600: '#3a9c3b',
          700: '#2d7b2d',
          800: '#256425',
          900: '#1a591a',
        },

        // ===== BIRU RMS — informasi & status "Dipakai" =====
        info: {
          50: '#eef7fc',
          100: '#daedf8',
          200: '#b9dcf1',
          300: '#8cc4e6',
          400: '#4aa1d6',
          500: '#338ccb', // biru sekunder (logo)
          600: '#2875aa',
          700: '#1d5a83',
          800: '#194a6b',
          900: '#153c57',
        },

        // ===== KUNING/ORANYE RMS — perhatian & status "Dijual" =====
        warning: {
          50: '#fffcf0',
          100: '#fef5d6',
          200: '#fdeaad',
          300: '#fdd579',
          400: '#fdb938',
          500: '#fca91c', // kuning/oranye (logo)
          600: '#d68b0e',
          700: '#a86c07',
          800: '#87560a',
          900: '#70470d',
        },

        // ===== MERAH — aksi destruktif & kondisi rusak berat =====
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },

        // ===== UNGU — status "Dipindahkan" =====
        accent: {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7e22ce',
          800: '#6b21a8',
          900: '#581c87',
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
          800: '#1e293b', // judul
          900: '#0f172a', // judul tertinggi / overlay
        },
      },

      boxShadow: {
        /* Bayangan kartu: dua lapis tipis, meniru cahaya lembut dari atas.
           Sengaja netral (slate), bukan hijau, supaya tidak terlihat "berwarna". */
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        'card-hover': '0 12px 28px -12px rgb(15 23 42 / 0.18), 0 4px 10px -6px rgb(15 23 42 / 0.08)',
        raised: '0 4px 12px -2px rgb(15 23 42 / 0.08), 0 2px 6px -2px rgb(15 23 42 / 0.05)',
        overlay: '0 24px 48px -12px rgb(15 23 42 / 0.25)',
        /* Bayangan berwarna, khusus elemen brand yang sedang aktif */
        brand: '0 4px 14px -4px rgb(58 156 59 / 0.45)',
        'brand-sm': '0 2px 8px -2px rgb(58 156 59 / 0.35)',
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
      },

      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-down': 'slide-down 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slide-up 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scale-in 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
