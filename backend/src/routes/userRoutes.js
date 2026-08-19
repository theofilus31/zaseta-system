const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/userController');
const { authenticate, requirePermission } = require('../middleware/auth');

// Membuka menu Manajemen Pengguna sudah butuh izin lihat; aksi yang mengubah
// data dijaga terpisah supaya bisa ada pengguna yang hanya boleh meninjau.
router.use(authenticate, requirePermission('users', 'view'));

// Harus sebelum '/:id', kalau tidak "modules" dianggap id pengguna.
router.get('/modules', ctrl.getModuleCatalog);

router.get('/', ctrl.listUsers);
router.get('/:id', ctrl.getUser);
router.post('/', requirePermission('users', 'create'), ctrl.createUser);
router.put('/:id', requirePermission('users', 'edit'), ctrl.updateUser);
router.delete('/:id', requirePermission('users', 'delete'), ctrl.deleteUser);

module.exports = router;
