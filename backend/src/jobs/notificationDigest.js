const pool = require('../config/db');
const { loadPermissions } = require('../middleware/auth');
const { getNotificationItems } = require('../utils/notificationItems');
const { sendNotificationDigest } = require('../utils/mailer');

/**
 * ============================================================================
 *  DIGEST EMAIL HARIAN — "PERLU DITINDAKLANJUTI"
 * ============================================================================
 *  Lonceng notifikasi di dalam aplikasi cuma terlihat kalau orangnya sedang
 *  membuka aplikasi. Untuk hal yang mendesak (garansi berakhir, stok habis,
 *  permintaan menumpuk), menunggu sampai seseorang kebetulan membuka app
 *  tidak cukup — jadi dikirim juga lewat surel sekali sehari.
 *
 *  Dikirim PER PENGGUNA, bukan satu surel ke semua admin: setiap orang cuma
 *  menerima item yang izinnya dia punya (sama seperti yang dia lihat sendiri
 *  di lonceng), lewat utils/notificationItems.js yang dipakai bersama.
 *  Pengguna tanpa item yang perlu ditindaklanjuti TIDAK menerima surel sama
 *  sekali — tidak ada gunanya mengirim "tidak ada yang perlu diurus" tiap
 *  hari, itu justru cepat diabaikan (alert fatigue).
 *
 *  Dijadwalkan lewat node-cron di server.js. Fungsi ini juga dipanggil
 *  langsung dari endpoint POST /api/notifications/digest/send-now (khusus
 *  admin) untuk menguji tanpa perlu menunggu jadwalnya.
 * ============================================================================
 */
async function runNotificationDigest() {
  const [users] = await pool.query(
    `SELECT u.id, u.tenant_id, u.name, u.email, r.name AS role
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.status = 'active' AND u.deleted_at IS NULL`
  );

  let emailsSent = 0;
  const errors = [];

  for (const user of users) {
    try {
      const permissions = await loadPermissions(user);
      const { items } = await getNotificationItems({ ...user, permissions });

      // Tidak ada gunanya mengirim surel kosong — dan berulang setiap hari
      // justru membuat orang berhenti membacanya.
      if (items.length === 0) continue;

      await sendNotificationDigest({ to: user.email, userName: user.name, items, tenantId: user.tenant_id });
      emailsSent += 1;
    } catch (err) {
      // Satu pengguna gagal terkirim (mis. alamat surel tidak valid) tidak
      // boleh menghentikan pengiriman untuk pengguna lain.
      errors.push({ userId: user.id, email: user.email, message: err.message });
    }
  }

  return { usersChecked: users.length, emailsSent, errors };
}

module.exports = { runNotificationDigest };
