/**
 * Penyusutan garis lurus (straight-line) — metode paling umum dipakai untuk
 * aset IT dan yang paling mudah dipertanggungjawabkan ke bagian keuangan.
 *
 *   penyusutan per bulan = (harga beli - nilai residu) / masa manfaat
 *   nilai buku           = harga beli - (penyusutan per bulan x bulan berjalan)
 *
 * Nilai buku tidak pernah turun di bawah nilai residu, dan tidak dihitung
 * sama sekali kalau data pendukungnya belum lengkap — lebih baik menampilkan
 * "belum dihitung" daripada angka yang menyesatkan bagian keuangan.
 */

function monthsBetween(from, to) {
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;

  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  // Belum lewat tanggal yang sama di bulan berjalan -> bulan itu belum genap
  if (b.getDate() < a.getDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * @returns {null|object} null kalau data belum cukup untuk dihitung.
 */
function calculateDepreciation(asset, now = new Date()) {
  const price = Number(asset.purchase_price);
  const life = Number(asset.useful_life_months);
  const salvage = Number(asset.salvage_value || 0);

  if (!asset.purchase_date || !price || !life || life <= 0) return null;

  const elapsed = monthsBetween(asset.purchase_date, now);
  if (elapsed === null) return null;

  const depreciable = Math.max(0, price - salvage);
  const perMonth = depreciable / life;
  const accumulated = Math.min(depreciable, perMonth * elapsed);
  const bookValue = Math.max(salvage, price - accumulated);

  return {
    monthsElapsed: elapsed,
    monthsRemaining: Math.max(0, life - elapsed),
    perMonth: Math.round(perMonth),
    accumulated: Math.round(accumulated),
    bookValue: Math.round(bookValue),
    percentDepreciated: depreciable > 0 ? Math.min(100, (accumulated / depreciable) * 100) : 0,
    isFullyDepreciated: elapsed >= life,
  };
}

/**
 * Status garansi. Dipakai untuk lencana di halaman detail dan peringatan
 * di Dasbor.
 */
function warrantyStatus(warrantyExpiry, now = new Date()) {
  if (!warrantyExpiry) return null;

  const expiry = new Date(warrantyExpiry);
  if (Number.isNaN(expiry.getTime())) return null;

  const days = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

  return {
    expiresAt: warrantyExpiry,
    daysRemaining: days,
    // 30 hari dipilih sebagai ambang "segera" karena cukup untuk mengurus
    // perpanjangan atau klaim sebelum garansinya benar-benar habis.
    state: days < 0 ? 'expired' : days <= 30 ? 'expiring' : 'active',
  };
}

module.exports = { calculateDepreciation, warrantyStatus, monthsBetween };
