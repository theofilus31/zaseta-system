const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/platformController');
const { authenticatePlatform } = require('../middleware/auth');

// Seluruh rute di sini lintas tenant — tidak ada satu pun yang berlaku "di
// dalam" satu tenant seperti requirePermission/requireRole biasa, jadi
// dijaga satu gerbang di sini, bukan per-rute. Sesi admin platform TERPISAH
// TOTAL dari sesi tenant sejak migration_separate_platform_admins.sql — lihat
// authenticatePlatform di middleware/auth.js & login-nya sendiri di
// routes/platformAuthRoutes.js.
router.use(authenticatePlatform);

router.get('/stats', ctrl.getStats);
router.get('/revenue', ctrl.getRevenue);
router.get('/activity', ctrl.getActivity);
router.post('/plan-expiry/run', ctrl.runPlanExpiryNow);

router.get('/plans', ctrl.listPlansAdmin);
router.post('/plans', ctrl.createPlan);
router.patch('/plans/:id', ctrl.updatePlan);
router.patch('/plans/:id/move', ctrl.movePlan);
router.delete('/plans/:id', ctrl.deletePlan);

router.get('/tenants', ctrl.listTenants);
router.patch('/tenants/:id/status', ctrl.updateTenantStatus);
router.patch('/tenants/:id/plan', ctrl.updateTenantPlan);
router.delete('/tenants/:id', ctrl.deleteTenant);

router.get('/admins', ctrl.listPlatformAdmins);
router.post('/admins', ctrl.createPlatformAdmin);
router.delete('/admins/:id', ctrl.removePlatformAdmin);
router.get('/users', ctrl.listAllUsers);
router.get('/audit-log', ctrl.listAllAuditLogs);

router.get('/ip-whitelist', ctrl.listIpWhitelist);
router.post('/ip-whitelist', ctrl.addIpWhitelist);
router.delete('/ip-whitelist/:id', ctrl.removeIpWhitelist);

router.get('/testimonials', ctrl.listTestimonials);
router.post('/testimonials/:id/approve', ctrl.approveTestimonial);
router.post('/testimonials/:id/reject', ctrl.rejectTestimonial);

module.exports = router;
