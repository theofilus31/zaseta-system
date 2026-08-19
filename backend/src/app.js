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
const zecodeRoutes = require('./routes/zecodeRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

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
app.use('/api/zecode', zecodeRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

module.exports = app;
