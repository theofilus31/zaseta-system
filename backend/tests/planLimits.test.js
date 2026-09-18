const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/teardown');
require('./helpers/setup');
const pool = require('../src/config/db');
const { checkAssetLimit, checkUserLimit, checkLocationLimit } = require('../src/middleware/planLimits');
const { createTestTenant, dropTestTenant, bulkInsertAssets, bulkInsertUsers, bulkInsertLocations } = require('./helpers/testTenant');
const { mockReq, runMiddleware } = require('./helpers/mockReqRes');

/**
 * Menguji middleware/planLimits.js LANGSUNG terhadap database sungguhan
 * (bukan mock) — tenant sekali pakai per test, dibuang begitu selesai (lihat
 * tests/helpers/testTenant.js). Jumlah baris di setiap test PERSIS di batas
 * (limit-1 lolos, limit blokir) supaya menguji kondisi tepi yang sesungguhnya
 * dipakai produksi, bukan angka aman yang jauh dari batas.
 */

test('Free — bisa membuat aset sampai 100, aset ke-101 ditolak', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));

  await bulkInsertAssets(tenantId, 99);
  const allowed = await runMiddleware(checkAssetLimit, mockReq({ tenantId }));
  assert.equal(allowed.nextCalled, true, 'aset ke-100 (index 99 -> jadi ke-100) harus tetap boleh');

  await bulkInsertAssets(tenantId, 1); // total sekarang 100 — pas di batas
  const blocked = await runMiddleware(checkAssetLimit, mockReq({ tenantId }));
  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.res.statusCode, 403);
  assert.equal(blocked.res.body.code, 'PLAN_LIMIT_REACHED');
  assert.equal(blocked.res.body.limit, 100);
  assert.match(blocked.res.body.message, /Upgrade|Tingkatkan|paket/i);
  assert.equal(blocked.res.body.upgradeUrl, '/billing');
});

test('Free — maksimal 2 pengguna, pengguna ke-3 ditolak', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));

  await bulkInsertUsers(tenantId, 1);
  const allowed = await runMiddleware(checkUserLimit, mockReq({ tenantId }));
  assert.equal(allowed.nextCalled, true);

  await bulkInsertUsers(tenantId, 1); // total 2 — pas di batas
  const blocked = await runMiddleware(checkUserLimit, mockReq({ tenantId }));
  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.res.statusCode, 403);
  assert.equal(blocked.res.body.limit, 2);
});

test('Free — maksimal 1 lokasi', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));

  const allowedFirst = await runMiddleware(checkLocationLimit, mockReq({ tenantId }));
  assert.equal(allowedFirst.nextCalled, true, 'lokasi pertama harus boleh (0 < 1)');

  await bulkInsertLocations(tenantId, 1);
  const blocked = await runMiddleware(checkLocationLimit, mockReq({ tenantId }));
  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.res.body.limit, 1);
});

test('Starter — maksimal 1.000 aset, 5 pengguna', async (t) => {
  const tenantId = await createTestTenant('starter');
  t.after(() => dropTestTenant(tenantId));

  await bulkInsertAssets(tenantId, 999);
  assert.equal((await runMiddleware(checkAssetLimit, mockReq({ tenantId }))).nextCalled, true);
  await bulkInsertAssets(tenantId, 1);
  const assetBlocked = await runMiddleware(checkAssetLimit, mockReq({ tenantId }));
  assert.equal(assetBlocked.nextCalled, false);
  assert.equal(assetBlocked.res.body.limit, 1000);

  await bulkInsertUsers(tenantId, 4);
  assert.equal((await runMiddleware(checkUserLimit, mockReq({ tenantId }))).nextCalled, true);
  await bulkInsertUsers(tenantId, 1);
  const userBlocked = await runMiddleware(checkUserLimit, mockReq({ tenantId }));
  assert.equal(userBlocked.nextCalled, false);
  assert.equal(userBlocked.res.body.limit, 5);
});

test('Business — maksimal 5.000 aset, 15 pengguna', async (t) => {
  const tenantId = await createTestTenant('business');
  t.after(() => dropTestTenant(tenantId));

  await bulkInsertAssets(tenantId, 4999);
  assert.equal((await runMiddleware(checkAssetLimit, mockReq({ tenantId }))).nextCalled, true);
  await bulkInsertAssets(tenantId, 1);
  const assetBlocked = await runMiddleware(checkAssetLimit, mockReq({ tenantId }));
  assert.equal(assetBlocked.nextCalled, false);
  assert.equal(assetBlocked.res.body.limit, 5000);

  await bulkInsertUsers(tenantId, 14);
  assert.equal((await runMiddleware(checkUserLimit, mockReq({ tenantId }))).nextCalled, true);
  await bulkInsertUsers(tenantId, 1);
  const userBlocked = await runMiddleware(checkUserLimit, mockReq({ tenantId }));
  assert.equal(userBlocked.nextCalled, false);
  assert.equal(userBlocked.res.body.limit, 15);
});

test('limit yang sudah pernah terlampaui TIDAK menghapus data existing (soft limit)', async (t) => {
  const tenantId = await createTestTenant('business');
  t.after(() => dropTestTenant(tenantId));

  await bulkInsertAssets(tenantId, 5000);
  const blocked = await runMiddleware(checkAssetLimit, mockReq({ tenantId }));
  assert.equal(blocked.nextCalled, false, 'penambahan baru harus diblokir');

  const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM assets WHERE tenant_id = :tenantId', { tenantId });
  assert.equal(Number(count), 5000, 'data yang sudah ada harus tetap utuh, tidak ikut terhapus');
});
