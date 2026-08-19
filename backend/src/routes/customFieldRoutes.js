const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/customFieldController');
const { authenticate, requirePermission, requireAnyPermission } = require('../middleware/auth');

router.use(authenticate);
// Daftar ini juga jadi isi dropdown di form aset, jadi boleh dibaca siapa pun
// yang berhak melihat aset — tanpa itu, pengguna yang boleh menambah aset tapi
// tidak diberi menu ini akan menemui dropdown kosong dan formnya buntu.
router.get('/', requireAnyPermission('custom_fields.view', 'assets.view'), ctrl.listCustomFields);
router.post('/', requirePermission('custom_fields', 'create'), ctrl.createCustomField);
router.put('/:id', requirePermission('custom_fields', 'edit'), ctrl.updateCustomField);
router.delete('/:id', requirePermission('custom_fields', 'delete'), ctrl.deleteCustomField);

module.exports = router;
