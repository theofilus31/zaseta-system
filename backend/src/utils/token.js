const jwt = require('jsonwebtoken');

/**
 * Menerbitkan JWT untuk seorang pengguna. Dipakai bersama oleh login dan
 * oleh profileController saat kata sandi sendiri diganti (supaya sesi yang
 * sedang berjalan langsung mendapat token generasi baru, bukan tiba-tiba
 * ditolak permintaan berikutnya).
 *
 * `tokenVersion` disertakan di payload dan dicocokkan ulang di
 * middleware/auth.js pada setiap permintaan — menaikkan angka ini di
 * database (lihat migration_add_token_version.sql) mencabut semua token
 * lama akun tersebut seketika, tanpa perlu daftar token yang diblokir.
 */
function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      tokenVersion: user.token_version,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

module.exports = { signToken };
