const express = require('express');
const router = express.Router();
const { getSummary } = require('../controllers/dashboardController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.get('/summary', authenticate, requirePermission('dashboard', 'view'), getSummary);

module.exports = router;
