const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/teardown');
require('./helpers/setup');
const pool = require('../src/config/db');
const { handlePakasirWebhook } = require('../src/controllers/billingController');
const { createTestTenant, dropTestTenant, createTestUser } = require('./helpers/testTenant');
const { mockReq, runMiddleware } = require('./helpers/mockReqRes');

const SECRET = 'test-webhook-secret';

function stubFetch(t, handler) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => handler(url);
  t.after(() => { globalThis.fetch = original; });
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

/** Simulasikan checkout Pakasir yang sudah dibuat requestPlanChange --
 *  langsung INSERT baris plan_upgrade_requests pending, tanpa memanggil
 *  create-transaction sungguhan (itu diuji terpisah di
 *  pakasirProvider.test.js/billingCheckout.test.js). */
async function insertPendingRequest(tenantId, userId, { requestedPlan = 'starter', price = 99000, status = 'pending' } = {}) {
  const orderId = `order-${tenantId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [result] = await pool.query(
    `INSERT INTO plan_upgrade_requests (tenant_id, requested_plan, previous_plan, billing_cycle, price, requested_by, order_id, payment_provider, status)
     VALUES (:tenantId, :requestedPlan, 'free', 'monthly', :price, :userId, :orderId, 'pakasir', :status) RETURNING id`,
    { tenantId, requestedPlan, price, userId, orderId, status }
  );
  return { id: result.insertId, orderId };
}

async function requestRow(id) {
  const [[row]] = await pool.query(
    `SELECT status, provider_transaction_id AS "providerTransactionId", paid_at AS "paidAt" FROM plan_upgrade_requests WHERE id = :id`,
    { id }
  );
  return row;
}

async function currentPlan(tenantId) {
  const [[row]] = await pool.query(`SELECT plan FROM tenants WHERE id = :tenantId`, { tenantId });
  return row.plan;
}

async function callWebhook(body, headers = { 'x-secret': SECRET }) {
  process.env.PAKASIR_SLUG = 'test-slug';
  process.env.PAKASIR_API_KEY = 'test-api-key';
  process.env.PAKASIR_WEBHOOK_SECRET = SECRET;
  const { res } = await runMiddleware(handlePakasirWebhook, { body, headers, ip: '127.0.0.1' });
  return res;
}

test('webhook: pembayaran lunas mengaktifkan paket & menandai permintaan paid', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));
  const userId = await createTestUser(tenantId);
  const { id: requestId, orderId } = await insertPendingRequest(tenantId, userId);

  stubFetch(t, () => jsonResponse(200, { order_id: orderId, status: 'completed', amount: 99000, completed_at: '2026-01-01T00:00:00Z' }));

  const res = await callWebhook({ order_id: orderId, txn_id: 'vwiqpcriq', status: 'completed' });
  assert.equal(res.statusCode, 200);

  const request = await requestRow(requestId);
  assert.equal(request.status, 'paid');
  assert.equal(request.providerTransactionId, 'vwiqpcriq');
  assert.ok(request.paidAt);

  assert.equal(await currentPlan(tenantId), 'starter');

  const [[invoice]] = await pool.query(
    `SELECT amount, status, provider, provider_transaction_id AS "providerTransactionId" FROM invoices WHERE tenant_id = :tenantId`,
    { tenantId }
  );
  assert.equal(Number(invoice.amount), 99000);
  assert.equal(invoice.status, 'paid');
  assert.equal(invoice.provider, 'pakasir');
  assert.equal(invoice.providerTransactionId, 'vwiqpcriq');
});

test('webhook: permintaan yang sudah paid tidak diproses ulang (idempotent)', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));
  const userId = await createTestUser(tenantId);
  const { id: requestId, orderId } = await insertPendingRequest(tenantId, userId, { status: 'paid' });

  stubFetch(t, () => jsonResponse(200, { order_id: orderId, status: 'completed' }));

  const res = await callWebhook({ order_id: orderId, txn_id: 'vwiqpcriq', status: 'completed' });
  assert.equal(res.statusCode, 200);

  // Tidak ada subscription/invoice baru dibuat -- permintaan sudah 'paid'
  // sebelumnya, webhook dobel diabaikan.
  const [[{ count }]] = await pool.query(`SELECT COUNT(*) AS count FROM subscriptions WHERE tenant_id = :tenantId`, { tenantId });
  assert.equal(Number(count), 0);
  assert.equal(await currentPlan(tenantId), 'free');
});

test('webhook: transaksi dibatalkan/kedaluwarsa menutup permintaan tanpa mengaktifkan apa pun', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));
  const userId = await createTestUser(tenantId);
  const { id: requestId, orderId } = await insertPendingRequest(tenantId, userId);

  stubFetch(t, () => jsonResponse(200, { order_id: orderId, status: 'canceled' }));

  const res = await callWebhook({ order_id: orderId, txn_id: 'vwiqpcriq', status: 'canceled' });
  assert.equal(res.statusCode, 200);

  const request = await requestRow(requestId);
  assert.equal(request.status, 'canceled');
  assert.equal(await currentPlan(tenantId), 'free');
});

test('webhook: order_id yang tidak dikenal tetap dibalas 200 tanpa mengubah data', async (t) => {
  stubFetch(t, () => jsonResponse(200, { order_id: 'TIDAK-ADA', status: 'completed' }));
  const res = await callWebhook({ order_id: 'TIDAK-ADA', txn_id: 'vwiqpcriq', status: 'completed' });
  assert.equal(res.statusCode, 200);
});

test('webhook: X-Secret salah ditolak 401, permintaan tidak berubah', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));
  const userId = await createTestUser(tenantId);
  const { id: requestId, orderId } = await insertPendingRequest(tenantId, userId);

  stubFetch(t, () => jsonResponse(200, { order_id: orderId, status: 'completed' }));

  const res = await callWebhook({ order_id: orderId, txn_id: 'vwiqpcriq' }, { 'x-secret': 'salah' });
  assert.equal(res.statusCode, 401);

  const request = await requestRow(requestId);
  assert.equal(request.status, 'pending');
});

test('webhook: harga yang dikunci saat checkout dipakai, BUKAN harga katalog terkini', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));
  const userId = await createTestUser(tenantId);
  // Harga dikunci 50000, sengaja BEDA dari harga katalog Starter (99000) --
  // simulasi katalog berubah SELAGI tenant belum membayar.
  const { id: requestId, orderId } = await insertPendingRequest(tenantId, userId, { price: 50000 });

  stubFetch(t, () => jsonResponse(200, { order_id: orderId, status: 'completed', amount: 50000, completed_at: '2026-01-01T00:00:00Z' }));

  await callWebhook({ order_id: orderId, txn_id: 'vwiqpcriq', status: 'completed' });

  const [[sub]] = await pool.query(`SELECT price FROM subscriptions WHERE tenant_id = :tenantId`, { tenantId });
  assert.equal(Number(sub.price), 50000, 'subscription harus pakai harga yang dikunci saat checkout, bukan harga katalog Starter (99000)');
});
