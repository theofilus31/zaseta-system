const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/teardown');
require('./helpers/setup');
const { getAllPlans, getPlan, isUpgrade, tierIndex } = require('../src/config/plans');

/**
 * Katalog paket sekarang dibaca dari tabel `plans` (lihat
 * migration_plans_catalog_db.sql), bukan array statis — test ini menguji
 * ISI seed default-nya (persis nilai yang dulu hardcode di config/plans.js),
 * bukan lagi struktur bahasa JS-nya. Kalau seed default di migrasi diubah,
 * test ini yang harus ikut diperbarui, bukan sebaliknya.
 */

test('katalog paket berisi tepat 4 paket (Free/Starter/Business/Enterprise)', () => {
  const plans = getAllPlans();
  assert.equal(plans.length, 4);
  assert.deepEqual(plans.map((p) => p.id), ['free', 'starter', 'business', 'enterprise']);
});

test('harga tahunan = harga bulanan x 10 (hemat ~16,7%) untuk paket berbayar', () => {
  for (const plan of getAllPlans()) {
    if (plan.price > 0) {
      assert.equal(plan.priceYearly, plan.price * 10, `${plan.id}: priceYearly harus price x 10`);
    }
  }
});

test('Free gratis dan tidak butuh pembayaran', () => {
  const free = getPlan('free');
  assert.equal(free.price, 0);
  assert.equal(free.priceYearly, 0);
});

test('limit sesuai spesifikasi', () => {
  assert.deepEqual(
    getAllPlans().map((p) => ({ id: p.id, maxAssets: p.maxAssets, maxUsers: p.maxUsers })),
    [
      { id: 'free', maxAssets: 100, maxUsers: 2 },
      { id: 'starter', maxAssets: 1000, maxUsers: 5 },
      { id: 'business', maxAssets: 5000, maxUsers: 15 },
      { id: 'enterprise', maxAssets: 20000, maxUsers: 50 },
    ]
  );
  assert.equal(getPlan('free').locationLimit, 1);
  assert.equal(getPlan('starter').locationLimit, null);
});

test('setiap paket punya daftar fitur sendiri (bukan hardcode di tempat lain)', () => {
  for (const plan of getAllPlans()) {
    assert.ok(Array.isArray(plan.features) && plan.features.length > 0, `${plan.id} harus punya features`);
  }
});

test('isUpgrade() membedakan naik vs turun/sama tingkat berdasar urutan tingkatan, bukan harga mentah', () => {
  assert.equal(isUpgrade('free', 'starter'), true);
  assert.equal(isUpgrade('free', 'enterprise'), true);
  assert.equal(isUpgrade('starter', 'business'), true);
  assert.equal(isUpgrade('business', 'starter'), false); // downgrade
  assert.equal(isUpgrade('business', 'free'), false); // downgrade
  assert.equal(isUpgrade('business', 'business'), false); // paket sama, bukan upgrade
  assert.equal(isUpgrade('unknown', 'business'), false); // paket tak dikenal — jangan pernah true
});

test('tierIndex() naik monoton mengikuti urutan katalog (kolom sort_order)', () => {
  assert.equal(tierIndex('free'), 0);
  assert.equal(tierIndex('starter'), 1);
  assert.equal(tierIndex('business'), 2);
  assert.equal(tierIndex('enterprise'), 3);
  assert.equal(tierIndex('tidak-ada'), null);
});
