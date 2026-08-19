const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/notificationController');
const { authenticate, requireAnyPermission } = require('../middleware/auth');

router.use(authenticate);

/* Digabung dari tiga sumber izin berbeda (data aset, barang habis pakai,
   permintaan aset). Cukup salah satu untuk lolos ke endpoint — di dalam
   controller, tiap bagian tetap disaring sendiri-sendiri sesuai izin nyata
   pengguna, supaya yang hanya boleh melihat satu di antaranya tidak ikut
   menerima pengingat dari sumber yang sebenarnya tidak boleh mereka lihat. */
router.get('/', requireAnyPermission('assets.view', 'consumables.view', 'requests.view'), ctrl.getNotifications);

module.exports = router;
