const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const generateAssetQr = require('../utils/qrGenerator');
const buildAssetCode = require('../utils/assetCodeGenerator');
const parseCsv = require('../utils/csvParser');
const { calculateDepreciation, warrantyStatus } = require('../utils/depreciation');
const { todayLocal } = require('../utils/dateLocal');

const MAX_CODE_GENERATION_RETRIES = 5;

// Mapping label kondisi (yang ramah dibaca manusia, dipakai di file CSV) ke value enum di database.
const CONDITION_LABEL_TO_VALUE = {
  'baik': 'baik',
  'rusak ringan': 'rusak_ringan',
  'rusak_ringan': 'rusak_ringan',
  'rusak berat': 'rusak_berat',
  'rusak_berat': 'rusak_berat',
};
const CONDITION_VALUE_TO_LABEL = { baik: 'Baik', rusak_ringan: 'Rusak Ringan', rusak_berat: 'Rusak Berat' };
const VALID_STATUSES = ['dijual', 'terjual', 'dipindah', 'dipakai', 'idle', 'hilang', 'dihapuskan'];

/* Status yang berarti aset sudah KELUAR dari inventaris aktif. Aset dalam
   keadaan ini tidak boleh diserahkan ke siapa pun, dan nilainya tidak ikut
   dihitung sebagai kekayaan yang masih dimiliki. */
const RETIRED_STATUSES = ['terjual', 'hilang', 'dihapuskan'];

/* Menyatakan aset hilang atau dihapuskan harus disertai alasan — tanpa itu,
   aset bisa lenyap dari daftar aktif tanpa ada yang bisa dimintai keterangan. */
const REASON_REQUIRED_STATUSES = ['hilang', 'dihapuskan'];
// Status yang, saat aset berstatus "dipindah", boleh dituju HANYA jika lokasi/sub lokasi
// tujuan sama persis dengan lokasi asal sebelum dipindah (auto-detect kembali ke lokasi semula).
const RETURN_ONLY_STATUSES = ['dipakai', 'idle'];

// Helper: ambil custom field values sebuah aset, digabung dengan definisi field
async function getCustomFieldValues(assetId) {
  const [rows] = await pool.query(
    `SELECT cf.id AS field_id, cf.field_key, cf.field_label, cf.field_type, cf.field_options,
            v.value_text
     FROM asset_custom_fields cf
     LEFT JOIN asset_custom_field_values v ON v.custom_field_id = cf.id AND v.asset_id = :assetId
     WHERE cf.is_active = TRUE
     ORDER BY cf.sort_order ASC`,
    { assetId }
  );
  return rows.map(r => ({ ...r, field_options: r.field_options ? JSON.parse(r.field_options) : null }));
}

// Helper: simpan/update custom field values (upsert)
/** `runner` menerima `pool` atau `conn` (dari pool.getConnection()) — keduanya
    punya bentuk .query() yang sama, jadi createAsset bisa menyertakan
    tulisan ini ke dalam transaksinya sendiri sekadar dengan mengoper `conn`. */
async function saveCustomFieldValues(assetId, customFields, runner = pool) {
  if (!customFields || typeof customFields !== 'object') return;
  const entries = Object.entries(customFields); // { fieldId: value }
  for (const [fieldId, value] of entries) {
    await runner.query(
      `INSERT INTO asset_custom_field_values (asset_id, custom_field_id, value_text)
       VALUES (:assetId, :fieldId, :value)
       ON DUPLICATE KEY UPDATE value_text = :value, updated_at = NOW()`,
      { assetId, fieldId, value: value === null || value === undefined ? null : String(value) }
    );
  }
}

/**
 * Menyusun klausa WHERE dari query string filter Daftar Aset.
 * Dipakai bersama oleh listAssets dan exportAssets supaya hasil ekspor selalu
 * persis sama dengan apa yang sedang dilihat pengguna di layar — kalau kedua
 * tempat menyusun filternya sendiri-sendiri, keduanya pasti akan menyimpang.
 */
function buildAssetFilter(query) {
  const { search = '', categoryId, assetTypeId, locationId, subLocationId, status, condition, departmentId } = query;

  const conditions = ['a.deleted_at IS NULL'];
  const params = {};

  if (search) {
    conditions.push('(MATCH(a.name, a.brand, a.model, a.serial_number) AGAINST (:search IN BOOLEAN MODE) OR a.asset_code LIKE :searchLike)');
    params.search = `${search}*`;
    params.searchLike = `%${search}%`;
  }
  if (categoryId) {
    // Filter "Kode Barang/Aset" (asset_categories) — dipakai untuk menyusun asset_code.
    conditions.push('a.category_id = :categoryId');
    params.categoryId = categoryId;
  }
  if (assetTypeId) {
    // Filter "Kategori Aset" (asset_types) — klasifikasi tampilan aset, terpisah dari kode barang/aset.
    conditions.push('a.asset_type_id = :assetTypeId');
    params.assetTypeId = assetTypeId;
  }
  if (locationId === 'none') {
    // Dipakai panel "Perlu Perhatian" di Dasbor untuk menemukan aset yang
    // lokasinya belum diisi — biasanya sisa impor CSV yang belum dilengkapi.
    conditions.push('a.location_id IS NULL');
  } else if (locationId) {
    conditions.push('a.location_id = :locationId');
    params.locationId = locationId;
  }
  if (subLocationId) {
    conditions.push('a.sub_location_id = :subLocationId');
    params.subLocationId = subLocationId;
  }
  if (status) {
    conditions.push('a.status = :status');
    params.status = status;
  }
  if (departmentId === 'none') {
    conditions.push('a.department_id IS NULL');
  } else if (departmentId) {
    conditions.push('a.department_id = :departmentId');
    params.departmentId = departmentId;
  }
  // Filter kondisi fisik — dipakai panel "Perlu Perhatian" di Dasbor untuk
  // menautkan langsung ke daftar aset rusak.
  if (condition && CONDITION_VALUE_TO_LABEL[condition]) {
    conditions.push('a.condition_status = :condition');
    params.condition = condition;
  }

  return { whereClause: `WHERE ${conditions.join(' AND ')}`, params };
}

