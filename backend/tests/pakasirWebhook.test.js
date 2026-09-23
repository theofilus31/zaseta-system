const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/teardown');
const pool = require('../src/config/db');
const { handlePakasirWebhook } = require('../src/controllers/billingController');
const { createTestTenant, dropTestTenant } = require('./helpers/testTenant');
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

async function insertInvoice(tenantId, invoiceNumber, status = 'pending') {
  const [result] = await pool.query(
    `INSERT INTO invoices (tenant_id, invoice_number, amount, status) VALUES (:tenantId, :invoiceNumber, 99000, :status) RETURNING id`,
    { tenantId, invoiceNumber, status }
  );
  return result.insertId;
}

async function invoiceRow(id) {
  const [[row]] = await pool.query(`SELECT status, provider, provider_transaction_id, paid_at FROM invoices WHERE id = :id`, { id });
  return row;
}

async function callWebhook(body, headers = { 'x-secret': SECRET }) {
  process.env.PAKASIR_SLUG = 'test-slug';
  process.env.PAKASIR_API_KEY = 'test-api-key';
  process.env.PAKASIR_WEBHOOK_SECRET = SECRET;
  const { res } = await runMiddleware(handlePakasirWebhook, { body, headers, ip: '127.0.0.1' });
  return res;
}

test('webhook: order_id lunas menandai invoice paid + menyimpan provider_transaction_id', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));
  const orderId = `INV/WH/${tenantId}`;
  const invoiceId = await insertInvoice(tenantId, orderId);

  stubFetch(t, () => jsonResponse(200, { order_id: orderId, status: 'completed', amount: 99000, completed_at: '2026-01-01T00:00:00Z' }));

  const res = await callWebhook({ order_id: orderId, txn_id: 'vwiqpcriq', status: 'completed' });
  assert.equal(res.statusCode, 200);

  const row = await invoiceRow(invoiceId);
  assert.equal(row.status, 'paid');
  assert.equal(row.provider, 'pakasir');
  assert.equal(row.provider_transaction_id, 'vwiqpcriq');
  assert.ok(row.paid_at);
});

test('webhook: invoice yang sudah paid tidak ditulis ulang', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));
  const orderId = `INV/WH2/${tenantId}`;
  const invoiceId = await insertInvoice(tenantId, orderId, 'paid');

  stubFetch(t, () => jsonResponse(200, { order_id: orderId, status: 'completed' }));

  const res = await callWebhook({ order_id: orderId, txn_id: 'vwiqpcriq', status: 'completed' });
  assert.equal(res.statusCode, 200);

  const row = await invoiceRow(invoiceId);
  assert.equal(row.provider_transaction_id, null); // tidak disentuh
});

test('webhook: order_id yang tidak dikenal tetap dibalas 200 tanpa mengubah data', async (t) => {
  stubFetch(t, () => jsonResponse(200, { order_id: 'TIDAK-ADA', status: 'completed' }));
  const res = await callWebhook({ order_id: 'TIDAK-ADA', txn_id: 'vwiqpcriq', status: 'completed' });
  assert.equal(res.statusCode, 200);
});

test('webhook: X-Secret salah ditolak 401, invoice tidak berubah', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));
  const orderId = `INV/WH3/${tenantId}`;
  const invoiceId = await insertInvoice(tenantId, orderId);

  stubFetch(t, () => jsonResponse(200, { order_id: orderId, status: 'completed' }));

  const res = await callWebhook({ order_id: orderId, txn_id: 'vwiqpcriq' }, { 'x-secret': 'salah' });
  assert.equal(res.statusCode, 401);

  const row = await invoiceRow(invoiceId);
  assert.equal(row.status, 'pending');
});
