const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/requestController');
const { authenticate, requirePermission } = require('../middleware/auth');
const { requireFeature } = require('../middleware/planLimits');

router.use(authenticate);
// Seluruh modul Permintaan Aset dikunci di paket Free — lihat catatan
// yang sama di opnameRoutes.js.
router.use(requireFeature('requests'));

router.get('/', requirePermission('requests', 'view'), ctrl.listRequests);
router.post('/', requirePermission('requests', 'create'), ctrl.createRequest);
router.get('/:id', requirePermission('requests', 'view'), ctrl.getRequest);

/* Menyetujui/menolak/memenuhi/membatalkan semuanya mengubah status permintaan
   yang sudah ada, jadi cukup izin "edit" — sama seperti pola stok opname. */
router.put('/:id/approve', requirePermission('requests', 'edit'), ctrl.approveRequest);
router.put('/:id/reject', requirePermission('requests', 'edit'), ctrl.rejectRequest);
router.put('/:id/fulfill', requirePermission('requests', 'edit'), ctrl.fulfillRequest);
router.put('/:id/cancel', requirePermission('requests', 'edit'), ctrl.cancelRequest);

router.delete('/:id', requirePermission('requests', 'delete'), ctrl.deleteRequest);

module.exports = router;
