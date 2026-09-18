const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { isIpWhitelisted } = require('../utils/ipWhitelist');

/**
 * ============================================================================
 *  PEMBATAS "LUPA KATA SANDI"
 * ============================================================================
 *  Dua rute publik (tanpa login) yang mengirim surel dan menerima tebakan
 *  kode OTP — keduanya butuh pembatas sendiri, terpisah dari loginLimiter:
 *
 *  - forgotPasswordLimiter: mencegah satu alamat dijadikan sasaran spam
 *    permintaan (tiap permintaan mengirim surel sungguhan).
 *  - resetPasswordLimiter: mencegah kode OTP 6 digit ditebak paksa dari
 *    banyak permintaan cepat — pelengkap batas 5x percobaan per kode yang
 *    sudah ada di authController, bukan pengganti (batas itu per KODE,
 *    ini per IP+akun lintas beberapa kode sekaligus).
 *
 *  Dikunci per KOMBINASI alamat IP + akun yang dituju (bukan per IP saja),
 *  sama seperti loginLimiter — supaya kantor yang berbagi satu IP publik
 *  tidak saling mengunci gara-gara satu orang mengetik salah berkali-kali.
 * ============================================================================
 */
function keyFor(prefix) {
  return (req) => `${prefix}:${ipKeyGenerator(req.ip)}:${String(req.body?.identifier || '').toLowerCase().trim()}`;
}

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyFor('forgot-password'),
  skip: (req) => isIpWhitelisted(req.ip),
  handler: (req, res) => {
    res.status(429).json({ message: 'Terlalu banyak permintaan kode reset. Coba lagi dalam beberapa menit.' });
  },
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyFor('reset-password'),
  skip: (req) => isIpWhitelisted(req.ip),
  handler: (req, res) => {
    res.status(429).json({ message: 'Terlalu banyak percobaan. Coba lagi dalam beberapa menit.' });
  },
});

module.exports = { forgotPasswordLimiter, resetPasswordLimiter };
