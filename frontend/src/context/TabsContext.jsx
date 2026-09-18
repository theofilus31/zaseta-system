import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { MODULES, MODULE_BY_KEY } from '../constants/modules.js';

/**
 * ============================================================================
 *  TAB ALA CHROME, DISAMBUNGKAN KE ROUTING SUNGGUHAN
 * ============================================================================
 *  Beda dari komponen aslinya (sidebar-with-chrome-like-tabs): di sana "tab"
 *  cuma menukar konten React lewat renderContent(navId) — URL-nya sendiri
 *  TIDAK ikut berubah. Zaseta sebaliknya adalah aplikasi ber-rute sungguhan
 *  (~30 halaman, tautan bisa dibagikan, tombol maju/mundur peramban dipakai)
 *  jadi tab di sini harus benar-benar mencerminkan URL:
 *
 *   - Tab AKTIF selalu disamakan dengan location.pathname sungguhan —
 *     baik saat diganti lewat sidebar (setActiveNav) MAUPUN saat berubah
 *     lewat cara lain (tautan di dalam halaman, tombol maju/mundur
 *     peramban). Ini yang membuat mengklik baris aset lalu berpindah ke
 *     halaman detailnya tetap "masuk akal" di dalam tab yang sama.
 *   - Berpindah/menutup tab memanggil navigate() sungguhan, supaya alamat
 *     di bilah alamat selalu cocok dengan yang terlihat di layar.
 *   - Satu keterbatasan yang tidak bisa dihindari: peramban cuma punya SATU
 *     riwayat maju/mundur (satu bilah alamat), jadi tab di sini TIDAK bisa
 *     punya riwayat maju/mundur masing-masing secara independen seperti tab
 *     asli di peramban sungguhan — itu hanya mungkin kalau tiap tab hidup di
 *     tab peramban terpisah.
 * ============================================================================
 */

/* Satu-satunya halaman tenant yang bukan modul di constants/modules.js. */
const EXTRA_ROUTES = {
  '/profile': { label: 'Profil Saya', iconKey: 'profile' },
};

/* Diurutkan dari path terpanjang supaya pencocokan awalan tidak salah pilih
   modul yang lebih pendek kalau suatu saat ada path yang tumpang tindih. */
const SORTED_MODULES = [...MODULES].sort((a, b) => b.path.length - a.path.length);

/** Tentukan identitas tab (label, ikon, modul) dari sebuah path. */
function resolveRoute(pathname) {
  const mod = SORTED_MODULES.find((m) => pathname === m.path || pathname.startsWith(`${m.path}/`));
  if (mod) return { navId: mod.key, path: mod.path, label: mod.label, iconKey: mod.key };

  const extra = EXTRA_ROUTES[pathname];
  if (extra) return { navId: pathname, path: pathname, label: extra.label, iconKey: extra.iconKey };

  const seg = pathname.split('/').filter(Boolean).pop() || 'Halaman';
  const label = seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return { navId: pathname, path: pathname, label, iconKey: 'default' };
}

function makeTab(pathname) {
  return { id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...resolveRoute(pathname) };
}

const TabsContext = createContext(null);

export function useTabs() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('useTabs harus dipakai di dalam <TabsProvider>');
  return ctx;
}

