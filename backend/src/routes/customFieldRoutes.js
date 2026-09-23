const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/customFieldController');
const { authenticate, requirePermission, requireAnyPermission } = require('../middleware/auth');
const { requireFeature } = require('../middleware/planLimits');

router.use(authenticate);
// Daftar ini juga jadi isi dropdown di form aset, jadi boleh dibaca siapa pun
// yang berhak melihat aset — tanpa itu, pengguna yang boleh menambah aset tapi
// tidak diberi menu ini akan menemui dropdown kosong dan formnya buntu. Karena
// itu GET TIDAK ikut dikunci di paket Free (beda dari opname/consumables/
// requests yang seluruh modulnya ditutup) — hanya membuat/mengubah/menghapus
// bidang kustom baru yang dikunci.
router.get('/', requireAnyPermission('custom_fields.view', 'assets.view'), ctrl.listCustomFields);
router.post('/', requirePermission('custom_fields', 'create'), requireFeature('custom_fields'), ctrl.createCustomField);
router.put('/:id', requirePermission('custom_fields', 'edit'), requireFeature('custom_fields'), ctrl.updateCustomField);
router.delete('/:id', requirePermission('custom_fields', 'delete'), requireFeature('custom_fields'), ctrl.deleteCustomField);

module.exports = router;
