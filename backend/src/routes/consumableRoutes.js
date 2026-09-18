const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/consumableController');
const qrCtrl = require('../controllers/consumableQrController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

router.get('/', requirePermission('consumables', 'view'), ctrl.listConsumables);
router.post('/', requirePermission('consumables', 'create'), ctrl.createConsumable);

// WAJIB sebelum `/:id` di bawah — kalau tidak, Express akan mencocokkan
// "by-code" sebagai NILAI :id (sama seperti urutan /by-code/:code di
// assetRoutes.js untuk alasan yang sama).
router.get('/by-code/:code', requirePermission('consumables', 'view'), ctrl.getConsumableByCode);

router.get('/:id', requirePermission('consumables', 'view'), ctrl.getConsumable);
router.put('/:id', requirePermission('consumables', 'edit'), ctrl.updateConsumable);
router.delete('/:id', requirePermission('consumables', 'delete'), ctrl.deleteConsumable);

router.get('/:id/transactions', requirePermission('consumables', 'view'), ctrl.listTransactions);

router.get('/:id/qr/print', requirePermission('consumables', 'view'), qrCtrl.getConsumableQr);
router.post('/:id/qr/regenerate', requirePermission('consumables', 'edit'), qrCtrl.regenerateConsumableQr);

/* Mutasi stok dihitung sebagai "edit" (mengubah data yang sudah ada), bukan
   "create" — barangnya sendiri sudah ada, yang berubah cuma jumlahnya. */
router.post('/:id/stock-in', requirePermission('consumables', 'edit'), ctrl.stockIn);
router.post('/:id/stock-out', requirePermission('consumables', 'edit'), ctrl.stockOut);
router.post('/:id/adjust', requirePermission('consumables', 'edit'), ctrl.adjustStock);

module.exports = router;
