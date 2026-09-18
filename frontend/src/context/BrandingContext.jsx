import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import axiosClient from '../api/axiosClient.js';

/**
 * ============================================================================
 *  MEREK APLIKASI
 * ============================================================================
 *  Nama aplikasi, nama perusahaan, dan logo — dimuat sekali dari server lalu
 *  dipakai bersama oleh sidebar, topbar, halaman Masuk, dan halaman Pindai QR.
 *
 *  Diambil dari endpoint PUBLIK (`/public/branding`) untuk halaman yang
 *  belum punya sesi (Masuk, Daftar, landing page, Pindai QR); begitu ada
 *  token di localStorage, dialihkan ke `/settings/branding` (terautentikasi)
 *  supaya sidebar/topbar menampilkan merek tenant PENGGUNA ITU SENDIRI, bukan
 *  tenant pertama yang kebetulan aktif — lihat memory Fase 3 soal bug ini.
 *
 *  Judul tab dan favicon ikut diperbarui dari sini, jadi memasang logo baru
 *  langsung terlihat sampai ke ikon tab peramban.
 * ============================================================================
 */

const BrandingContext = createContext(null);

/* Dipakai sebelum data server tiba, supaya tidak ada kedipan teks kosong. */
const FALLBACK = {
  appName: 'ZASETA',
  companyName: '',
  tagline: null,
  logoVersion: 0,
  tenantId: null,
  logos: { icon: false, light: false, dark: false },
  notFound: false,
};

/* Halaman masuk KHUSUS satu tenant (Fase 5, Tahap 2 SaaS — mis. /rms/login).
   Beda dari resolvePublicTenantId() (menebak tenant pertama yang aktif),
   slug di URL di sini MENENTUKAN tenant mana yang dituju secara eksplisit —
   dipakai refresh() di bawah untuk mengambil merek tenant itu PERSIS, bukan
   tebakan atau sesi yang mungkin masih tersimpan dari tenant lain. */
const TENANT_LOGIN_PATTERN = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)\/login$/;

/**
 * Halaman identitas PRODUK — bukan tenant mana pun. Landing page & Masuk/
 * Daftar adalah pintu masuk ke SISTEMNYA sendiri, bukan portal satu
 * pelanggan tertentu, jadi tab peramban (judul + favicon) di sini SENGAJA
 * tidak boleh ikut tebakan `resolvePublicTenantId()` (tenant aktif/trial
 * pertama, lihat backend) seperti halaman publik lain (Pindai QR, Ajukan
 * Permintaan) yang justru MEMANG terikat satu tenant sungguhan.
 *
 * Ini HANYA mengunci tab peramban (document.title + favicon) — logo di
 * dalam panel Masuk/Daftar sendiri tetap memakai BrandLogo/tenant tebakan
 * seperti sebelumnya (belum diminta untuk diubah).
 */
const PRODUCT_IDENTITY_ROUTES = ['/', '/login', '/signup'];

/* Nilai bawaan index.html — ditangkap sekali di sini (bukan ditulis ulang)
   supaya tidak dobel-sumber kalau judul/favicon bawaan berubah di sana.
   index.html mendaftarkan BEBERAPA tag <link rel="icon"> (32/64/256px) plus
   satu apple-touch-icon — semuanya ditangkap di sini, bukan cuma yang
   pertama, supaya efek di bawah bisa mengembalikan/menimpa semuanya. */
