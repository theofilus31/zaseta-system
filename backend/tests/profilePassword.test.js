const { test } = require('node:test');
// updateProfile menerbitkan JWT baru; di CI tidak ada .env, jadi beri rahasia uji.
process.env.JWT_SECRET ||= 'test-only-jwt-secret';
const assert = require('node:assert/strict');
require('./helpers/teardown');
require('./helpers/setup');
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');
const { updateProfile, getProfile } = require('../src/controllers/profileController');
const { createTestTenant, dropTestTenant, createTestUser } = require('./helpers/testTenant');
const { mockReq, runMiddleware } = require('./helpers/mockReqRes');

async function setup(t, { passwordIsSet, password = 'sandi-lama-123' }) {
  const tenantId = await createTestTenant('free');
  t.after(() => dropTestTenant(tenantId));
  const userId = await createTestUser(tenantId);
  await pool.query(
    `UPDATE users SET password_hash = :hash, password_is_set = :passwordIsSet WHERE id = :userId`,
    { hash: await bcrypt.hash(password, 4), passwordIsSet, userId }
  );
  return { tenantId, userId };
}

async function put(tenantId, userId, body) {
  const { res } = await runMiddleware(updateProfile, mockReq({ tenantId, userId, body }));
  return res;
}

test('Akun biasa: ganti kata sandi TANPA kata sandi saat ini ditolak', async (t) => {
  const { tenantId, userId } = await setup(t, { passwordIsSet: true });
  const res = await put(tenantId, userId, { name: 'Uji', newPassword: 'sandi-baru-123' });
  assert.equal(res.statusCode, 400);
});

test('Akun biasa: kata sandi saat ini salah ditolak, benar diterima', async (t) => {
  const { tenantId, userId } = await setup(t, { passwordIsSet: true });
  const salah = await put(tenantId, userId, { name: 'Uji', currentPassword: 'salah-salah', newPassword: 'sandi-baru-123' });
  assert.equal(salah.statusCode, 401);

  const benar = await put(tenantId, userId, { name: 'Uji', currentPassword: 'sandi-lama-123', newPassword: 'sandi-baru-123' });
  assert.equal(benar.statusCode, 200);
  assert.ok(benar.body.token, 'token baru diterbitkan setelah kata sandi diganti');
});

test('Akun daftar via Google (password_is_set = FALSE): boleh membuat kata sandi tanpa kata sandi lama, lalu jadi akun biasa', async (t) => {
  const { tenantId, userId } = await setup(t, { passwordIsSet: false });

  const { res: profil } = await runMiddleware(getProfile, mockReq({ tenantId, userId }));
  assert.equal(profil.body.passwordIsSet, false);

  const dibuat = await put(tenantId, userId, { name: 'Uji', newPassword: 'sandi-baru-123' });
  assert.equal(dibuat.statusCode, 200);
  assert.equal(dibuat.body.user.passwordIsSet, true);

  const [[row]] = await pool.query(`SELECT password_hash, password_is_set FROM users WHERE id = :userId`, { userId });
  assert.equal(row.password_is_set, true);
  assert.ok(await bcrypt.compare('sandi-baru-123', row.password_hash));

  // Sesudahnya aturan biasa berlaku: mengganti lagi WAJIB kata sandi saat ini.
  const lagi = await put(tenantId, userId, { name: 'Uji', newPassword: 'sandi-lain-456' });
  assert.equal(lagi.statusCode, 400);
});

test('Akun Google: kata sandi baru tetap dicek panjang minimalnya', async (t) => {
  const { tenantId, userId } = await setup(t, { passwordIsSet: false });
  const res = await put(tenantId, userId, { name: 'Uji', newPassword: 'pendek' });
  assert.equal(res.statusCode, 400);
});
