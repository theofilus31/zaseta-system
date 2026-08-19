const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const parseCsv = require('../utils/csvParser');
const { buildCsv } = require('../utils/csv');
const { todayLocal } = require('../utils/dateLocal');

const listCategories = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, parent_id, name, slug, description, is_active FROM asset_categories ORDER BY name ASC`
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
    `INSERT INTO asset_categories (parent_id, name, slug, description) VALUES (:parentId, :name, :slug, :description)`,
    { parentId: parentId || null, name, slug, description: description || null }
  );
  await logAudit({ userId: req.user.id, action: 'create', entityType: 'asset_category', entityId: result.insertId, newValues: req.body });
  res.status(201).json({ id: result.insertId, name, slug });
});

const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, slug, description, isActive } = req.body;
  await pool.query(
    `UPDATE asset_categories SET name = :name, slug = :slug, description = :description, is_active = :isActive WHERE id = :id`,
    { id, name, slug, description: description || null, isActive: isActive ?? true }
  );
  await logAudit({ userId: req.user.id, action: 'update', entityType: 'asset_category', entityId: id, newValues: req.body });
  res.json({ message: 'Kategori berhasil diperbarui.' });
});

const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await pool.query(`DELETE FROM asset_categories WHERE id = :id`, { id });
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
    const [existing] = await pool.query(`SELECT id, is_active FROM asset_categories WHERE slug = :slug`, { slug: code });
    if (existing[0] && existing[0].is_active) {
      summary.skipped.push({ row: rowNum, reason: `Kategori "${code}" sudah aktif, tidak dibuat ulang.` });
      continue;
    }
    if (existing[0] && !existing[0].is_active) {
      await pool.query(`UPDATE asset_categories SET is_active = TRUE, name = :name WHERE id = :id`, { id: existing[0].id, name });
      summary.categoriesReactivated++;
      continue;
    }

    await pool.query(`INSERT INTO asset_categories (name, slug) VALUES (:name, :slug)`, { name, slug: code });
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
    `SELECT slug, name, description, is_active FROM asset_categories ORDER BY name ASC`
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
