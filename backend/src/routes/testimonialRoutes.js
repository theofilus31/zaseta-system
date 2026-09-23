const express = require('express');
const router = express.Router();
const { submitTestimonial, skipTestimonial } = require('../controllers/testimonialController');
const { authenticate } = require('../middleware/auth');

// Semua pengguna yang login (bukan cuma admin) boleh mengisi testimoni --
// beda dari billing/upgrade paket, ini bukan keputusan finansial, jadi tidak
// dijaga requireRole('admin').
router.use(authenticate);

router.post('/', submitTestimonial);
router.post('/skip', skipTestimonial);

module.exports = router;
