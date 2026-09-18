const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const { todayLocal } = require('../utils/dateLocal');

/**
 * ============================================================================
 *  PEMELIHARAAN ASET (servis, kalibrasi, perbaikan)
 * ============================================================================
 *  Sebelumnya tidak ada tempat untuk mencatat "AC ini diservis tiap 3 bulan,
 *  terakhir bulan lalu, biayanya sekian, oleh vendor mana" — riwayat itu
 *  hidup di nota kertas yang gampang hilang. Setiap pemeliharaan dicatat
 *  sebagai baris tersendiri (bukan tanggal yang berulang seperti pengingat),
 *  karena setiap kalinya punya rincian sendiri: vendor, biaya, hasil.
 * ============================================================================
 */

const TYPE_LABEL = {
  preventive: 'Preventif (Terjadwal)',
  corrective: 'Korektif (Perbaikan)',
  calibration: 'Kalibrasi',
  other: 'Lainnya',
};
const TYPES = Object.keys(TYPE_LABEL);

function toItem(row) {
  return {
    id: row.id,
    assetId: row.asset_id,
    maintenanceType: row.maintenance_type,
    maintenanceTypeLabel: TYPE_LABEL[row.maintenance_type] || row.maintenance_type,
    title: row.title,
    description: row.description,
    scheduledDate: row.scheduled_date,
    completedDate: row.completed_date,
    status: row.status,
    vendor: row.vendor,
    cost: row.cost,
    resultNote: row.result_note,
    createdBy: row.created_by_name || null,
    completedBy: row.completed_by_name || null,
    createdAt: row.created_at,
  };
}

const SELECT_WITH_USERS = `
  SELECT m.*, uc.name AS created_by_name, ud.name AS completed_by_name
  FROM asset_maintenances m
  LEFT JOIN users uc ON uc.id = m.created_by
  LEFT JOIN users ud ON ud.id = m.completed_by`;

// GET /api/assets/:id/maintenances
const listMaintenances = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [rows] = await pool.query(
    `${SELECT_WITH_USERS} WHERE m.asset_id = :id AND m.tenant_id = :tenantId
     ORDER BY (m.status = 'dijadwalkan') DESC, m.scheduled_date DESC`,
    { id, tenantId: req.user.tenant_id }
  );
  res.json(rows.map(toItem));
});

// POST /api/assets/:id/maintenances
const createMaintenance = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { maintenanceType = 'preventive', title, description, scheduledDate, vendor, cost } = req.body;
  const tenantId = req.user.tenant_id;

  if (!String(title || '').trim()) return res.status(400).json({ message: 'Judul pemeliharaan wajib diisi.' });
  if (!scheduledDate) return res.status(400).json({ message: 'Tanggal jadwal wajib diisi.' });
  if (!TYPES.includes(maintenanceType)) return res.status(400).json({ message: 'Jenis pemeliharaan tidak dikenal.' });

  const [assetRows] = await pool.query(`SELECT id FROM assets WHERE id = :id AND tenant_id = :tenantId AND deleted_at IS NULL`, { id, tenantId });
  if (!assetRows[0]) return res.status(404).json({ message: 'Aset tidak ditemukan.' });

  const [result] = await pool.query(
    `INSERT INTO asset_maintenances (tenant_id, asset_id, maintenance_type, title, description, scheduled_date, vendor, cost, created_by)
     VALUES (:tenantId, :id, :maintenanceType, :title, :description, :scheduledDate, :vendor, :cost, :userId)
     RETURNING id`,
    {
      tenantId, id, maintenanceType, title: title.trim(), description: description || null,
      scheduledDate, vendor: vendor || null, cost: cost || null, userId: req.user.id,
    }
  );

  await logAudit({
    userId: req.user.id, action: 'create', entityType: 'asset_maintenance', entityId: result.insertId,
    newValues: { assetId: id, title, scheduledDate, maintenanceType }, ipAddress: req.ip,
  });

  const [rows] = await pool.query(`${SELECT_WITH_USERS} WHERE m.id = :id`, { id: result.insertId });
  res.status(201).json({ message: 'Jadwal pemeliharaan ditambahkan.', ...toItem(rows[0]) });
});

