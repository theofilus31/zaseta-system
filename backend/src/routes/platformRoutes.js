const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/platformController');
const { authenticate, requirePlatformAdmin } = require('../middleware/auth');

// Seluruh rute di sini lintas tenant — tidak ada satu pun yang berlaku "di
// dalam" satu tenant seperti requirePermission/requireRole biasa, jadi
// dijaga satu gerbang di sini, bukan per-rute.
router.use(authenticate, requirePlatformAdmin);

router.get('/stats', ctrl.getStats);
router.post('/plan-expiry/run', ctrl.runPlanExpiryNow);

router.get('/tenants', ctrl.listTenants);
router.patch('/tenants/:id/status', ctrl.updateTenantStatus);
router.patch('/tenants/:id/plan', ctrl.updateTenantPlan);
router.delete('/tenants/:id', ctrl.deleteTenant);

router.get('/admins', ctrl.listPlatformAdmins);
router.post('/admins', ctrl.createPlatformAdmin);
router.get('/users/search', ctrl.searchUsers);
router.patch('/users/:id/platform-admin', ctrl.setPlatformAdmin);
router.get('/users', ctrl.listAllUsers);
router.get('/audit-log', ctrl.listAllAuditLogs);

router.get('/ip-whitelist', ctrl.listIpWhitelist);
router.post('/ip-whitelist', ctrl.addIpWhitelist);
router.delete('/ip-whitelist/:id', ctrl.removeIpWhitelist);

module.exports = router;
