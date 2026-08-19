/**
 * Util CSV bersama untuk fitur ekspor — dipakai categoryController.js,
 * locationController.js, departmentController.js (dan bisa dipakai lagi
 * kalau ada ekspor baru lain). exportAssets di assetController.js sudah
 * berjalan lama dengan logika serupa yang ditulis sendiri di tempat; util
 * ini dibuat supaya ekspor-ekspor BARU tidak menduplikasi escaping yang
 * sama tiga kali, bukan untuk mengubah kode yang sudah berjalan.
 */

function toCsvCell(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Bungkus dengan tanda kutip kalau mengandung pemisah, kutip, atau baris baru.
  return /[",\r\n;]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** headers: string[]; rows: array of array-nilai-mentah (belum di-escape). */
function buildCsv(headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(row.map(toCsvCell).join(','));
  // BOM di depan supaya Excel membaca UTF-8 (nama berlokasi/aksen) dengan benar.
  // Ditulis sebagai escape \uFEFF, bukan karakter mentah — karakternya tidak
  // terlihat di editor sehingga gampang hilang tanpa sadar kalau ditulis langsung.
  return `\uFEFF${lines.join('\r\n')}`;
}

module.exports = { toCsvCell, buildCsv };
