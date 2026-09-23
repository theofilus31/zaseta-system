const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/teardown');
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');
const { login } = require('../src/controllers/authController');
const { createTestTenant, dropTestTenant, createTestUser } = require('./helpers/testTenant');
const { runMiddleware } = require('./helpers/mockReqRes');

async function callLogin(body, ip = '127.0.0.1') {
  const { res } = await runMiddleware(login, { body, ip });
  return res;
}

async function setPassword(userId, password) {
  const hash = await bcrypt.hash(password, 4);
  await pool.query(`UPDATE users SET password_hash = :hash, email_verified_at = NOW() WHERE id = :userId`, { hash, userId });
}

test('login: kredensial benar menaikkan login_count & mengembalikannya di respons', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));
  const userId = await createTestUser(tenantId);
  await setPassword(userId, 'sandi-benar-123');
  const [[{ username }]] = await pool.query(`SELECT username FROM users WHERE id = :userId`, { userId });

  const res = await callLogin({ username, password: 'sandi-benar-123' });

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.token);
  assert.equal(res.body.user.loginCount, 1, 'login pertama -> login_count jadi 1');
  assert.equal(res.body.user.testimonialStatus, 'none');

  const [[row]] = await pool.query(`SELECT login_count AS "loginCount" FROM users WHERE id = :userId`, { userId });
  assert.equal(row.loginCount, 1, 'login_count di database ikut naik, bukan cuma di respons');

  // Login kedua -> harus 2, bukan tetap 1 (regresi RETURNING banyak kolom
  // yang sempat membuat login gagal total dengan galat 500 -- lihat riwayat
  // commit fix-nya).
  const res2 = await callLogin({ username, password: 'sandi-benar-123' });
  assert.equal(res2.statusCode, 200);
  assert.equal(res2.body.user.loginCount, 2);
});

test('login: password salah ditolak 401, login_count TIDAK naik', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));
  const userId = await createTestUser(tenantId);
  await setPassword(userId, 'sandi-benar-123');
  const [[{ username }]] = await pool.query(`SELECT username FROM users WHERE id = :userId`, { userId });

  const res = await callLogin({ username, password: 'salah' });
  assert.equal(res.statusCode, 401);

  const [[row]] = await pool.query(`SELECT login_count AS "loginCount" FROM users WHERE id = :userId`, { userId });
  assert.equal(row.loginCount, 0);
});

test('login: testimonialStatus "submitted" ikut terbawa di respons (tidak ditawarkan lagi)', async (t) => {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));
  const userId = await createTestUser(tenantId);
  await setPassword(userId, 'sandi-benar-123');
  await pool.query(`UPDATE users SET testimonial_status = 'submitted' WHERE id = :userId`, { userId });
  const [[{ username }]] = await pool.query(`SELECT username FROM users WHERE id = :userId`, { userId });

  const res = await callLogin({ username, password: 'sandi-benar-123' });
  assert.equal(res.body.user.testimonialStatus, 'submitted');
});
