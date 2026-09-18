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

/* Update username — mengikuti izin menu Manajemen Pengguna (users.edit),
   BUKAN lagi khusus role admin — keputusan yang disengaja (lihat komentar
   `isAdmin = can('users','edit')` di frontend/src/pages/Profile.jsx),
   konsisten dengan PUT /api/users/:id yang juga mengizinkan staf
   non-admin terdelegasi mengganti username pengguna lain. (Fase 6 audit:
   komentar "KHUSUS ADMIN" di profileController.updateUsername sempat tidak
   sinkron dengan keputusan ini — sudah diperbarui di sana, bukan di sini.) */
router.put('/username', requirePermission('users', 'edit'), updateUsername);

module.exports = router;
