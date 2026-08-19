const express = require('express');
const router = express.Router();
const { login, me } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const loginLimiter = require('../middleware/loginLimiter');

router.post('/login', loginLimiter, login);
router.get('/me', authenticate, me);

module.exports = router;
