import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const NotificationContext = createContext(null);

const STORAGE_KEY = 'notificationHistory';
const MAX_HISTORY = 30;

/* Galat dibiarkan tampil lama karena biasanya berisi alasan kegagalan yang
   perlu dibaca sampai habis. Notifikasi sukses cukup sekilas. */
const DURATION_MS = {
  error: 30_000,
  success: 4_000,
  info: 6_000,
};

export function NotificationProvider({ children }) {
  const [history, setHistory] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      /* Riwayat lama disimpan tanpa properti `type` — anggap semuanya galat
         supaya entri lama tetap tampil dengan ikon yang benar. */
      return parsed.map((entry) => ({ type: 'error', ...entry }));
    } catch {
      return [];
    }
  });

  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch { /* kuota penuh — abaikan */ }
  }, [history]);

  const dismissToast = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast(null);
  }, []);

  /**
   * Tampilkan notifikasi mengambang di pojok kanan atas.
   * Hanya galat yang ikut disimpan ke riwayat — notifikasi sukses bersifat
   * sekali pakai dan tidak berguna untuk ditelusuri belakangan.
   */
  const push = useCallback((message, type = 'error') => {
    if (!message) return;

    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      message,
      type,
      time: new Date().toISOString(),
    };

    if (type === 'error') {
      setHistory((prev) => [entry, ...prev].slice(0, MAX_HISTORY));
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(entry);
    timerRef.current = setTimeout(() => {
      setToast(null);
      timerRef.current = null;
    }, DURATION_MS[type] ?? DURATION_MS.info);
  }, []);

  const pushError = useCallback((message) => push(message, 'error'), [push]);
  const pushSuccess = useCallback((message) => push(message, 'success'), [push]);
  const pushInfo = useCallback((message) => push(message, 'info'), [push]);

  const clearHistory = useCallback(() => setHistory([]), []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <NotificationContext.Provider
      value={{ history, toast, push, pushError, pushSuccess, pushInfo, dismissToast, clearHistory }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  return useContext(NotificationContext);
}
