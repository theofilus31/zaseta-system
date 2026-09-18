const { OAuth2Client } = require('google-auth-library');

/**
 * ============================================================================
 *  VERIFIKASI TOKEN "MASUK DENGAN GOOGLE"
 * ============================================================================
 *  Pakai Google Identity Services (bukan alur OAuth redirect penuh) —
 *  frontend memuat skrip GIS, pengguna menekan tombol Google, dan browser
 *  langsung menerima sebuah ID token (JWT) yang SUDAH ditandatangani Google.
 *  Backend di sini hanya perlu MEMVERIFIKASI tanda tangan token itu (lewat
 *  kunci publik Google) — tidak pernah menyentuh kata sandi akun Google
 *  pengguna, dan tidak perlu Client Secret sama sekali (beda dari alur
 *  redirect "Authorization Code" yang lebih rumit dan tidak dibutuhkan di
 *  sini karena ZASETA cuma butuh identitas dasar, bukan akses API Google
 *  lain seperti Kalender/Drive).
 * ============================================================================
 */

let client = null;
function getClient() {
  if (client) return client;
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID belum diatur di .env.');
  }
  client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  return client;
}

/**
 * @param {string} credential — ID token JWT dari Google Identity Services (frontend).
 * @returns {{ googleId: string, email: string, name: string }}
 * @throws kalau tanda tangannya tidak valid, audience-nya bukan Client ID
 *         aplikasi ini, atau surel akun Google itu sendiri belum terverifikasi.
 */
async function verifyGoogleCredential(credential) {
  const ticket = await getClient().verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload) {
    throw new Error('Token Google tidak berisi data pengguna.');
  }
  if (!payload.email_verified) {
    throw new Error('Surel akun Google ini belum diverifikasi Google.');
  }

  return {
    googleId: payload.sub,
    email: String(payload.email).toLowerCase(),
    name: payload.name || payload.email,
  };
}

module.exports = { verifyGoogleCredential };
