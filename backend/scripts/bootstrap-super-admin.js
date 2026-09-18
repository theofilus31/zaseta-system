/**
 * Bootstrap satu kali: buat tenant vendor ('default') + akun admin platform
 * pertama, untuk database yang masih kosong (belum ada tenant/user sama
 * sekali, jadi endpoint /api/platform/* tidak bisa dipakai memberi akses
 * platform admin ke siapa pun -- lihat platformController.setPlatformAdmin).
 *
 * Jalankan sekali: node scripts/bootstrap-super-admin.js
 * Aman dijalankan ulang -- akan berhenti kalau tenant/username/email sudah ada.
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../src/config/db');
const { fullAccess } = require('../src/config/modules');

const COMPANY_NAME = 'Zaseta';
const SLUG = 'default';
const NAME = 'Super Admin';
const USERNAME = 'superadmin';
const EMAIL = 'theofilus31@gmail.com';

function generatePassword(length = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
  const bytes = crypto.randomBytes(length);
  let pwd = '';
  for (let i = 0; i < length; i++) pwd += chars[bytes[i] % chars.length];
  return pwd;
}

async function main() {
  const [existingTenant] = await pool.query(`SELECT id FROM tenants WHERE slug = :slug`, { slug: SLUG });
  if (existingTenant[0]) {
    console.error(`Tenant slug '${SLUG}' sudah ada (id=${existingTenant[0].id}). Batal -- jalankan manual kalau memang ingin menambah user ke tenant ini.`);
    process.exit(1);
  }

  const [existingUser] = await pool.query(
    `SELECT id FROM users WHERE username = :username OR email = :email`,
    { username: USERNAME, email: EMAIL }
  );
  if (existingUser[0]) {
    console.error(`Username '${USERNAME}' atau email '${EMAIL}' sudah dipakai. Batal.`);
    process.exit(1);
  }

  const [[adminRole]] = await pool.query(`SELECT id FROM roles WHERE name = 'admin'`);
  if (!adminRole) throw new Error(`Role 'admin' tidak ada di tabel roles.`);

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 10);

  const conn = await pool.getConnection();
  let tenantId, userId;
  try {
    await conn.beginTransaction();

    const [tenantResult] = await conn.query(
      `INSERT INTO tenants (slug, company_name, status, plan) VALUES (:slug, :companyName, 'active', 'enterprise_custom') RETURNING id`,
      { slug: SLUG, companyName: COMPANY_NAME }
    );
    tenantId = tenantResult.insertId;

    const [userResult] = await conn.query(
      `INSERT INTO users (tenant_id, username, role_id, name, email, password_hash, status, is_platform_admin)
       VALUES (:tenantId, :username, :roleId, :name, :email, :passwordHash, 'active', TRUE)
       RETURNING id`,
      { tenantId, username: USERNAME, roleId: adminRole.id, name: NAME, email: EMAIL, passwordHash }
    );
    userId = userResult.insertId;

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // Baris izin penuh untuk tampilan matriks Manajemen Pengguna -- sama seperti
  // pola signup/createUser, meski penegakannya lewat role admin di middleware.
  const access = fullAccess();
  for (const [moduleKey, actions] of Object.entries(access)) {
    await pool.query(
      `INSERT INTO user_permissions (user_id, module_key, can_view, can_create, can_edit, can_delete)
       VALUES (:userId, :moduleKey, TRUE, :canCreate, :canEdit, :canDelete)`,
      {
        userId, moduleKey,
        canCreate: actions.includes('create'),
        canEdit: actions.includes('edit'),
        canDelete: actions.includes('delete'),
      }
    );
  }

  console.log('=== Super admin berhasil dibuat ===');
  console.log('Tenant   :', COMPANY_NAME, `(slug=${SLUG}, id=${tenantId})`);
  console.log('User ID  :', userId);
  console.log('Username :', USERNAME);
  console.log('Email    :', EMAIL);
  console.log('Password :', password);
  console.log('(is_platform_admin = true -- akses penuh ke /api/platform/* dan persetujuan billing lintas tenant)');
  console.log('PENTING: simpan password ini sekarang, tidak akan ditampilkan lagi. Segera ganti setelah login pertama.');

  process.exit(0);
}

main().catch((err) => {
  console.error('Gagal:', err.message);
  process.exit(1);
});
