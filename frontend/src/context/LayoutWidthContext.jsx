import React, { createContext, useContext, useEffect } from 'react';

/**
 * ============================================================================
 *  LEBAR PANEL KONTEN — DIATUR DARI DALAM HALAMAN
 * ============================================================================
 *  Sampai sebelum tab ala Chrome ditambahkan, tiap halaman memasang <Layout>
 *  sendiri-sendiri dan bisa langsung memberi prop `width="narrow"` dsb di
 *  situ. Sekarang Layout dipasang SATU KALI di App.jsx (membungkus <Outlet/>)
 *  supaya sidebar & tab tidak dibongkar-pasang ulang setiap kali berpindah
 *  halaman — konsekuensinya, App.jsx tidak lagi tahu halaman APA yang sedang
 *  aktif untuk meneruskan prop `width` itu.
 *
 *  Hook ini gantinya: halaman yang butuh lebar selain bawaan cukup memanggil
 *  `useLayoutWidth('narrow')` sekali di awal komponennya — sama seperti dulu
 *  menulis `<Layout width="narrow">`, hanya arah alirannya dibalik (anak
 *  memberi tahu induk, bukan induk memberi prop ke anak).
 * ============================================================================
 */

const LayoutWidthContext = createContext(null);

/** Dipasang oleh Layout.jsx sendiri — jangan dipakai langsung di halaman. */
export function LayoutWidthProvider({ setWidth, children }) {
  return <LayoutWidthContext.Provider value={setWidth}>{children}</LayoutWidthContext.Provider>;
}

/** Dipanggil dari komponen halaman: `useLayoutWidth('narrow' | 'full')`. */
export function useLayoutWidth(width) {
  const setWidth = useContext(LayoutWidthContext);

  useEffect(() => {
    if (!setWidth) return;
    setWidth(width);
    /* Kembalikan ke bawaan saat halaman ini lepas — supaya halaman
       berikutnya (yang tidak memanggil hook ini sama sekali) tidak
       mewarisi lebar "narrow" bekas halaman sebelumnya. */
    return () => setWidth('default');
  }, [width, setWidth]);
}
