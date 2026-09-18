const pool = require('../config/db');

/**
 * ============================================================================
 *  DAFTAR PUTIH IP — DIKACU DI MEMORI (Fase 5 SaaS susulan)
 * ============================================================================
 *  Semua pembatas laju (rate limiter) di middleware/loginLimiter.js,
 *  passwordResetLimiter.js, signupLimiter.js, publicLimiter.js memeriksa
 *  `isIpWhitelisted(req.ip)` di opsi `skip` mereka -- itu jalan di SETIAP
 *  permintaan yang masuk, jadi TIDAK boleh query database setiap kali (bisa
 *  jadi beban nyata di endpoint bertrafik tinggi). Sebagai gantinya daftar
 *  putihnya disalin ke sebuah Set di memori sekali saat server menyala, lalu
 *  disegarkan ulang setiap kali admin platform menambah/menghapus entri
 *  (lihat platformController.addIpWhitelist/removeIpWhitelist) -- bukan
 *  dijadwalkan berkala, karena perubahannya jarang dan harus langsung
 *  berlaku begitu admin menyimpannya.
 * ============================================================================
 */
let whitelistCache = new Set();

/**
 * Node bisa melaporkan alamat loopback/localhost dalam beberapa bentuk
 * berbeda tergantung jalur koneksinya (mis. "::ffff:127.0.0.1" untuk IPv4
 * yang dipetakan ke IPv6, "::1" untuk IPv6 asli) -- disamakan ke satu bentuk
 * supaya admin yang menambahkan "127.0.0.1" ke daftar putih benar-benar
 * cocok dengan IP yang dilihat req.ip, apa pun bentuk pelaporannya.
 */
function normalizeIp(ip) {
  if (!ip) return ip;
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  if (ip === '::1') return '127.0.0.1';
  return ip;
}

async function reloadIpWhitelist() {
  const [rows] = await pool.query(`SELECT ip_address FROM ip_whitelist`);
  whitelistCache = new Set(rows.map((r) => normalizeIp(r.ip_address)));
}

function isIpWhitelisted(ip) {
  return whitelistCache.has(normalizeIp(ip));
}

module.exports = { reloadIpWhitelist, isIpWhitelisted, normalizeIp };
