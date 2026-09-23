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
      tenantId: user.tenant_id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      tokenVersion: user.token_version,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h', algorithm: 'HS256' }
  );
}

/**
 * Menerbitkan JWT untuk admin platform — BENTUK BERBEDA dari signToken() di
 * atas (tidak ada tenantId/role/permissions sama sekali, dan `type: 'platform'`
 * eksplisit di payload) supaya token admin platform dan token pengguna tenant
 * tidak bisa saling dipakai silang. middleware/auth.js authenticate() (tenant)
 * menolak token dengan `type === 'platform'`, dan authenticatePlatform()
 * menolak token TANPA `type === 'platform'` — dua arah, bukan cuma satu.
 */
function signPlatformToken(admin) {
  return jwt.sign(
    {
      id: admin.id,
      username: admin.username,
      name: admin.name,
      email: admin.email,
      tokenVersion: admin.token_version,
      type: 'platform',
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h', algorithm: 'HS256' }
  );
}

module.exports = { signToken, signPlatformToken };
