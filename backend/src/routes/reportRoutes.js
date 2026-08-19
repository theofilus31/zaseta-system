const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reportController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

router.get('/depreciation', requirePermission('reports', 'view'), ctrl.getDepreciationReport);
router.get('/depreciation/export', requirePermission('reports', 'view'), ctrl.exportDepreciationReport);

module.exports = router;
