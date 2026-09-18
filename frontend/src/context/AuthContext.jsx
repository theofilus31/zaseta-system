import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import axiosClient from '../api/axiosClient';
import { useBranding } from './BrandingContext.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });

  /* BrandingProvider membungkus AuthProvider (lihat main.jsx), jadi merek
     tenant bisa disegarkan dari sini begitu sesi berubah — supaya
     sidebar/topbar langsung menampilkan merek tenant yang benar setelah
     login/daftar/keluar, tanpa perlu memuat ulang halaman. */
  const { refresh: refreshBranding } = useBranding();

  /* Izin disegarkan dari server saat aplikasi dibuka.
     Dua alasan: (1) sesi lama yang tersimpan sebelum fitur izin ada belum
     punya field `permissions` sama sekali, dan (2) administrator bisa
     mengubah hak akses seseorang yang sedang aktif — perubahan itu harus
     terasa tanpa menunggu yang bersangkutan login ulang. */
  useEffect(() => {
    if (!localStorage.getItem('token')) return;

    axiosClient.get('/auth/me')
      .then((res) => {
        const fresh = res.data.user;
        setUser((prev) => {
          const merged = { ...prev, ...fresh };
          localStorage.setItem('user', JSON.stringify(merged));
          return merged;
        });
      })
      .catch(() => {
        /* Token kedaluwarsa/dicabut sudah ditangani interceptor axios
           (diarahkan ke halaman masuk). Tidak ada yang perlu dilakukan di sini. */
      });
  }, []);

  // `slug` opsional (Fase 5 Tahap 2 SaaS) — dikirim TenantLogin.jsx (halaman
  // masuk khusus satu tenant, /rms/login) supaya pencarian akunnya langsung
  // di dalam tenant itu saja. Login.jsx (universal) memanggil tanpa slug,
  // perilakunya tidak berubah sama sekali.
  async function login(username, password, slug) {
    const { data } = await axiosClient.post('/auth/login', { username, password, slug });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    refreshBranding();
    return data.user;
  }

  /**
   * Pendaftaran mandiri perusahaan baru (Fase 2 SaaS). SEJAK gerbang
   * verifikasi surel ditambahkan, responsnya TIDAK LAGI berisi token/user
   * langsung (lihat authController.signup) — akun barunya belum bisa dipakai
   * sebelum kode OTP yang dikirim ke surelnya dikonfirmasi lewat
   * verifySignupEmail() di bawah. Signup.jsx yang mengarahkan pendaftar ke
   * layar "masukkan kode" berikutnya, bukan langsung ke dasbor.
   */
  async function signup({ companyName, companyCode, name, email, username, password }) {
    const { data } = await axiosClient.post('/auth/signup', { companyName, companyCode, name, email, username, password });
    return data; // { tenantSlug, identifier, needsVerification, message }
  }

  /**
   * Menyelesaikan gerbang verifikasi surel signup() — SETELAH ini responsnya
   * baru berisi token + user, sama seperti login(), supaya pendaftar langsung
   * masuk ke dasbornya begitu kodenya benar tanpa login manual lagi.
   */
  async function verifySignupEmail(identifier, otp) {
    const { data } = await axiosClient.post('/auth/verify-signup-email', { identifier, otp });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    refreshBranding();
    return { user: data.user, tenantSlug: data.tenantSlug };
  }

  /** Minta kode verifikasi signup baru — dipakai saat kode lama kedaluwarsa/hilang. */
  async function resendSignupVerification(identifier) {
    const { data } = await axiosClient.post('/auth/resend-signup-verification', { identifier });
    return data.message;
  }

  /**
   * "Masuk dengan Google" — `credential` adalah ID token JWT dari Google
   * Identity Services (lihat components/GoogleSignInButton.jsx), `slug`
   * opsional sama seperti login() biasa. Bentuk respons & efek sampingnya
   * (simpan token, refreshBranding) sama persis dengan login() — cuma cara
   * membuktikan identitasnya yang beda (token Google, bukan kata sandi).
   */
  async function googleLogin(credential, slug) {
    const { data } = await axiosClient.post('/auth/google-login', { credential, slug });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    refreshBranding();
    return data.user;
  }

  /**
   * "Daftar dengan Google" — padanan signup() untuk pendaftar yang memilih
   * Google. Beda dari signup() biasa: responsnya LANGSUNG berisi token/user
   * (lihat authController.googleSignup) karena surelnya sudah diverifikasi
   * Google sendiri, tidak perlu gerbang kode OTP lagi.
   */
  async function googleSignup({ credential, companyName, companyCode }) {
    const { data } = await axiosClient.post('/auth/google-signup', { credential, companyName, companyCode });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    refreshBranding();
    return data; // { token, tenantSlug, user }
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    refreshBranding();
  }

  /**
   * Apakah pengguna boleh melakukan `action` pada `moduleKey`?
   *
   * Ini HANYA untuk tampilan — menyembunyikan menu dan tombol yang tidak
   * berguna. Otorisasi sesungguhnya tetap dicek backend di setiap endpoint
   * (middleware/auth.js → requirePermission), jadi menyingkirkan pemeriksaan
   * di sini lewat devtools tidak memberi akses apa pun.
   */
  const can = useCallback((moduleKey, action = 'view') => {
    // Administrator selalu berakses penuh — sejalan dengan aturan di backend.
    if (user?.role === 'admin') return true;
    return Boolean(user?.permissions?.[moduleKey]?.includes(action));
  }, [user]);

  /** Modul apa saja yang boleh dibuka pengguna ini. */
  const visibleModules = useCallback(
    () => Object.keys(user?.permissions || {}),
    [user]
  );

  /* Masih dipakai untuk hal yang memang melekat pada peran, bukan pada menu.
     Untuk pertanyaan "boleh tidak melakukan X", gunakan can() — hasilnya
     mengikuti izin per-pengguna, bukan nama perannya. */
  function hasRole(...roles) {
    return Boolean(user && roles.includes(user.role));
  }

  return (
    <AuthContext.Provider value={{ user, login, signup, verifySignupEmail, resendSignupVerification, googleLogin, googleSignup, logout, hasRole, can, visibleModules, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
