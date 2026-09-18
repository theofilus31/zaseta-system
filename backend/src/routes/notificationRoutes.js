const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/notificationController');
const { authenticate, requireAnyPermission, requireRole } = require('../middleware/auth');

router.use(authenticate);

/* Digabung dari tiga sumber izin berbeda (data aset, barang habis pakai,
   permintaan aset). Cukup salah satu untuk lolos ke endpoint — di dalam
   controller, tiap bagian tetap disaring sendiri-sendiri sesuai izin nyata
   pengguna, supaya yang hanya boleh melihat satu di antaranya tidak ikut
   menerima pengingat dari sumber yang sebenarnya tidak boleh mereka lihat. */
router.get('/', requireAnyPermission('assets.view', 'consumables.view', 'requests.view'), ctrl.getNotifications);

/* Memicu digest email langsung (bukan menunggu jadwal jam 7 pagi) — dipakai
   untuk menguji konfigurasi SMTP/isi surelnya. Dibatasi admin karena akan
   mengirim surel sungguhan ke SEMUA pengguna aktif yang punya item tertunda,
   bukan cuma pratinjau untuk diri sendiri. */
router.post('/digest/send-now', requireRole('admin'), ctrl.sendDigestNow);

module.exports = router;
