import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Modal from '../components/ui/Modal.jsx';
import Button from '../components/ui/Button.jsx';

/**
 * ============================================================================
 *  PENJAGA PERUBAHAN BELUM TERSIMPAN
 * ============================================================================
 *  Halaman form (Tambah/Ubah Aset) mendaftarkan status "kotor"-nya lewat
 *  useUnsavedChanges(isDirty). Navigasi yang berpotensi membuang isian —
 *  tombol Batal di form — dijalankan lewat requestNavigation(), yang
 *  menahannya dulu dengan dialog konfirmasi selama masih ada perubahan yang
 *  belum disimpan. (Dulu juga mencakup tombol "Kembali" di kerangka
 *  aplikasi — sudah tidak ada lagi sejak sidebar diganti sistem tab ala
 *  Chrome, digantikan membuka lagi menu sidebar yang sesuai atau menutup
 *  tabnya, lihat TabsContext.jsx.)
 *
 *  Cakupan yang DITANGANI:
 *    - tombol Batal pada form
 *    - refresh / tutup tab (lewat event beforeunload bawaan peramban)
 *
 *  Yang TIDAK ditangani: tombol Back milik peramban itu sendiri. Mencegatnya
 *  butuh useBlocker dari React Router, dan itu hanya tersedia pada data router
 *  (createBrowserRouter). Aplikasi ini memakai <BrowserRouter> biasa, jadi
 *  memaksakannya berarti merombak seluruh definisi rute.
 * ============================================================================
 */

const UnsavedChangesContext = createContext(null);

export function UnsavedChangesProvider({ children }) {
  // Disimpan di ref, bukan state: nilainya dibaca saat aksi dijalankan,
  // dan perubahannya tidak perlu memicu render ulang seluruh aplikasi.
  const dirtyRef = useRef(false);
  const [dirty, setDirty] = useState(false);

  // Aksi navigasi yang sedang ditahan menunggu jawaban pengguna
  const [pendingAction, setPendingAction] = useState(null);

  const setGuard = useCallback((isDirty) => {
    dirtyRef.current = isDirty;
    setDirty(isDirty);
  }, []);

  /**
   * Jalankan `action` kalau tidak ada perubahan tertunda; kalau ada, tahan
   * dulu dan tampilkan dialog konfirmasi.
   */
  const requestNavigation = useCallback((action) => {
    if (!dirtyRef.current) {
      action();
      return;
    }
    // Dibungkus fungsi karena setState memperlakukan argumen fungsi sebagai updater
    setPendingAction(() => action);
  }, []);

  const confirmLeave = useCallback(() => {
    const action = pendingAction;
    setPendingAction(null);
    dirtyRef.current = false;
    setDirty(false);
    action?.();
  }, [pendingAction]);

  const cancelLeave = useCallback(() => setPendingAction(null), []);

  /* Peringatan bawaan peramban saat tab ditutup atau halaman di-refresh.
     Teksnya tidak bisa diatur — semua peramban modern menampilkan kalimat
     standarnya sendiri demi mencegah penyalahgunaan. */
  useEffect(() => {
    if (!dirty) return undefined;

    const handler = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  return (
    <UnsavedChangesContext.Provider value={{ dirty, setGuard, requestNavigation }}>
      {children}

      {pendingAction && (
        <Modal
          title="Perubahan belum disimpan"
          icon="fa-triangle-exclamation"
          iconTone="warning"
          onClose={cancelLeave}
          width="sm"
          footer={
            <>
              <Button variant="secondary" onClick={cancelLeave}>
                Tetap di Halaman Ini
              </Button>
              <Button variant="destructive" onClick={confirmLeave}>
                Keluar &amp; Buang Perubahan
              </Button>
            </>
          }
        >
          <p className="text-sm text-ink-600 leading-relaxed">
            Ada isian yang sudah Anda ubah tapi belum disimpan. Kalau keluar sekarang,
            <strong className="text-ink-800"> seluruh isian itu hilang</strong> dan tidak bisa dikembalikan.
          </p>
          <p className="mt-3 rounded-xl bg-ink-100 px-3.5 py-3 text-xs text-ink-600 leading-relaxed">
            Pilih <strong className="text-ink-800">Tetap di Halaman Ini</strong> kalau Anda ingin
            menyimpannya dulu lewat tombol Simpan di bagian bawah form.
          </p>
        </Modal>
      )}
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChangesContext() {
  return useContext(UnsavedChangesContext) || {
    dirty: false,
    setGuard: () => {},
    // Fallback aman kalau provider belum terpasang: navigasi tetap jalan.
    requestNavigation: (action) => action(),
  };
}

/**
 * Dipakai halaman form: daftarkan apakah saat ini ada perubahan yang belum
 * disimpan. Penjaga otomatis dilepas saat halamannya ditinggalkan.
 */
export function useUnsavedChanges(isDirty) {
  const { setGuard } = useUnsavedChangesContext();

  useEffect(() => {
    setGuard(Boolean(isDirty));
    return () => setGuard(false);
  }, [isDirty, setGuard]);
}
