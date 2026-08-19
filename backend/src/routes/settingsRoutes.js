const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/settingsController');
const { authenticate, requirePermission } = require('../middleware/auth');
const uploadImage = require('../middleware/uploadImage');

router.use(authenticate);

router.get('/', requirePermission('settings', 'view'), ctrl.getSettings);
router.put('/', requirePermission('settings', 'edit'), ctrl.updateSettings);

router.post(
  '/logo/:variant',
  requirePermission('settings', 'edit'),
  uploadImage.single('logo'),
  ctrl.uploadLogo
);
router.delete('/logo/:variant', requirePermission('settings', 'edit'), ctrl.deleteLogo);

module.exports = router;
