const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const parseCsv = require('../utils/csvParser');
const { buildCsv } = require('../utils/csv');
const { todayLocal } = require('../utils/dateLocal');

// GET /api/locations
const listLocations = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, code, name, description, is_active FROM locations WHERE tenant_id = :tenantId AND is_active = TRUE ORDER BY name ASC`,
    { tenantId: req.user.tenant_id }
  );
  res.json(rows);
});

// POST /api/locations
const createLocation = asyncHandler(async (req, res) => {
  const { code, name, description } = req.body;
  const tenantId = req.user.tenant_id;
  if (!code || !name) {
    return res.status(400).json({ message: 'Kode dan nama lokasi wajib diisi.' });
  }
  if (code.includes('/')) {
    return res.status(400).json({ message: 'Kode lokasi tidak boleh mengandung karakter "/" (dipakai sebagai pemisah pada kode aset).' });
  }

  const [existing] = await pool.query(`SELECT id, is_active FROM locations WHERE tenant_id = :tenantId AND code = :code`, { tenantId, code });
  if (existing[0] && existing[0].is_active) {
    return res.status(409).json({ message: 'Kode lokasi sudah digunakan.' });
  }
  if (existing[0] && !existing[0].is_active) {
    // Kode ini pernah dipakai lokasi yang sudah dihapus (soft-delete) — aktifkan kembali alih-alih menolak.
    await pool.query(`UPDATE locations SET is_active = TRUE, name = :name WHERE id = :id`, { id: existing[0].id, name });
    await logAudit({ userId: req.user.id, action: 'update', entityType: 'location', entityId: existing[0].id, newValues: { ...req.body, reactivated: true } });
    return res.status(200).json({ id: existing[0].id, code, name, reactivated: true });
  }

  const [result] = await pool.query(
    `INSERT INTO locations (tenant_id, code, name, description) VALUES (:tenantId, :code, :name, :description) RETURNING id`,
    { tenantId, code, name, description: description || null }
  );
  await logAudit({ userId: req.user.id, action: 'create', entityType: 'location', entityId: result.insertId, newValues: req.body });
  res.status(201).json({ id: result.insertId, code, name });
});

// PUT /api/locations/:id
// Catatan: kode lokasi SENGAJA tidak bisa diubah lewat endpoint ini walau dikirim di body —
// kode dipakai sebagai bagian dari kode aset yang sudah tercetak/di-generate, jadi kalau perlu
// ganti kode, lokasi harus dihapus (soft-delete) lalu dibuat ulang dengan kode baru.
const updateLocation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, isActive } = req.body;
  const tenantId = req.user.tenant_id;

  const [rows] = await pool.query(`SELECT id FROM locations WHERE id = :id AND tenant_id = :tenantId`, { id, tenantId });
  if (!rows[0]) return res.status(404).json({ message: 'Lokasi tidak ditemukan.' });

  await pool.query(
    `UPDATE locations SET name = :name, description = :description, is_active = :isActive WHERE id = :id`,
    { id, name, description: description || null, isActive: isActive ?? true }
  );
  await logAudit({ userId: req.user.id, action: 'update', entityType: 'location', entityId: id, newValues: { name, description, isActive } });
  res.json({ message: 'Lokasi berhasil diperbarui.' });
});

// DELETE /api/locations/:id (soft — nonaktifkan, karena mungkin masih dipakai aset lama)
const deleteLocation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [result] = await pool.query(
    `UPDATE locations SET is_active = FALSE WHERE id = :id AND tenant_id = :tenantId`,
    { id, tenantId: req.user.tenant_id }
  );
  if (result.affectedRows === 0) return res.status(404).json({ message: 'Lokasi tidak ditemukan.' });
  await logAudit({ userId: req.user.id, action: 'delete', entityType: 'location', entityId: id });
  res.json({ message: 'Lokasi berhasil dinonaktifkan.' });
});

// POST /api/locations/import — import massal Lokasi + Sub Lokasi dari file CSV
// Format kolom yang diharapkan: location_code, location_name, sub_location_code, sub_location_name
// (dua kolom terakhir boleh kosong kalau baris itu hanya untuk membuat Lokasi tanpa Sub Lokasi)
const importLocations = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Berkas CSV wajib diunggah.' });
  }

  const rows = parseCsv(req.file.buffer.toString('utf-8'));
  if (rows.length === 0) {
    return res.status(400).json({ message: 'Berkas CSV kosong atau formatnya tidak terbaca.' });
  }

  const requiredHeaders = ['location_code', 'location_name'];
  const actualHeaders = Object.keys(rows[0]);
  const missingHeaders = requiredHeaders.filter((h) => !actualHeaders.includes(h));
  if (missingHeaders.length > 0) {
    return res.status(400).json({
      message: `Kolom wajib tidak ditemukan: ${missingHeaders.join(', ')}. Header yang diharapkan: location_code, location_name, sub_location_code, sub_location_name.`,
    });
  }

  const tenantId = req.user.tenant_id;
  const summary = {
    locationsCreated: 0,
    locationsReactivated: 0,
    subLocationsCreated: 0,
    subLocationsReactivated: 0,
    skipped: [], // { row, reason }
    errors: [],  // { row, reason }
  };

  // Cache supaya tidak query berulang untuk lokasi yang sama di banyak baris
  const locationCache = new Map(); // code -> locationId

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // +2 karena baris 1 adalah header, dan index dimulai dari 0
    const row = rows[i];
    const locationCode = (row.location_code || '').trim();
    const locationName = (row.location_name || '').trim();
    const subLocationCode = (row.sub_location_code || '').trim();
    const subLocationName = (row.sub_location_name || '').trim();

    if (!locationCode || !locationName) {
      summary.errors.push({ row: rowNum, reason: 'location_code dan location_name wajib diisi.' });
      continue;
    }
    if (locationCode.includes('/') || subLocationCode.includes('/')) {
      summary.errors.push({ row: rowNum, reason: 'Kode tidak boleh mengandung karakter "/".' });
      continue;
    }

    // ===== Lokasi =====
    let locationId;
    if (locationCache.has(locationCode)) {
      locationId = locationCache.get(locationCode);
    } else {
      // Sengaja TIDAK filter is_active di sini — perlu tahu juga kalau kode ini pernah dipakai lokasi yang sudah dihapus (soft-delete),
      // supaya bisa diaktifkan kembali alih-alih dianggap "sudah ada" padahal tidak pernah muncul di dropdown/list.
      const [existingRows] = await pool.query(`SELECT id, is_active FROM locations WHERE tenant_id = :tenantId AND code = :code`, { tenantId, code: locationCode });
      if (existingRows[0] && existingRows[0].is_active) {
        locationId = existingRows[0].id;
        locationCache.set(locationCode, locationId);
        summary.skipped.push({ row: rowNum, reason: `Lokasi "${locationCode}" sudah aktif, dipakai untuk sub lokasi (kalau ada) tapi tidak dibuat ulang.` });
      } else if (existingRows[0] && !existingRows[0].is_active) {
        locationId = existingRows[0].id;
        await pool.query(`UPDATE locations SET is_active = TRUE, name = :name WHERE id = :id`, { id: locationId, name: locationName });
        locationCache.set(locationCode, locationId);
        summary.locationsReactivated++;
      } else {
        const [result] = await pool.query(
          `INSERT INTO locations (tenant_id, code, name) VALUES (:tenantId, :code, :name) RETURNING id`,
          { tenantId, code: locationCode, name: locationName }
        );
        locationId = result.insertId;
        locationCache.set(locationCode, locationId);
        summary.locationsCreated++;
      }
    }

    // ===== Sub Lokasi (opsional) =====
    if (subLocationCode || subLocationName) {
      if (!subLocationCode || !subLocationName) {
        summary.errors.push({ row: rowNum, reason: 'sub_location_code dan sub_location_name harus diisi berdua, atau dikosongkan berdua.' });
        continue;
      }
      const [existingSub] = await pool.query(
        `SELECT id, is_active FROM sub_locations WHERE location_id = :locationId AND code = :code`,
        { locationId, code: subLocationCode }
      );
      if (existingSub[0] && existingSub[0].is_active) {
        summary.skipped.push({ row: rowNum, reason: `Sub lokasi "${subLocationCode}" sudah aktif di lokasi "${locationCode}".` });
        continue;
      }
      if (existingSub[0] && !existingSub[0].is_active) {
        await pool.query(
          `UPDATE sub_locations SET is_active = TRUE, name = :name WHERE id = :id`,
          { id: existingSub[0].id, name: subLocationName }
        );
        summary.subLocationsReactivated++;
        continue;
      }
      await pool.query(
        `INSERT INTO sub_locations (tenant_id, location_id, code, name) VALUES (:tenantId, :locationId, :code, :name)`,
        { tenantId, locationId, code: subLocationCode, name: subLocationName }
      );
      summary.subLocationsCreated++;
    }
  }

  await logAudit({ userId: req.user.id, action: 'create', entityType: 'location_import', newValues: summary });

  res.json(summary);
});

// GET /api/locations/export — satu baris per Sub Lokasi, plus satu baris untuk
// Lokasi yang belum punya Sub Lokasi sama sekali. Format kolomnya SENGAJA
// dibuat sama persis dengan yang diharapkan importLocations (lihat di atas),
// supaya berkas ini bisa langsung dipakai lagi sebagai berkas impor kalau
// perlu dipulihkan atau disalin ke instalasi lain.
const exportLocations = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT l.code AS location_code, l.name AS location_name,
            sl.code AS sub_location_code, sl.name AS sub_location_name
     FROM locations l
     LEFT JOIN sub_locations sl ON sl.location_id = l.id AND sl.is_active = TRUE
     WHERE l.tenant_id = :tenantId AND l.is_active = TRUE
     ORDER BY l.name ASC, sl.name ASC`,
    { tenantId: req.user.tenant_id }
  );

  const headers = ['Kode Lokasi', 'Nama Lokasi', 'Kode Sub Lokasi', 'Nama Sub Lokasi'];
  const csvRows = rows.map((r) => [r.location_code, r.location_name, r.sub_location_code, r.sub_location_name]);
  const csv = buildCsv(headers, csvRows);

  await logAudit({
    userId: req.user.id, action: 'export', entityType: 'location_export',
    newValues: { rows: rows.length }, ipAddress: req.ip,
  });

  const stamp = todayLocal();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="lokasi-${stamp}.csv"`);
  res.send(csv);
});

module.exports = { listLocations, createLocation, updateLocation, deleteLocation, importLocations, exportLocations };
