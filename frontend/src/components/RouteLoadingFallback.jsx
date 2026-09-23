import React from 'react';

/**
 * Fallback <Suspense> untuk rute yang dimuat lazy (lihat App.jsx) --
 * tampil SEBENTAR sekali saja, waktu berkas JS halaman itu sendiri masih
 * diunduh (biasanya sudah di-cache browser & tidak terlihat sama sekali
 * pada kunjungan berikutnya). Sengaja polos & tidak mengasumsikan berada
 * di dalam Layout.jsx (sidebar tenant) ATAU PlatformLayout.jsx (sidebar
 * admin platform) ATAU tanpa layout sama sekali (halaman publik seperti
 * /harga) -- rute-rute yang dimuat lazy tersebar di ketiga konteks itu.
 */
export default function RouteLoadingFallback() {
  return (
    <div className="flex min-h-[40vh] w-full items-center justify-center py-16">
      <i className="fas fa-spinner fa-spin text-2xl text-brand-500" aria-hidden="true" />
      <span className="sr-only">Memuat halaman…</span>
    </div>
  );
}