// PUT /api/assets/:id/maintenances/:maintenanceId/complete
const completeMaintenance = asyncHandler(async (req, res) => {
  const { id, maintenanceId } = req.params;
  const { completedDate, vendor, cost, resultNote } = req.body;
  const tenantId = req.user.tenant_id;

  const [rows] = await pool.query(
    `SELECT * FROM asset_maintenances WHERE id = :maintenanceId AND asset_id = :id AND tenant_id = :tenantId`, { maintenanceId, id, tenantId }
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ message: 'Jadwal pemeliharaan tidak ditemukan.' });
  if (row.status !== 'dijadwalkan') {
    return res.status(400).json({ message: `Jadwal ini sudah berstatus "${row.status}", tidak bisa diubah lagi.` });
  }

  await pool.query(
    `UPDATE asset_maintenances
     SET status = 'selesai', completed_date = :completedDate, completed_by = :userId,
         vendor = COALESCE(:vendor, vendor), cost = :cost, result_note = :resultNote
     WHERE id = :maintenanceId AND tenant_id = :tenantId`,
    {
      maintenanceId,
      tenantId,
      completedDate: completedDate || todayLocal(),
      userId: req.user.id,
      vendor: vendor || null,
      cost: cost || null,
      resultNote: resultNote || null,
    }
  );

  await logAudit({
    userId: req.user.id, action: 'update', entityType: 'asset_maintenance', entityId: maintenanceId,
    oldValues: { status: 'dijadwalkan' },
    newValues: { status: 'selesai', cost, vendor }, ipAddress: req.ip,
  });

  res.json({ message: 'Pemeliharaan ditandai selesai.' });
});

// PUT /api/assets/:id/maintenances/:maintenanceId/cancel
const cancelMaintenance = asyncHandler(async (req, res) => {
  const { id, maintenanceId } = req.params;
  const tenantId = req.user.tenant_id;

  const [rows] = await pool.query(
    `SELECT * FROM asset_maintenances WHERE id = :maintenanceId AND asset_id = :id AND tenant_id = :tenantId`, { maintenanceId, id, tenantId }
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ message: 'Jadwal pemeliharaan tidak ditemukan.' });
  if (row.status !== 'dijadwalkan') {
    return res.status(400).json({ message: `Jadwal ini sudah berstatus "${row.status}", tidak bisa dibatalkan.` });
  }

  await pool.query(`UPDATE asset_maintenances SET status = 'dibatalkan' WHERE id = :maintenanceId AND tenant_id = :tenantId`, { maintenanceId, tenantId });

  await logAudit({
    userId: req.user.id, action: 'update', entityType: 'asset_maintenance', entityId: maintenanceId,
    oldValues: { status: 'dijadwalkan' }, newValues: { status: 'dibatalkan' }, ipAddress: req.ip,
  });

  res.json({ message: 'Jadwal pemeliharaan dibatalkan.' });
});

// DELETE /api/assets/:id/maintenances/:maintenanceId
const deleteMaintenance = asyncHandler(async (req, res) => {
  const { id, maintenanceId } = req.params;
  const tenantId = req.user.tenant_id;

  const [rows] = await pool.query(
    `SELECT * FROM asset_maintenances WHERE id = :maintenanceId AND asset_id = :id AND tenant_id = :tenantId`, { maintenanceId, id, tenantId }
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ message: 'Jadwal pemeliharaan tidak ditemukan.' });

  await pool.query(`DELETE FROM asset_maintenances WHERE id = :maintenanceId AND tenant_id = :tenantId`, { maintenanceId, tenantId });

  await logAudit({
    userId: req.user.id, action: 'delete', entityType: 'asset_maintenance', entityId: maintenanceId,
    oldValues: { assetId: id, title: row.title, status: row.status }, ipAddress: req.ip,
  });

  res.json({ message: `Jadwal "${row.title}" dihapus.` });
});

module.exports = {
  TYPE_LABEL, listMaintenances, createMaintenance, completeMaintenance, cancelMaintenance, deleteMaintenance,
};
