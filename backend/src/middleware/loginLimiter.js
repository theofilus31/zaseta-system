const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { isIpWhitelisted } = require('../utils/ipWhitelist');

/**
 * ============================================================================
 *  PEMBATAS PERCOBAAN MASUK
 * ============================================================================
 *  Sebelum ini, halaman Masuk tidak punya batas percobaan sama sekali —
 *  siapa pun dengan akses jaringan ke server bisa mencoba kata sandi tanpa
 *  henti terhadap satu akun. Pembatas ini menutup celah itu tanpa mengganggu
 *  pemakaian wajar: seseorang yang salah ketik beberapa kali masih jauh dari
 *  batasnya.
 *
 *  Dikunci per KOMBINASI alamat IP + nama pengguna yang dicoba (bukan per IP
 *  saja) — supaya satu penyerang tidak bisa menghabiskan jatah percobaan
 *  akun "admin" hanya dengan mencoba nama pengguna lain dulu, dan supaya
 *  kantor dengan banyak orang di jaringan yang sama (IP publik dibagi lewat
 *  NAT) tidak saling mengunci gara-gara satu orang salah ketik berkali-kali.
 * ============================================================================
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // ipKeyGenerator menormalkan alamat IPv6 (yang bisa ditulis dengan banyak
  // representasi berbeda untuk host yang sama) supaya tidak dipakai untuk
  // mengelabui pembatas ini lewat variasi penulisan alamat.
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.username || '').toLowerCase().trim()}`,
  // Percobaan yang BERHASIL tidak ikut menghabiskan jatah — hanya percobaan
  // gagal yang dihitung, supaya pengguna yang sah tidak pernah terkunci
  // sendiri oleh pemakaian normal.
  skipSuccessfulRequests: true,
  // Alamat IP di daftar putih (menu Daftar Putih IP, panel admin platform)
  // lewat semua pembatas laju sama sekali -- lihat utils/ipWhitelist.js.
  skip: (req) => isIpWhitelisted(req.ip),
  handler: (req, res) => {
    res.status(429).json({
      message: 'Terlalu banyak percobaan masuk yang gagal. Coba lagi dalam beberapa menit.',
    });
  },
});

module.exports = loginLimiter;
