const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const assetRoutes = require('./routes/assetRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const assetTypeRoutes = require('./routes/assetTypeRoutes');
const customFieldRoutes = require('./routes/customFieldRoutes');
const publicRoutes = require('./routes/publicRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const userRoutes = require('./routes/userRoutes');
const profileRoutes = require('./routes/profileRoutes');
const locationRoutes = require('./routes/locationRoutes');
const subLocationRoutes = require('./routes/subLocationRoutes');
const auditRoutes = require('./routes/auditRoutes');
const assignmentRoutes = require('./routes/assignmentRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const opnameRoutes = require('./routes/opnameRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const consumableRoutes = require('./routes/consumableRoutes');
const requestRoutes = require('./routes/requestRoutes');
const reportRoutes = require('./routes/reportRoutes');
const billingRoutes = require('./routes/billingRoutes');
const platformRoutes = require('./routes/platformRoutes');
const platformAuthRoutes = require('./routes/platformAuthRoutes');
const testimonialRoutes = require('./routes/testimonialRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

/* Fase 6 (pengerasan keamanan) — WAJIB diaktifkan supaya express-rate-limit
   (dipakai loginLimiter, signupLimiter, passwordResetLimiter, publicLimiter)
   bisa membaca req.ip dengan benar begitu aplikasi berjalan di belakang
   reverse proxy/load balancer (Nginx, Cloudflare, PaaS mana pun — hampir
   pasti terjadi di produksi, tidak seperti pengembangan lokal ini). TANPA
   ini, express-rate-limit v8+ MELEMPAR ERROR begitu ada header
   X-Forwarded-For di request (persis yang terjadi begitu online di belakang
   proxy) — login/daftar/lupa-sandi bisa mati total. Nilai bawaan 1 =
   percaya SATU lapis proxy terdekat (topologi paling umum: satu reverse
   proxy/load balancer langsung di depan Node) — atur TRUST_PROXY_HOPS di
   .env kalau topologi produksi berbeda (mis. Cloudflare + Nginx = 2 lapis).
   Aman dibiarkan di pengembangan lokal ini: request langsung ke server tidak
   pernah membawa X-Forwarded-For, jadi pengaturan ini tidak berpengaruh
   sampai benar-benar ada proxy di depan. */
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

/* JWT_SECRET WAJIB diisi dengan nilai acak yang cukup panjang, sama seperti
   FRONTEND_URL di bawah — gagal-di-awal jauh lebih aman daripada
   gagal-diam-diam-jadi-terbuka. Siapa pun yang tahu/menebak nilai ini bisa
   memalsukan token masuk untuk akun MANA PUN, termasuk admin platform —
   ini bukan sekadar praktik baik, kalau ini lolos ke produksi dengan nilai
   lemah/bawaan artinya seluruh sistem otentikasi runtuh. */
const PLACEHOLDER_JWT_SECRETS = new Set(['change_this_to_a_long_random_secret', 'secret', 'changeme']);
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || PLACEHOLDER_JWT_SECRETS.has(process.env.JWT_SECRET)) {
  throw new Error(
    'JWT_SECRET belum diisi dengan benar di .env — wajib string acak (bukan nilai contoh), minimal 32 karakter.'
  );
}

/* Header keamanan bawaan (X-Content-Type-Options, X-Frame-Options, dst.) —
   lapisan pertahanan kedua di luar CORS. crossOriginResourcePolicy DIATUR
   LONGGAR karena frontend & backend sengaja berjalan di origin/port berbeda
   (localhost:5173 vs :4000 saat pengembangan): bawaan helmet yang ketat
   (same-origin) akan memblokir <img> memuat logo merek & gambar Kode QR
   dari backend meskipun CORS sudah mengizinkannya. */
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

/* FRONTEND_URL WAJIB diisi — sengaja tidak diberi fallback ke '*'. Wildcard
   berarti situs mana pun bisa memanggil API ini langsung dari peramban
   pengunjungnya; gagal-di-awal (menolak start) jauh lebih aman daripada
   gagal-diam-diam-jadi-terbuka kalau variabel ini sampai lupa diisi di
   server produksi. */
if (!process.env.FRONTEND_URL) {
  throw new Error('FRONTEND_URL belum diisi di .env — wajib diisi alamat frontend yang sah, tidak boleh dikosongkan.');
}
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json({ limit: '2mb' }));

// Public (tanpa auth) — halaman scan QR
app.use('/api/public', publicRoutes);

// Protected (butuh JWT)
app.use('/api/auth', authRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/asset-types', assetTypeRoutes);
app.use('/api/custom-fields', customFieldRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/sub-locations', subLocationRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/opnames', opnameRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/consumables', consumableRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/platform', platformRoutes);
app.use('/api/platform-auth', platformAuthRoutes);
app.use('/api/testimonials', testimonialRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

module.exports = app;
