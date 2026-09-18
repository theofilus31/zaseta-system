const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/billingController');
const { authenticate, requirePermission, requireRole, requirePlatformAdmin } = require('../middleware/auth');
const { publicReadLimiter } = require('../middleware/publicLimiter');

// Katalog paket — publik, dipakai halaman Harga & Landing sebelum login.
// publicReadLimiter (Fase 6) — dampak rendah (cuma katalog statis) tapi
// tidak ada alasan membiarkannya satu-satunya rute publik tanpa pembatas.
router.get('/plans', publicReadLimiter, ctrl.getPlans);

router.use(authenticate);

// Menu "Langganan" dalam aplikasi — sama seperti Pengaturan, tetap butuh izin
// modul 'billing' supaya sidebar & rute frontend konsisten dengan pola menu lain.
router.get('/me', requirePermission('billing', 'view'), ctrl.getMyBilling);
router.get('/invoices', requirePermission('billing', 'view'), ctrl.listInvoices);
router.get('/invoices/:id', requirePermission('billing', 'view'), ctrl.getInvoice);

// Mengajukan upgrade/downgrade & membatalkan langganan adalah keputusan
// finansial/kontraktual — sengaja dijaga requireRole('admin'), bukan matriks
// izin per-menu (lihat komentar di billingController.createUpgradeRequest).
router.post('/upgrade-requests', requirePermission('billing', 'view'), requireRole('admin'), ctrl.createUpgradeRequest);
router.post('/cancel', requirePermission('billing', 'view'), requireRole('admin'), ctrl.cancelSubscription);

// Lintas tenant — khusus admin platform (lihat migration_billing_phase4.sql).
router.get('/upgrade-requests', requirePlatformAdmin, ctrl.listUpgradeRequests);
router.post('/upgrade-requests/:id/approve', requirePlatformAdmin, ctrl.approveUpgradeRequest);
router.post('/upgrade-requests/:id/reject', requirePlatformAdmin, ctrl.rejectUpgradeRequest);

module.exports = router;
