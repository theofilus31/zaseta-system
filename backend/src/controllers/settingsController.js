const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const { normalizeSlug } = require('../utils/tenantSlug');

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

/**
 * Baris pengaturan milik satu tenant; dibuat otomatis kalau entah bagaimana
 * belum ada. Sejak migrasi multi-tenant, app_settings tidak lagi satu baris
 * tunggal ber-id tetap (id=1) — setiap tenant punya barisnya sendiri, dikunci
 * lewat UNIQUE(tenant_id), jadi baris yang dibaca/ditulis harus selalu dicari
 * lewat tenant_id, bukan id.
 */
async function readSettings(tenantId) {
  const [rows] = await pool.query(`SELECT * FROM app_settings WHERE tenant_id = :tenantId`, { tenantId });
  if (rows[0]) return rows[0];

  await pool.query(`INSERT INTO app_settings (tenant_id) VALUES (:tenantId) ON CONFLICT (tenant_id) DO NOTHING`, { tenantId });
  const [again] = await pool.query(`SELECT * FROM app_settings WHERE tenant_id = :tenantId`, { tenantId });
  return again[0];
}

/**
 * Resolusi tenant untuk endpoint PUBLIK (tanpa sesi login) — sama persis
 * dengan stopgap resolvePublicTenantId() di publicController.js. Diulang di
 * sini (bukan diimpor) karena publicController tidak mengekspornya; keduanya
 * HARUS tetap sinkron sampai digantikan resolusi berbasis subdomain di
 * Fase 2/3.
 */
async function resolvePublicTenantId() {
  const [rows] = await pool.query(
    `SELECT id FROM tenants WHERE status IN ('active','trial') ORDER BY id ASC LIMIT 1`
  );
  return rows[0]?.id ?? null;
}

/**
 * Tenant untuk endpoint logo publik: pakai ?tenantId= kalau valid (dikirim
 * oleh pengguna yang sudah login lewat getMyBranding()), jatuh kembali ke
 * stopgap resolvePublicTenantId() kalau tidak ada atau tidak valid — supaya
 * halaman yang benar-benar belum punya sesi (Masuk, Daftar) tetap dapat logo.
 */
