/**
 * "Hari ini" menurut tanggal LOKAL — bukan
 * `new Date().toISOString().slice(0, 10)`.
 *
 * `.toISOString()` mengonversi ke UTC lebih dulu, dan karena WIB delapan jam
 * di depan UTC, antara pukul 00.00–07.00 WIB tanggalnya salah mundur satu
 * hari (mis. jam 03.00 WIB tanggal 19 Agustus dianggap masih 18 Agustus).
 * Fungsi ini membaca komponen tanggal langsung dari zona waktu lokal
 * peramban, jadi selalu cocok dengan tanggal yang dilihat penggunanya.
 */
export function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
