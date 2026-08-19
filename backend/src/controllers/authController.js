const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const { loadPermissions } = require('../middleware/auth');
const { signToken } = require('../utils/token');

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Nama pengguna/surel dan kata sandi wajib diisi.' });
  }

  const identifier = username.toLowerCase();

  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.name, u.email, u.password_hash, u.status, u.token_version, r.name AS role
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE (u.username = :identifier OR u.email = :identifier) AND u.deleted_at IS NULL LIMIT 1`,
    { identifier }
  );

  const user = rows[0];
  if (!user || user.status !== 'active') {
    return res.status(401).json({ message: 'Nama pengguna/surel atau kata sandi salah.' });
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    return res.status(401).json({ message: 'Nama pengguna/surel atau kata sandi salah.' });
  }

  const token = signToken(user);

  await pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = :id`, { id: user.id });
  await logAudit({ userId: user.id, action: 'login', entityType: 'user', entityId: user.id, ipAddress: req.ip });

  /* Izin ikut dikirim saat login supaya menu & tombol langsung tampil sesuai
     hak akses, tanpa perlu satu permintaan tambahan. Ini hanya untuk tampilan —
     penegakan yang sesungguhnya tetap di middleware setiap endpoint. */
  const permissions = await loadPermissions(user);

  res.json({
    token,
    user: {
      id: user.id, username: user.username, name: user.name,
      email: user.email, role: user.role, permissions,
    },
  });
});

/**
 * GET /api/auth/me
 * Dipakai frontend untuk menyegarkan izin tanpa login ulang — berguna ketika
 * administrator baru saja mengubah hak akses pengguna yang sedang aktif.
 * req.user sudah berisi izin terbaru dari database (lihat middleware auth).
 */
const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});

module.exports = { login, me };
