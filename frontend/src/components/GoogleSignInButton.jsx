import React, { useEffect, useRef, useState } from 'react';

/**
 * ============================================================================
 *  TOMBOL "LANJUTKAN DENGAN GOOGLE"
 * ============================================================================
 *  Dipakai Login.jsx, TenantLogin.jsx, dan Signup.jsx. Tombolnya sendiri
 *  DIRENDER OLEH GOOGLE (lewat google.accounts.id.renderButton di dalam
 *  elemen ini) — bukan tombol custom yang meniru tampilan Google. Kebijakan
 *  merek Google mewajibkan ini: https://developers.google.com/identity/branding-guidelines
 *
 *  Alurnya Google Identity Services (ID token), BUKAN OAuth redirect penuh —
 *  begitu ditekan, Google langsung mengembalikan sebuah ID token (JWT) yang
 *  sudah ditandatangani lewat `callback`, tanpa pernah keluar halaman ini.
 *  Backend (utils/googleAuth.js) yang memverifikasi tanda tangannya — cuma
 *  butuh Client ID, TIDAK PERNAH butuh Client Secret.
 *
 *  Skrip Google dimuat SEKALI, lazy — dipakai bersama kalau tombol ini
 *  dipasang lebih dari sekali dalam satu sesi (mis. berpindah dari Login.jsx
 *  ke Signup.jsx tanpa memuat ulang halaman).
 *
 *  Tersembunyi total kalau VITE_GOOGLE_CLIENT_ID belum diisi (lihat .env) —
 *  supaya halaman tidak menampilkan tombol yang pasti gagal begitu diklik.
 * ============================================================================
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

/** Dipakai pemanggil (Login.jsx dkk.) untuk menyembunyikan SELURUH blok
    "ATAU" + tombol sekaligus (bukan cuma tombolnya) kalau Client ID belum
    diisi — supaya tidak ada pembatas menggantung tanpa isi di bawahnya. */
export const GOOGLE_AUTH_ENABLED = Boolean(CLIENT_ID);

let gisLoadPromise = null;
function loadGoogleIdentityServices() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;
  gisLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Gagal memuat Google Identity Services.'));
    document.head.appendChild(script);
  });
  return gisLoadPromise;
}

/**
 * @param {(credential: string) => void} onCredential — dipanggil dengan ID
 *   token JWT begitu pengguna berhasil memilih akun Google-nya.
 * @param {'continue_with'|'signin_with'|'signup_with'} text — teks bawaan Google di dalam tombol.
 */
export default function GoogleSignInButton({ onCredential, text = 'continue_with' }) {
  const containerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadGoogleIdentityServices()
      .then(() => { if (!cancelled) setReady(true); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready || !containerRef.current) return;

    window.google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: (response) => onCredentialRef.current?.(response.credential),
    });

    containerRef.current.innerHTML = '';
    window.google.accounts.id.renderButton(containerRef.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text,
      logo_alignment: 'center',
      width: 336,
    });
  }, [ready, text]);

  if (!CLIENT_ID) return null;

  return <div ref={containerRef} className="flex justify-center" />;
}