export function TabsProvider({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  /* Disekat per tenant + pengguna supaya tab tidak "bocor" antar akun kalau
     komputer dipakai bergantian (mis. admin platform login sebagai beberapa
     tenant berbeda untuk uji coba). */
  const storageKey = user ? `zaseta-tabs:${user.tenantId ?? user.tenant_id ?? 'x'}:${user.id}` : null;

  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState('');
  const hydratedRef = useRef(false);
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;

  useEffect(() => {
    hydratedRef.current = false;
    if (!storageKey) {
      setTabs([]);
      setActiveTabId('');
      return;
    }

    let initial = null;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) initial = JSON.parse(saved);
    } catch {
      /* data tersimpan rusak — abaikan, mulai dari tab baru */
    }

    if (initial?.tabs?.length) {
      setTabs(initial.tabs);
      const validActive = initial.tabs.some((t) => t.id === initial.activeTabId);
      setActiveTabId(validActive ? initial.activeTabId : initial.tabs[0].id);
    } else {
      const first = makeTab(locationRef.current);
      setTabs([first]);
      setActiveTabId(first.id);
    }
    hydratedRef.current = true;
  }, [storageKey]);

  /* Disimpan dengan jeda kecil supaya navigasi cepat tidak memicu tulis
     berkali-kali — pola yang sama seperti komponen aslinya. */
  useEffect(() => {
    if (!storageKey || !hydratedRef.current || tabs.length === 0) return;
    const handle = setTimeout(() => {
      localStorage.setItem(storageKey, JSON.stringify({ tabs, activeTabId }));
    }, 400);
    return () => clearTimeout(handle);
  }, [storageKey, tabs, activeTabId]);

  /* Menjaga tab AKTIF tetap sama dengan lokasi sungguhan — mencakup
     tombol maju/mundur peramban DAN navigasi dari dalam halaman yang tidak
     lewat sidebar (mis. klik baris aset -> halaman detail). Idempoten:
     kalau path tab sudah sama, tidak melakukan apa-apa — jadi navigasi yang
     dipicu dari setActiveNav/setActiveTab sendiri tidak diproses dua kali. */
  useEffect(() => {
    if (!hydratedRef.current) return;
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === activeTabId);
      if (idx === -1) return prev;
      if (prev[idx].path === location.pathname) return prev;
      const next = [...prev];
      next[idx] = { ...prev[idx], ...resolveRoute(location.pathname) };
      return next;
    });
  }, [location.pathname, activeTabId]);

  /* Dipanggil sidebar — menukar isi tab AKTIF ke modul lain (dipakai
     kembali, bukan membuka tab baru), sama seperti setActiveNav aslinya. */
  const setActiveNav = useCallback(
    (navId) => {
      const mod = MODULE_BY_KEY[navId];
      if (!mod) return;
      setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, navId, path: mod.path, label: mod.label, iconKey: mod.key } : t)));
      navigate(mod.path);
    },
    [activeTabId, navigate]
  );

  const addTab = useCallback(
    (navId) => {
      const mod = navId ? MODULE_BY_KEY[navId] : MODULE_BY_KEY.dashboard;
      const path = mod?.path || '/dashboard';
      const tab = makeTab(path);
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
      navigate(path);
    },
    [navigate]
  );

  const closeTab = useCallback(
    (tabId) => {
      setTabs((prev) => {
        if (prev.length === 1) return prev;
        const idx = prev.findIndex((t) => t.id === tabId);
        if (idx === -1) return prev;
        const next = prev.filter((t) => t.id !== tabId);
        if (activeTabId === tabId) {
          const safeIdx = Math.max(0, idx === next.length ? idx - 1 : idx);
          const nextActive = next[safeIdx];
          setActiveTabId(nextActive.id);
          navigate(nextActive.path);
        }
        return next;
      });
    },
    [activeTabId, navigate]
  );

  const closeOthers = useCallback((tabId) => {
    setTabs((prev) => prev.filter((t) => t.id === tabId));
    setActiveTabId(tabId);
  }, []);

  const closeToRight = useCallback(
    (tabId) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === tabId);
        if (idx === -1) return prev;
        const next = prev.slice(0, idx + 1);
        if (!next.some((t) => t.id === activeTabId)) {
          setActiveTabId(tabId);
          navigate(prev[idx].path);
        }
        return next;
      });
    },
    [activeTabId, navigate]
  );

  const closeToLeft = useCallback(
    (tabId) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === tabId);
        if (idx === -1) return prev;
        const next = prev.slice(idx);
        if (!next.some((t) => t.id === activeTabId)) {
          setActiveTabId(tabId);
          navigate(prev[idx].path);
        }
        return next;
      });
    },
    [activeTabId, navigate]
  );

  const closeAll = useCallback(() => {
    setTabs((prev) => {
      if (prev.length <= 1) return prev;
      const first = prev[0];
      setActiveTabId(first.id);
      navigate(first.path);
      return [first];
    });
  }, [navigate]);

  const setActiveTab = useCallback(
    (tabId) => {
      setTabs((prev) => {
        const tab = prev.find((t) => t.id === tabId);
        if (tab) {
          setActiveTabId(tabId);
          navigate(tab.path);
        }
        return prev;
      });
    },
    [navigate]
  );

  const reorderTabs = useCallback((nextTabs) => setTabs(nextTabs), []);

  const value = useMemo(
    () => ({ tabs, activeTabId, setActiveNav, addTab, closeTab, closeOthers, closeToRight, closeToLeft, closeAll, setActiveTab, reorderTabs }),
    [tabs, activeTabId, setActiveNav, addTab, closeTab, closeOthers, closeToRight, closeToLeft, closeAll, setActiveTab, reorderTabs]
  );

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}
