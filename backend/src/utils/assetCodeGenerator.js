const pool = require('../config/db');

/**
 * Menyusun kode aset dengan format: {KODE_LOKASI}/{KODE_SUB_LOKASI}/{SLUG_KATEGORI}/{NOMOR_URUT}
 * - Sub lokasi bersifat opsional: kalau tidak dipilih, segmen itu dilewati (tidak ada slash kosong).
 * - Nomor urut bersifat GLOBAL (lintas lokasi & kategori) dan tidak pernah dobel:
 *     - Kalau diisi manual, harus belum pernah dipakai aset lain (dicek via UNIQUE constraint sequence_no).
 *     - Kalau dikosongkan, otomatis pakai MAX(sequence_no) + 1 dari seluruh aset (mulai dari 1 kalau belum ada aset sama sekali).
 * - Dipadding minimal 4 digit (0001, 0002, ..., dan otomatis melebar kalau sudah tembus 9999).
 *
 * @throws {Error} dengan properti `status` terisi (400/404/409) kalau validasi gagal — asyncHandler akan meneruskan ke errorHandler.
 */
async function buildAssetCode({ locationId, subLocationId, categoryId, manualSequence }) {
  const [locRows] = await pool.query(
    `SELECT code FROM locations WHERE id = :id AND is_active = TRUE`,
    { id: locationId }
  );
  if (!locRows[0]) {
    const err = new Error('Lokasi tidak valid atau sudah tidak aktif.');
    err.status = 400;
    throw err;
  }

  let subLocationCode = null;
  if (subLocationId) {
    const [subRows] = await pool.query(
      `SELECT code FROM sub_locations WHERE id = :id AND location_id = :locationId AND is_active = TRUE`,
      { id: subLocationId, locationId }
    );
    if (!subRows[0]) {
      const err = new Error('Sub lokasi tidak valid untuk lokasi yang dipilih.');
      err.status = 400;
      throw err;
    }
    subLocationCode = subRows[0].code;
  }

  const [catRows] = await pool.query(`SELECT slug FROM asset_categories WHERE id = :id`, { id: categoryId });
  if (!catRows[0]) {
    const err = new Error('Kategori tidak valid.');
    err.status = 400;
    throw err;
  }
  const categorySlug = catRows[0].slug;

  let sequenceNo;
  const hasManualInput = manualSequence !== undefined && manualSequence !== null && String(manualSequence).trim() !== '';

  if (hasManualInput) {
    sequenceNo = parseInt(manualSequence, 10);
    if (!Number.isInteger(sequenceNo) || sequenceNo <= 0) {
      const err = new Error('Nomor urut harus berupa angka positif.');
      err.status = 400;
      throw err;
    }
    const [dupeRows] = await pool.query(`SELECT id, asset_code FROM assets WHERE sequence_no = :sequenceNo`, { sequenceNo });
    if (dupeRows[0]) {
      const err = new Error(`Nomor urut ${sequenceNo} sudah dipakai aset "${dupeRows[0].asset_code}". Kosongkan untuk generate otomatis, atau pilih nomor lain.`);
      err.status = 409;
      throw err;
    }
  } else {
    // Cari nomor urut terkecil yang belum pernah dipakai (mengisi celah/gap terlebih dahulu),
    // bukan sekadar melanjutkan dari nomor tertinggi. Contoh: kalau yang sudah dipakai {1, 4},
    // auto-generate berikutnya harus menghasilkan 2, lalu 3, baru 5 (bukan langsung 5).
    const [rows] = await pool.query(`SELECT sequence_no FROM assets WHERE sequence_no IS NOT NULL ORDER BY sequence_no ASC`);
    const usedNumbers = new Set(rows.map((r) => r.sequence_no));
    let candidate = 1;
    while (usedNumbers.has(candidate)) candidate++;
    sequenceNo = candidate;
  }

  const paddedSequence = String(sequenceNo).padStart(4, '0');
  const assetCode = [locRows[0].code, subLocationCode, categorySlug, paddedSequence].filter(Boolean).join('/');

  return { assetCode, sequenceNo };
}

module.exports = buildAssetCode;
