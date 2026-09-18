const { after } = require('node:test');
const pool = require('../../src/config/db');

/**
 * `require`-lah ini di baris pertama SETIAP berkas test yang menyentuh
 * database. pg.Pool membiarkan koneksinya tetap terbuka menunggu query
 * berikutnya — tanpa ditutup eksplisit, proses `node --test` tidak pernah
 * keluar sendiri walau semua test-nya sudah selesai (terlihat seperti
 * "menggantung" tanpa pesan galat apa pun).
 */
after(async () => {
  await pool.end();
});
