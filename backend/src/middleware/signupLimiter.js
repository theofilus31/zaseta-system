const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { isIpWhitelisted } = require('../utils/ipWhitelist');

/**
 * ============================================================================
 *  PEMBATAS PENDAFTARAN TENANT BARU
 * ============================================================================
 *  POST /api/auth/signup TANPA AUTH dan menulis ke database sungguhan (bikin
 *  tenant + pengguna administrator baru) — dikunci per ALAMAT IP saja, beda
 *  dari loginLimiter/passwordResetLimiter yang juga mengunci per akun, karena
 *  di sini belum ada akun sama sekali untuk dijadikan kunci tambahan.
 *
 *  Jauh lebih ketat daripada loginLimiter: setiap permintaan yang lolos
 *  benar-benar membuat data baru (bukan sekadar mencocokkan kredensial yang
 *  sudah ada), jadi disalahgunakan bisa membanjiri tabel tenants/users.
 * ============================================================================
 */
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 jam
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  skip: (req) => isIpWhitelisted(req.ip),
  handler: (req, res) => {
    res.status(429).json({ message: 'Terlalu banyak percobaan pendaftaran dari alamat ini. Coba lagi dalam satu jam.' });
  },
});

/* Pasangan pembatas untuk verifikasi surel setelah signup (lihat
   authController.verifySignupEmail/resendSignupVerification) — pola sama
   seperti forgotPasswordLimiter/resetPasswordLimiter di
   passwordResetLimiter.js: dikunci per KOMBINASI IP + akun yang dituju. */
function keyFor(prefix) {
  return (req) => `${prefix}:${ipKeyGenerator(req.ip)}:${String(req.body?.identifier || '').toLowerCase().trim()}`;
}

const resendSignupVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyFor('resend-signup-verification'),
  skip: (req) => isIpWhitelisted(req.ip),
  handler: (req, res) => {
    res.status(429).json({ message: 'Terlalu banyak permintaan kode verifikasi. Coba lagi dalam beberapa menit.' });
  },
});

const verifySignupEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyFor('verify-signup-email'),
  skip: (req) => isIpWhitelisted(req.ip),
  handler: (req, res) => {
    res.status(429).json({ message: 'Terlalu banyak percobaan. Coba lagi dalam beberapa menit.' });
  },
});

module.exports = { signupLimiter, resendSignupVerificationLimiter, verifySignupEmailLimiter };
