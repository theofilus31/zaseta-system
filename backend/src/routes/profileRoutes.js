const express = require('express');
const router = express.Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const {
  getProfile,
  updateProfile,
  requestEmailOtp,
  verifyEmailOtp,
  updateUsername,
} = require('../controllers/profileController');

router.use(authenticate);

// Profil sendiri — semua role
router.get('/', getProfile);
router.put('/', updateProfile); // nama & password

// Ganti email sendiri — semua role, wajib verifikasi OTP yang dikirim ke email baru
router.post('/email/otp/request', requestEmailOtp);
router.post('/email/otp/verify', verifyEmailOtp);

// Update username — khusus admin
router.put('/username', requirePermission('users', 'edit'), updateUsername);

module.exports = router;
