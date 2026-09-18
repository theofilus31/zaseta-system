const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const parseCsv = require('../utils/csvParser');
const { buildCsv } = require('../utils/csv');
const { todayLocal } = require('../utils/dateLocal');

const listCategories = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, parent_id, name, slug, description, is_active FROM asset_categories WHERE tenant_id = :tenantId ORDER BY name ASC`,
    { tenantId: req.user.tenant_id }
  );
  res.json(rows);
});

const createCategory = asyncHandler(async (req, res) => {
  const { name, slug, description, parentId } = req.body;
  if (!name || !slug) {
    return res.status(400).json({ message: 'Nama dan slug kategori wajib diisi.' });
  }
  if (slug.includes('/')) {
    return res.status(400).json({ message: 'Slug kategori tidak boleh mengandung karakter "/" (dipakai sebagai pemisah pada kode aset).' });
  }
  const [result] = await pool.query(
    `INSERT INTO asset_categories (tenant_id, parent_id, name, slug, description) VALUES (:tenantId, :parentId, :name, :slug, :description) RETURNING id`,
    { tenantId: req.user.tenant_id, parentId: parentId || null, name, slug, description: description || null }
  );
  await logAudit({ userId: req.user.id, action: 'create', entityType: 'asset_category', entityId: result.insertId, newValues: req.body });
  res.status(201).json({ id: result.insertId, name, slug });
});

const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, slug, description, isActive } = req.body;
  const [result] = await pool.query(
    `UPDATE asset_categories SET name = :name, slug = :slug, description = :description, is_active = :isActive
     WHERE id = :id AND tenant_id = :tenantId`,
    { id, name, slug, description: description || null, isActive: isActive ?? true, tenantId: req.user.tenant_id }
  );
  if (result.affectedRows === 0) return res.status(404).json({ message: 'Kode barang/aset tidak ditemukan.' });
  await logAudit({ userId: req.user.id, action: 'update', entityType: 'asset_category', entityId: id, newValues: req.body });
  res.json({ message: 'Kategori berhasil diperbarui.' });
});

const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [rows] = await pool.query(`SELECT id FROM asset_categories WHERE id = :id AND tenant_id = :tenantId`, { id, tenantId: req.user.tenant_id });
  if (!rows[0]) return res.status(404).json({ message: 'Kode barang/aset tidak ditemukan.' });

  const [[used]] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE deleted_at IS NULL) AS active,
       COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS trashed
     FROM assets WHERE category_id = :id`,
    { id }
  );

  /* Kolom category_id di assets bersifat RESTRICT & NOT NULL di database —
     dan constraint itu TIDAK peduli aset sudah di-soft-delete (masuk tempat
     sampah) atau belum, jadi hitungannya wajib mencakup keduanya. Kalau cuma
     menghitung aset aktif, kode barang yang asetnya sudah "dihapus" tapi
     masih di tempat sampah tetap akan gagal dihapus dengan error mentah dari
     MySQL (constraint fk_asset_category) yang tidak bermakna bagi pengguna.
     Lebih baik ditolak dengan angka yang jelas, sama seperti pola di
     deleteDepartment. */
  if (Number(used.total) > 0) {
    const rincian = [
      Number(used.active) > 0 ? `${used.active} aktif` : null,
      Number(used.trashed) > 0 ? `${used.trashed} di tempat sampah` : null,
    ].filter(Boolean).join(', ');

    return res.status(409).json({
      message: `Kode barang ini masih terhubung dengan ${used.total} aset (${rincian}). Pindahkan aset aktif ke kode barang lain, dan hapus permanen aset di tempat sampah, sebelum menghapus kode barang ini.`,
    });
  }

  await pool.query(`DELETE FROM asset_categories WHERE id = :id AND tenant_id = :tenantId`, { id, tenantId: req.user.tenant_id });
  await logAudit({ userId: req.user.id, action: 'delete', entityType: 'asset_category', entityId: id });
  res.json({ message: 'Kategori berhasil dihapus.' });
});

