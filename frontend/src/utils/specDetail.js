// Util bersama untuk field "Spec Detail" pada aset.
// Mendeteksi apakah isinya berupa list bernomor (1. ... / 1) ...), supaya
// bisa ditampilkan sebagai daftar menurun. Kalau bukan list, ditampilkan
// sebagai teks biasa (mengikuti layout pemanggil, misal sejajar/kesamping).
// Dipakai di halaman Detail Aset (admin) & halaman Scan publik supaya konsisten.

const NUMBERED_LINE_RE = /^\s*\d+[.)]\s*/;

export function parseSpecDetail(value) {
  const raw = (value || '').toString();
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const numberedLines = lines.filter((l) => NUMBERED_LINE_RE.test(l));
  // Dianggap "list" kalau minimal 2 baris diawali format nomor (1. / 1) dst).
  const isList = lines.length > 0 && numberedLines.length >= 2;

  if (isList) {
    return { isList: true, items: lines.map((l) => l.replace(NUMBERED_LINE_RE, '')) };
  }
  return { isList: false, text: raw };
}
