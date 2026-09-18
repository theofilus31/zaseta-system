const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/teardown');
const pool = require('../src/config/db');
const { activateSubscription, cancelActiveSubscription } = require('../src/services/subscriptionService');
const billingController = require('../src/controllers/billingController');
const { createTestTenant, dropTestTenant, bulkInsertAssets } = require('./helpers/testTenant');
const { mockReq, runMiddleware } = require('./helpers/mockReqRes');

async function currentPlan(tenantId) {
  const [[row]] = await pool.query('SELECT plan, plan_expires_at AS "planExpiresAt" FROM tenants WHERE id = :tenantId', { tenantId });
  return row;
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

  const req = mockReq({ tenantId, body: { requestedPlan: 'starter', billingCycle: 'monthly' } });
  const { res } = await runMiddleware(billingController.createUpgradeRequest, req);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.downgradeWarning, null, 'pemakaian di bawah limit -> tidak ada peringatan');
});

test('Downgrade Business -> Starter, pemakaian MELEBIHI limit: dapat peringatan, TIDAK menghapus data', async (t) => {
  const tenantId = await createTestTenant('business');
  t.after(() => dropTestTenant(tenantId));
  await activateSubscription({ tenantId, planId: 'business', billingCycle: 'monthly' });
  await bulkInsertAssets(tenantId, 3000); // di ATAS limit Starter (1.000)

  const req = mockReq({ tenantId, userId: 1, body: { requestedPlan: 'starter', billingCycle: 'monthly' } });
  const { res } = await runMiddleware(billingController.createUpgradeRequest, req);

  assert.equal(res.statusCode, 201);
  assert.ok(res.body.downgradeWarning, 'pemakaian di atas limit -> harus ada peringatan');
  assert.match(res.body.downgradeWarning, /aset/i);

  // Setujui permintaannya (simulasikan admin platform) — pastikan approve
  // TIDAK PERNAH menyentuh/menghapus baris assets sama sekali.
  const approveReq = mockReq({ tenantId, userId: 1, params: { id: String(res.body.id) } });
  const { res: approveRes } = await runMiddleware(billingController.approveUpgradeRequest, approveReq);
  assert.equal(approveRes.body.status, 'approved');

  assert.equal((await currentPlan(tenantId)).plan, 'starter', 'paket sungguhan berubah ke Starter');
  const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM assets WHERE tenant_id = :tenantId', { tenantId });
  assert.equal(Number(count), 3000, 'ke-3000 aset lama TIDAK boleh terhapus oleh downgrade');
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
