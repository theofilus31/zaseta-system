const pool = require('../../src/config/db');

/**
 * Tenant sekali pakai untuk pengujian billing/plan-limits — dibuat & dihapus
 * di setiap test (ON DELETE CASCADE membereskan users/assets/locations/
 * subscriptions/invoices ikutannya, lihat schema.postgres.sql), supaya tidak
 * ada satu pun test yang menyentuh data tenant sungguhan.
 */
async function createTestTenant(plan = 'free') {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [result] = await pool.query(
    `INSERT INTO tenants (slug, company_name, status, plan) VALUES (:slug, :companyName, 'active', :plan) RETURNING id`,
    { slug: `test-${suffix}`, companyName: `Test Tenant ${suffix}`, plan }
  );
  return result.insertId;
}

async function dropTestTenant(tenantId) {
  await pool.query(`DELETE FROM tenants WHERE id = :tenantId`, { tenantId });
}

/** Bulk-insert N baris aset lewat generate_series — satu query set-based,
 *  bukan N round-trip, supaya menguji batas 1.000/5.000 aset tetap cepat. */
async function bulkInsertAssets(tenantId, count) {
  if (count <= 0) return;
  // ON CONFLICT (upsert) — testTenant helper dipanggil BERKALI-KALI untuk
  // tenant uji yang sama dalam satu test (mis. 99 aset lalu +1 lagi), jadi
  // kategorinya harus idempotent, bukan INSERT polos yang bentrok UNIQUE
  // (tenant_id, slug) di percobaan kedua.
  const [categoryResult] = await pool.query(
    `INSERT INTO asset_categories (tenant_id, name, slug) VALUES (:tenantId, 'Kategori Uji', 'kategori-uji')
     ON CONFLICT (tenant_id, slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    { tenantId }
  );
  // Offset dari jumlah baris yang SUDAH ada untuk tenant ini — bulkInsert*
  // sering dipanggil lebih dari sekali per tenant dalam satu test (mis. 99
  // aset dulu, lalu +1 lagi buat pas di batas); generate_series yang selalu
  // mulai dari 1 akan bentrok UNIQUE (tenant_id, asset_code) kalau tidak
  // disambung dari posisi terakhir.
  const [[{ existing }]] = await pool.query(
    `SELECT COUNT(*) AS existing FROM assets WHERE tenant_id = :tenantId`, { tenantId }
  );
  const offset = Number(existing);
  await pool.query(
    `INSERT INTO assets (tenant_id, asset_code, category_id, name, condition_status, status)
     SELECT :tenantId, 'TEST-' || (g + :offset), :categoryId, 'Aset Uji ' || (g + :offset), 'baik', 'idle'
     FROM generate_series(1, :count) AS g`,
    { tenantId, categoryId: categoryResult.insertId, count, offset }
  );
}

async function bulkInsertLocations(tenantId, count) {
  if (count <= 0) return;
  const [[{ existing }]] = await pool.query(
    `SELECT COUNT(*) AS existing FROM locations WHERE tenant_id = :tenantId`, { tenantId }
  );
  const offset = Number(existing);
  await pool.query(
    `INSERT INTO locations (tenant_id, code, name)
     SELECT :tenantId, 'LOC-' || (g + :offset), 'Lokasi Uji ' || (g + :offset)
     FROM generate_series(1, :count) AS g`,
    { tenantId, count, offset }
  );
}

let cachedAdminRoleId = null;
async function adminRoleId() {
  // roles GLOBAL (bukan per-tenant, lihat schema.postgres.sql) dan sudah
  // diseed — 'admin' pasti ada, cukup dibaca sekali lalu di-cache.
  if (cachedAdminRoleId) return cachedAdminRoleId;
  const [[role]] = await pool.query(`SELECT id FROM roles WHERE name = 'admin'`);
  cachedAdminRoleId = role.id;
  return cachedAdminRoleId;
}

async function bulkInsertUsers(tenantId, count) {
  if (count <= 0) return;
  const roleId = await adminRoleId();
  const [[{ existing }]] = await pool.query(
    `SELECT COUNT(*) AS existing FROM users WHERE tenant_id = :tenantId`, { tenantId }
  );
  const offset = Number(existing);
  await pool.query(
    `INSERT INTO users (tenant_id, username, role_id, name, email, password_hash, status)
     SELECT :tenantId, 'test-user-' || (g + :offset), :roleId, 'User Uji ' || (g + :offset), 'test-user-' || (g + :offset) || '@example.test', 'x', 'active'
     FROM generate_series(1, :count) AS g`,
    { tenantId, roleId, count, offset }
  );
}

module.exports = { createTestTenant, dropTestTenant, bulkInsertAssets, bulkInsertLocations, bulkInsertUsers };
