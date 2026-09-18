const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const { clampPagination } = require('../utils/pagination');

/**
 * ============================================================================
 *  BARANG HABIS PAKAI (consumables)
 * ============================================================================
 *  Kertas, toner, alat kebersihan, kabel — barang yang dibeli untuk dipakai
 *  habis, bukan dipinjam-kembalikan seperti aset tetap. Sebelumnya tidak ada
 *  tempat untuk menjawab "stok kertas tinggal berapa?" selain bertanya
 *  langsung ke gudang.
 *
 *  Aturan yang ditegakkan di sini, bukan di database: `current_stock` pada
 *  tabel consumables HANYA boleh berubah lewat tiga aksi (masuk/keluar/
 *  penyesuaian), tidak pernah lewat endpoint ubah data biasa — supaya angka
 *  stok selalu punya jejak transaksi yang menjelaskannya.
 * ============================================================================
 */

const CATEGORY_LABEL = { atk: 'ATK', kebersihan: 'Kebersihan', it_supplies: 'Perlengkapan IT', lainnya: 'Lainnya' };
const CATEGORIES = Object.keys(CATEGORY_LABEL);
const TYPE_LABEL = { masuk: 'Stok Masuk', keluar: 'Stok Keluar', penyesuaian: 'Penyesuaian' };

async function generateConsumableCode(tenantId) {
  const [rows] = await pool.query(`SELECT code FROM consumables WHERE tenant_id = :tenantId ORDER BY id DESC LIMIT 1`, { tenantId });
  const last = rows[0] ? Number(String(rows[0].code).split('-')[1]) : 0;
  return `BHP-${String(last + 1).padStart(4, '0')}`;
}

function toItem(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    categoryLabel: CATEGORY_LABEL[row.category] || row.category,
    unit: row.unit,
    currentStock: row.current_stock,
    minStock: row.min_stock,
    lowStock: row.current_stock <= row.min_stock,
    locationId: row.location_id,
    locationName: row.location_name || null,
    notes: row.notes,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
  };
}

const SELECT_ITEM = `
  SELECT c.*, l.name AS location_name
  FROM consumables c
  LEFT JOIN locations l ON l.id = c.location_id`;

