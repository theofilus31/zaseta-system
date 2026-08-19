const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/assignmentController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

// Melihat siapa memegang apa mengikuti izin lihat pada menu Daftar Aset.
router.get('/', requirePermission('assets', 'view'), ctrl.listAssignments);
router.get('/holders', requirePermission('assets', 'view'), ctrl.listHolders);
router.get('/:id/bast', requirePermission('assets', 'view'), ctrl.getBast);

// Serah terima mengubah data & status aset, jadi butuh izin ubah aset.
router.post('/', requirePermission('assets', 'edit'), ctrl.checkOut);
router.put('/:id/return', requirePermission('assets', 'edit'), ctrl.checkIn);

module.exports = router;
