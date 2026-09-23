/**
 * Waktu relatif ringkas ("5 menit lalu", "3 hari lalu") — dipakai halaman
 * admin platform yang menampilkan feed aktivitas (PlatformDashboard,
 * PlatformActivity). Sebelumnya disalin identik di kedua berkas itu.
 *
 * Tidak menangani `iso` kosong/null (pemanggilnya selalu punya nilai nyata)
 * dan tidak berhenti membungkus ke format tanggal di suatu titik -- kalau
 * butuh keduanya (mis. daftar yang bisa berisi "belum pernah"), lihat
 * PlatformUsers.jsx yang punya varian sendiri untuk itu, sengaja tidak
 * disatukan ke sini karena perilakunya beda, bukan cuma gaya teks.
 */
export function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}
