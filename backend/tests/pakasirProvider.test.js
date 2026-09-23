const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/teardown');
const pool = require('../src/config/db');
const PakasirProvider = require('../src/services/paymentGateway/PakasirProvider');
const { getPaymentGateway } = require('../src/services/paymentGateway');
const { createTestTenant, dropTestTenant } = require('./helpers/testTenant');

const CONFIG = { slug: 'test-slug', apiKey: 'test-api-key', webhookSecret: 'test-webhook-secret' };

/** Stub `fetch` global untuk satu test; `t.after` mengembalikannya supaya
 *  test lain tidak ikut memakai stub yang sama. `calls` menampung
 *  { url, options } setiap panggilan untuk diperiksa. */
function stubFetch(t, handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return handler(url, options);
  };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

test('getPaymentGateway("pakasir") mengembalikan instance PakasirProvider', () => {
  assert.ok(getPaymentGateway('pakasir') instanceof PakasirProvider);
});

test('createCheckout: memanggil endpoint yang benar dan menormalkan respons payment_link', async (t) => {
  const provider = new PakasirProvider(CONFIG);
  const calls = stubFetch(t, () => jsonResponse(200, {
    txn_id: 'vwiqpcriq',
    payment_link: 'https://app.pakasir.com/pay-v2/vwiqpcriq',
  }));

  const result = await provider.createCheckout({ invoiceNumber: 'INV/2026/00001', amount: 99000 });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://app.pakasir.com/api/v2/create-transaction/test-slug/INV%2F2026%2F00001');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['X-Api-Key'], 'test-api-key');
  assert.deepEqual(JSON.parse(calls[0].options.body), { method: 'payment_link', amount: 99000 });

  assert.equal(result.provider, 'pakasir');
  assert.equal(result.providerTransactionId, 'vwiqpcriq');
  assert.equal(result.checkoutUrl, 'https://app.pakasir.com/pay-v2/vwiqpcriq');
});

test('createCheckout: metode qris tidak punya checkoutUrl tapi punya qrString', async (t) => {
  const provider = new PakasirProvider(CONFIG);
  stubFetch(t, () => jsonResponse(200, {
    txn_id: 'vwiqpcriq', status: 'pending', payment_method: 'qris',
    qr_string: '00020101...', amount: 24000, fee: 300, total_payment: 24300,
  }));

  const result = await provider.createCheckout({ invoiceNumber: 'INV/2026/00002', amount: 24000, paymentMethod: 'qris' });

  assert.equal(result.checkoutUrl, null);
  assert.equal(result.qrString, '00020101...');
  assert.equal(result.totalPayment, 24300);
  assert.equal(result.status, 'pending');
});

test('createCheckout: respons galat Pakasir dilempar sebagai Error', async (t) => {
  const provider = new PakasirProvider(CONFIG);
  stubFetch(t, () => jsonResponse(400, { message: 'Nominal di bawah batas minimum.' }));

  await assert.rejects(
    () => provider.createCheckout({ invoiceNumber: 'INV/2026/00003', amount: 100 }),
    /Nominal di bawah batas minimum/
  );
});

test('createCheckout: melempar error jelas kalau kredensial belum diisi', async () => {
  const provider = new PakasirProvider({});
  await assert.rejects(
    () => provider.createCheckout({ invoiceNumber: 'X', amount: 1000 }),
    /belum dikonfigurasi/
  );
});

test('getPaymentStatus: cross-check ke API pakai txn_id yang tersimpan di invoice', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));

  const [invoiceResult] = await pool.query(
    `INSERT INTO invoices (tenant_id, invoice_number, amount, status, provider, provider_transaction_id)
     VALUES (:tenantId, :invoiceNumber, 99000, 'pending', 'pakasir', 'vwiqpcriq') RETURNING id`,
    { tenantId, invoiceNumber: `INV/TEST/${tenantId}` }
  );

  const provider = new PakasirProvider(CONFIG);
  const calls = stubFetch(t, () => jsonResponse(200, {
    order_id: `INV/TEST/${tenantId}`, status: 'completed', amount: 99000, completed_at: '2026-01-01T00:00:00Z',
  }));

  const result = await provider.getPaymentStatus({ invoiceId: invoiceResult.insertId });

  assert.equal(calls[0].url, 'https://app.pakasir.com/api/v2/transaction-status/test-slug/vwiqpcriq');
  assert.equal(result.status, 'paid');
  assert.equal(result.completedAt, '2026-01-01T00:00:00Z');
});

test('getPaymentStatus: invoice tanpa provider_transaction_id dianggap pending tanpa memanggil API', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));

  const [result0] = await pool.query(
    `INSERT INTO invoices (tenant_id, invoice_number, amount, status) VALUES (:tenantId, :invoiceNumber, 99000, 'pending') RETURNING id`,
    { tenantId, invoiceNumber: `INV/TEST2/${tenantId}` }
  );

  const provider = new PakasirProvider(CONFIG);
  const calls = stubFetch(t, () => jsonResponse(200, {}));

  const result = await provider.getPaymentStatus({ invoiceId: result0.insertId });
  assert.equal(result.status, 'pending');
  assert.equal(calls.length, 0);
});

test('handleWebhook: menolak kalau header X-Secret tidak cocok', async (t) => {
  const provider = new PakasirProvider(CONFIG);
  stubFetch(t, () => jsonResponse(200, {}));

  await assert.rejects(
    () => provider.handleWebhook({ order_id: 'X', txn_id: 'Y' }, { 'x-secret': 'salah' }),
    (err) => { assert.equal(err.status, 401); return true; }
  );
});

test('handleWebhook: menolak payload tanpa order_id/txn_id', async (t) => {
  const provider = new PakasirProvider(CONFIG);
  stubFetch(t, () => jsonResponse(200, {}));

  await assert.rejects(
    () => provider.handleWebhook({}, { 'x-secret': 'test-webhook-secret' }),
    (err) => { assert.equal(err.status, 400); return true; }
  );
});

test('handleWebhook: menolak kalau order_id hasil cross-check tidak cocok dengan payload', async (t) => {
  const provider = new PakasirProvider(CONFIG);
  stubFetch(t, () => jsonResponse(200, { order_id: 'BEDA', status: 'completed' }));

  await assert.rejects(
    () => provider.handleWebhook({ order_id: 'INV123', txn_id: 'vwiqpcriq' }, { 'x-secret': 'test-webhook-secret' }),
    (err) => { assert.equal(err.status, 409); return true; }
  );
});

test('handleWebhook: sukses saat secret cocok dan cross-check order_id sama', async (t) => {
  const provider = new PakasirProvider(CONFIG);
  const calls = stubFetch(t, () => jsonResponse(200, {
    order_id: 'INV123', status: 'completed', amount: 99000, completed_at: '2026-01-01T00:00:00Z', is_sandbox: false,
  }));

  const result = await provider.handleWebhook(
    { order_id: 'INV123', txn_id: 'vwiqpcriq', status: 'completed' },
    { 'x-secret': 'test-webhook-secret' }
  );

  assert.equal(calls[0].url, 'https://app.pakasir.com/api/v2/transaction-status/test-slug/vwiqpcriq');
  assert.equal(result.orderId, 'INV123');
  assert.equal(result.providerTransactionId, 'vwiqpcriq');
  assert.equal(result.status, 'paid');
  assert.equal(result.isSandbox, false);
});
