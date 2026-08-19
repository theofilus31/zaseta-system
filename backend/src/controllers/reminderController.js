const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');

/**
 * ============================================================================
 *  PENGINGAT BERTANGGAL
 * ============================================================================
 *  Garansi sudah dilacak sistem, tapi banyak tanggal penting lain yang tidak
 *  punya tempat: perpanjangan lisensi, servis AC berkala, asuransi, kontrak
 *  sewa. Semuanya selama ini hidup di kepala orang atau kalender pribadi
 *  masing-masing staf — begitu orangnya cuti atau resign, tanggalnya ikut
 *  hilang.
 *
 *  Beda dari pemeliharaan (satu peristiwa sekali jalan dengan vendor & biaya),
 *  pengingat sengaja ringan dan bisa BERULANG: menandainya selesai memajukan
 *  tanggal ke periode berikutnya, bukan menutup baris untuk selamanya.
 * ============================================================================
 */

const RECURRENCE = ['none', 'monthly', 'quarterly', 'yearly'];
const RECURRENCE_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };
const RECURRENCE_LABEL = { none: 'Sekali', monthly: 'Bulanan', quarterly: 'Triwulanan', yearly: 'Tahunan' };

function toItem(row) {
  return {
    id: row.id,
    assetId: row.asset_id,
    title: row.title,
    reminderDate: row.reminder_date,
    recurrence: row.recurrence,
    recurrenceLabel: RECURRENCE_LABEL[row.recurrence] || row.recurrence,
    notes: row.notes,
    isActive: Boolean(row.is_active),
    createdBy: row.created_by_name || null,
    createdAt: row.created_at,
  };
}

const SELECT_WITH_USER = `
  SELECT r.*, u.name AS created_by_name
  FROM asset_reminders r
  LEFT JOIN users u ON u.id = r.created_by`;

// GET /api/assets/:id/reminders
const listReminders = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [rows] = await pool.query(
    `${SELECT_WITH_USER} WHERE r.asset_id = :id ORDER BY r.is_active DESC, r.reminder_date ASC`,
    { id }
  );
  res.json(rows.map(toItem));
});

// POST /api/assets/:id/reminders
const createReminder = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, reminderDate, recurrence = 'none', notes } = req.body;

  if (!String(title || '').trim()) return res.status(400).json({ message: 'Judul pengingat wajib diisi.' });
  if (!reminderDate) return res.status(400).json({ message: 'Tanggal pengingat wajib diisi.' });
  if (!RECURRENCE.includes(recurrence)) return res.status(400).json({ message: 'Pengulangan tidak dikenal.' });

  const [assetRows] = await pool.query(`SELECT id FROM assets WHERE id = :id AND deleted_at IS NULL`, { id });
  if (!assetRows[0]) return res.status(404).json({ message: 'Aset tidak ditemukan.' });

  const [result] = await pool.query(
    `INSERT INTO asset_reminders (asset_id, title, reminder_date, recurrence, notes, created_by)
     VALUES (:id, :title, :reminderDate, :recurrence, :notes, :userId)`,
    { id, title: title.trim(), reminderDate, recurrence, notes: notes || null, userId: req.user.id }
  );

  await logAudit({
    userId: req.user.id, action: 'create', entityType: 'asset_reminder', entityId: result.insertId,
    newValues: { assetId: id, title, reminderDate, recurrence }, ipAddress: req.ip,
  });

  const [rows] = await pool.query(`${SELECT_WITH_USER} WHERE r.id = :id`, { id: result.insertId });
  res.status(201).json({ message: 'Pengingat berhasil ditambahkan.', ...toItem(rows[0]) });
});

// POST /api/assets/:id/reminders/:reminderId/complete
const completeReminder = asyncHandler(async (req, res) => {
  const { id, reminderId } = req.params;

  const [rows] = await pool.query(
    `SELECT * FROM asset_reminders WHERE id = :reminderId AND asset_id = :id`, { reminderId, id }
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ message: 'Pengingat tidak ditemukan.' });
  if (!row.is_active) return res.status(400).json({ message: 'Pengingat ini sudah tidak aktif.' });

  if (row.recurrence === 'none') {
    await pool.query(`UPDATE asset_reminders SET is_active = FALSE WHERE id = :reminderId`, { reminderId });
  } else {
    /* Dimajukan dari GREATEST(tanggal lama, hari ini) — kalau pengingatnya
       sudah lewat berbulan-bulan sebelum ditandai selesai, periode
       berikutnya tetap dihitung dari sekarang, bukan dari tanggal basi yang
       akan langsung terlambat lagi begitu disimpan. */
    const months = RECURRENCE_MONTHS[row.recurrence];
    await pool.query(
      `UPDATE asset_reminders
       SET reminder_date = DATE_ADD(GREATEST(reminder_date, CURDATE()), INTERVAL :months MONTH)
       WHERE id = :reminderId`,
      { reminderId, months }
    );
  }

  await logAudit({
    userId: req.user.id, action: 'update', entityType: 'asset_reminder', entityId: reminderId,
    newValues: { selesai: true, recurrence: row.recurrence }, ipAddress: req.ip,
  });

  const [after] = await pool.query(`${SELECT_WITH_USER} WHERE r.id = :reminderId`, { reminderId });
  res.json({
    message: row.recurrence === 'none'
      ? 'Pengingat ditandai selesai.'
      : `Pengingat dijadwalkan ulang (${RECURRENCE_LABEL[row.recurrence]}).`,
    ...toItem(after[0]),
  });
});

// DELETE /api/assets/:id/reminders/:reminderId
const deleteReminder = asyncHandler(async (req, res) => {
  const { id, reminderId } = req.params;

  const [rows] = await pool.query(
    `SELECT * FROM asset_reminders WHERE id = :reminderId AND asset_id = :id`, { reminderId, id }
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ message: 'Pengingat tidak ditemukan.' });

  await pool.query(`DELETE FROM asset_reminders WHERE id = :reminderId`, { reminderId });

  await logAudit({
    userId: req.user.id, action: 'delete', entityType: 'asset_reminder', entityId: reminderId,
    oldValues: { assetId: id, title: row.title }, ipAddress: req.ip,
  });

  res.json({ message: `Pengingat "${row.title}" dihapus.` });
});

module.exports = { RECURRENCE_LABEL, listReminders, createReminder, completeReminder, deleteReminder };