// GET /api/consumables?search=&category=&lowStockOnly=&page=&limit=
const listConsumables = asyncHandler(async (req, res) => {
  const { search = '', category = '', lowStockOnly } = req.query;
  const { page, limit } = clampPagination(req.query, { defaultLimit: 20 });
  const offset = (page - 1) * limit;

  const conditions = ['c.is_active = TRUE', 'c.tenant_id = :tenantId'];
  const params = { tenantId: req.user.tenant_id };

  if (search) {
    conditions.push('(c.name ILIKE :search OR c.code ILIKE :search)');
    params.search = `%${search}%`;
  }
  if (category && CATEGORIES.includes(category)) {
    conditions.push('c.category = :category');
    params.category = category;
  }
  if (lowStockOnly === 'true') {
    conditions.push('c.current_stock <= c.min_stock');
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const [rows] = await pool.query(
    `${SELECT_ITEM} ${whereClause} ORDER BY c.name ASC LIMIT :limit OFFSET :offset`,
    { ...params, limit: Number(limit), offset }
  );
  const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM consumables c ${whereClause}`, params);

  res.json({
    data: rows.map(toItem),
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: countRows[0].total,
      totalPages: Math.ceil(countRows[0].total / Number(limit)),
    },
  });
});

// GET /api/consumables/:id
const getConsumable = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [rows] = await pool.query(`${SELECT_ITEM} WHERE c.id = :id AND c.tenant_id = :tenantId`, { id, tenantId: req.user.tenant_id });
  if (!rows[0]) return res.status(404).json({ message: 'Barang tidak ditemukan.' });
  res.json(toItem(rows[0]));
});

// POST /api/consumables
const createConsumable = asyncHandler(async (req, res) => {
  const { name, category = 'lainnya', unit = 'pcs', minStock = 0, locationId, notes } = req.body;
  const tenantId = req.user.tenant_id;

  if (!String(name || '').trim()) return res.status(400).json({ message: 'Nama barang wajib diisi.' });
  if (!CATEGORIES.includes(category)) return res.status(400).json({ message: 'Kategori tidak dikenal.' });
  if (!String(unit || '').trim()) return res.status(400).json({ message: 'Satuan wajib diisi.' });

  // locationId datang dari input pemakai — pastikan benar-benar milik tenant ini.
  if (locationId) {
    const [locRows] = await pool.query(`SELECT id FROM locations WHERE id = :locationId AND tenant_id = :tenantId`, { locationId, tenantId });
    if (!locRows[0]) return res.status(400).json({ message: 'Lokasi tidak valid.' });
  }

  const code = await generateConsumableCode(tenantId);
  const [result] = await pool.query(
    `INSERT INTO consumables (tenant_id, code, name, category, unit, min_stock, location_id, notes, created_by)
     VALUES (:tenantId, :code, :name, :category, :unit, :minStock, :locationId, :notes, :userId)
     RETURNING id`,
    {
      tenantId, code, name: name.trim(), category, unit: unit.trim(),
      minStock: Number(minStock) || 0, locationId: locationId || null,
      notes: notes || null, userId: req.user.id,
    }
  );

  await logAudit({
    userId: req.user.id, action: 'create', entityType: 'consumable', entityId: result.insertId,
    newValues: { code, name, category, unit }, ipAddress: req.ip,
  });

  const [rows] = await pool.query(`${SELECT_ITEM} WHERE c.id = :id`, { id: result.insertId });
  res.status(201).json({ message: `${name} ditambahkan sebagai ${code}.`, ...toItem(rows[0]) });
});

// PUT /api/consumables/:id — kode & stok TIDAK bisa diubah di sini
const updateConsumable = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, category, unit, minStock, locationId, notes } = req.body;
  const tenantId = req.user.tenant_id;

  if (!String(name || '').trim()) return res.status(400).json({ message: 'Nama barang wajib diisi.' });
  if (!CATEGORIES.includes(category)) return res.status(400).json({ message: 'Kategori tidak dikenal.' });

  const [rows] = await pool.query(`SELECT * FROM consumables WHERE id = :id AND tenant_id = :tenantId`, { id, tenantId });
  if (!rows[0]) return res.status(404).json({ message: 'Barang tidak ditemukan.' });

  // locationId datang dari input pemakai — pastikan benar-benar milik tenant ini.
  if (locationId) {
    const [locRows] = await pool.query(`SELECT id FROM locations WHERE id = :locationId AND tenant_id = :tenantId`, { locationId, tenantId });
    if (!locRows[0]) return res.status(400).json({ message: 'Lokasi tidak valid.' });
  }

  await pool.query(
    `UPDATE consumables
     SET name = :name, category = :category, unit = :unit, min_stock = :minStock,
         location_id = :locationId, notes = :notes
     WHERE id = :id AND tenant_id = :tenantId`,
    {
      id, tenantId, name: name.trim(), category, unit: (unit || 'pcs').trim(),
      minStock: Number(minStock) || 0, locationId: locationId || null, notes: notes || null,
    }
  );

  await logAudit({
    userId: req.user.id, action: 'update', entityType: 'consumable', entityId: id,
    oldValues: { name: rows[0].name, category: rows[0].category },
    newValues: { name, category, unit, minStock }, ipAddress: req.ip,
  });

  res.json({ message: 'Barang berhasil diperbarui.' });
});

// DELETE /api/consumables/:id — nonaktifkan, ditolak kalau stoknya masih ada
const deleteConsumable = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user.tenant_id;
  const [rows] = await pool.query(`SELECT * FROM consumables WHERE id = :id AND tenant_id = :tenantId`, { id, tenantId });
  if (!rows[0]) return res.status(404).json({ message: 'Barang tidak ditemukan.' });

  /* Menonaktifkan barang yang stoknya masih ada akan menyembunyikan nilai
     persediaan dari daftar aktif tanpa penjelasan. Barang harus dihabiskan
     dulu (lewat stok keluar/penyesuaian) sebelum dinonaktifkan. */
  if (rows[0].current_stock > 0) {
    return res.status(409).json({
      message: `Stok "${rows[0].name}" masih tersisa ${rows[0].current_stock} ${rows[0].unit}. Habiskan atau sesuaikan stoknya ke 0 dulu.`,
    });
  }

  await pool.query(`UPDATE consumables SET is_active = FALSE WHERE id = :id AND tenant_id = :tenantId`, { id, tenantId });
  await logAudit({
    userId: req.user.id, action: 'delete', entityType: 'consumable', entityId: id,
    oldValues: { code: rows[0].code, name: rows[0].name }, ipAddress: req.ip,
  });
  res.json({ message: `${rows[0].name} dinonaktifkan.` });
});

// GET /api/consumables/:id/transactions?page=&limit=
const listTransactions = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page, limit } = clampPagination(req.query, { defaultLimit: 20 });
  const offset = (page - 1) * limit;

  // consumable_transactions tidak punya tenant_id langsung — kepemilikannya
  // dibuktikan lewat consumables induknya sebelum baris transaksi manapun dibaca.
  const [ownerRows] = await pool.query(`SELECT id FROM consumables WHERE id = :id AND tenant_id = :tenantId`, { id, tenantId: req.user.tenant_id });
  if (!ownerRows[0]) return res.status(404).json({ message: 'Barang tidak ditemukan.' });

  const [rows] = await pool.query(
    `SELECT t.*, u.name AS created_by_name
     FROM consumable_transactions t
     LEFT JOIN users u ON u.id = t.created_by
     WHERE t.consumable_id = :id
     ORDER BY t.created_at DESC, t.id DESC
     LIMIT :limit OFFSET :offset`,
    { id, limit: Number(limit), offset }
  );
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM consumable_transactions WHERE consumable_id = :id`, { id }
  );

  res.json({
    data: rows.map((r) => ({
      id: r.id,
      type: r.type,
      typeLabel: TYPE_LABEL[r.type] || r.type,
      quantity: r.quantity,
      balanceAfter: r.balance_after,
      vendor: r.vendor,
      unitPrice: r.unit_price,
      requestedBy: r.requested_by,
      department: r.department,
      notes: r.notes,
      createdBy: r.created_by_name || null,
      createdAt: r.created_at,
    })),
    pagination: {
      page: Number(page), limit: Number(limit),
      total: countRows[0].total, totalPages: Math.ceil(countRows[0].total / Number(limit)),
    },
  });
});

