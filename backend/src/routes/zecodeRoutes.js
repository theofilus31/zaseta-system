const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/zecodeController');
const { authenticate, requirePermission } = require('../middleware/auth');
const zecodeChatLimiter = require('../middleware/zecodeChatLimiter');

router.use(authenticate);
router.use(requirePermission('zecode', 'view'));

router.get('/conversations', ctrl.listConversations);
router.get('/conversations/:id', ctrl.getConversation);
router.delete('/conversations/:id', ctrl.deleteConversation);

/* /chat memanggil model AI lokal yang bisa butuh puluhan detik per balasan —
   jauh lebih berat dari endpoint lain di rute ini, jadi diberi pembatas laju
   tersendiri (lihat middleware/zecodeChatLimiter.js) supaya satu pengguna
   tidak bisa membebani Zecode untuk semua orang lain. */
router.post('/chat', zecodeChatLimiter, ctrl.chat);

/* Aksi yang diusulkan Zecode (mis. mengajukan permintaan aset) TIDAK
   dijalankan otomatis — baru dieksekusi di sini setelah pengguna menekan
   konfirmasi. Izin untuk JENIS aksi yang diusulkan (mis. requests.create)
   dicek ULANG di dalam confirmAction, bukan cuma dipercaya dari saat
   tawarannya dibuat — kalau izin pengguna dicabut administrator SELAGI
   tawaran ini masih menunggu diklik, eksekusinya tetap harus ditolak. */
router.post('/messages/:id/confirm', ctrl.confirmAction);
router.post('/messages/:id/cancel', ctrl.cancelAction);

module.exports = router;
