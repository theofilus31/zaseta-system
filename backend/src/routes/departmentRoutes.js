const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/departmentController');
const { authenticate, requirePermission, requireAnyPermission } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(authenticate);

// Daftar ini juga jadi isi dropdown di form aset, jadi boleh dibaca siapa pun
// yang berhak melihat aset — tanpa itu, pengguna yang boleh menambah aset tapi
// tidak diberi menu ini akan menemui dropdown kosong dan formnya buntu.
router.get('/', requireAnyPermission('departments.view', 'assets.view'), ctrl.listDepartments);
// Harus dideklarasikan sebelum '/:id' kalau suatu saat ditambah — kalau tidak,
// Express akan menganggap "export" sebagai id departemen.
router.get('/export', requirePermission('departments', 'view'), ctrl.exportDepartments);

router.post('/', requirePermission('departments', 'create'), ctrl.createDepartment);
router.post('/import', requirePermission('departments', 'create'), upload.single('file'), ctrl.importDepartments);
router.put('/:id', requirePermission('departments', 'edit'), ctrl.updateDepartment);
router.delete('/:id', requirePermission('departments', 'delete'), ctrl.deleteDepartment);

module.exports = router;