// GET /api/assets?search=&categoryId=&assetTypeId=&locationId=&subLocationId=&status=&condition=&page=&limit=
const listAssets = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);
  const { whereClause, params } = buildAssetFilter(req.query);

  const [rows] = await pool.query(
    `SELECT a.id, a.asset_code, a.name, a.brand, a.model, a.status, a.condition_status,
            a.warranty_expiry,
            d.code AS department_code, d.name AS department_name,
            l.name AS location_name, sl.name AS sub_location_name,
            c.name AS category_name, t.name AS asset_type_name, a.created_at,
            asg.holder_name, asg.department AS holder_department
     FROM assets a
     JOIN asset_categories c ON c.id = a.category_id
     LEFT JOIN asset_types t ON t.id = a.asset_type_id
     LEFT JOIN locations l ON l.id = a.location_id
     LEFT JOIN sub_locations sl ON sl.id = a.sub_location_id
     LEFT JOIN departments d ON d.id = a.department_id
     -- Pemegang saat ini (penugasan yang belum ditutup). Satu aset hanya boleh
     -- punya satu baris aktif, jadi join ini tidak menggandakan hasil.
     LEFT JOIN asset_assignments asg ON asg.asset_id = a.id AND asg.returned_at IS NULL
     ${whereClause}
     ORDER BY (a.sequence_no IS NULL) ASC, a.sequence_no ASC, a.created_at DESC
     LIMIT :limit OFFSET :offset`,
    { ...params, limit: Number(limit), offset }
  );

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM assets a ${whereClause}`,
    params
  );

  res.json({
    data: rows,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: countRows[0].total,
      totalPages: Math.ceil(countRows[0].total / Number(limit)),
    },
  });
});

/**
 * Menyusun detail lengkap satu aset.
 *
 * Dipisah dari handler-nya karena dipakai dua pintu masuk: lewat id (halaman
 * detail) dan lewat kode QR (petugas yang memindai di lapangan). Menyalin
 * kueri sepanjang ini ke dua tempat hampir pasti berakhir dengan salah satunya
 * ketinggalan saat ada kolom baru.
 *
 * @returns {Promise<object|null>} null kalau aset tidak ada / sudah dihapus
 */
async function buildAssetDetail(id) {
  const [rows] = await pool.query(
    `SELECT a.*, c.name AS category_name, t.name AS asset_type_name, d.code AS department_code, d.name AS department_name, l.name AS location_name, l.code AS location_code,
            sl.name AS sub_location_name, sl.code AS sub_location_code,
            ol.name AS origin_location_name, osl.name AS origin_sub_location_name
     FROM assets a
     JOIN asset_categories c ON c.id = a.category_id
     LEFT JOIN asset_types t ON t.id = a.asset_type_id
     LEFT JOIN locations l ON l.id = a.location_id
     LEFT JOIN sub_locations sl ON sl.id = a.sub_location_id
     LEFT JOIN departments d ON d.id = a.department_id
     LEFT JOIN locations ol ON ol.id = a.origin_location_id
     LEFT JOIN sub_locations osl ON osl.id = a.origin_sub_location_id
     WHERE a.id = :id AND a.deleted_at IS NULL`,
    { id }
  );
  const asset = rows[0];
  if (!asset) return null;

  const customFields = await getCustomFieldValues(id);

  const [qrRows] = await pool.query(`SELECT code, scan_url, image_path, scan_count FROM qr_codes WHERE asset_id = :id`, { id });
  const [historyRows] = await pool.query(
    `SELECT h.old_status, h.new_status, h.changed_at, h.notes, u.name AS changed_by_name
     FROM asset_status_histories h LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.asset_id = :id ORDER BY h.changed_at DESC`,
    { id }
  );

  /* Custody: penugasan yang sedang aktif + seluruh riwayat serah terima.
     Keduanya diambil dalam satu query, lalu dipisah — riwayat penugasan
     jumlahnya selalu kecil per aset. */
  const [assignmentRows] = await pool.query(
    `SELECT asg.*, ub.name AS assigned_by_name, ur.name AS returned_by_name
     FROM asset_assignments asg
     LEFT JOIN users ub ON ub.id = asg.assigned_by
     LEFT JOIN users ur ON ur.id = asg.returned_by
     WHERE asg.asset_id = :id
     ORDER BY asg.assigned_at DESC, asg.id DESC`,
    { id }
  );

  return {
    ...asset,
    customFields,
    qr: qrRows[0] || null,
    statusHistory: historyRows,
    currentAssignment: assignmentRows.find((a) => !a.returned_at) || null,
    assignmentHistory: assignmentRows,
    depreciation: calculateDepreciation(asset),
    warranty: warrantyStatus(asset.warranty_expiry),
  };
}

// GET /api/assets/:id
const getAsset = asyncHandler(async (req, res) => {
  const detail = await buildAssetDetail(req.params.id);
  if (!detail) return res.status(404).json({ message: 'Aset tidak ditemukan.' });
  res.json(detail);
});

/**
 * GET /api/assets/by-code/:code
 *
 * Menukar token pada Kode QR dengan detail asetnya. Inilah yang membuat hasil
 * pindaian bisa DIKERJAKAN, bukan sekadar dibaca: petugas yang sudah masuk dan
 * punya izin mendapat data lengkap beserta tombol aksinya, sementara orang luar
 * yang memindai label yang sama tetap mendarat di halaman publik read-only.
 *
 * Sengaja TIDAK menaikkan scan_count — angka itu dimaksudkan menghitung
 * pemindaian oleh pihak luar, dan pengecekan rutin oleh petugas (apalagi saat
 * stok opname) akan membuatnya tidak berarti lagi.
 */
const getAssetByCode = asyncHandler(async (req, res) => {
  const { code } = req.params;

  const [rows] = await pool.query(
    `SELECT asset_id FROM qr_codes WHERE code = :code LIMIT 1`,
    { code }
  );
  if (!rows[0]) return res.status(404).json({ message: 'Kode QR tidak dikenali.' });

  const detail = await buildAssetDetail(rows[0].asset_id);
  if (!detail) return res.status(404).json({ message: 'Aset untuk Kode QR ini sudah dihapus.' });

  res.json(detail);
});

// POST /api/assets
const createAsset = asyncHandler(async (req, res) => {
  const { categoryId, assetTypeId, name, brand, model, serialNumber, specDetail, condition, status, locationId, subLocationId, departmentId, sequenceNo: manualSequence, purchaseDate, purchasePrice, warrantyExpiry, usefulLifeMonths, salvageValue, saleValueNet, soldDate, soldPrice, vendor, notes, retiredDate, retiredReason, retiredDocNo, customFields } = req.body;

  if (!categoryId || !name || !locationId) {
    return res.status(400).json({ message: 'categoryId, locationId, dan name wajib diisi.' });
  }
  if (status === 'dijual' && !saleValueNet) {
    return res.status(400).json({ message: 'Harga Jual/Net wajib diisi untuk status Dijual.' });
  }
  if (status === 'terjual' && !soldPrice) {
    return res.status(400).json({ message: 'Harga Terjual wajib diisi untuk status Terjual.' });
  }
  if (REASON_REQUIRED_STATUSES.includes(status) && !String(retiredReason || '').trim()) {
    return res.status(400).json({ message: 'Alasan wajib diisi untuk status Hilang atau Dihapuskan.' });
  }

  const hasManualInput = manualSequence !== undefined && manualSequence !== null && String(manualSequence).trim() !== '';

  /* Generate QR di luar transaksi — murni komputasi (bikin UUID + gambar QR),
     tidak menyentuh database sama sekali, jadi tidak ada gunanya ikut
     ditahan sampai transaksi commit. */
  const { code: qrCode, scanUrl, imageDataUrl } = await generateAssetQr();

  /* Baris aset, nilai bidang kustom, riwayat status awal, dan Kode QR-nya
     sekarang satu transaksi — sebelumnya empat `pool.query` terpisah, jadi
     proses yang terhenti di tengah jalan bisa meninggalkan aset tanpa Kode
     QR (memutus alur pindai) atau tanpa riwayat status awal. */
  const conn = await pool.getConnection();
  let assetCode, sequenceNo, assetId;
  try {
    await conn.beginTransaction();

    let result;
    for (let attempt = 1; attempt <= MAX_CODE_GENERATION_RETRIES; attempt++) {
      ({ assetCode, sequenceNo } = await buildAssetCode({ locationId, subLocationId, categoryId, manualSequence }));

      try {
        [result] = await conn.query(
          `INSERT INTO assets (asset_code, sequence_no, category_id, asset_type_id, name, brand, model, serial_number, spec_detail, condition_status, status, location_id, sub_location_id, department_id, purchase_date, purchase_price, warranty_expiry, useful_life_months, salvage_value, sale_value_net, sold_date, sold_price, vendor, notes, retired_date, retired_reason, retired_doc_no, created_by, updated_by)
           VALUES (:assetCode, :sequenceNo, :categoryId, :assetTypeId, :name, :brand, :model, :serialNumber, :specDetail, :condition, :status, :locationId, :subLocationId, :departmentId, :purchaseDate, :purchasePrice, :warrantyExpiry, :usefulLifeMonths, :salvageValue, :saleValueNet, :soldDate, :soldPrice, :vendor, :notes, :retiredDate, :retiredReason, :retiredDocNo, :userId, :userId)`,
          {
            assetCode, sequenceNo, categoryId, assetTypeId: assetTypeId || null, name,
            brand: brand || null, model: model || null, serialNumber: serialNumber || null, specDetail: specDetail || null,
            condition: condition || 'baik',
            status: status || 'idle', locationId, subLocationId: subLocationId || null,
            departmentId: departmentId || null,
            purchaseDate: purchaseDate || null, purchasePrice: purchasePrice || null,
            warrantyExpiry: warrantyExpiry || null,
            usefulLifeMonths: usefulLifeMonths || null,
            salvageValue: salvageValue || null,
            saleValueNet: saleValueNet || null,
            soldDate: soldDate || null, soldPrice: soldPrice || null,
            vendor: vendor || null, notes: notes || null,
            retiredDate: retiredDate || null,
            retiredReason: retiredReason || null,
            retiredDocNo: retiredDocNo || null,
            userId: req.user.id,
          }
        );
        break; // berhasil, keluar dari loop retry
      } catch (err) {
        const isDuplicate = err.code === 'ER_DUP_ENTRY';
        // Kalau nomor diisi manual dan ternyata bentrok (race condition langka), jangan diam-diam ganti nomor — beri tahu user.
        if (isDuplicate && hasManualInput) {
          await conn.rollback();
          return res.status(409).json({ message: `Nomor urut ${sequenceNo} baru saja dipakai aset lain. Coba nomor lain atau kosongkan untuk otomatis.` });
        }
        // Kalau auto-generate dan bentrok (dua orang generate bersamaan), coba lagi dengan nomor berikutnya.
        if (isDuplicate && attempt < MAX_CODE_GENERATION_RETRIES) {
          continue;
        }
        throw err;
      }
    }

    assetId = result.insertId;

    await saveCustomFieldValues(assetId, customFields, conn);

    // Catat status awal
    await conn.query(
      `INSERT INTO asset_status_histories (asset_id, old_status, new_status, changed_by, notes)
       VALUES (:assetId, NULL, :status, :userId, 'Aset dibuat')`,
      { assetId, status: status || 'idle', userId: req.user.id }
    );

    await conn.query(
      `INSERT INTO qr_codes (asset_id, code, scan_url, image_path, generated_by) VALUES (:assetId, :code, :scanUrl, :imagePath, :userId)`,
      { assetId, code: qrCode, scanUrl, imagePath: imageDataUrl, userId: req.user.id }
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  await logAudit({ userId: req.user.id, action: 'create', entityType: 'asset', entityId: assetId, newValues: req.body });

  res.status(201).json({ id: assetId, assetCode, qr: { code: qrCode, scanUrl, imageDataUrl } });
});

// PUT /api/assets/:id
// Catatan: endpoint ini mendukung update PARSIAL. Field yang tidak dikirim di body
// (undefined) akan dipertahankan dari nilai yang sudah ada di database — bukan ditimpa
// jadi kosong/null. Ini penting karena beberapa aksi (mis. ubah status massal, pindah
// lokasi massal) sengaja hanya mengirim sebagian field, mis. { status, locationId, subLocationId }.
const updateAsset = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const body = req.body;

  const [existingRows] = await pool.query(`SELECT * FROM assets WHERE id = :id AND deleted_at IS NULL`, { id });
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ message: 'Aset tidak ditemukan.' });

  // pick(bodyKey, dbColumn): pakai nilai dari body kalau dikirim (termasuk kalau sengaja dikosongkan jadi ''/null),
  // kalau tidak dikirim sama sekali (undefined) pertahankan nilai lama.
  const pick = (bodyKey, dbColumn) => (body[bodyKey] !== undefined ? body[bodyKey] : existing[dbColumn]);

  const categoryId = pick('categoryId', 'category_id');
  const assetTypeId = pick('assetTypeId', 'asset_type_id') || null;
  const name = pick('name', 'name');
  const brand = pick('brand', 'brand') || null;
  const model = pick('model', 'model') || null;
  const serialNumber = pick('serialNumber', 'serial_number') || null;
  const specDetail = pick('specDetail', 'spec_detail') || null;
  const condition = pick('condition', 'condition_status') || 'baik';
  const status = pick('status', 'status');
  const locationId = pick('locationId', 'location_id') || null;
  const subLocationId = pick('subLocationId', 'sub_location_id') || null;
  const departmentId = pick('departmentId', 'department_id') || null;
  const purchaseDate = pick('purchaseDate', 'purchase_date') || null;
  const purchasePrice = pick('purchasePrice', 'purchase_price') || null;
  const warrantyExpiry = pick('warrantyExpiry', 'warranty_expiry') || null;
  const usefulLifeMonths = pick('usefulLifeMonths', 'useful_life_months') || null;
  const salvageValue = pick('salvageValue', 'salvage_value') || null;
  const saleValueNet = pick('saleValueNet', 'sale_value_net') || null;
  const soldDate = pick('soldDate', 'sold_date') || null;
  const soldPrice = pick('soldPrice', 'sold_price') || null;
  const vendor = pick('vendor', 'vendor') || null;
  const notes = pick('notes', 'notes') || null;
  const retiredDate = pick('retiredDate', 'retired_date') || null;
  const retiredReason = pick('retiredReason', 'retired_reason') || null;
  const retiredDocNo = pick('retiredDocNo', 'retired_doc_no') || null;
  const customFields = body.customFields;

  if (status === 'dijual' && !saleValueNet) {
    return res.status(400).json({ message: 'Harga Jual/Net wajib diisi untuk status Dijual.' });
  }
  if (status === 'terjual' && !soldPrice) {
    return res.status(400).json({ message: 'Harga Terjual wajib diisi untuk status Terjual.' });
  }
  if (REASON_REQUIRED_STATUSES.includes(status) && !String(retiredReason || '').trim()) {
    return res.status(400).json({ message: 'Alasan wajib diisi untuk status Hilang atau Dihapuskan.' });
  }

  const locationChanged = String(locationId || '') !== String(existing.location_id || '') || String(subLocationId || '') !== String(existing.sub_location_id || '');
  const statusChanging = status && status !== existing.status;

  // Aset yang sedang "dipindah" hanya boleh diubah ke Dipakai/Menganggur kalau lokasi tujuan
  // SAMA PERSIS dengan lokasi asal (origin_location_id/origin_sub_location_id) — auto-detect
  // "kembali ke lokasi semula". Selama belum kembali, status tetap dikunci di Dipindah.
  if (existing.status === 'dipindah' && statusChanging && RETURN_ONLY_STATUSES.includes(status)) {
    const backToOrigin = String(locationId || '') === String(existing.origin_location_id || '')
      && String(subLocationId || '') === String(existing.origin_sub_location_id || '');
    if (!backToOrigin) {
      return res.status(400).json({
        message: 'Status hanya bisa diubah ke Dipakai/Menganggur jika aset dikembalikan ke lokasi & sub lokasi semula terlebih dahulu.',
      });
    }
  }

  // Tentukan origin_location_id/origin_sub_location_id yang baru:
  // - Baru masuk status "dipindah" (dari status lain) -> simpan lokasi SAAT INI (sebelum update) sebagai lokasi asal.
  // - Sudah "dipindah" lalu dipindah lagi ke lokasi lain -> lokasi asal awal dipertahankan (bukan lokasi transit).
  // - Keluar dari "dipindah" ke Dipakai/Menganggur (sudah kembali ke asal) -> lokasi asal dikosongkan lagi.
  let originLocationId = existing.origin_location_id;
  let originSubLocationId = existing.origin_sub_location_id;
  if (statusChanging && status === 'dipindah' && existing.status !== 'dipindah') {
    originLocationId = existing.location_id;
    originSubLocationId = existing.sub_location_id;
  } else if (statusChanging && existing.status === 'dipindah' && RETURN_ONLY_STATUSES.includes(status)) {
    originLocationId = null;
    originSubLocationId = null;
  }

  await pool.query(
    `UPDATE assets SET category_id = :categoryId, asset_type_id = :assetTypeId, name = :name, brand = :brand, model = :model,
       serial_number = :serialNumber, spec_detail = :specDetail, condition_status = :condition, status = :status, location_id = :locationId, sub_location_id = :subLocationId,
       origin_location_id = :originLocationId, origin_sub_location_id = :originSubLocationId,
       department_id = :departmentId,
       retired_date = :retiredDate, retired_reason = :retiredReason, retired_doc_no = :retiredDocNo,
       purchase_date = :purchaseDate, purchase_price = :purchasePrice,
       warranty_expiry = :warrantyExpiry, useful_life_months = :usefulLifeMonths, salvage_value = :salvageValue,
       sale_value_net = :saleValueNet, sold_date = :soldDate, sold_price = :soldPrice,
       vendor = :vendor, notes = :notes, updated_by = :userId
     WHERE id = :id`,
    {
      id, categoryId, assetTypeId, name, brand, model, serialNumber, specDetail,
      condition,
      status, locationId, subLocationId, departmentId,
      retiredDate, retiredReason, retiredDocNo,
      originLocationId, originSubLocationId,
      purchaseDate, purchasePrice,
      warrantyExpiry, usefulLifeMonths, salvageValue,
      saleValueNet,
      soldDate, soldPrice,
      vendor, notes, userId: req.user.id,
    }
  );

  await saveCustomFieldValues(id, customFields);

  // Jika status berubah, catat ke histori. Kalau status baru "dipindah" dan lokasi/sub lokasi
  // ikut berubah, catat juga perpindahannya di kolom notes — id & kode aset TIDAK berubah.
  if (statusChanging) {
    const moveNote = status === 'dipindah' && locationChanged ? 'Aset dipindahkan ke lokasi/sub lokasi baru.' : null;
    const returnNote = existing.status === 'dipindah' && RETURN_ONLY_STATUSES.includes(status) ? 'Aset kembali ke lokasi/sub lokasi semula.' : null;
    await pool.query(
      `INSERT INTO asset_status_histories (asset_id, old_status, new_status, changed_by, notes) VALUES (:id, :oldStatus, :newStatus, :userId, :notes)`,
      { id, oldStatus: existing.status, newStatus: status, userId: req.user.id, notes: moveNote || returnNote }
    );
  }

  await logAudit({ userId: req.user.id, action: 'update', entityType: 'asset', entityId: id, oldValues: existing, newValues: req.body });

  res.json({ message: 'Aset berhasil diperbarui.' });
});

// DELETE /api/assets/:id (soft delete)
const deleteAsset = asyncHandler(async (req, res) => {
  const { id } = req.params;
  // Bebaskan sequence_no & "cadangkan" asset_code lama (supaya tidak bentrok UNIQUE constraint kalau
  // nomor yang sama dipakai lagi oleh aset baru nanti) sambil tetap menyimpan datanya untuk histori/audit.
  // Guard "deleted_at IS NULL" mencegah kode lama ke-mangle berkali-kali kalau endpoint ini terpanggil dobel.
  const [result] = await pool.query(
    `UPDATE assets
     SET deleted_at = NOW(),
         sequence_no = NULL,
         asset_code = CONCAT(asset_code, '-DEL-', id)
     WHERE id = :id AND deleted_at IS NULL`,
    { id }
  );
  if (result.affectedRows === 0) {
    return res.status(404).json({ message: 'Aset tidak ditemukan atau sudah dihapus sebelumnya.' });
  }
  await logAudit({ userId: req.user.id, action: 'delete', entityType: 'asset', entityId: id });
  res.json({ message: 'Aset berhasil dihapus.' });
});

// POST /api/assets/import — import massal Aset dari file CSV
//
// Kolom WAJIB   : location, category (kode barang/aset)
// Kolom OPSIONAL: sub_location, id (nomor urut), name, asset_type, condition,
//                 spec_detail, brand, model, status, sale_value_net, sold_date, sold_price
//
// asset_code (kode unik aset) TIDAK diinput manual — server menyusunnya otomatis dari
// location + sub_location + category + id (nomor urut), persis seperti saat
// menambah aset satu-satu lewat form. Kolom "id" boleh dikosongkan agar diisi otomatis
// (nomor urut global terkecil yang belum dipakai). Detail lain yang dikosongkan (name,
// asset_type, condition, status, dst.) akan diisi nilai default dan bisa dilengkapi
// belakangan lewat menu Edit Aset.
const importAssets = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Berkas CSV wajib diunggah.' });
  }

  const rows = parseCsv(req.file.buffer.toString('utf-8'));
  if (rows.length === 0) {
    return res.status(400).json({ message: 'Berkas CSV kosong atau formatnya tidak terbaca.' });
  }

  const requiredHeaders = ['location', 'category'];
  const actualHeaders = Object.keys(rows[0]);
  const missingHeaders = requiredHeaders.filter((h) => !actualHeaders.includes(h));
  if (missingHeaders.length > 0) {
    return res.status(400).json({
      message: `Kolom wajib tidak ditemukan: ${missingHeaders.join(', ')}. Header minimal yang diharapkan: ${requiredHeaders.join(', ')}.`,
    });
  }

  const summary = {
    assetsCreated: 0,
    skipped: [], // { row, reason }
    errors: [],  // { row, reason }
  };

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // +2 karena baris 1 adalah header, dan index dimulai dari 0
    const row = rows[i];

    const locationCode = (row.location || '').trim();
    const subLocationCode = (row.sub_location || '').trim();
    const categoryCode = (row.category || '').trim();
    const sequenceRaw = (row.id || '').trim();
    const name = (row.name || '').trim();
    const assetTypeName = (row.asset_type || '').trim();
    const conditionRaw = (row.condition || '').trim();
    const statusRaw = (row.status || '').trim();
    const specDetail = (row.spec_detail || '').trim();
    const brand = (row.brand || '').trim();
    const model = (row.model || '').trim();
    // Kolom opsional — hanya relevan/wajib tergantung status baris ini (lihat validasi di langkah 6b).
    const saleValueNetRaw = (row.sale_value_net || '').trim();
    const soldDateRaw = (row.sold_date || '').trim();
    const soldPriceRaw = (row.sold_price || '').trim();

    if (!locationCode || !categoryCode) {
      summary.errors.push({ row: rowNum, reason: 'location dan category wajib diisi.' });
      continue;
    }

    // 1. Validasi lokasi & sub lokasi (sub lokasi opsional) sudah terdaftar/aktif
    const [locRows] = await pool.query(`SELECT id, code FROM locations WHERE code = :code AND is_active = TRUE`, { code: locationCode });
    if (!locRows[0]) {
      summary.errors.push({ row: rowNum, reason: `Lokasi dengan kode "${locationCode}" belum terdaftar/aktif. Tambahkan dulu di menu Lokasi.` });
      continue;
    }

    let subLocationRow = null;
    if (subLocationCode) {
      const [subRows] = await pool.query(
        `SELECT id, code FROM sub_locations WHERE code = :code AND location_id = :locationId AND is_active = TRUE`,
        { code: subLocationCode, locationId: locRows[0].id }
      );
      if (!subRows[0]) {
        summary.errors.push({ row: rowNum, reason: `Sub lokasi dengan kode "${subLocationCode}" belum terdaftar/aktif untuk lokasi "${locationCode}". Tambahkan dulu di menu Lokasi.` });
        continue;
      }
      subLocationRow = subRows[0];
    }

    // 2. Validasi kode barang/aset sudah terdaftar/aktif
    const [catRows] = await pool.query(`SELECT id, name, slug FROM asset_categories WHERE slug = :slug AND is_active = TRUE`, { slug: categoryCode });
    if (!catRows[0]) {
      summary.errors.push({ row: rowNum, reason: `Kode barang/aset "${categoryCode}" belum terdaftar/aktif. Tambahkan dulu di menu Kode Barang/Aset.` });
      continue;
    }

    // 3. Kolom "id" (nomor urut) opsional — kalau diisi harus angka positif (keunikannya dicek oleh buildAssetCode di langkah 7)
    if (sequenceRaw && (!Number.isInteger(Number(sequenceRaw)) || Number(sequenceRaw) <= 0)) {
      summary.errors.push({ row: rowNum, reason: `Kolom "id" (nomor urut) "${sequenceRaw}" tidak valid, harus berupa angka positif atau dikosongkan untuk otomatis.` });
      continue;
    }

    // 4. Validasi kategori aset (dropdown baru, terpisah dari kode barang/aset) — opsional
    let assetTypeId = null;
    if (assetTypeName) {
      const [typeRows] = await pool.query(`SELECT id FROM asset_types WHERE name = :name AND is_active = TRUE`, { name: assetTypeName });
      if (!typeRows[0]) {
        summary.errors.push({ row: rowNum, reason: `Kategori aset "${assetTypeName}" belum terdaftar/aktif. Tambahkan dulu di menu Kategori Aset.` });
        continue;
      }
      assetTypeId = typeRows[0].id;
    }

    // 5. Kondisi — opsional, default 'baik' kalau kosong
    let condition = 'baik';
    if (conditionRaw) {
      const mapped = CONDITION_LABEL_TO_VALUE[conditionRaw.toLowerCase()];
      if (!mapped) {
        summary.errors.push({ row: rowNum, reason: `Kondisi "${conditionRaw}" tidak valid. Gunakan salah satu: Baik, Rusak Ringan, Rusak Berat, atau kosongkan.` });
        continue;
      }
      condition = mapped;
    }

    // 6. Status — opsional, default 'idle' kalau kosong
    let status = 'idle';
    if (statusRaw) {
      const mapped = VALID_STATUSES.find((s) => s === statusRaw.toLowerCase());
      if (!mapped) {
        summary.errors.push({ row: rowNum, reason: `Status "${statusRaw}" tidak valid. Gunakan salah satu: ${VALID_STATUSES.join(', ')}, atau kosongkan.` });
        continue;
      }
      status = mapped;
    }

    // 6b. Kolom finansial wajib mengikuti status — sama seperti aturan di form Tambah/Edit Aset.
    if (status === 'dijual' && !saleValueNetRaw) {
      summary.errors.push({ row: rowNum, reason: 'Status "dijual" wajib mengisi kolom sale_value_net (harga jual/net).' });
      continue;
    }
    if (status === 'terjual' && !soldPriceRaw) {
      summary.errors.push({ row: rowNum, reason: 'Status "terjual" wajib mengisi kolom sold_price (harga aset terjual).' });
      continue;
    }
    const saleValueNet = status === 'dijual' && saleValueNetRaw ? Number(saleValueNetRaw) : null;
    const soldPrice = status === 'terjual' && soldPriceRaw ? Number(soldPriceRaw) : null;
    const soldDate = status === 'terjual' && soldDateRaw ? soldDateRaw : null;
    if (saleValueNetRaw && Number.isNaN(saleValueNet)) {
      summary.errors.push({ row: rowNum, reason: `sale_value_net "${saleValueNetRaw}" harus berupa angka.` });
      continue;
    }
    if (soldPriceRaw && Number.isNaN(soldPrice)) {
      summary.errors.push({ row: rowNum, reason: `sold_price "${soldPriceRaw}" harus berupa angka.` });
      continue;
    }

    // 7. Susun asset_code otomatis (server-side) dari lokasi + sub lokasi + kode barang + nomor urut,
    // sama seperti alur Tambah Aset satu-satu. Nomor urut auto-generate kalau sequence_no dikosongkan,
    // dan retry beberapa kali kalau kebetulan bentrok dengan baris/import lain yang berjalan bersamaan.
    let assetCode, sequenceNo, insertResult;
    let rowFailed = false;
    for (let attempt = 1; attempt <= MAX_CODE_GENERATION_RETRIES; attempt++) {
      try {
        ({ assetCode, sequenceNo } = await buildAssetCode({
          locationId: locRows[0].id,
          subLocationId: subLocationRow?.id || null,
          categoryId: catRows[0].id,
          manualSequence: sequenceRaw || undefined,
        }));
      } catch (err) {
        summary.errors.push({ row: rowNum, reason: err.message });
        rowFailed = true;
        break;
      }

      // Nama boleh dikosongkan di CSV — pakai default yang masih informatif, bisa dilengkapi lewat Edit Aset nanti.
      const finalName = name || `${catRows[0].name} ${String(sequenceNo).padStart(4, '0')}`;

      try {
        [insertResult] = await pool.query(
          `INSERT INTO assets (asset_code, sequence_no, category_id, asset_type_id, name, brand, model, spec_detail, condition_status, status, location_id, sub_location_id, sale_value_net, sold_date, sold_price, created_by, updated_by)
           VALUES (:assetCode, :sequenceNo, :categoryId, :assetTypeId, :name, :brand, :model, :specDetail, :condition, :status, :locationId, :subLocationId, :saleValueNet, :soldDate, :soldPrice, :userId, :userId)`,
          {
            assetCode, sequenceNo, categoryId: catRows[0].id, assetTypeId, name: finalName,
            brand: brand || null, model: model || null, specDetail: specDetail || null,
            condition, status, locationId: locRows[0].id, subLocationId: subLocationRow?.id || null,
            saleValueNet, soldDate, soldPrice,
            userId: req.user.id,
          }
        );
        break; // berhasil, keluar dari loop retry
      } catch (err) {
        const isDuplicate = err.code === 'ER_DUP_ENTRY';
        const hasManualInput = Boolean(sequenceRaw);
        if (isDuplicate && hasManualInput) {
          summary.skipped.push({ row: rowNum, reason: `Kode aset "${assetCode}" sudah ada, dilewati.` });
          rowFailed = true;
          break;
        }
        if (isDuplicate && attempt < MAX_CODE_GENERATION_RETRIES) {
          continue; // auto-generate bentrok (jarang terjadi), coba nomor berikutnya
        }
        summary.errors.push({ row: rowNum, reason: `Gagal menyimpan baris ini: ${err.message}` });
        rowFailed = true;
        break;
      }
    }
    if (rowFailed) continue;

    const assetId = insertResult.insertId;

    await pool.query(
      `INSERT INTO asset_status_histories (asset_id, old_status, new_status, changed_by, notes)
       VALUES (:assetId, NULL, :status, :userId, 'Aset dibuat via import CSV')`,
      { assetId, status, userId: req.user.id }
    );

    const { code, scanUrl, imageDataUrl } = await generateAssetQr();
    await pool.query(
      `INSERT INTO qr_codes (asset_id, code, scan_url, image_path, generated_by) VALUES (:assetId, :code, :scanUrl, :imagePath, :userId)`,
      { assetId, code, scanUrl, imagePath: imageDataUrl, userId: req.user.id }
    );

    summary.assetsCreated++;
  }

  await logAudit({ userId: req.user.id, action: 'create', entityType: 'asset_import', newValues: summary });

  res.json(summary);
});

/**
 * GET /api/assets/export — unduh Daftar Aset sebagai CSV.
 *
 * Menerima query filter yang sama persis dengan listAssets, jadi tombol
 * "Ekspor CSV" di layar selalu mengunduh apa yang sedang terlihat — bukan
 * seluruh isi tabel. Sengaja TIDAK dipaginasi: yang diekspor adalah seluruh
 * baris yang cocok dengan filter, bukan hanya halaman yang sedang dibuka.
 *
 * Kolomnya disusun agar bisa dibaca manusia (label, bukan enum mentah) sekaligus
 * tetap cocok dengan format impor untuk kolom-kolom yang memang sama.
 */
const exportAssets = asyncHandler(async (req, res) => {
  const { whereClause, params } = buildAssetFilter(req.query);

  const [rows] = await pool.query(
    `SELECT a.asset_code, a.sequence_no, a.name, a.brand, a.model, a.serial_number,
            a.spec_detail, a.condition_status, a.status,
            a.retired_date, a.retired_reason, a.retired_doc_no,
            d.code AS department_code, d.name AS department_name,
            c.name AS category_name, t.name AS asset_type_name,
            l.code AS location_code, l.name AS location_name,
            sl.code AS sub_location_code, sl.name AS sub_location_name,
            asg.holder_name, asg.department AS holder_department, asg.assigned_at,
            a.vendor, a.purchase_date, a.purchase_price,
            a.warranty_expiry, a.useful_life_months, a.salvage_value,
            a.sale_value_net, a.sold_date, a.sold_price,
            a.notes, a.created_at
     FROM assets a
     JOIN asset_categories c ON c.id = a.category_id
     LEFT JOIN asset_types t ON t.id = a.asset_type_id
     LEFT JOIN locations l ON l.id = a.location_id
     LEFT JOIN sub_locations sl ON sl.id = a.sub_location_id
     LEFT JOIN departments d ON d.id = a.department_id
     LEFT JOIN asset_assignments asg ON asg.asset_id = a.id AND asg.returned_at IS NULL
     ${whereClause}
     ORDER BY (a.sequence_no IS NULL) ASC, a.sequence_no ASC, a.created_at DESC`,
    params
  );

  const STATUS_LABEL = {
    dijual: 'Dijual', terjual: 'Terjual', dipindah: 'Dipindahkan',
    dipakai: 'Dipakai', idle: 'Menganggur',
    hilang: 'Hilang', dihapuskan: 'Dihapuskan',
  };

  const headers = [
    'Kode Aset', 'Nomor Urut', 'Nama Aset', 'Brand', 'Model', 'Nomor Seri',
    'Detail Spesifikasi', 'Kondisi', 'Status', 'Kode Barang/Aset', 'Kategori Aset',
    'Kode Lokasi', 'Lokasi', 'Kode Sub Lokasi', 'Sub Lokasi',
    'Kode Departemen', 'Departemen',
    'Pemegang', 'Departemen Pemegang', 'Sejak',
    'Vendor', 'Tanggal Beli', 'Harga Beli',
    'Garansi Berakhir', 'Masa Manfaat (bulan)', 'Nilai Residu', 'Nilai Buku',
    'Harga Jual/Net', 'Tanggal Terjual', 'Harga Terjual',
    'Tanggal Keluar', 'Alasan Keluar', 'No. Berita Acara',
    'Catatan', 'Dibuat',
  ];

  const asDate = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');

  const toCell = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    // Bungkus dengan tanda kutip kalau mengandung pemisah, kutip, atau baris baru.
    return /[",\r\n;]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const lines = [headers.join(',')];
  for (const r of rows) {
    // Nilai buku dihitung saat ekspor supaya laporan keuangan tidak perlu
    // menurunkannya sendiri dari harga beli + masa manfaat.
    const dep = calculateDepreciation(r);

    lines.push([
      r.asset_code, r.sequence_no, r.name, r.brand, r.model, r.serial_number,
      r.spec_detail, CONDITION_VALUE_TO_LABEL[r.condition_status] || r.condition_status,
      STATUS_LABEL[r.status] || r.status,
      r.category_name, r.asset_type_name,
      r.location_code, r.location_name, r.sub_location_code, r.sub_location_name,
      r.department_code, r.department_name,
      r.holder_name, r.holder_department, asDate(r.assigned_at),
      r.vendor, asDate(r.purchase_date), r.purchase_price,
      asDate(r.warranty_expiry), r.useful_life_months, r.salvage_value,
      dep ? dep.bookValue : '',
      r.sale_value_net, asDate(r.sold_date), r.sold_price,
      asDate(r.retired_date), r.retired_reason, r.retired_doc_no,
      r.notes, asDate(r.created_at),
    ].map(toCell).join(','));
  }

  await logAudit({
    userId: req.user.id,
    // Butuh migration_add_audit_export_action.sql — nilai 'export' baru
    // ditambahkan ke ENUM audit_logs.action. Kalau migrasi belum dijalankan,
    // pencatatan audit-nya gagal diam-diam (ditangkap auditLogger) dan ekspor
    // tetap berjalan normal.
    action: 'export',
    entityType: 'asset_export',
    newValues: { rows: rows.length, filter: req.query },
    ipAddress: req.ip,
  });

  const stamp = todayLocal();
  // BOM di depan supaya Excel membaca UTF-8 (nama berlokasi/aksen) dengan benar.
  const csv = `\uFEFF${lines.join('\r\n')}`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="daftar-aset-${stamp}.csv"`);
  res.send(csv);
});

module.exports = { listAssets, getAsset, getAssetByCode, createAsset, updateAsset, deleteAsset, importAssets, exportAssets };
