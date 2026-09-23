const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/opnameController');
const { authenticate, requirePermission } = require('../middleware/auth');
const { requireFeature } = require('../middleware/planLimits');

router.use(authenticate);
// Seluruh modul Stok Opname dikunci di paket Free (lihat FREE_LOCKED_MODULES
// di middleware/planLimits.js) — dicek di sini, bukan cuma di /:id/scan atau
// /:id/finish, supaya bahkan GET /opnames (daftar sesi) ikut tertutup.
router.use(requireFeature('opname'));

router.get('/', requirePermission('opname', 'view'), ctrl.listOpnames);
// Harus sebelum '/:id' — "active" bukan id sesi.
router.get('/active', requirePermission('opname', 'view'), ctrl.listActiveOpnames);
router.get('/:id', requirePermission('opname', 'view'), ctrl.getOpname);
router.get('/:id/export', requirePermission('opname', 'view'), ctrl.exportOpname);

router.post('/', requirePermission('opname', 'create'), ctrl.createOpname);

/* Mencatat hasil pemeriksaan dan menutup sesi sama-sama "mengubah sesi yang
   sedang berjalan", jadi keduanya cukup di bawah izin ubah. */
router.put('/:id/items/:itemId', requirePermission('opname', 'edit'), ctrl.checkItem);
router.post('/:id/scan', requirePermission('opname', 'edit'), ctrl.scanItem);
router.post('/:id/finish', requirePermission('opname', 'edit'), ctrl.finishOpname);
router.post('/:id/cancel', requirePermission('opname', 'edit'), ctrl.cancelOpname);

router.delete('/:id', requirePermission('opname', 'delete'), ctrl.deleteOpname);

module.exports = router;
