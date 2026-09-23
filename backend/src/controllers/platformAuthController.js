const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const { signPlatformToken } = require('../utils/token');
const { verifyGoogleCredential } = require('../utils/googleAuth');

/**
 * ============================================================================
 *  LOGIN ADMIN PLATFORM — TERPISAH TOTAL dari login tenant (authController.js)
 * ============================================================================
 *  Sejak migration_separate_platform_admins.sql, admin platform tidak lagi
 *  punya baris `users` sama sekali — jalur masuknya sendiri di sini, ke
 *  tabel `platform_admins` sendiri, menerbitkan JWT berbentuk beda
 *  (utils/token.js signPlatformToken, `type: 'platform'`). SENGAJA tidak
 *  ada dukungan `slug` tenant seperti authController.login — konsepnya
 *  memang tidak berlaku, akun ini tidak pernah "milik" satu tenant.
 *
 *  Rute /api/platform-auth/* ini TIDAK DITAUTKAN dari UI publik mana pun
 *  (landing page, menu login tenant) — lihat pages/PlatformLogin.jsx,
 *  hanya bisa dibuka lewat URL langsung, sesuai permintaan pemilik produk
 *  supaya publik tidak tahu cara masuknya sama sekali.
 * ============================================================================
 */

// POST /api/platform-auth/login — { username, password } (username ATAU email)
const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Nama pengguna/surel dan kata sandi wajib diisi.' });
  }

  const [rows] = await pool.query(
    `SELECT * FROM platform_admins WHERE (username = :identifier OR email = :identifier) AND deleted_at IS NULL AND status = 'active' LIMIT 1`,
    { identifier: String(username).trim().toLowerCase() }
  );
  const admin = rows[0];

  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
    return res.status(401).json({ message: 'Nama pengguna/surel atau kata sandi salah.' });
  }

  await pool.query(`UPDATE platform_admins SET last_login_at = NOW() WHERE id = :id`, { id: admin.id });
  await logAudit({ platformAdminId: admin.id, tenantId: null, action: 'login', entityType: 'platform_admin', entityId: admin.id, ipAddress: req.ip });

  const token = signPlatformToken(admin);
  res.json({
    token,
    admin: { id: admin.id, username: admin.username, name: admin.name, email: admin.email },
  });
});

/**
 * POST /api/platform-auth/google-login — { credential }
 *
 * Padanan authController.googleLogin, tapi jauh lebih sederhana: tidak ada
 * `slug` (platform_admins bukan tabel per-tenant), tidak ada ambiguitas
 * "surel ini terdaftar di beberapa tenant" (tabelnya global tunggal), dan
 * TIDAK ADA alur signup lewat Google -- admin platform SELALU dibuat lebih
 * dulu oleh admin lain (lihat platformController.createPlatformAdmin),
 * Google di sini murni cara masuk ALTERNATIF untuk akun yang sudah ada,
 * sama seperti tombol Google di TenantLogin.jsx (bukan Login.jsx universal
 * yang punya alur signup).
 *
 * Akun yang match lewat surel (belum pernah pakai Google sebelumnya)
 * OTOMATIS ditautkan (google_id diisi) saat itu juga.
 */
const googleLogin = asyncHandler(async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ message: 'Token Google wajib diisi.' });
  }

  let profile;
  try {
    profile = await verifyGoogleCredential(credential);
  } catch (err) {
    return res.status(401).json({ message: 'Verifikasi akun Google gagal. Coba lagi.' });
  }

  const [byGoogleId] = await pool.query(
    `SELECT * FROM platform_admins WHERE google_id = :googleId AND deleted_at IS NULL AND status = 'active'`,
    { googleId: profile.googleId }
  );
  let admin = byGoogleId[0] || null;

  if (!admin) {
    const [byEmail] = await pool.query(
      `SELECT * FROM platform_admins WHERE email = :email AND google_id IS NULL AND deleted_at IS NULL AND status = 'active'`,
      { email: profile.email }
    );
    if (byEmail[0]) {
      admin = byEmail[0];
      await pool.query(`UPDATE platform_admins SET google_id = :googleId WHERE id = :id`, { googleId: profile.googleId, id: admin.id });
    }
  }

  if (!admin) {
    return res.status(404).json({
      message: 'Belum ada akun admin platform dengan surel Google ini.',
      code: 'NO_ACCOUNT_FOUND',
    });
  }

  await pool.query(`UPDATE platform_admins SET last_login_at = NOW() WHERE id = :id`, { id: admin.id });
  await logAudit({ platformAdminId: admin.id, tenantId: null, action: 'login', entityType: 'platform_admin', entityId: admin.id, ipAddress: req.ip });

  const token = signPlatformToken(admin);
  res.json({
    token,
    admin: { id: admin.id, username: admin.username, name: admin.name, email: admin.email },
  });
});

// GET /api/platform-auth/me
const me = asyncHandler(async (req, res) => {
  res.json({ admin: req.platformAdmin });
});

module.exports = { login, googleLogin, me };
