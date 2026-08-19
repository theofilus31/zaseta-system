const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/subLocationController');
const { authenticate, requirePermission, requireAnyPermission } = require('../middleware/auth');

router.use(authenticate);
// Daftar ini juga jadi isi dropdown di form aset, jadi boleh dibaca siapa pun
// yang berhak melihat aset — tanpa itu, pengguna yang boleh menambah aset tapi
// tidak diberi menu ini akan menemui dropdown kosong dan formnya buntu.
router.get('/', requireAnyPermission('locations.view', 'assets.view'), ctrl.listSubLocations);
router.post('/', requirePermission('locations', 'create'), ctrl.createSubLocation);
router.put('/:id', requirePermission('locations', 'edit'), ctrl.updateSubLocation);
router.delete('/:id', requirePermission('locations', 'delete'), ctrl.deleteSubLocation);

module.exports = router;
