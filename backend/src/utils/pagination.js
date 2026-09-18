/**
 * ============================================================================
 *  BATAS ATAS PAGINASI (Fase 6 — pengerasan keamanan)
 * ============================================================================
 *  Sebelum ini, `limit` dari query string dipakai langsung tanpa batas atas
 *  di beberapa endpoint daftar (aset, barang habis pakai, riwayat aktivitas,
 *  permintaan) — klien bisa mengirim `?limit=999999` dan server akan
 *  mencoba mengembalikan SELURUH baris yang cocok dalam satu query. Bukan
 *  celah otorisasi (data tetap terbatas ke tenant pemanggil, lihat
 *  middleware/auth.js), tapi genuine vektor kelelahan sumber daya — makin
 *  nyata untuk tenant berpaket TANPA BATAS aset (lihat config/plans.js).
 *
 *  Satu tempat dipakai bersama oleh semua endpoint daftar bertingkat supaya
 *  batasnya tidak diam-diam melenceng antar endpoint.
 * ============================================================================
 */
const MAX_LIMIT = 200;

/**
 * @param {object} query - req.query mentah
 * @param {object} [opts]
 * @param {number} [opts.defaultLimit=20] - dipakai kalau `limit` tidak dikirim/tidak valid
 * @param {number} [opts.maxLimit=MAX_LIMIT] - batas atas keras, tidak bisa dilampaui klien
 */
function clampPagination(query, { defaultLimit = 20, maxLimit = MAX_LIMIT } = {}) {
  const page = Math.max(1, Math.trunc(Number(query.page)) || 1);
  const rawLimit = Math.trunc(Number(query.limit)) || defaultLimit;
  const limit = Math.min(Math.max(1, rawLimit), maxLimit);
  return { page, limit };
}

module.exports = { clampPagination, MAX_LIMIT };
