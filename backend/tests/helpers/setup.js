const { before } = require('node:test');
const { reloadPlansCache } = require('../../src/config/plans');

/**
 * `require`-lah ini di setiap berkas test yang (langsung atau tidak
 * langsung lewat middleware/controller/service) memanggil `getPlan()`/
 * `isUpgrade()`/dll dari config/plans.js. Katalog paket sekarang tabel
 * database (lihat migration_plans_catalog_db.sql), dimuat ke cache di
 * memori — sama seperti server.js production, cache-nya kosong sampai
 * `reloadPlansCache()` benar-benar ditunggu, dan `node --test` menjalankan
 * setiap berkas *.test.js di proses/module registry terpisah, jadi
 * pemuatannya harus diulang per berkas, bukan cukup sekali secara global.
 */
before(async () => {
  await reloadPlansCache();
});
