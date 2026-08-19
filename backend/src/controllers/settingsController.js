const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');

/**
 * ============================================================================
 *  PENGATURAN MEREK
 * ============================================================================
 *  Nama aplikasi, nama perusahaan, dan logo — supaya aplikasi ini bisa dipakai
 *  perusahaan mana pun tanpa menyunting kode.
 *
 *  Logo disimpan sebagai data URL base64 (pola yang sama dengan qr_codes),
 *  tapi TIDAK ikut dikirim pada endpoint pengaturan biasa. Berkas logo bisa
 *  ratusan kilobyte; kalau ikut menempel di setiap pemuatan halaman, biayanya
 *  ditanggung terus-menerus tanpa alasan. Gantinya ada endpoint gambar
 *  tersendiri yang menyajikannya dengan header cache panjang, dan URL-nya
 *  membawa penanda versi supaya cache tetap tersegarkan saat logo diganti.
 * ============================================================================
 */

const LOGO_VARIANTS = ['icon', 'light', 'dark'];
const LOGO_COLUMN = { icon: 'logo_icon', light: 'logo_light', dark: 'logo_dark' };

/** Baris pengaturan; dibuat otomatis kalau entah bagaimana belum ada. */
async function readSettings() {
  const [rows] = await pool.query(`SELECT * FROM app_settings WHERE id = 1`);
  if (rows[0]) return rows[0];

  await pool.query(`INSERT INTO app_settings (id) VALUES (1) ON DUPLICATE KEY UPDATE id = id`);
  const [again] = await pool.query(`SELECT * FROM app_settings WHERE id = 1`);
  return again[0];
}

/**
 * Bentuk ringkas untuk dikirim ke klien: teks + daftar logo yang tersedia,
 * tanpa isi gambarnya.
 */
function toPublicShape(s) {
  return {
    appName: s.app_name,
    companyName: s.company_name,
    tagline: s.tagline,
    logoVersion: s.logo_version,
    logos: {
      icon: Boolean(s.logo_icon),
      light: Boolean(s.logo_light),
      dark: Boolean(s.logo_dark),
    },
  };
}

/**
 * GET /api/public/branding — TANPA autentikasi.
 * Halaman Masuk dan halaman Pindai QR publik butuh merek sebelum ada sesi,
 * jadi endpoint ini sengaja terbuka. Isinya memang tidak rahasia: nama
 * perusahaan dan logo justru dipasang untuk dilihat orang.
 */
const getPublicBranding = asyncHandler(async (req, res) => {
  const settings = await readSettings();
  res.json(toPublicShape(settings));
});

/**
 * GET /api/public/branding/logo/:variant — TANPA autentikasi.
 * Menyajikan berkas gambarnya. Dipanggil lewat atribut <img src>, yang tidak
 * bisa mengirim header Authorization — itu sebabnya endpoint ini publik.
 */
const getLogo = asyncHandler(async (req, res) => {
  const { variant } = req.params;
  const column = LOGO_COLUMN[variant];
  if (!column) return res.status(404).json({ message: 'Varian logo tidak dikenal.' });

  const settings = await readSettings();
  const dataUrl = settings[column];
  if (!dataUrl) return res.status(404).json({ message: 'Logo belum diunggah.' });

  /* Data URL berbentuk "data:image/png;base64,AAAA..." — dipecah jadi tipe
     konten dan isi binernya. */
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) return res.status(500).json({ message: 'Data logo rusak.' });

  const [, mimeType, base64] = match;
  const buffer = Buffer.from(base64, 'base64');

  res.setHeader('Content-Type', mimeType);
  /* Cache panjang aman karena URL selalu membawa ?v=<logo_version>; begitu
     logo diganti, versinya naik dan peramban menganggapnya URL baru. */
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(buffer);
});

// GET /api/settings — bentuk lengkap untuk halaman pengaturan
const getSettings = asyncHandler(async (req, res) => {
  const settings = await readSettings();
  res.json({
    ...toPublicShape(settings),
    updatedAt: settings.updated_at,
  });
});

// PUT /api/settings — perbarui teks merek
const updateSettings = asyncHandler(async (req, res) => {
  const { appName, companyName, tagline } = req.body;

  if (!appName || !appName.trim()) {
    return res.status(400).json({ message: 'Nama aplikasi wajib diisi.' });
  }
  if (!companyName || !companyName.trim()) {
    return res.status(400).json({ message: 'Nama perusahaan wajib diisi.' });
  }

  const before = await readSettings();

  await pool.query(
    `UPDATE app_settings
     SET app_name = :appName, company_name = :companyName, tagline = :tagline, updated_by = :userId
     WHERE id = 1`,
    {
      appName: appName.trim(),
      companyName: companyName.trim(),
      tagline: (tagline || '').trim() || null,
      userId: req.user.id,
    }
  );

  await logAudit({
    userId: req.user.id, action: 'update', entityType: 'app_settings', entityId: 1,
    oldValues: { appName: before.app_name, companyName: before.company_name, tagline: before.tagline },
    newValues: { appName, companyName, tagline },
    ipAddress: req.ip,
  });

  const settings = await readSettings();
  res.json({ message: 'Pengaturan merek berhasil disimpan.', ...toPublicShape(settings) });
});

// POST /api/settings/logo/:variant — unggah/ganti satu logo
const uploadLogo = asyncHandler(async (req, res) => {
  const { variant } = req.params;
  const column = LOGO_COLUMN[variant];
  if (!column) return res.status(400).json({ message: 'Varian logo tidak dikenal.' });
  if (!req.file) return res.status(400).json({ message: 'Berkas gambar wajib diunggah.' });

  const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

  await pool.query(
    `UPDATE app_settings SET ${column} = :dataUrl, logo_version = logo_version + 1, updated_by = :userId WHERE id = 1`,
    { dataUrl, userId: req.user.id }
  );

  await logAudit({
    userId: req.user.id, action: 'update', entityType: 'app_settings', entityId: 1,
    newValues: { logo: variant, sizeKb: Math.round(req.file.size / 1024) },
    ipAddress: req.ip,
  });

  const settings = await readSettings();
  res.json({ message: 'Logo berhasil diperbarui.', ...toPublicShape(settings) });
});

// DELETE /api/settings/logo/:variant — kembalikan ke tampilan bawaan
const deleteLogo = asyncHandler(async (req, res) => {
  const { variant } = req.params;
  const column = LOGO_COLUMN[variant];
  if (!column) return res.status(400).json({ message: 'Varian logo tidak dikenal.' });

  await pool.query(
    `UPDATE app_settings SET ${column} = NULL, logo_version = logo_version + 1, updated_by = :userId WHERE id = 1`,
    { userId: req.user.id }
  );

  await logAudit({
    userId: req.user.id, action: 'delete', entityType: 'app_settings', entityId: 1,
    newValues: { logoDihapus: variant }, ipAddress: req.ip,
  });

  const settings = await readSettings();
  res.json({ message: 'Logo dihapus.', ...toPublicShape(settings) });
});

module.exports = {
  LOGO_VARIANTS,
  getPublicBranding, getLogo,
  getSettings, updateSettings, uploadLogo, deleteLogo,
};
