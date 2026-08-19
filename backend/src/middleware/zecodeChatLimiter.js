const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

/**
 * ============================================================================
 *  PEMBATAS PERMINTAAN CHAT ZECODE
 * ============================================================================
 *  Beda dari endpoint CRUD biasa yang instan, /api/zecode/chat memanggil
 *  model AI lokal (Ollama) yang bisa butuh waktu puluhan detik per balasan.
 *  Tanpa batas, satu pengguna yang mengirim beruntun (sengaja atau tidak,
 *  mis. klik kirim berkali-kali karena mengira gagal) bisa menumpuk beberapa
 *  permintaan berat sekaligus dan memperlambat Zecode untuk semua orang lain
 *  yang berbagi instance Ollama yang sama.
 *
 *  Dikunci per PENGGUNA (req.user.id, sudah tersedia karena middleware
 *  `authenticate` selalu berjalan sebelum ini) — bukan per IP, karena kantor
 *  bisa berbagi IP publik yang sama dan kita tidak ingin satu orang mengunci
 *  rekan sekantornya.
 * ============================================================================
 */
const zecodeChatLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 menit
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  // req.user selalu ada di sini (middleware authenticate berjalan lebih dulu);
  // fallback ke IP (dinormalkan lewat ipKeyGenerator demi keamanan IPv6) cuma
  // jaga-jaga kalau urutan middleware berubah di kemudian hari.
  keyGenerator: (req) => (req.user?.id ? `zecode-chat:user:${req.user.id}` : `zecode-chat:ip:${ipKeyGenerator(req.ip)}`),
  handler: (req, res) => {
    res.status(429).json({
      message: 'Terlalu banyak pesan ke Zecode dalam waktu singkat. Coba lagi dalam beberapa menit.',
    });
  },
});

module.exports = zecodeChatLimiter;