async function recordTransaction(conn, { consumableId, type, quantity, balanceAfter, extra, userId }) {
  const [result] = await conn.query(
    `INSERT INTO consumable_transactions
       (consumable_id, type, quantity, balance_after, vendor, unit_price, requested_by, department, notes, created_by)
     VALUES (:consumableId, :type, :quantity, :balanceAfter, :vendor, :unitPrice, :requestedBy, :department, :notes, :userId)
     RETURNING id`,
    {
      consumableId, type, quantity, balanceAfter,
      vendor: extra.vendor || null, unitPrice: extra.unitPrice || null,
      requestedBy: extra.requestedBy || null, department: extra.department || null,
      notes: extra.notes || null, userId,
    }
  );
  return result.insertId;
}

// POST /api/consumables/:id/stock-in
const stockIn = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { quantity, vendor, unitPrice, notes } = req.body;
  const qty = Number(quantity);

  if (!qty || qty <= 0) return res.status(400).json({ message: 'Jumlah harus lebih dari nol.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(`SELECT * FROM consumables WHERE id = :id AND tenant_id = :tenantId FOR UPDATE`, { id, tenantId: req.user.tenant_id });
    if (!rows[0]) { await conn.rollback(); return res.status(404).json({ message: 'Barang tidak ditemukan.' }); }

    const newStock = rows[0].current_stock + qty;
    await conn.query(`UPDATE consumables SET current_stock = :newStock WHERE id = :id`, { id, newStock });
    await recordTransaction(conn, {
      consumableId: id, type: 'masuk', quantity: qty, balanceAfter: newStock,
      extra: { vendor, unitPrice: unitPrice || null, notes }, userId: req.user.id,
    });

    await conn.commit();

    await logAudit({
      userId: req.user.id, action: 'update', entityType: 'consumable', entityId: id,
      oldValues: { stock: rows[0].current_stock }, newValues: { stok_masuk: qty, stokBaru: newStock, vendor },
      ipAddress: req.ip,
    });

    res.json({ message: `Stok ${rows[0].name} bertambah ${qty} ${rows[0].unit}.`, currentStock: newStock });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// POST /api/consumables/:id/stock-out
const stockOut = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { quantity, requestedBy, department, notes } = req.body;
  const qty = Number(quantity);

  if (!qty || qty <= 0) return res.status(400).json({ message: 'Jumlah harus lebih dari nol.' });
  if (!String(requestedBy || '').trim()) return res.status(400).json({ message: 'Nama peminta wajib diisi.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(`SELECT * FROM consumables WHERE id = :id AND tenant_id = :tenantId FOR UPDATE`, { id, tenantId: req.user.tenant_id });
    if (!rows[0]) { await conn.rollback(); return res.status(404).json({ message: 'Barang tidak ditemukan.' }); }

    if (qty > rows[0].current_stock) {
      await conn.rollback();
      return res.status(400).json({
        message: `Stok tidak cukup — tersisa ${rows[0].current_stock} ${rows[0].unit}, diminta ${qty}.`,
      });
    }

    const newStock = rows[0].current_stock - qty;
    await conn.query(`UPDATE consumables SET current_stock = :newStock WHERE id = :id`, { id, newStock });
    await recordTransaction(conn, {
      consumableId: id, type: 'keluar', quantity: qty, balanceAfter: newStock,
      extra: { requestedBy: requestedBy.trim(), department, notes }, userId: req.user.id,
    });

    await conn.commit();

    await logAudit({
      userId: req.user.id, action: 'update', entityType: 'consumable', entityId: id,
      oldValues: { stock: rows[0].current_stock },
      newValues: { stok_keluar: qty, stokBaru: newStock, requestedBy, department },
      ipAddress: req.ip,
    });

    res.json({ message: `Stok ${rows[0].name} berkurang ${qty} ${rows[0].unit}.`, currentStock: newStock });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// POST /api/consumables/:id/adjust — koreksi stok setelah stok opname fisik
const adjustStock = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { newStock, notes } = req.body;
  const target = Number(newStock);

  if (newStock === undefined || newStock === null || Number.isNaN(target) || target < 0) {
    return res.status(400).json({ message: 'Stok baru harus berupa angka 0 atau lebih.' });
  }
  if (!String(notes || '').trim()) {
    return res.status(400).json({ message: 'Alasan penyesuaian wajib diisi — ini mengoreksi catatan resmi.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(`SELECT * FROM consumables WHERE id = :id AND tenant_id = :tenantId FOR UPDATE`, { id, tenantId: req.user.tenant_id });
    if (!rows[0]) { await conn.rollback(); return res.status(404).json({ message: 'Barang tidak ditemukan.' }); }

    const selisih = target - rows[0].current_stock;
    if (selisih === 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'Stok baru sama dengan stok saat ini — tidak ada yang perlu disesuaikan.' });
    }

    await conn.query(`UPDATE consumables SET current_stock = :target WHERE id = :id`, { id, target });
    await recordTransaction(conn, {
      consumableId: id, type: 'penyesuaian', quantity: Math.abs(selisih), balanceAfter: target,
      extra: { notes: `${notes.trim()} (${selisih > 0 ? '+' : ''}${selisih} ${rows[0].unit})` },
      userId: req.user.id,
    });

    await conn.commit();

    await logAudit({
      userId: req.user.id, action: 'update', entityType: 'consumable', entityId: id,
      oldValues: { stock: rows[0].current_stock }, newValues: { stokBaru: target, selisih, alasan: notes },
      ipAddress: req.ip,
    });

    res.json({ message: `Stok ${rows[0].name} disesuaikan menjadi ${target} ${rows[0].unit}.`, currentStock: target });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

module.exports = {
  CATEGORY_LABEL, listConsumables, getConsumable, createConsumable, updateConsumable, deleteConsumable,
  listTransactions, stockIn, stockOut, adjustStock,
};
