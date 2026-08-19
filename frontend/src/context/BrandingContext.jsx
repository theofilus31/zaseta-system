import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import axiosClient from '../api/axiosClient.js';

/**
 * ============================================================================
 *  MEREK APLIKASI
 * ============================================================================
 *  Nama aplikasi, nama perusahaan, dan logo — dimuat sekali dari server lalu
 *  dipakai bersama oleh sidebar, topbar, halaman Masuk, dan halaman Pindai QR.
 *
 *  Diambil dari endpoint PUBLIK (`/public/branding`) karena halaman Masuk dan
 *  halaman Pindai QR sudah menampilkannya sebelum ada sesi login.
 *
 *  Judul tab dan favicon ikut diperbarui dari sini, jadi memasang logo baru
 *  langsung terlihat sampai ke ikon tab peramban.
 * ============================================================================
 */

const BrandingContext = createContext(null);

/* Dipakai sebelum data server tiba, supaya tidak ada kedipan teks kosong. */
const FALLBACK = {
  appName: 'Asset Inventory',
  companyName: '',
  tagline: null,
  logoVersion: 0,
  logos: { icon: false, light: false, dark: false },
};

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(FALLBACK);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await axiosClient.get('/public/branding');
      setBranding({ ...FALLBACK, ...res.data });
    } catch {
      /* Server belum siap atau endpoint belum ada — pakai nilai bawaan.
         Merek bukan alasan yang cukup untuk menggagalkan seluruh aplikasi. */
      setBranding(FALLBACK);
    } finally {
      setLoading(false);
    }
  }, []);

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
    return `${base}/public/branding/logo/${variant}?v=${branding.logoVersion}`;
  }, [branding]);

  /* Judul tab mengikuti merek yang berlaku. */
  useEffect(() => {
    document.title = branding.companyName
      ? `${branding.appName} — ${branding.companyName}`
      : branding.appName;
  }, [branding.appName, branding.companyName]);

  /* Favicon ikut logo ikon; kalau belum ada, biarkan berkas bawaan di
     index.html yang dipakai. */
  useEffect(() => {
    const url = logoUrl('icon');
    if (!url) return;

    let link = document.querySelector("link[rel='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = url;
  }, [logoUrl]);

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
