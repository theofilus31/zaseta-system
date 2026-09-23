const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const { signPlatformToken } = require('../utils/token');

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

// GET /api/platform-auth/me
const me = asyncHandler(async (req, res) => {
  res.json({ admin: req.platformAdmin });
});

module.exports = { login, me };
