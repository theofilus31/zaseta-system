const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/billingController');
const { authenticate, requirePermission, requireRole } = require('../middleware/auth');
const { publicReadLimiter } = require('../middleware/publicLimiter');

// Katalog paket — publik, dipakai halaman Harga & Landing sebelum login.
// publicReadLimiter (Fase 6) — dampak rendah (cuma katalog statis) tapi
// tidak ada alasan membiarkannya satu-satunya rute publik tanpa pembatas.
router.get('/plans', publicReadLimiter, ctrl.getPlans);

// Webhook Pakasir — TANPA AUTH (dipanggil server Pakasir, tidak punya token
// kita). Diautentikasi lewat header X-Secret di dalam controller/provider,
// bukan requirePermission. publicReadLimiter dipakai sebagai pembatas dasar
// terhadap banjir permintaan; verifikasi secret-nya sendiri yang menolak
// permintaan palsu.
router.post('/webhooks/pakasir', publicReadLimiter, ctrl.handlePakasirWebhook);

router.use(authenticate);

// Menu "Langganan" dalam aplikasi — sama seperti Pengaturan, tetap butuh izin
// modul 'billing' supaya sidebar & rute frontend konsisten dengan pola menu lain.
router.get('/me', requirePermission('billing', 'view'), ctrl.getMyBilling);
router.get('/invoices', requirePermission('billing', 'view'), ctrl.listInvoices);
router.get('/invoices/:id', requirePermission('billing', 'view'), ctrl.getInvoice);

// Mengganti paket, membatalkan checkout, & membatalkan langganan adalah
// keputusan finansial/kontraktual — sengaja dijaga requireRole('admin'),
// bukan matriks izin per-menu (lihat komentar di billingController.requestPlanChange).
router.post('/checkout', requirePermission('billing', 'view'), requireRole('admin'), ctrl.requestPlanChange);
router.post('/checkout/cancel', requirePermission('billing', 'view'), requireRole('admin'), ctrl.cancelPendingCheckout);
router.post('/cancel', requirePermission('billing', 'view'), requireRole('admin'), ctrl.cancelSubscription);

module.exports = router;