async function resolveLogoTenantId(req) {
  const requested = Number(req.query.tenantId);
  if (Number.isInteger(requested) && requested > 0) {
    const [rows] = await pool.query(`SELECT id FROM tenants WHERE id = :id LIMIT 1`, { id: requested });
    if (rows[0]) return rows[0].id;
  }
  return resolvePublicTenantId();
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
 *
 * Dipakai HANYA oleh halaman yang benar-benar belum punya sesi (Masuk,
 * Daftar, landing page, Pindai QR publik). Pengguna yang SUDAH login harus
 * lewat getMyBranding() di bawah, supaya sidebar/topbar-nya menampilkan
 * merek tenant miliknya sendiri, bukan tenant pertama yang kebetulan aktif.
 *
 * `?slug=` (opsional, Fase 5 Tahap 2 SaaS) — dipakai halaman masuk KHUSUS
 * satu tenant (mis. /rms/login, lihat BrandingContext.jsx) untuk mengambil
 * merek tenant itu PERSIS lewat kode perusahaannya, bukan tebakan
 * resolvePublicTenantId(). 404 kalau kodenya tidak dikenal — SENGAJA tidak
 * diam-diam jatuh ke tebakan, supaya halaman masuknya bisa menunjukkan
 * "perusahaan tidak ditemukan" dengan jelas, bukan malah menyesatkan
 * menampilkan tenant lain yang tidak diminta.
 */
const getPublicBranding = asyncHandler(async (req, res) => {
  let tenantId;

  if (req.query.slug) {
    const slug = normalizeSlug(req.query.slug);
    const [rows] = await pool.query(`SELECT id FROM tenants WHERE slug = :slug LIMIT 1`, { slug });
    if (!rows[0]) {
      return res.status(404).json({ message: 'Perusahaan dengan kode ini tidak ditemukan.' });
    }
    tenantId = rows[0].id;
  } else {
    tenantId = await resolvePublicTenantId();
  }

  const settings = await readSettings(tenantId);
  res.json({ ...toPublicShape(settings), tenantId });
});

/**
 * GET /api/settings/branding — TERAUTENTIKASI, tanpa syarat izin menu.
 * Versi getPublicBranding() di atas untuk pengguna yang sudah login: memakai
 * tenant sungguhan dari sesinya (req.user.tenant_id), bukan tebakan
 * resolvePublicTenantId(). Tidak disyaratkan izin 'settings.view' karena
 * sidebar/topbar butuh ini untuk SEMUA pengguna, bukan cuma yang boleh buka
 * menu Pengaturan. tenantId ikut disertakan di respons supaya klien bisa
 * meminta logo tenant yang benar lewat getLogo() di bawah.
 */
const getMyBranding = asyncHandler(async (req, res) => {
  const settings = await readSettings(req.user.tenant_id);
  res.json({ ...toPublicShape(settings), tenantId: req.user.tenant_id });
});

/**
 * GET /api/public/branding/logo/:variant — TANPA autentikasi.
 * Menyajikan berkas gambarnya. Dipanggil lewat atribut <img src>, yang tidak
 * bisa mengirim header Authorization — itu sebabnya endpoint ini tetap
 * terbuka bahkan untuk pengguna yang sudah login.
 *
 * ?tenantId= (opsional) — dikirim oleh klien yang sudah tahu tenant-nya
 * sendiri (dari getMyBranding() di atas), supaya logo yang tersaji cocok
 * dengan tenant pengguna, bukan hasil tebakan resolvePublicTenantId(). Sama
 * seperti getPublicBranding(), ini bukan celah keamanan baru: logo & nama
 * perusahaan memang sengaja tidak rahasia (lihat komentar di atas), jadi
 * mengizinkan tenant mana yang diminta secara eksplisit tidak membocorkan
 * apa pun yang belum bisa dilihat siapa pun lewat endpoint publik ini.
 */
const getLogo = asyncHandler(async (req, res) => {
  const { variant } = req.params;
  const column = LOGO_COLUMN[variant];
  if (!column) return res.status(404).json({ message: 'Varian logo tidak dikenal.' });

  const tenantId = await resolveLogoTenantId(req);
  const settings = await readSettings(tenantId);
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
  const settings = await readSettings(req.user.tenant_id);
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

  const tenantId = req.user.tenant_id;
  const before = await readSettings(tenantId);

  await pool.query(
    `UPDATE app_settings
     SET app_name = :appName, company_name = :companyName, tagline = :tagline, updated_by = :userId
     WHERE tenant_id = :tenantId`,
    {
      tenantId,
      appName: appName.trim(),
      companyName: companyName.trim(),
      tagline: (tagline || '').trim() || null,
      userId: req.user.id,
    }
  );

  await logAudit({
    userId: req.user.id, action: 'update', entityType: 'app_settings', entityId: before.id,
    oldValues: { appName: before.app_name, companyName: before.company_name, tagline: before.tagline },
    newValues: { appName, companyName, tagline },
    ipAddress: req.ip,
  });

  const settings = await readSettings(tenantId);
  res.json({ message: 'Pengaturan merek berhasil disimpan.', ...toPublicShape(settings) });
});

// PNG/JPEG/WEBP — sama persis dengan daftar di middleware/uploadImage.js.
const ALLOWED_LOGO_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

// POST /api/settings/logo/:variant — unggah/ganti satu logo
const uploadLogo = asyncHandler(async (req, res) => {
  const { variant } = req.params;
  const column = LOGO_COLUMN[variant];
  if (!column) return res.status(400).json({ message: 'Varian logo tidak dikenal.' });
  if (!req.file) return res.status(400).json({ message: 'Berkas gambar wajib diunggah.' });

  /* Fase 6 (pengerasan keamanan) — middleware/uploadImage.js sudah menyaring
     `req.file.mimetype`, tapi nilai itu SEKADAR DIKLAIM klien (header
     Content-Type unggahan), bukan diverifikasi dari isi berkasnya sendiri.
     Sniff byte asli di sini (magic number, bukan ekstensi/klaim) supaya
     Content-Type yang disimpan & disajikan ulang lewat endpoint publik
     (GET /public/branding/logo/:variant) selalu cocok dengan isi berkas
     sungguhan — mis. mencegah berkas yang isinya bukan gambar sama sekali
     tersimpan mengaku PNG cuma karena namanya/header klaimnya begitu.
     `file-type` ESM-only sejak v17 (proyek ini CommonJS) — import dinamis
     di sini adalah cara resminya, bukan workaround. */
  const { fileTypeFromBuffer } = await import('file-type');
  const detected = await fileTypeFromBuffer(req.file.buffer);
  if (!detected || !ALLOWED_LOGO_MIME.has(detected.mime)) {
    return res.status(400).json({ message: 'Berkas bukan gambar PNG, JPG, atau WEBP yang valid.' });
  }

  const tenantId = req.user.tenant_id;
  const dataUrl = `data:${detected.mime};base64,${req.file.buffer.toString('base64')}`;

  const before = await readSettings(tenantId);
  await pool.query(
    `UPDATE app_settings SET ${column} = :dataUrl, logo_version = logo_version + 1, updated_by = :userId WHERE tenant_id = :tenantId`,
    { dataUrl, userId: req.user.id, tenantId }
  );

  await logAudit({
    userId: req.user.id, action: 'update', entityType: 'app_settings', entityId: before.id,
    newValues: { logo: variant, sizeKb: Math.round(req.file.size / 1024) },
    ipAddress: req.ip,
  });

  const settings = await readSettings(tenantId);
  res.json({ message: 'Logo berhasil diperbarui.', ...toPublicShape(settings) });
});

// DELETE /api/settings/logo/:variant — kembalikan ke tampilan bawaan
const deleteLogo = asyncHandler(async (req, res) => {
  const { variant } = req.params;
  const column = LOGO_COLUMN[variant];
  if (!column) return res.status(400).json({ message: 'Varian logo tidak dikenal.' });

  const tenantId = req.user.tenant_id;
  const before = await readSettings(tenantId);
  await pool.query(
    `UPDATE app_settings SET ${column} = NULL, logo_version = logo_version + 1, updated_by = :userId WHERE tenant_id = :tenantId`,
    { userId: req.user.id, tenantId }
  );

  await logAudit({
    userId: req.user.id, action: 'delete', entityType: 'app_settings', entityId: before.id,
    newValues: { logoDihapus: variant }, ipAddress: req.ip,
  });

  const settings = await readSettings(tenantId);
  res.json({ message: 'Logo dihapus.', ...toPublicShape(settings) });
});

module.exports = {
  LOGO_VARIANTS,
  getPublicBranding, getMyBranding, getLogo,
  getSettings, updateSettings, uploadLogo, deleteLogo,
};
