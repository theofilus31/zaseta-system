const cron = require('node-cron');
const app = require('./app');
require('dotenv').config();
const { runNotificationDigest } = require('./jobs/notificationDigest');
const { runPlanExpiryCheck } = require('./jobs/planExpiry');
const { reloadIpWhitelist } = require('./utils/ipWhitelist');

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`ZASETA API berjalan di port ${PORT}`);
});

/* Cache daftar putih IP dimuat sekali di sini, sebelum permintaan pertama
   sempat ditolak pembatas laju gara-gara cache-nya masih kosong (lihat
   utils/ipWhitelist.js) -- disegarkan lagi otomatis tiap kali admin platform
   menambah/menghapus entri lewat menu Daftar Putih IP. */
reloadIpWhitelist().catch((err) => console.error('Gagal memuat daftar putih IP saat startup:', err.message));

/* Digest email harian — nonaktif hanya kalau EMAIL_DIGEST_ENABLED diset
   eksplisit ke 'false' di .env (mis. saat mengembangkan lokal tanpa mau
   surel terkirim tiap hari). EMAIL_DIGEST_HOUR: jam pengiriman (0-23, waktu
   Asia/Jakarta), bawaan jam 7 pagi — cukup pagi untuk ditindaklanjuti hari
   itu juga, tanpa mengganggu di luar jam kerja. */
if (process.env.EMAIL_DIGEST_ENABLED !== 'false') {
  const hour = Number(process.env.EMAIL_DIGEST_HOUR ?? 7);
  cron.schedule(`0 ${hour} * * *`, async () => {
    try {
      const result = await runNotificationDigest();
      console.log(`[digest email] terkirim ke ${result.emailsSent}/${result.usersChecked} pengguna.`, result.errors);
    } catch (err) {
      console.error('[digest email] gagal berjalan:', err);
    }
  }, { timezone: 'Asia/Jakarta' });
  console.log(`Digest email notifikasi dijadwalkan tiap hari jam ${hour}:00 WIB.`);
}

/* Penegakan kedaluwarsa paket — nonaktif hanya kalau PLAN_EXPIRY_ENABLED
   diset eksplisit ke 'false'. Dijalankan tiap hari jam 2 pagi WIB (di luar
   jam kerja, dan sebelum digest notifikasi jam 7 supaya kalau ada dampak ke
   notifikasi lain hari itu, datanya sudah konsisten duluan). */
if (process.env.PLAN_EXPIRY_ENABLED !== 'false') {
  cron.schedule('0 2 * * *', async () => {
    try {
      const result = await runPlanExpiryCheck();
      console.log(`[kedaluwarsa paket] ${result.downgraded}/${result.tenantsChecked} tenant diturunkan ke Free.`, result.errors);
    } catch (err) {
      console.error('[kedaluwarsa paket] gagal berjalan:', err);
    }
  }, { timezone: 'Asia/Jakarta' });
  console.log('Pengecekan kedaluwarsa paket dijadwalkan tiap hari jam 02:00 WIB.');
}
