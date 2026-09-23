const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/config/db');
const { activateSubscription, cancelActiveSubscription } = require('../src/services/subscriptionService');
const billingController = require('../src/controllers/billingController');
const { updatePlan } = require('../src/controllers/platformController');
const { getPlan } = require('../src/config/plans');
const { createTestTenant, dropTestTenant, createTestUser, bulkInsertAssets, createTestPlatformAdmin, dropTestPlatformAdmin } = require('./helpers/testTenant');
const { mockReq, runMiddleware } = require('./helpers/mockReqRes');

// updatePlan() (platformController.js) menulis audit log lewat
// logAudit({ platformAdminId }), di-FK ke tabel `platform_admins` -- perlu
// satu baris admin sungguhan, bukan sekadar userId bawaan mockReq() (lihat
// catatan yang sama di plansAdmin.test.js). Didaftarkan SEBELUM
// require('./helpers/teardown') di bawah dengan sengaja -- lihat catatan
// urutan hook FIFO yang sama di plansAdmin.test.js.
let testAdminId;
before(async () => { testAdminId = await createTestPlatformAdmin(); });
after(() => dropTestPlatformAdmin(testAdminId));

require('./helpers/teardown');
require('./helpers/setup');

// requestPlanChange (paket berbayar) & handlePakasirWebhook memanggil
// getPaymentGateway('pakasir'), yang butuh kredensial terisi -- nilai palsu
// ini cukup karena panggilan HTTP-nya sendiri di-stub lewat stubFetch().
process.env.PAKASIR_SLUG = 'test-slug';
process.env.PAKASIR_API_KEY = 'test-api-key';
process.env.PAKASIR_WEBHOOK_SECRET = 'test-webhook-secret';

async function currentPlan(tenantId) {
  const [[row]] = await pool.query('SELECT plan, plan_expires_at AS "planExpiresAt" FROM tenants WHERE id = :tenantId', { tenantId });
  return row;
}

function stubFetch(t, handler) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => handler(url);
  t.after(() => { globalThis.fetch = original; });
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

/** Simulasikan pembayaran lunas sungguhan atas checkout `requestId`: stub
 *  fetch supaya create-transaction & webhook cross-check Pakasir sama-sama
 *  "berhasil", lalu panggil handlePakasirWebhook seperti Pakasir betulan
 *  yang mengonfirmasi. Dipakai menggantikan approveUpgradeRequest lama
 *  (alur verifikasi manual admin, sudah dihapus -- lihat
 *  migration_pakasir_self_serve_billing.sql). */
async function payPendingCheckout(t, tenantId) {
  const [[request]] = await pool.query(
    `SELECT order_id AS "orderId", price FROM plan_upgrade_requests WHERE tenant_id = :tenantId AND status = 'pending'`,
    { tenantId }
  );
  // Pengganti stubFetch() -- reassign LANGSUNG tanpa mendaftarkan t.after()
  // sendiri, supaya tidak menumpuk dua pemulihan globalThis.fetch dalam satu
  // test (urutan `t.after()` bertumpuk tidak dijamin selalu aman kalau
  // stubFetch() sebelumnya di test yang sama sudah mendaftarkan satu).
  globalThis.fetch = async () => jsonResponse(200, {
    order_id: request.orderId, status: 'completed', amount: Number(request.price), completed_at: '2026-01-01T00:00:00Z',
  });

  const { res } = await runMiddleware(billingController.handlePakasirWebhook, {
    body: { order_id: request.orderId, txn_id: 'vwiqpcriq', status: 'completed' },
    headers: { 'x-secret': 'test-webhook-secret' },
    ip: '127.0.0.1',
  });
  return res;
}

test('Upgrade Free -> Starter: subscription aktif, invoice lunas dibuat, tenants.plan ikut berubah', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));

  const result = await activateSubscription({ tenantId, planId: 'starter', billingCycle: 'monthly' });
  assert.equal(result.planId, 'starter');
  assert.equal(result.price, 99000);
  assert.ok(result.invoice, 'paket berbayar harus punya invoice');
  assert.equal(result.invoice.amount, 99000);

  const tenant = await currentPlan(tenantId);
  assert.equal(tenant.plan, 'starter');
  assert.ok(tenant.planExpiresAt, 'paket berbayar harus punya tanggal kedaluwarsa');

  const [[invoiceRow]] = await pool.query('SELECT status FROM invoices WHERE tenant_id = :tenantId', { tenantId });
  assert.equal(invoiceRow.status, 'paid');
});

test('Upgrade Starter -> Business, lalu Business -> Enterprise: histori subscriptions bertambah, yang lama ditutup', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));

  await activateSubscription({ tenantId, planId: 'starter', billingCycle: 'monthly' });
  await activateSubscription({ tenantId, planId: 'business', billingCycle: 'monthly' });
  const enterpriseResult = await activateSubscription({ tenantId, planId: 'enterprise', billingCycle: 'yearly' });

  assert.equal((await currentPlan(tenantId)).plan, 'enterprise');
  assert.equal(enterpriseResult.price, 5990000);

  const [rows] = await pool.query(
    'SELECT plan_id AS "planId", status FROM subscriptions WHERE tenant_id = :tenantId ORDER BY id ASC',
    { tenantId }
  );
  assert.equal(rows.length, 3, 'tiga kali upgrade = tiga baris riwayat subscriptions');
  assert.deepEqual(rows.map((r) => r.status), ['canceled', 'canceled', 'active'], 'cuma yang terakhir aktif, sisanya ditutup — bukan diedit di tempat');
});

