const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/assetController');
const qrCtrl = require('../controllers/qrController');
const attachCtrl = require('../controllers/attachmentController');
const reminderCtrl = require('../controllers/reminderController');
const maintenanceCtrl = require('../controllers/maintenanceController');
const { authenticate, requirePermission } = require('../middleware/auth');
const { checkAssetLimit, requireFeature } = require('../middleware/planLimits');
const upload = require('../middleware/upload');
const uploadAttachment = require('../middleware/uploadAttachment');

router.use(authenticate);
router.get('/', requirePermission('assets', 'view'), ctrl.listAssets);
// Harus dideklarasikan SEBELUM '/:id', kalau tidak Express akan menganggap
// "export" sebagai id aset dan permintaannya berakhir 404.
router.get('/export', requirePermission('assets', 'view'), ctrl.exportAssets);
// Juga harus sebelum '/:id' — "by-code" bukan id aset.
router.get('/by-code/:code', requirePermission('assets', 'view'), ctrl.getAssetByCode);
router.post('/import', requirePermission('assets', 'create'), checkAssetLimit, upload.single('file'), ctrl.importAssets);

// Tempat sampah — juga harus dideklarasikan SEBELUM '/:id', kalau tidak
// Express akan menganggap "trash" sebagai id aset.
router.get('/trash', requirePermission('trash', 'view'), ctrl.listTrash);
router.put('/trash/:id/restore', requirePermission('trash', 'edit'), ctrl.restoreAsset);
router.delete('/trash/:id', requirePermission('trash', 'delete'), ctrl.permanentDeleteAsset);

router.get('/:id', requirePermission('assets', 'view'), ctrl.getAsset);
router.post('/', requirePermission('assets', 'create'), checkAssetLimit, ctrl.createAsset);
router.put('/:id', requirePermission('assets', 'edit'), ctrl.updateAsset);
router.delete('/:id', requirePermission('assets', 'delete'), ctrl.deleteAsset);

router.get('/:id/qr/print', requirePermission('assets', 'view'), qrCtrl.getAssetQr);
router.post('/:id/qr/regenerate', requirePermission('assets', 'edit'), qrCtrl.regenerateAssetQr);
// Cetak Kode Batang MASSAL dikunci di paket Free (lihat FREE_LOCKED_MODULES di
// middleware/planLimits.js) — cetak SATUAN di /:id/qr/print di atas tetap
// terbuka untuk semua paket, cuma versi massalnya yang berbayar.
router.post('/qr/batch', requirePermission('barcode', 'view'), requireFeature('barcode'), qrCtrl.getAssetsQrBatch);

// Lampiran berkas — mengunggah dihitung sebagai "create" (menambah data baru),
// mengunduh cukup izin "view" karena tidak mengubah apa pun.
router.get('/:id/attachments', requirePermission('assets', 'view'), attachCtrl.listAttachments);
router.post('/:id/attachments', requirePermission('assets', 'create'), uploadAttachment.single('file'), attachCtrl.uploadAttachment);
router.get('/:id/attachments/:attachmentId', requirePermission('assets', 'view'), attachCtrl.downloadAttachment);
router.delete('/:id/attachments/:attachmentId', requirePermission('assets', 'delete'), attachCtrl.deleteAttachment);

// Pengingat bertanggal — menandai selesai/memajukan tanggal dihitung sebagai
// mengubah data yang sudah ada, jadi butuh izin "edit".
router.get('/:id/reminders', requirePermission('assets', 'view'), reminderCtrl.listReminders);
router.post('/:id/reminders', requirePermission('assets', 'create'), reminderCtrl.createReminder);
router.post('/:id/reminders/:reminderId/complete', requirePermission('assets', 'edit'), reminderCtrl.completeReminder);
router.delete('/:id/reminders/:reminderId', requirePermission('assets', 'delete'), reminderCtrl.deleteReminder);

// Pemeliharaan
router.get('/:id/maintenances', requirePermission('assets', 'view'), maintenanceCtrl.listMaintenances);
router.post('/:id/maintenances', requirePermission('assets', 'create'), maintenanceCtrl.createMaintenance);
router.put('/:id/maintenances/:maintenanceId/complete', requirePermission('assets', 'edit'), maintenanceCtrl.completeMaintenance);
router.put('/:id/maintenances/:maintenanceId/cancel', requirePermission('assets', 'edit'), maintenanceCtrl.cancelMaintenance);
router.delete('/:id/maintenances/:maintenanceId', requirePermission('assets', 'delete'), maintenanceCtrl.deleteMaintenance);

module.exports = router;
