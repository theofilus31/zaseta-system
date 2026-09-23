const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/teardown');
require('./helpers/setup');
const { requireFeature } = require('../src/middleware/planLimits');
const { createTestTenant, dropTestTenant } = require('./helpers/testTenant');
const { mockReq, runMiddleware } = require('./helpers/mockReqRes');

/**
 * Menguji requireFeature('opname'/'consumables'/'requests'/'custom_fields'/
 * 'barcode') LANGSUNG terhadap database sungguhan — sama gayanya dengan
 * planLimits.test.js, tapi ini menguji modul dikunci UTUH, bukan batas
 * jumlah: paket Free harus SELALU ditolak untuk modul-modul ini, paket
 * berbayar manapun SELALU boleh, tidak peduli berapa banyak data yang sudah
 * ada.
 */

test('Free — modul yang dikunci (opname/consumables/requests/custom_fields/barcode) ditolak', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));

  for (const moduleKey of ['opname', 'consumables', 'requests', 'custom_fields', 'barcode']) {
    // eslint-disable-next-line no-await-in-loop
    const result = await runMiddleware(requireFeature(moduleKey), mockReq({ tenantId }));
    assert.equal(result.nextCalled, false, `${moduleKey} harus ditolak di paket Free`);
    assert.equal(result.res.statusCode, 403);
    assert.equal(result.res.body.code, 'PLAN_FEATURE_LOCKED');
    assert.equal(result.res.body.moduleKey, moduleKey);
    assert.equal(result.res.body.upgradeUrl, '/billing');
  }
});

test('Free — modul yang TIDAK dikunci (assets, dst.) tetap boleh', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));

  const result = await runMiddleware(requireFeature('assets'), mockReq({ tenantId }));
  assert.equal(result.nextCalled, true);
});

test('Starter/Business/Enterprise — semua modul yang dikunci di Free tetap boleh', async (t) => {
  for (const plan of ['starter', 'business', 'enterprise']) {
    // eslint-disable-next-line no-await-in-loop
    const tenantId = await createTestTenant(plan);
    t.after(() => dropTestTenant(tenantId));

    for (const moduleKey of ['opname', 'consumables', 'requests', 'custom_fields', 'barcode']) {
      // eslint-disable-next-line no-await-in-loop
      const result = await runMiddleware(requireFeature(moduleKey), mockReq({ tenantId }));
      assert.equal(result.nextCalled, true, `${moduleKey} harus boleh di paket ${plan}`);
    }
  }
});
