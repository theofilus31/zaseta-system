const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/assetTypeController');
const { authenticate, requirePermission, requireAnyPermission } = require('../middleware/auth');

router.use(authenticate);
// Daftar ini juga jadi isi dropdown di form aset, jadi boleh dibaca siapa pun
// yang berhak melihat aset — tanpa itu, pengguna yang boleh menambah aset tapi
// tidak diberi menu ini akan menemui dropdown kosong dan formnya buntu.
router.get('/', requireAnyPermission('asset_types.view', 'assets.view'), ctrl.listAssetTypes);
router.post('/', requirePermission('asset_types', 'create'), ctrl.createAssetType);
router.put('/:id', requirePermission('asset_types', 'edit'), ctrl.updateAssetType);
router.delete('/:id', requirePermission('asset_types', 'delete'), ctrl.deleteAssetType);

module.exports = router;
