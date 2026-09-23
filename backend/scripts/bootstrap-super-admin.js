/**
 * Bootstrap satu kali: buat akun admin platform pertama, untuk database yang
 * masih kosong (belum ada admin platform sama sekali).
 *
 * Sejak migration_separate_platform_admins.sql, admin platform hidup di
 * tabel `platform_admins` sendiri, TERPISAH TOTAL dari `users`/`tenants` --
 * tidak perlu tenant "rumah" seperti dulu.
 *
 * Jalankan sekali: node scripts/bootstrap-super-admin.js
 * Aman dijalankan ulang -- akan berhenti kalau username/email sudah ada.
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../src/config/db');

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
  const [existing] = await pool.query(
    `SELECT id FROM platform_admins WHERE username = :username OR email = :email`,
    { username: USERNAME, email: EMAIL }
  );
  if (existing[0]) {
    console.error(`Username '${USERNAME}' atau email '${EMAIL}' sudah dipakai admin platform lain. Batal.`);
    process.exit(1);
  }

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 10);

  const [result] = await pool.query(
    `INSERT INTO platform_admins (username, name, email, password_hash, status)
     VALUES (:username, :name, :email, :passwordHash, 'active') RETURNING id`,
    { username: USERNAME, name: NAME, email: EMAIL, passwordHash }
  );

  console.log('=== Admin platform pertama berhasil dibuat ===');
  console.log('Admin ID :', result.insertId);
  console.log('Username :', USERNAME);
  console.log('Email    :', EMAIL);
  console.log('Password :', password);
  console.log('Login lewat /platform/login (TIDAK ditautkan dari UI publik mana pun -- lihat pages/PlatformLogin.jsx).');
  console.log('PENTING: simpan password ini sekarang, tidak akan ditampilkan lagi. Segera ganti setelah login pertama.');

  process.exit(0);
}

main().catch((err) => {
  console.error('Gagal:', err.message);
  process.exit(1);
});
