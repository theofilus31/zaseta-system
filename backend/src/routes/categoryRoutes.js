const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/categoryController');
const { authenticate, requirePermission, requireAnyPermission } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(authenticate);
// Daftar ini juga jadi isi dropdown di form aset, jadi boleh dibaca siapa pun
// yang berhak melihat aset — tanpa itu, pengguna yang boleh menambah aset tapi
// tidak diberi menu ini akan menemui dropdown kosong dan formnya buntu.
router.get('/', requireAnyPermission('categories.view', 'assets.view'), ctrl.listCategories);
// Harus dideklarasikan sebelum '/:id' kalau suatu saat ditambah — kalau tidak,
// Express akan menganggap "export" sebagai id kategori.
router.get('/export', requirePermission('categories', 'view'), ctrl.exportCategories);
router.post('/', requirePermission('categories', 'create'), ctrl.createCategory);
router.post('/import', requirePermission('categories', 'create'), upload.single('file'), ctrl.importCategories);
router.put('/:id', requirePermission('categories', 'edit'), ctrl.updateCategory);
router.delete('/:id', requirePermission('categories', 'delete'), ctrl.deleteCategory);

module.exports = router;
