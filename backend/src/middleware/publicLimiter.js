const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { isIpWhitelisted } = require('../utils/ipWhitelist');

/**
 * ============================================================================
 *  PEMBATAS RUTE PUBLIK
 * ============================================================================
 *  Rute di publicRoutes.js (scan QR, daftar kode barang, pengajuan permintaan
 *  aset) TANPA AUTH — begitu situs ini dibuka ke publik, siapa pun di
 *  internet bisa memanggilnya. Dua pembatas dengan ketat yang berbeda:
 *
 *  - publicReadLimiter: untuk pemindaian QR & daftar kode barang (baca saja,
 *    tidak menulis apa pun) — cukup longgar supaya kantor dengan banyak staf
 *    di jaringan yang sama (IP publik dibagi lewat NAT) tidak saling
 *    mengunci, tapi tetap mencegah kode QR "ditebak" satu-satu bertubi-tubi
 *    untuk mengintip data aset.
 *
 *  - publicWriteLimiter: untuk pengajuan permintaan aset (menulis ke
 *    database) — jauh lebih ketat, karena mengajukan permintaan seharusnya
 *    jarang dilakukan berulang-ulang dalam waktu singkat oleh orang yang
 *    sama. Pelengkap dari honeypot yang sudah ada di publicController.js,
 *    bukan pengganti — honeypot menyaring bot yang naif, ini membatasi yang
 *    lebih gigih (atau honeypot-nya sengaja dilewati).
 * ============================================================================
 */

function handler(message) {
  return (req, res) => res.status(429).json({ message });
}

const publicReadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 menit
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  skip: (req) => isIpWhitelisted(req.ip),
  handler: handler('Terlalu banyak permintaan dari alamat ini dalam waktu singkat. Coba lagi sesaat lagi.'),
});

const publicWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  skip: (req) => isIpWhitelisted(req.ip),
  handler: handler('Terlalu banyak pengajuan dari alamat ini dalam waktu singkat. Coba lagi dalam beberapa menit.'),
});

/**
 * enumerationLimiter — khusus endpoint yang balasannya membocorkan "apakah
 * nilai X ini ada di sistem" (mis. /public/resolve-username, Fase 5 Tahap 3
 * SaaS: mengonfirmasi satu nama pengguna persis cocok dengan satu tenant).
 * SENGAJA per-IP MURNI (bukan per-IP+nilai seperti loginLimiter/
 * forgotPasswordLimiter) — ancaman di sini adalah MENYAPU banyak nilai
 * BERBEDA dari satu alamat untuk memetakan nama pengguna/perusahaan mana
 * saja yang ada, bukan menebak satu nilai tetap berulang-ulang; pembatas
 * per-nilai tidak akan memperlambat penyapuan seperti itu sama sekali.
 */
const enumerationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  skip: (req) => isIpWhitelisted(req.ip),
  handler: handler('Terlalu banyak permintaan dari alamat ini dalam waktu singkat. Coba lagi dalam beberapa menit.'),
});

module.exports = { publicReadLimiter, publicWriteLimiter, enumerationLimiter };