const DEFAULT_TITLE = typeof document !== 'undefined' ? document.title : FALLBACK.appName;
const DEFAULT_FAVICON_LINKS = typeof document !== 'undefined'
  ? Array.from(document.querySelectorAll("link[rel='icon'], link[rel='apple-touch-icon']")).map((el) => ({
      el,
      href: el.href,
    }))
  : [];

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(FALLBACK);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const isProductPage = PRODUCT_IDENTITY_ROUTES.includes(location.pathname);
  const tenantLoginSlug = TENANT_LOGIN_PATTERN.exec(location.pathname)?.[1] || null;

  const refresh = useCallback(async () => {
    try {
      let res;
      if (tenantLoginSlug) {
        /* Merek tenant PERSIS sesuai slug di URL — bukan tebakan
           resolvePublicTenantId(), dan bukan pula sesi yang mungkin masih
           tersimpan di localStorage dari tenant LAIN (mis. sudah login di
           satu tenant, lalu membuka link masuk tenant lain di tab baru). */
        res = await axiosClient.get('/public/branding', { params: { slug: tenantLoginSlug } });
      } else {
        const hasSession = Boolean(localStorage.getItem('token'));
        res = await axiosClient.get(hasSession ? '/settings/branding' : '/public/branding');
      }
      setBranding({ ...FALLBACK, ...res.data });
    } catch {
      /* Untuk halaman masuk khusus tenant, kegagalan di sini SPESIFIK berarti
         kode perusahaan di URL tidak valid — `notFound` dipakai TenantLogin.jsx
         untuk menampilkan "perusahaan tidak ditemukan", bukan diam-diam jatuh
         ke bawaan ZASETA seperti kegagalan biasa (server belum siap, dst.). */
      setBranding({ ...FALLBACK, notFound: Boolean(tenantLoginSlug) });
    } finally {
      setLoading(false);
    }
  }, [tenantLoginSlug]);

  useEffect(() => { refresh(); }, [refresh]);

  /**
   * URL gambar logo, atau null kalau varian itu belum diunggah.
   *
   * Dibangun manual (bukan lewat axios) karena dipakai di atribut <img src>.
   * `v=logoVersion` membuat peramban memperlakukan logo baru sebagai URL baru
   * — tanpa itu, logo lama bisa bertahan di cache berhari-hari.
   */
  const logoUrl = useCallback((variant) => {
    if (!branding.logos?.[variant]) return null;
    const base = axiosClient.defaults.baseURL?.replace(/\/$/, '') || '';
    const tenantParam = branding.tenantId ? `&tenantId=${branding.tenantId}` : '';
    return `${base}/public/branding/logo/${variant}?v=${branding.logoVersion}${tenantParam}`;
  }, [branding]);

  /* Judul tab mengikuti merek yang berlaku — KECUALI di halaman identitas
     produk (lihat PRODUCT_IDENTITY_ROUTES), yang selalu dikunci ke judul
     bawaan ZASETA, tidak peduli tenant apa yang kebetulan didapat lewat
     resolvePublicTenantId(). */
  useEffect(() => {
    if (isProductPage) {
      document.title = DEFAULT_TITLE;
      return;
    }
    document.title = branding.companyName
      ? `${branding.appName} — ${branding.companyName}`
      : branding.appName;
  }, [branding.appName, branding.companyName, isProductPage]);

  /* Favicon ikut logo ikon; kalau belum ada, biarkan berkas bawaan di
     index.html yang dipakai. Sama seperti judul tab, halaman identitas
     produk dikunci ke favicon bawaan — tidak pernah ikut logo tenant.
     index.html punya BEBERAPA tag <link rel="icon"> (satu per ukuran) —
     semuanya harus ditimpa/dikembalikan bersamaan, bukan cuma yang
     pertama, supaya tab peramban tidak menampilkan campuran ikon lama &
     baru di ukuran berbeda. */
  useEffect(() => {
    const links = document.querySelectorAll("link[rel='icon'], link[rel='apple-touch-icon']");

    if (isProductPage) {
      DEFAULT_FAVICON_LINKS.forEach(({ el, href }) => {
        if (href) el.href = href;
      });
      return;
    }

    const url = logoUrl('icon');
    if (!url) return;
    if (links.length === 0) {
      const link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
      link.href = url;
      return;
    }
    links.forEach((link) => { link.href = url; });
  }, [logoUrl, isProductPage]);

  return (
    <BrandingContext.Provider value={{ ...branding, loading, refresh, logoUrl }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext) || { ...FALLBACK, loading: false, refresh: () => {}, logoUrl: () => null };
}

/**
 * Logo siap pakai. Kalau varian yang diminta belum diunggah, menampilkan
 * kotak berisi huruf awal nama perusahaan — jadi aplikasi tetap terlihat utuh
 * di instalasi yang sama sekali belum memasang logo.
 */
export function BrandLogo({ variant = 'icon', className = '', fallbackClassName = '', alt }) {
  const { logoUrl, companyName, appName } = useBranding();
  const url = logoUrl(variant);
  const label = alt ?? (companyName || appName);

  if (url) {
    return <img src={url} alt={label} className={className} />;
  }

  const initial = (companyName || appName || '?').trim()[0]?.toUpperCase() || '?';
  return (
    <span
      role="img"
      aria-label={label}
      className={`inline-flex items-center justify-center rounded-xl bg-brand-500 font-bold text-white ${fallbackClassName || className}`}
    >
      {initial}
    </span>
  );
}
