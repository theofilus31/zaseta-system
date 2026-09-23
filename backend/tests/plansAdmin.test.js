const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/config/db');
const { createPlan, updatePlan, movePlan, deletePlan, listPlansAdmin } = require('../src/controllers/platformController');
const { getPlan } = require('../src/config/plans');
const { createTestTenant, dropTestTenant, createTestPlatformAdmin, dropTestPlatformAdmin } = require('./helpers/testTenant');
const { mockReq: baseMockReq, runMiddleware } = require('./helpers/mockReqRes');

/**
 * Semua test di sini memanggil platformController.js, yang menulis audit log
 * lewat logAudit({ platformAdminId }) -- di-FK ke tabel `platform_admins`
 * (lihat migration_separate_platform_admins.sql). `userId` bawaan mockReq()
 * (angka 1) TIDAK BOLEH diandalkan begitu saja di sini (sama seperti alasan
 * createTestUser() ada -- lihat catatannya di testTenant.js): di database
 * bersih, tidak ada jaminan baris platform_admins id=1 ada. Satu admin
 * sungguhan dibuat sekali untuk seluruh file ini (bukan bagian yang diuji,
 * cuma actor-nya) dan dipakai di setiap panggilan lewat wrapper mockReq() ini.
 *
 * Hook ini DIDAFTARKAN SEBELUM require('./helpers/teardown') di bawah dengan
 * sengaja -- hook `after` top-level jalan menurut URUTAN PENDAFTARAN (FIFO),
 * jadi baris ini harus lebih dulu daripada teardown.js supaya penghapusan
 * baris uji ini terjadi SEBELUM pool.end() teardown, bukan sesudahnya
 * (query ke pool yang sudah ditutup melempar error).
 */
let testAdminId;
before(async () => { testAdminId = await createTestPlatformAdmin(); });
after(() => dropTestPlatformAdmin(testAdminId));
function mockReq(opts) {
  return baseMockReq({ userId: testAdminId, ...opts });
}

require('./helpers/teardown');
require('./helpers/setup');

/**
 * CRUD katalog paket (platformController.createPlan/updatePlan/movePlan/
 * deletePlan) — LANGSUNG terhadap database sungguhan, sama seperti
 * planLimits.test.js. Setiap test memakai id unik (`testPlanId()`) dan
 * membersihkan baris yang dibuatnya sendiri lewat `t.after()`, supaya tidak
 * ada satu pun yang mencemari katalog sungguhan (yang juga dipakai manual
 * testing UI di halaman Katalog Paket secara bersamaan).
 */