// POST /api/categories/import — import massal Kategori dari file CSV
// Format kolom yang diharapkan: category_code, category_name
const importCategories = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Berkas CSV wajib diunggah.' });
  }

  const rows = parseCsv(req.file.buffer.toString('utf-8'));
  if (rows.length === 0) {
    return res.status(400).json({ message: 'Berkas CSV kosong atau formatnya tidak terbaca.' });
  }

  const requiredHeaders = ['category_code', 'category_name'];
  const actualHeaders = Object.keys(rows[0]);
  const missingHeaders = requiredHeaders.filter((h) => !actualHeaders.includes(h));
  if (missingHeaders.length > 0) {
    return res.status(400).json({
      message: `Kolom wajib tidak ditemukan: ${missingHeaders.join(', ')}. Header yang diharapkan: category_code, category_name.`,
    });
  }

  const tenantId = req.user.tenant_id;
  const summary = {
    categoriesCreated: 0,
    categoriesReactivated: 0,
    skipped: [], // { row, reason }
    errors: [],  // { row, reason }
  };

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // +2 karena baris 1 adalah header, dan index dimulai dari 0
    const row = rows[i];
    const code = (row.category_code || '').trim();
    const name = (row.category_name || '').trim();

    if (!code || !name) {
      summary.errors.push({ row: rowNum, reason: 'category_code dan category_name wajib diisi.' });
      continue;
    }
    if (code.includes('/')) {
      summary.errors.push({ row: rowNum, reason: 'category_code tidak boleh mengandung karakter "/" (dipakai sebagai pemisah pada kode aset).' });
      continue;
    }

    // Sengaja TIDAK filter is_active — perlu tahu juga kalau kode ini pernah dipakai kategori yang sudah dinonaktifkan,
    // supaya bisa diaktifkan kembali alih-alih dianggap "sudah ada" padahal tidak pernah muncul di dropdown/list.
    const [existing] = await pool.query(
      `SELECT id, is_active FROM asset_categories WHERE tenant_id = :tenantId AND slug = :slug`,
      { tenantId, slug: code }
    );
    if (existing[0] && existing[0].is_active) {
      summary.skipped.push({ row: rowNum, reason: `Kategori "${code}" sudah aktif, tidak dibuat ulang.` });
      continue;
    }
    if (existing[0] && !existing[0].is_active) {
      await pool.query(`UPDATE asset_categories SET is_active = TRUE, name = :name WHERE id = :id`, { id: existing[0].id, name });
      summary.categoriesReactivated++;
      continue;
    }

    await pool.query(`INSERT INTO asset_categories (tenant_id, name, slug) VALUES (:tenantId, :name, :slug)`, { tenantId, name, slug: code });
    summary.categoriesCreated++;
  }

  await logAudit({ userId: req.user.id, action: 'create', entityType: 'category_import', newValues: summary });

  res.json(summary);
});

// GET /api/categories/export — daftar kode barang/aset apa adanya (sama seperti
// yang dibaca listCategories, tanpa filter tambahan) supaya konsisten dengan
// yang terlihat di halaman Kode Barang/Aset.
const exportCategories = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT slug, name, description, is_active FROM asset_categories WHERE tenant_id = :tenantId ORDER BY name ASC`,
    { tenantId: req.user.tenant_id }
  );

  const headers = ['Kode Barang', 'Nama', 'Deskripsi', 'Status'];
  const csvRows = rows.map((r) => [r.slug, r.name, r.description, r.is_active ? 'Aktif' : 'Nonaktif']);
  const csv = buildCsv(headers, csvRows);

  await logAudit({
    userId: req.user.id, action: 'export', entityType: 'category_export',
    newValues: { rows: rows.length }, ipAddress: req.ip,
  });

  const stamp = todayLocal();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="kode-barang-aset-${stamp}.csv"`);
  res.send(csv);
});

module.exports = { listCategories, createCategory, updateCategory, deleteCategory, importCategories, exportCategories };
