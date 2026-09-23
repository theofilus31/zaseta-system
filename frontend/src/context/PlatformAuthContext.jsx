import React, { createContext, useContext, useEffect, useState } from 'react';
import platformAxiosClient from '../api/platformAxiosClient';

/**
 * Sesi admin platform — TERPISAH TOTAL dari AuthContext.jsx tenant sejak
 * migration_separate_platform_admins.sql (localStorage key sendiri,
 * `platformAxiosClient` sendiri, endpoint /api/platform-auth sendiri). Tidak
 * ada satu pun state yang dibagi dengan AuthProvider — dua sesi ini bisa
 * aktif berdampingan di browser yang sama tanpa saling mengganggu.
 */
const PlatformAuthContext = createContext(null);

export function PlatformAuthProvider({ children }) {
  const [admin, setAdmin] = useState(() => {
    const stored = localStorage.getItem('platformAdmin');
    return stored ? JSON.parse(stored) : null;
  });

  // Segarkan dari server saat aplikasi dibuka -- sama alasannya dengan
  // AuthContext.jsx (sesi lama tanpa field baru, atau token yang sudah
  // dicabut sejak sesi terakhir dibuka).
  useEffect(() => {
    if (!localStorage.getItem('platformToken')) return;

    platformAxiosClient.get('/platform-auth/me')
      .then((res) => {
        const fresh = res.data.admin;
        setAdmin((prev) => {
          const merged = { ...prev, ...fresh };
          localStorage.setItem('platformAdmin', JSON.stringify(merged));
          return merged;
        });
      })
      .catch(() => {
        /* 401 sudah ditangani interceptor platformAxiosClient (diarahkan ke
           /platform/login). Tidak ada yang perlu dilakukan di sini. */
      });
  }, []);

  async function login(username, password) {
    const { data } = await platformAxiosClient.post('/platform-auth/login', { username, password });
    localStorage.setItem('platformToken', data.token);
    localStorage.setItem('platformAdmin', JSON.stringify(data.admin));
    setAdmin(data.admin);
    return data.admin;
  }

  /** "Masuk dengan Google" — padanan login() di atas, `credential` adalah ID
      token JWT dari Google Identity Services (lihat GoogleSignInButton.jsx). */
  async function googleLogin(credential) {
    const { data } = await platformAxiosClient.post('/platform-auth/google-login', { credential });
    localStorage.setItem('platformToken', data.token);
    localStorage.setItem('platformAdmin', JSON.stringify(data.admin));
    setAdmin(data.admin);
    return data.admin;
  }

  function logout() {
    localStorage.removeItem('platformToken');
    localStorage.removeItem('platformAdmin');
    setAdmin(null);
  }

  return (
    <PlatformAuthContext.Provider value={{ admin, login, googleLogin, logout, setAdmin }}>
      {children}
    </PlatformAuthContext.Provider>
  );
}

export function usePlatformAuth() {
  return useContext(PlatformAuthContext);
}
