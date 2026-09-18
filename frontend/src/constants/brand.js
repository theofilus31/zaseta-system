/**
 * ============================================================================
 *  IDENTITAS PRODUK (ZASETA) — BUKAN identitas tenant mana pun
 * ============================================================================
 *  Dipakai di halaman-halaman yang belum/tidak terikat satu tenant tertentu:
 *  LandingPage, Login (universal, tanpa slug), Signup. Sengaja terpisah dari
 *  BrandingContext/BrandLogo — keduanya menarik merek satu TENANT (nama &
 *  logo satu perusahaan pelanggan, lihat publicController.resolvePublicTenantId),
 *  yang salah kalau ditampilkan sebagai identitas PRODUKNYA sendiri.
 *
 *  Rebrand ZASETA (2026-08-24) — sumber: ZASETA_Logo_Guideline.pdf. Aset logo
 *  (ikon Z+Shield+Padlock) ada di public/brand/zaseta-icon.png.
 * ============================================================================
 */
export const PRODUCT_NAME = 'ZASETA';
export const PRODUCT_TAGLINE = 'Asset Management System';
export const PRODUCT_SLOGAN = 'Tercatat Rapi dan Aman';
export const PRODUCT_ICON_URL = '/brand/zaseta-icon.png';
