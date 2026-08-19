const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/auditController');
const { authenticate, requirePermission } = require('../middleware/auth');

// Riwayat aktivitas memperlihatkan jejak seluruh pengguna, termasuk perubahan
// data sensitif — aksesnya diatur lewat izin menu Riwayat Aktivitas.
router.use(authenticate, requirePermission('audit_logs', 'view'));

router.get('/', ctrl.listAuditLogs);
router.get('/filters', ctrl.getAuditFilters);

module.exports = router;