function testPlanId() {
  return `test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

async function forceDeletePlan(id) {
  await pool.query(`DELETE FROM plans WHERE id = :id`, { id });
}

test('createPlan — berhasil membuat paket baru di urutan paling bawah', async (t) => {
  const id = testPlanId();
  t.after(() => forceDeletePlan(id));

  const created = await runMiddleware(createPlan, mockReq({
    body: { id, name: 'Paket Uji', tagline: 'Tagline uji', price: 150000, features: ['Fitur A', 'Fitur B'] },
  }));
  assert.equal(created.res.statusCode, 201);
  assert.equal(created.res.body.plan.id, id);
  assert.equal(created.res.body.plan.name, 'Paket Uji');
  assert.deepEqual(created.res.body.plan.features, ['Fitur A', 'Fitur B']);

  const [[{ maxOrder }]] = await pool.query(`SELECT MAX(sort_order) AS "maxOrder" FROM plans`);
  assert.equal(created.res.body.plan.sortOrder, maxOrder, 'paket baru harus di urutan paling bawah');

  // Cache langsung ter-refresh, tidak perlu tunggu request lain.
  assert.ok(getPlan(id), 'getPlan() harus langsung melihat paket yang baru dibuat');
});

test('createPlan — ID yang sama ditolak (409), format ID tidak valid ditolak (400)', async (t) => {
  const id = testPlanId();
  t.after(() => forceDeletePlan(id));

  const first = await runMiddleware(createPlan, mockReq({ body: { id, name: 'Awal' } }));
  assert.equal(first.res.statusCode, 201);

  const dupe = await runMiddleware(createPlan, mockReq({ body: { id, name: 'Duplikat' } }));
  assert.equal(dupe.res.statusCode, 409);

  const badFormat = await runMiddleware(createPlan, mockReq({ body: { id: 'ID Tidak Valid!', name: 'X' } }));
  assert.equal(badFormat.res.statusCode, 400);
});

test('updatePlan — bisa ubah harga/fitur/status aktif paket biasa', async (t) => {
  const id = testPlanId();
  t.after(() => forceDeletePlan(id));
  await runMiddleware(createPlan, mockReq({ body: { id, name: 'Awal', price: 100000 } }));

  const updated = await runMiddleware(updatePlan, mockReq({ params: { id }, body: { name: 'Sudah Diubah', price: 200000, isActive: false } }));
  assert.equal(updated.res.statusCode, 200);
  assert.equal(updated.res.body.plan.name, 'Sudah Diubah');
  assert.equal(updated.res.body.plan.price, 200000);
  assert.equal(updated.res.body.plan.isActive, false);

  // Paket nonaktif TIDAK ikut di katalog publik (default includeInactive=false)...
  const { getAllPlans } = require('../src/config/plans');
  assert.ok(!getAllPlans().some((p) => p.id === id));
  // ...tapi tetap ada kalau admin minta termasuk yang nonaktif.
  assert.ok(getAllPlans({ includeInactive: true }).some((p) => p.id === id));
});

test('updatePlan — paket Free tidak boleh diberi harga atau dinonaktifkan', async () => {
  const priced = await runMiddleware(updatePlan, mockReq({ params: { id: 'free' }, body: { price: 50000 } }));
  assert.equal(priced.res.statusCode, 400);

  const deactivated = await runMiddleware(updatePlan, mockReq({ params: { id: 'free' }, body: { isActive: false } }));
  assert.equal(deactivated.res.statusCode, 400);

  // Free tidak ikut berubah sama sekali setelah dua percobaan di atas.
  const free = getPlan('free');
  assert.equal(free.price, 0);
  assert.equal(free.isActive, true);
});

test('updatePlan — paket tidak dikenal balas 404', async () => {
  const res = await runMiddleware(updatePlan, mockReq({ params: { id: 'paket-tidak-ada' }, body: { name: 'X' } }));
  assert.equal(res.res.statusCode, 404);
});

test('movePlan — menukar sort_order dengan tetangga, ditolak di ujung katalog', async (t) => {
  const idA = testPlanId();
  const idB = `${idA}_b`;
  t.after(async () => { await forceDeletePlan(idA); await forceDeletePlan(idB); });

  const createdA = await runMiddleware(createPlan, mockReq({ body: { id: idA, name: 'A' } }));
  const createdB = await runMiddleware(createPlan, mockReq({ body: { id: idB, name: 'B' } }));
  const orderA = createdA.res.body.plan.sortOrder;
  const orderB = createdB.res.body.plan.sortOrder;
  assert.ok(orderB > orderA, 'B dibuat setelah A, harusnya di bawahnya');

  // B naik satu tingkat -> harus menukar sort_order dengan A.
  const moved = await runMiddleware(movePlan, mockReq({ params: { id: idB }, body: { direction: 'up' } }));
  assert.equal(moved.res.statusCode, 200);
  assert.equal(getPlan(idB).sortOrder, orderA);
  assert.equal(getPlan(idA).sortOrder, orderB);

  // Paket paling atas (Free, sort_order 0) tidak bisa naik lagi.
  const atTop = await runMiddleware(movePlan, mockReq({ params: { id: 'free' }, body: { direction: 'up' } }));
  assert.equal(atTop.res.statusCode, 400);
});

test('deletePlan — paket Free tidak boleh dihapus', async () => {
  const res = await runMiddleware(deletePlan, mockReq({ params: { id: 'free' } }));
  assert.equal(res.res.statusCode, 400);
  assert.ok(getPlan('free'), 'paket Free harus tetap ada setelah percobaan hapus ditolak');
});

test('deletePlan — paket yang masih dipakai tenant ditolak (409), yang tidak dipakai berhasil dihapus', async (t) => {
  const usedId = testPlanId();
  const unusedId = testPlanId() + '_unused';
  t.after(() => forceDeletePlan(usedId)); // unusedId sudah terhapus lewat aksi test-nya sendiri

  await runMiddleware(createPlan, mockReq({ body: { id: usedId, name: 'Dipakai Tenant' } }));
  await runMiddleware(createPlan, mockReq({ body: { id: unusedId, name: 'Tidak Dipakai' } }));

  const tenantId = await createTestTenant(usedId);
  t.after(() => dropTestTenant(tenantId));

  const blocked = await runMiddleware(deletePlan, mockReq({ params: { id: usedId } }));
  assert.equal(blocked.res.statusCode, 409);
  assert.ok(getPlan(usedId), 'paket yang masih dipakai tenant tidak boleh hilang dari cache');

  const allowed = await runMiddleware(deletePlan, mockReq({ params: { id: unusedId } }));
  assert.equal(allowed.res.statusCode, 200);
  assert.equal(getPlan(unusedId), null);
});

test('listPlansAdmin — mengembalikan paket aktif MAUPUN nonaktif', async (t) => {
  const id = testPlanId();
  t.after(() => forceDeletePlan(id));
  await runMiddleware(createPlan, mockReq({ body: { id, name: 'Nonaktif Nanti' } }));
  await runMiddleware(updatePlan, mockReq({ params: { id }, body: { isActive: false } }));

  const listed = await runMiddleware(listPlansAdmin, mockReq({}));
  assert.equal(listed.res.statusCode, 200);
  assert.ok(listed.res.body.plans.some((p) => p.id === id && p.isActive === false));
});
