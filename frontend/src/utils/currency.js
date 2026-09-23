/**
 * Format Rupiah bersama — sebelumnya disalin identik di banyak berkas
 * (BillingPage, InvoicePrintPage, PricingCards, PlatformDashboard,
 * ConsumableDetail, AssetMaintenance, AssetDetail, Dashboard,
 * DepreciationReportPage).
 *
 * SENGAJA tidak menyatukan SEMUA varian yang pernah ada -- PlatformPlans.jsx
 * (fallback '—' alih-alih null) dan PlatformRevenue.jsx (rupiah yang
 * dibulatkan lebih dulu, dan rupiahRingkas dengan aljabar berbeda yang
 * mendukung angka negatif untuk grafik pendapatan) punya perilaku yang
 * memang beda, bukan sekadar gaya penulisan berbeda -- memaksakannya ke sini
 * akan menambah parameter/cabang cuma untuk dua pemanggil, abstraksi yang
 * lebih rumit daripada duplikasinya sendiri.
 */

/** `Rp 1.500.000` — tanpa penanganan kosong, pemanggilnya sudah pasti punya angka. */
export function rupiah(v) {
  return `Rp ${Number(v).toLocaleString('id-ID')}`;
}

/** Sama seperti `rupiah()`, tapi `null`/`undefined`/`''` balik jadi `null`
 *  (bukan "Rp NaN") -- untuk kolom opsional (harga beli belum diisi, dst.). */
export function rupiahOrNull(v) {
  return v === null || v === undefined || v === '' ? null : rupiah(v);
}

/** `Rp 1,5 jt` / `Rp 250 rb` / `Rp 2,1 M` — ringkas untuk kartu KPI & grafik,
 *  lengkap dipadankan `rupiahPenuh()` di bawah untuk isi atribut `title=`. */
export function rupiahRingkas(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`;
  if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  if (v >= 1_000) return `Rp ${(v / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 0 })} rb`;
  return `Rp ${v.toLocaleString('id-ID')}`;
}

/** Angka penuh (tanpa disingkat) untuk atribut `title=` di sebelah `rupiahRingkas()`. */
export function rupiahPenuh(n) {
  return `Rp ${(Number(n) || 0).toLocaleString('id-ID')}`;
}
