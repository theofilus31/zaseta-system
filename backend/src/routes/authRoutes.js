const express = require('express');
const router = express.Router();
const {
  login, me, forgotPassword, resetPassword, signup, verifySignupEmail, resendSignupVerification,
  googleLogin, googleSignup,
} = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const loginLimiter = require('../middleware/loginLimiter');
const { forgotPasswordLimiter, resetPasswordLimiter } = require('../middleware/passwordResetLimiter');
const { signupLimiter, resendSignupVerificationLimiter, verifySignupEmailLimiter } = require('../middleware/signupLimiter');

router.post('/login', loginLimiter, login);
router.get('/me', authenticate, me);

// Publik (tanpa login) — "Masuk/Daftar dengan Google" (Google Identity
// Services). Limiter yang sama dengan jalur kata sandi biasa — sama-sama
// permukaan tanpa-auth yang bisa dipukul berulang kalau tidak dibatasi.
router.post('/google-login', loginLimiter, googleLogin);
router.post('/google-signup', signupLimiter, googleSignup);

// Publik (tanpa login) — alur "Lupa Kata Sandi" di halaman Masuk.
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/reset-password', resetPasswordLimiter, resetPassword);

// Publik (tanpa login) — pendaftaran mandiri perusahaan baru (Fase 2 SaaS).
router.post('/signup', signupLimiter, signup);

// Publik (tanpa login) — verifikasi surel setelah signup (susulan keamanan).
router.post('/verify-signup-email', verifySignupEmailLimiter, verifySignupEmail);
router.post('/resend-signup-verification', resendSignupVerificationLimiter, resendSignupVerification);

module.exports = router;
