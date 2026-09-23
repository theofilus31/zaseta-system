const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/teardown');
const pool = require('../src/config/db');
const { submitTestimonial, skipTestimonial, listPublicTestimonials } = require('../src/controllers/testimonialController');
const { listTestimonials, approveTestimonial, rejectTestimonial } = require('../src/controllers/platformController');
const { createTestTenant, dropTestTenant, createTestUser } = require('./helpers/testTenant');
const { mockReq, runMiddleware } = require('./helpers/mockReqRes');

async function userRow(userId) {
  const [[row]] = await pool.query(`SELECT login_count AS "loginCount", testimonial_status AS "testimonialStatus" FROM users WHERE id = :userId`, { userId });
  return row;
}

test('submitTestimonial: berhasil dengan rating & pesan valid, menandai user "submitted"', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));
  const userId = await createTestUser(tenantId);

  const req = mockReq({ tenantId, userId, body: { rating: 5, message: 'Sangat membantu!', authorRole: 'Manajer IT' } });
  const { res } = await runMiddleware(submitTestimonial, req);

  assert.equal(res.statusCode, 201);
  assert.ok(res.body.id);

  const [[row]] = await pool.query(
    `SELECT rating, message, author_role AS "authorRole", company_name AS "companyName", status FROM testimonials WHERE id = :id`,
    { id: res.body.id }
  );
  assert.equal(row.rating, 5);
  assert.equal(row.status, 'pending', 'testimoni baru harus menunggu tinjauan, tidak langsung terbit');
  assert.equal(row.authorRole, 'Manajer IT');

  assert.equal((await userRow(userId)).testimonialStatus, 'submitted');
});

test('submitTestimonial: rating di luar 1-5 dan pesan kosong ditolak', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));
  const userId = await createTestUser(tenantId);

  const badRating = await runMiddleware(submitTestimonial, mockReq({ tenantId, userId, body: { rating: 6, message: 'oke' } }));
  assert.equal(badRating.res.statusCode, 400);

  const emptyMessage = await runMiddleware(submitTestimonial, mockReq({ tenantId, userId, body: { rating: 4, message: '   ' } }));
  assert.equal(emptyMessage.res.statusCode, 400);
});

test('skipTestimonial: menandai user "skipped"', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));
  const userId = await createTestUser(tenantId);

  const { res } = await runMiddleware(skipTestimonial, mockReq({ tenantId, userId }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.testimonialStatus, 'skipped');
  assert.equal((await userRow(userId)).testimonialStatus, 'skipped');
});

test('listPublicTestimonials: hanya mengembalikan yang berstatus approved', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));
  const userId = await createTestUser(tenantId);

  const pending = await runMiddleware(submitTestimonial, mockReq({ tenantId, userId, body: { rating: 4, message: 'Testimoni pending' } }));
  const approved = await runMiddleware(submitTestimonial, mockReq({ tenantId, userId: await createTestUser(tenantId), body: { rating: 5, message: 'Testimoni approved' } }));
  await pool.query(`UPDATE testimonials SET status = 'approved', reviewed_at = NOW() WHERE id = :id`, { id: approved.res.body.id });

  const { res } = await runMiddleware(listPublicTestimonials, mockReq({}));
  const ids = res.body.map((x) => x.id);
  assert.ok(ids.includes(approved.res.body.id));
  assert.ok(!ids.includes(pending.res.body.id));
  const approvedRow = res.body.find((x) => x.id === approved.res.body.id);
  assert.equal(approvedRow.message, 'Testimoni approved');
  assert.equal(approvedRow.rating, 5);
});

test('platform: approve/reject testimoni, dan tidak bisa ditinjau dua kali', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));
  const userId = await createTestUser(tenantId);
  const adminId = await createTestUser(tenantId);

  const submitted = await runMiddleware(submitTestimonial, mockReq({ tenantId, userId, body: { rating: 3, message: 'Lumayan' } }));
  const testimonialId = submitted.res.body.id;

  const { res: listRes } = await runMiddleware(listTestimonials, mockReq({ userId: adminId, query: { status: 'pending' } }));
  assert.ok(listRes.body.testimonials.some((x) => x.id === testimonialId));

  const { res: approveRes } = await runMiddleware(approveTestimonial, mockReq({ userId: adminId, params: { id: String(testimonialId) } }));
  assert.equal(approveRes.statusCode, 200);
  assert.equal(approveRes.body.status, 'approved');

  const { res: secondApprove } = await runMiddleware(approveTestimonial, mockReq({ userId: adminId, params: { id: String(testimonialId) } }));
  assert.equal(secondApprove.statusCode, 409, 'testimoni yang sudah ditinjau tidak boleh ditinjau ulang');
});

test('listPublicTestimonials: menampilkan SEMUA yang approved (bukan cuma cuplikan kecil), dan ?limit= dihormati', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));

  // 15 testimoni approved -- lebih dari batas lama (12) yang dulu diam-diam
  // menyembunyikan testimoni lama begitu ada yang baru.
  const ids = [];
  for (let i = 0; i < 15; i++) {
    // eslint-disable-next-line no-await-in-loop
    const userId = await createTestUser(tenantId);
    // eslint-disable-next-line no-await-in-loop
    const submitted = await runMiddleware(submitTestimonial, mockReq({ tenantId, userId, body: { rating: 5, message: `Testimoni ke-${i}` } }));
    ids.push(submitted.res.body.id);
  }
  await pool.query(`UPDATE testimonials SET status = 'approved', reviewed_at = NOW() WHERE id = ANY(:ids::bigint[])`, { ids });

  const { res: allRes } = await runMiddleware(listPublicTestimonials, mockReq({ query: {} }));
  const approvedIds = new Set(allRes.body.map((x) => x.id));
  assert.equal(ids.filter((id) => approvedIds.has(id)).length, 15, 'ke-15 testimoni approved harus semuanya tampil, tidak dipotong ke 12 seperti batas lama');

  const { res: limitedRes } = await runMiddleware(listPublicTestimonials, mockReq({ query: { limit: '3' } }));
  assert.equal(limitedRes.body.length, 3, '?limit= tetap dihormati untuk pemanggil yang memang cuma mau cuplikan kecil');
});

test('platform: reject testimoni tidak membuatnya muncul di daftar publik', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));
  const userId = await createTestUser(tenantId);
  const adminId = await createTestUser(tenantId);

  const submitted = await runMiddleware(submitTestimonial, mockReq({ tenantId, userId, body: { rating: 1, message: 'Kurang puas' } }));
  await runMiddleware(rejectTestimonial, mockReq({ userId: adminId, params: { id: String(submitted.res.body.id) } }));

  const { res } = await runMiddleware(listPublicTestimonials, mockReq({}));
  assert.ok(!res.body.some((x) => x.id === submitted.res.body.id));
});
