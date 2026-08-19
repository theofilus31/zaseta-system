const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');

/**
 * ============================================================================
 *  LAMPIRAN BERKAS ASET
 * ============================================================================
 *  Faktur pembelian, kartu garansi, manual, foto kondisi — sebelumnya semua
 *  ini hidup di lemari arsip atau folder pribadi masing-masing staf, terpisah
 *  dari catatan asetnya sendiri. Begitu ada yang menanyakan "mana bukti
 *  pembeliannya?", jawabannya selalu "coba saya cari dulu".
 *
 *  Berkas disimpan sebagai base64 di database, pola yang sama dengan logo
 *  merek dan gambar Kode QR — bukan karena itu solusi paling hemat, tapi
 *  karena konsisten dengan cara aplikasi ini sudah menyimpan berkas: tidak
 *  ada folder unggahan terpisah yang perlu ikut dipindah saat aplikasinya
 *  dipindah ke server lain.
 * ============================================================================
 */

const CATEGORY_LABEL = {
  invoice: 'Faktur/Nota Pembelian',
  warranty: 'Kartu Garansi',
  manual: 'Manual/Panduan',
  photo: 'Foto Kondisi',
  other: 'Lainnya',
};
const CATEGORIES = Object.keys(CATEGORY_LABEL);

function toMeta(row) {
  return {
    id: row.id,
    assetId: row.asset_id,
    category: row.category,
    categoryLabel: CATEGORY_LABEL[row.category] || row.category,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    notes: row.notes,
    uploadedBy: row.uploaded_by_name || null,
    createdAt: row.created_at,
  };
}

// GET /api/assets/:id/attachments — metadata saja, TANPA isi berkas.
// Daftar ini dimuat setiap kali halaman detail aset dibuka; menyertakan
// base64 di sini akan membuat halaman itu lambat begitu ada beberapa lampiran.
const listAttachments = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [rows] = await pool.query(
    `SELECT a.id, a.asset_id, a.category, a.file_name, a.mime_type, a.file_size, a.notes, a.created_at,
            u.name AS uploaded_by_name
     FROM asset_attachments a
     LEFT JOIN users u ON u.id = a.uploaded_by
     WHERE a.asset_id = :id
     ORDER BY a.created_at DESC`,
    { id }
  );

  res.json(rows.map(toMeta));
});

// POST /api/assets/:id/attachments — unggah satu berkas
const uploadAttachment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { category = 'other', notes } = req.body;

  if (!req.file) return res.status(400).json({ message: 'Berkas wajib diunggah.' });
  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ message: 'Kategori lampiran tidak dikenal.' });
  }

  const [assetRows] = await pool.query(
    `SELECT id FROM assets WHERE id = :id AND deleted_at IS NULL`, { id }
  );
  if (!assetRows[0]) return res.status(404).json({ message: 'Aset tidak ditemukan.' });

  const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

  const [result] = await pool.query(
    `INSERT INTO asset_attachments (asset_id, category, file_name, mime_type, file_size, data, notes, uploaded_by)
     VALUES (:assetId, :category, :fileName, :mimeType, :fileSize, :data, :notes, :userId)`,
    {
      assetId: id,
      category,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      data: dataUrl,
      notes: notes || null,
      userId: req.user.id,
    }
  );

  await logAudit({
    userId: req.user.id, action: 'create', entityType: 'asset_attachment', entityId: result.insertId,
    newValues: { assetId: id, category, fileName: req.file.originalname, sizeKb: Math.round(req.file.size / 1024) },
    ipAddress: req.ip,
  });

  const [rows] = await pool.query(
    `SELECT a.id, a.asset_id, a.category, a.file_name, a.mime_type, a.file_size, a.notes, a.created_at,
            u.name AS uploaded_by_name
     FROM asset_attachments a LEFT JOIN users u ON u.id = a.uploaded_by
     WHERE a.id = :id`,
    { id: result.insertId }
  );

  res.status(201).json({ message: 'Berkas berhasil diunggah.', ...toMeta(rows[0]) });
});

// GET /api/assets/:id/attachments/:attachmentId — unduh/tampilkan isi berkas
const downloadAttachment = asyncHandler(async (req, res) => {
  const { id, attachmentId } = req.params;

  const [rows] = await pool.query(
    `SELECT * FROM asset_attachments WHERE id = :attachmentId AND asset_id = :id`,
    { id, attachmentId }
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ message: 'Lampiran tidak ditemukan.' });

  const match = /^data:([^;]+);base64,(.+)$/s.exec(row.data);
  if (!match) return res.status(500).json({ message: 'Data lampiran rusak.' });
  const [, , base64] = match;

  res.setHeader('Content-Type', row.mime_type);
  /* inline (bukan attachment): PDF dan gambar sebaiknya langsung terbuka di
     tab baru, bukan otomatis terunduh — pengguna baru memutuskan menyimpannya
     setelah melihat isinya. */
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.file_name)}"`);
  res.send(Buffer.from(base64, 'base64'));
});

// DELETE /api/assets/:id/attachments/:attachmentId
const deleteAttachment = asyncHandler(async (req, res) => {
  const { id, attachmentId } = req.params;

  const [rows] = await pool.query(
    `SELECT * FROM asset_attachments WHERE id = :attachmentId AND asset_id = :id`,
    { id, attachmentId }
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ message: 'Lampiran tidak ditemukan.' });

  await pool.query(`DELETE FROM asset_attachments WHERE id = :attachmentId`, { attachmentId });

  await logAudit({
    userId: req.user.id, action: 'delete', entityType: 'asset_attachment', entityId: attachmentId,
    oldValues: { assetId: id, fileName: row.file_name, category: row.category },
    ipAddress: req.ip,
  });

  res.json({ message: `${row.file_name} dihapus.` });
});

module.exports = { CATEGORY_LABEL, listAttachments, uploadAttachment, downloadAttachment, deleteAttachment };
