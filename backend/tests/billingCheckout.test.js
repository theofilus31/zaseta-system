const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/teardown');
require('./helpers/setup');
const pool = require('../src/config/db');
const { requestPlanChange, cancelPendingCheckout } = require('../src/controllers/billingController');
const { createTestTenant, dropTestTenant, createTestUser } = require('./helpers/testTenant');
const { mockReq, runMiddleware } = require('./helpers/mockReqRes');

process.env.PAKASIR_SLUG = 'test-slug';
process.env.PAKASIR_API_KEY = 'test-api-key';
process.env.PAKASIR_WEBHOOK_SECRET = 'test-webhook-secret';

function stubFetch(t, handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return handler(url, options); };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

async function setupTenantUser(t, plan = 'free') {
  const tenantId = await createTestTenant(plan);
  t.after(() => dropTestTenant(tenantId));
  const userId = await createTestUser(tenantId);
  return { tenantId, userId };
}

test('requestPlanChange: paket Free diterapkan seketika tanpa checkout Pakasir', async (t) => {
  const { tenantId, userId } = await setupTenantUser(t, 'starter');
  const calls = stubFetch(t, () => jsonResponse(200, {}));

  const req = mockReq({ tenantId, userId, body: { requestedPlan: 'free' } });
  const { res } = await runMiddleware(requestPlanChange, req);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.status, 'applied');
  assert.equal(res.body.checkoutUrl, null);
  assert.equal(calls.length, 0, 'tidak boleh memanggil Pakasir sama sekali untuk paket gratis');

  const [[tenant]] = await pool.query(`SELECT plan FROM tenants WHERE id = :tenantId`, { tenantId });
  assert.equal(tenant.plan, 'free');
});

test('requestPlanChange: paket berbayar membuat checkout & mengembalikan checkoutUrl, TANPA mengubah paket', async (t) => {
  const { tenantId, userId } = await setupTenantUser(t);
  const calls = stubFetch(t, () => jsonResponse(200, { txn_id: 'vwiqpcriq', payment_link: 'https://app.pakasir.com/pay-v2/vwiqpcriq' }));

  const req = mockReq({ tenantId, userId, body: { requestedPlan: 'starter', billingCycle: 'monthly' } });
  const { res } = await runMiddleware(requestPlanChange, req);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.status, 'pending');
  assert.equal(res.body.checkoutUrl, 'https://app.pakasir.com/pay-v2/vwiqpcriq');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/v2\/create-transaction\/test-slug\//);

  const [[tenant]] = await pool.query(`SELECT plan FROM tenants WHERE id = :tenantId`, { tenantId });
  assert.equal(tenant.plan, 'free', 'paket TIDAK boleh berubah sebelum webhook mengonfirmasi lunas');
});

test('requestPlanChange: memilih plan yang sama dengan saat ini ditolak', async (t) => {
  const { tenantId, userId } = await setupTenantUser(t, 'starter');
  const req = mockReq({ tenantId, userId, body: { requestedPlan: 'starter' } });
  const { res } = await runMiddleware(requestPlanChange, req);
  assert.equal(res.statusCode, 400);
});

test('requestPlanChange: dipanggil ulang untuk plan pending YANG SAMA -> checkoutUrl baru (resume), bukan permintaan baru', async (t) => {
  const { tenantId, userId } = await setupTenantUser(t);
  let n = 0;
  stubFetch(t, () => jsonResponse(200, { txn_id: 'vwiqpcriq', payment_link: `https://app.pakasir.com/pay-v2/v${++n}` }));

  const req = mockReq({ tenantId, userId, body: { requestedPlan: 'starter' } });
  const first = await runMiddleware(requestPlanChange, req);
  const second = await runMiddleware(requestPlanChange, mockReq({ tenantId, userId, body: { requestedPlan: 'starter' } }));

  assert.equal(first.res.statusCode, 201);
  assert.equal(second.res.statusCode, 201);
  assert.equal(first.res.body.id, second.res.body.id, 'permintaan yang sama diresume, bukan baris baru');

  const [[{ count }]] = await pool.query(`SELECT COUNT(*) AS count FROM plan_upgrade_requests WHERE tenant_id = :tenantId`, { tenantId });
  assert.equal(Number(count), 1);
});

test('requestPlanChange: ada checkout pending untuk plan LAIN -> ditolak 409', async (t) => {
  const { tenantId, userId } = await setupTenantUser(t);
  stubFetch(t, () => jsonResponse(200, { txn_id: 'vwiqpcriq', payment_link: 'https://app.pakasir.com/pay-v2/vwiqpcriq' }));

  await runMiddleware(requestPlanChange, mockReq({ tenantId, userId, body: { requestedPlan: 'starter' } }));
  const { res } = await runMiddleware(requestPlanChange, mockReq({ tenantId, userId, body: { requestedPlan: 'business' } }));

  assert.equal(res.statusCode, 409);
});

test('requestPlanChange: kegagalan Pakasir tidak meninggalkan permintaan pending yang macet', async (t) => {
  const { tenantId, userId } = await setupTenantUser(t);
  stubFetch(t, () => jsonResponse(400, { message: 'Nominal di bawah batas minimum.' }));

  const { res } = await runMiddleware(requestPlanChange, mockReq({ tenantId, userId, body: { requestedPlan: 'starter' } }));
  assert.equal(res.statusCode, 502);

  // requestPlanChange berikutnya untuk plan yang sama harus BOLEH dicoba lagi
  // (baris pending tidak ditinggalkan dalam keadaan tanpa order_id yang valid).
  stubFetch(t, () => jsonResponse(200, { txn_id: 'vwiqpcriq', payment_link: 'https://app.pakasir.com/pay-v2/vwiqpcriq' }));
  const retry = await runMiddleware(requestPlanChange, mockReq({ tenantId, userId, body: { requestedPlan: 'starter' } }));
  assert.equal(retry.res.statusCode, 201);
});

test('cancelPendingCheckout: membatalkan checkout pending, plan lain lalu bisa dipilih', async (t) => {
  const { tenantId, userId } = await setupTenantUser(t);
  stubFetch(t, () => jsonResponse(200, { txn_id: 'vwiqpcriq', payment_link: 'https://app.pakasir.com/pay-v2/vwiqpcriq', message: 'ok' }));

  await runMiddleware(requestPlanChange, mockReq({ tenantId, userId, body: { requestedPlan: 'starter' } }));

  const { res: cancelRes } = await runMiddleware(cancelPendingCheckout, mockReq({ tenantId, userId }));
  assert.equal(cancelRes.statusCode, 200);
  assert.equal(cancelRes.body.status, 'canceled');

  const { res: secondRes } = await runMiddleware(requestPlanChange, mockReq({ tenantId, userId, body: { requestedPlan: 'business' } }));
  assert.equal(secondRes.statusCode, 201, 'plan lain harus bisa diajukan setelah checkout sebelumnya dibatalkan');
});

test('cancelPendingCheckout: tidak ada checkout pending -> 404', async (t) => {
  const { tenantId, userId } = await setupTenantUser(t);
  const { res } = await runMiddleware(cancelPendingCheckout, mockReq({ tenantId, userId }));
  assert.equal(res.statusCode, 404);
});
