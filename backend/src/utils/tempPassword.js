const crypto = require('crypto');

/**
 * Kata sandi awal untuk pengguna baru — dibuatkan sistem, TIDAK PERNAH
 * ditentukan admin (lihat userController.createUser / platformController.
 * createPlatformAdmin). Tanpa karakter yang gampang tertukar saat dibaca/
 * diketik ulang dari surel (0/O, 1/l/I tidak dipakai).
 */
function generateTempPassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
  const bytes = crypto.randomBytes(length);
  let pwd = '';
  for (let i = 0; i < length; i++) pwd += chars[bytes[i] % chars.length];
  return pwd;
}

module.exports = { generateTempPassword };
