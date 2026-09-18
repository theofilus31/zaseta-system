import React from 'react';
import { PRODUCT_NAME, PRODUCT_TAGLINE, PRODUCT_ICON_URL } from '../constants/brand.js';

/**
 * Lambang produk ZASETA (ikon + nama "ZASETA" + tagline "ASSET MANAGEMENT
 * SYSTEM") — dipakai di halaman publik UNIVERSAL yang belum terikat tenant
 * mana pun (Login.jsx, Signup.jsx). Bukan pengganti BrandLogo (itu untuk
 * merek TENANT) — lihat catatan di constants/brand.js.
 *
 * `tone="dark"`: ikon diberi chip kaca buram (bg-white/10 + ring putih tipis)
 * supaya ikon hijau ZASETA tidak tenggelam di atas latar gradasi hijau tua
 * (mis. panel kiri Login/Signup) — tanpa chip ini ikon & latar sama-sama
 * hijau gelap, kontrasnya nyaris hilang. `tone="light"` untuk latar terang
 * biasa, tanpa chip (ikonnya sudah cukup kontras sendiri di atas putih).
 */
export default function ProductBrandMark({ tone = 'light', className = '' }) {
  const isDark = tone === 'dark';

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span
        className={[
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
          isDark ? 'bg-white/10 ring-1 ring-inset ring-white/15 backdrop-blur-sm' : '',
        ].join(' ')}
      >
        <img src={PRODUCT_ICON_URL} alt="" className="h-7 w-7 object-contain" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <span className={`block text-lg font-black tracking-tight leading-tight ${isDark ? 'text-white' : 'text-ink-900'}`}>
          {PRODUCT_NAME}
        </span>
        <span className={`block text-[10px] font-bold uppercase tracking-[0.12em] ${isDark ? 'text-white/50' : 'text-ink-400'}`}>
          {PRODUCT_TAGLINE}
        </span>
      </div>
    </div>
  );
}