test('Downgrade Business -> Starter, pemakaian MASIH di bawah limit: tanpa peringatan', async (t) => {
  const tenantId = await createTestTenant('business');
  t.after(() => dropTestTenant(tenantId));
  await activateSubscription({ tenantId, planId: 'business', billingCycle: 'monthly' });
  await bulkInsertAssets(tenantId, 500); // di bawah limit Starter (1.000)

  // requested_by NOT NULL + FK ke users(id) -- perlu user SUNGGUHAN, bukan
  // sekadar userId angka dari mockReq (lihat catatan createTestUser()).
  const userId = await createTestUser(tenantId);
  stubFetch(t, () => jsonResponse(200, { txn_id: 'vwiqpcriq', payment_link: 'https://app.pakasir.com/pay-v2/vwiqpcriq' }));
  const req = mockReq({ tenantId, userId, body: { requestedPlan: 'starter', billingCycle: 'monthly' } });
  const { res } = await runMiddleware(billingController.requestPlanChange, req);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.downgradeWarning, null, 'pemakaian di bawah limit -> tidak ada peringatan');
});

test('Downgrade Business -> Starter, pemakaian MELEBIHI limit: dapat peringatan, TIDAK menghapus data', async (t) => {
  const tenantId = await createTestTenant('business');
  t.after(() => dropTestTenant(tenantId));
  await activateSubscription({ tenantId, planId: 'business', billingCycle: 'monthly' });
  await bulkInsertAssets(tenantId, 3000); // di ATAS limit Starter (1.000)

  const userId = await createTestUser(tenantId);
  stubFetch(t, () => jsonResponse(200, { txn_id: 'vwiqpcriq', payment_link: 'https://app.pakasir.com/pay-v2/vwiqpcriq' }));
  const req = mockReq({ tenantId, userId, body: { requestedPlan: 'starter', billingCycle: 'monthly' } });
  const { res } = await runMiddleware(billingController.requestPlanChange, req);

  assert.equal(res.statusCode, 201);
  assert.ok(res.body.downgradeWarning, 'pemakaian di atas limit -> harus ada peringatan');
  assert.match(res.body.downgradeWarning, /aset/i);
  assert.ok(res.body.checkoutUrl, 'paket berbayar harus mengembalikan checkoutUrl untuk diarahkan');

  // Simulasikan Pakasir mengonfirmasi lunas lewat webhook -- pastikan itu
  // TIDAK PERNAH menyentuh/menghapus baris assets sama sekali.
  const payRes = await payPendingCheckout(t, tenantId);
  assert.equal(payRes.statusCode, 200);

  assert.equal((await currentPlan(tenantId)).plan, 'starter', 'paket sungguhan berubah ke Starter');
  const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM assets WHERE tenant_id = :tenantId', { tenantId });
  assert.equal(Number(count), 3000, 'ke-3000 aset lama TIDAK boleh terhapus oleh downgrade');
});

test('Harga paket berubah SELAGI checkout menunggu pembayaran: tenant tetap ditagih harga saat checkout dibuat, bukan harga baru', async (t) => {
  const originalStarterPrice = getPlan('starter').price;
  t.after(() => runMiddleware(updatePlan, mockReq({ userId: testAdminId, params: { id: 'starter' }, body: { price: originalStarterPrice } })));

  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));
  const userId = await createTestUser(tenantId);

  stubFetch(t, () => jsonResponse(200, { txn_id: 'vwiqpcriq', payment_link: 'https://app.pakasir.com/pay-v2/vwiqpcriq' }));
  const createReq = mockReq({ tenantId, userId, body: { requestedPlan: 'starter', billingCycle: 'monthly' } });
  const { res: createRes } = await runMiddleware(billingController.requestPlanChange, createReq);
  assert.equal(createRes.statusCode, 201);
  assert.equal(createRes.body.price, originalStarterPrice, 'harga dikunci di angka katalog SAAT CHECKOUT DIBUAT');

  // Admin platform menaikkan harga Starter SELAGI tenant belum sempat membayar.
  const priceChange = await runMiddleware(updatePlan, mockReq({ userId: testAdminId, params: { id: 'starter' }, body: { price: 777000 } }));
  assert.equal(priceChange.res.statusCode, 200);
  assert.equal(getPlan('starter').price, 777000);

  const payRes = await payPendingCheckout(t, tenantId);
  assert.equal(payRes.statusCode, 200);

  const [[sub]] = await pool.query('SELECT price FROM subscriptions WHERE tenant_id = :tenantId ORDER BY id DESC LIMIT 1', { tenantId });
  const [[invoice]] = await pool.query('SELECT amount FROM invoices WHERE tenant_id = :tenantId ORDER BY id DESC LIMIT 1', { tenantId });
  assert.equal(Number(sub.price), originalStarterPrice, 'subscription harus pakai harga saat checkout dibuat, bukan harga baru (777000)');
  assert.equal(Number(invoice.amount), originalStarterPrice, 'invoice harus pakai harga saat checkout dibuat, bukan harga baru (777000)');
});

test('Batalkan langganan: status jadi canceled TAPI tenants.plan tidak langsung diturunkan', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));
  await activateSubscription({ tenantId, planId: 'business', billingCycle: 'monthly' });

  const result = await cancelActiveSubscription({ tenantId });
  assert.ok(result.subscriptionId);

  const [[sub]] = await pool.query('SELECT status, canceled_at AS "canceledAt" FROM subscriptions WHERE id = :id', { id: result.subscriptionId });
  assert.equal(sub.status, 'canceled');
  assert.ok(sub.canceledAt);

  // Tenant TETAP di paket Business — pembatalan cuma berarti "tidak
  // diperpanjang", bukan pencabutan akses seketika (jobs/planExpiry.js yang
  // nanti menurunkan begitu plan_expires_at benar-benar lewat).
  assert.equal((await currentPlan(tenantId)).plan, 'business');
});
