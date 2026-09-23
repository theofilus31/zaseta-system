const express = require('express');
const router = express.Router();
const { login, googleLogin, me } = require('../controllers/platformAuthController');
const { updateProfile, updateUsername, requestEmailOtp, verifyEmailOtp } = require('../controllers/platformProfileController');
const { authenticatePlatform } = require('../middleware/auth');
const loginLimiter = require('../middleware/loginLimiter');

// Sesi admin platform TERPISAH TOTAL dari /api/auth tenant — lihat
// migration_separate_platform_admins.sql & controllers/platformAuthController.js.
router.post('/login', loginLimiter, login);
router.post('/google-login', loginLimiter, googleLogin);

router.get('/me', authenticatePlatform, me);
router.put('/profile', authenticatePlatform, updateProfile);
router.put('/profile/username', authenticatePlatform, updateUsername);
router.post('/profile/email/otp/request', authenticatePlatform, requestEmailOtp);
router.post('/profile/email/otp/verify', authenticatePlatform, verifyEmailOtp);

module.exports = router;
