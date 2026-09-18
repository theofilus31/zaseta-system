const asyncHandler = require('../utils/asyncHandler');
const { getNotificationItems } = require('../utils/notificationItems');
const { runNotificationDigest } = require('../jobs/notificationDigest');

/**
 * ============================================================================
 *  PEMBERITAHUAN (pusat "perlu ditindaklanjuti")
 * ============================================================================
 *  Sebelum ini, tiga sumber tanggal penting (garansi, pengingat kustom,
 *  jadwal pemeliharaan) masing-masing hanya terlihat kalau orangnya sengaja
 *  membuka halaman yang tepat. Titik akhir ini menggabungkan ketiganya jadi
 *  satu daftar, dibaca oleh lonceng di bagian atas aplikasi — supaya "apa
 *  yang harus saya urus hari ini?" bisa dijawab tanpa membuka satu per satu
 *  aset satu per satu.
 *
 *  Sengaja TIDAK punya status "sudah dibaca" yang disimpan di database.
 *  Daftar ini dihitung ulang setiap dibuka, sama seperti bagian Garansi di
 *  Dasbor yang sudah ada — begitu tanggalnya lewat jendela waktu yang
 *  dipantau, dia hilang sendiri dari daftar tanpa perlu ada yang menghapus.
 *  Melacak status baca per pengguna adalah fitur yang jauh lebih besar
 *  daripada yang diminta di sini, dan generasi ulang otomatis ini sudah
 *  menjawab kebutuhan utamanya: tidak ada tanggal penting yang terlewat.
 *
 *  Logika pengumpulan itemnya sendiri ada di utils/notificationItems.js —
 *  dipakai bersama dengan digest email harian (lihat jobs/notificationDigest.js)
 *  supaya lonceng di aplikasi dan surel yang terkirim selalu sinkron.
 * ============================================================================
 */

// GET /api/notifications
const getNotifications = asyncHandler(async (req, res) => {
  const result = await getNotificationItems(req.user);
  res.json(result);
});

// POST /api/notifications/digest/send-now — admin, untuk menguji digest email
const sendDigestNow = asyncHandler(async (req, res) => {
  const result = await runNotificationDigest();
  res.json({
    message: `Digest terkirim ke ${result.emailsSent} dari ${result.usersChecked} pengguna aktif.`,
    ...result,
  });
});

module.exports = { getNotifications, sendDigestNow };
