import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import axiosClient from '../api/axiosClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });

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

  async function login(username, password) {
    const { data } = await axiosClient.post('/auth/login', { username, password });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
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
    <AuthContext.Provider value={{ user, login, logout, hasRole, can, visibleModules, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
