const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/locationController');
const { authenticate, requirePermission, requireAnyPermission } = require('../middleware/auth');
const { checkLocationLimit } = require('../middleware/planLimits');
const upload = require('../middleware/upload');

router.use(authenticate);
// Daftar ini juga jadi isi dropdown di form aset, jadi boleh dibaca siapa pun
// yang berhak melihat aset — tanpa itu, pengguna yang boleh menambah aset tapi
// tidak diberi menu ini akan menemui dropdown kosong dan formnya buntu.
router.get('/', requireAnyPermission('locations.view', 'assets.view'), ctrl.listLocations);
// Harus dideklarasikan sebelum '/:id' kalau suatu saat ditambah — kalau tidak,
// Express akan menganggap "export" sebagai id lokasi.
router.get('/export', requirePermission('locations', 'view'), ctrl.exportLocations);
router.post('/', requirePermission('locations', 'create'), checkLocationLimit, ctrl.createLocation);
router.post('/import', requirePermission('locations', 'create'), checkLocationLimit, upload.single('file'), ctrl.importLocations);
router.put('/:id', requirePermission('locations', 'edit'), ctrl.updateLocation);
router.delete('/:id', requirePermission('locations', 'delete'), ctrl.deleteLocation);

module.exports = router;
