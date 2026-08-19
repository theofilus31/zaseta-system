const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const { sendEmailChangeOtp } = require('../utils/mailer');
const { signToken } = require('../utils/token');

const USERNAME_REGEX = /^[a-z0-9_-]{3,50}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_EXPIRES_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;

// GET /api/profile
const getProfile = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.name, u.email, u.status, r.name AS role
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = :id AND u.deleted_at IS NULL`,
    { id: req.user.id }
  );
  if (!rows[0]) return res.status(404).json({ message: 'User tidak ditemukan.' });
  res.json(rows[0]);
});

// PUT /api/profile — ganti nama & password sendiri (SEMUA ROLE).
// Email TIDAK diubah lewat endpoint ini — lihat requestEmailOtp/verifyEmailOtp.
const updateProfile = asyncHandler(async (req, res) => {
  const { name, currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  const [userRows] = await pool.query(
    `SELECT * FROM users WHERE id = :id AND deleted_at IS NULL`,
    { id: userId }
  );
  const user = userRows[0];
  if (!user) return res.status(404).json({ message: 'User tidak ditemukan.' });

  if (!name) {
    return res.status(400).json({ message: 'Nama wajib diisi.' });
  }

  if (newPassword) {
    if (!currentPassword) {
      return res.status(400).json({ message: 'Kata sandi saat ini wajib diisi untuk mengganti kata sandi.' });
    }
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Kata sandi saat ini salah.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Kata sandi minimal 8 karakter.' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    /* token_version dinaikkan supaya token lama (kalau sampai bocor) langsung
       tidak berlaku — lihat middleware/auth.js. Sesi yang sedang berjalan
       tetap mulus karena token baru diterbitkan di respons ini juga. */
    await pool.query(
      `UPDATE users SET password_hash = :passwordHash, token_version = token_version + 1 WHERE id = :id`,
      { id: userId, passwordHash }
    );
    await logAudit({ userId, action: 'update', entityType: 'user_password', entityId: userId });
  }

  await pool.query(
    `UPDATE users SET name = :name WHERE id = :id`,
    { id: userId, name }
  );

  await logAudit({ userId, action: 'update', entityType: 'user_profile', entityId: userId });

  const [updated] = await pool.query(
    `SELECT u.id, u.username, u.name, u.email, u.status, u.token_version, r.name AS role
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = :id`,
    { id: userId }
  );

  const responseBody = { message: 'Profil berhasil diperbarui.', user: updated[0] };
  /* Kata sandi baru saja diganti -> token_version naik -> token yang dipakai
     permintaan ini sendiri sudah tidak berlaku untuk permintaan BERIKUTNYA.
     Token baru disertakan di sini supaya sesi yang sedang berjalan tidak
     tiba-tiba ditolak; frontend menggantinya diam-diam di localStorage. */
  if (newPassword) {
    responseBody.token = signToken(updated[0]);
  }

  res.json(responseBody);
});

// POST /api/profile/email/otp/request — SEMUA ROLE, untuk email sendiri.
// Kirim kode OTP ke alamat email BARU untuk membuktikan kepemilikan.
const requestEmailOtp = asyncHandler(async (req, res) => {
  const { newEmail } = req.body;
  const userId = req.user.id;

  if (!newEmail || !EMAIL_REGEX.test(newEmail)) {
    return res.status(400).json({ message: 'Alamat surel baru tidak valid.' });
  }

  const [userRows] = await pool.query(`SELECT email FROM users WHERE id = :id AND deleted_at IS NULL`, { id: userId });
  const user = userRows[0];
  if (!user) return res.status(404).json({ message: 'User tidak ditemukan.' });

  if (newEmail.toLowerCase() === user.email.toLowerCase()) {
    return res.status(400).json({ message: 'Surel baru sama dengan surel saat ini.' });
  }

  const [dupe] = await pool.query(
    `SELECT id FROM users WHERE email = :email AND id != :id AND deleted_at IS NULL`,
    { email: newEmail, id: userId }
  );
  if (dupe[0]) {
    return res.status(409).json({ message: 'Surel tersebut sudah dipakai pengguna lain.' });
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000)); // 6 digit
  const expiresAt = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000);

  // 1 permintaan aktif per user — request baru menimpa yang lama.
  await pool.query(
    `INSERT INTO email_change_otps (user_id, new_email, otp_code, attempts, expires_at)
     VALUES (:userId, :newEmail, :otp, 0, :expiresAt)
     ON DUPLICATE KEY UPDATE new_email = :newEmail, otp_code = :otp, attempts = 0, expires_at = :expiresAt`,
    { userId, newEmail, otp, expiresAt }
  );

  try {
    await sendEmailChangeOtp({ to: newEmail, otp, expiresInMinutes: OTP_EXPIRES_MINUTES });
  } catch (err) {
    console.error('Gagal mengirim email OTP:', err.message);
    return res.status(502).json({ message: 'Gagal mengirim surel OTP. Coba lagi beberapa saat lagi.' });
  }

  res.json({ message: `Kode OTP telah dikirim ke ${newEmail}. Berlaku ${OTP_EXPIRES_MINUTES} menit.` });
});

// POST /api/profile/email/otp/verify — SEMUA ROLE, untuk email sendiri.
const verifyEmailOtp = asyncHandler(async (req, res) => {
  const { otp } = req.body;
  const userId = req.user.id;

  if (!otp) {
    return res.status(400).json({ message: 'Kode OTP wajib diisi.' });
  }

  const [rows] = await pool.query(`SELECT * FROM email_change_otps WHERE user_id = :userId`, { userId });
  const record = rows[0];
  if (!record) {
    return res.status(400).json({ message: 'Tidak ada permintaan ganti surel yang aktif. Silakan mulai lagi.' });
  }

  if (new Date(record.expires_at) < new Date()) {
    await pool.query(`DELETE FROM email_change_otps WHERE user_id = :userId`, { userId });
    return res.status(400).json({ message: 'Kode OTP sudah kedaluwarsa. Silakan minta kode baru.' });
  }

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    await pool.query(`DELETE FROM email_change_otps WHERE user_id = :userId`, { userId });
    return res.status(429).json({ message: 'Terlalu banyak percobaan salah. Silakan minta kode baru.' });
  }

  if (String(otp).trim() !== record.otp_code) {
    await pool.query(`UPDATE email_change_otps SET attempts = attempts + 1 WHERE user_id = :userId`, { userId });
    return res.status(400).json({ message: 'Kode OTP salah.' });
  }

  // Cek lagi email belum dipakai user lain (race condition guard) sebelum commit.
  const [dupe] = await pool.query(
    `SELECT id FROM users WHERE email = :email AND id != :id AND deleted_at IS NULL`,
    { email: record.new_email, id: userId }
  );
  if (dupe[0]) {
    await pool.query(`DELETE FROM email_change_otps WHERE user_id = :userId`, { userId });
    return res.status(409).json({ message: 'Surel tersebut baru saja dipakai pengguna lain. Silakan mulai lagi.' });
  }

  await pool.query(`UPDATE users SET email = :email WHERE id = :id`, { email: record.new_email, id: userId });
  await pool.query(`DELETE FROM email_change_otps WHERE user_id = :userId`, { userId });
  await logAudit({ userId, action: 'update', entityType: 'user_email', entityId: userId, newValues: { email: record.new_email } });

  const [updated] = await pool.query(
    `SELECT u.id, u.username, u.name, u.email, u.status, r.name AS role
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = :id`,
    { id: userId }
  );

  res.json({ message: 'Surel berhasil diperbarui.', user: updated[0] });
});

// PUT /api/profile/username — KHUSUS ADMIN
const updateUsername = asyncHandler(async (req, res) => {
  const { userId, username } = req.body;

  if (!userId || !username) {
    return res.status(400).json({ message: 'userId dan nama pengguna wajib diisi.' });
  }

  if (!USERNAME_REGEX.test(username)) {
    return res.status(400).json({
      message: 'Nama pengguna hanya boleh huruf kecil, angka, garis bawah (_), tanda minus (-), minimal 3 karakter.'
    });
  }

  const [dupe] = await pool.query(
    `SELECT id FROM users WHERE username = :username AND id != :userId AND deleted_at IS NULL`,
    { username, userId }
  );
  if (dupe[0]) {
    return res.status(409).json({ message: 'Nama pengguna sudah dipakai pengguna lain.' });
  }

  await pool.query(
    `UPDATE users SET username = :username WHERE id = :userId`,
    { username, userId }
  );

  await logAudit({ userId: req.user.id, action: 'update', entityType: 'user_username', entityId: userId });

  res.json({ message: 'Nama pengguna berhasil diperbarui.' });
});

module.exports = { getProfile, updateProfile, requestEmailOtp, verifyEmailOtp, updateUsername };
