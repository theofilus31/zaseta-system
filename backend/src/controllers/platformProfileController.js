const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const { sendEmailChangeOtp } = require('../utils/mailer');
const { signPlatformToken } = require('../utils/token');

/**
 * ============================================================================
 *  AKUN ADMIN PLATFORM SENDIRI — padanan profileController.js tenant, tapi
 *  untuk tabel `platform_admins` (lihat migration_separate_platform_admins.sql).
 *  Dipakai pages/PlatformAccount.jsx satu-satunya jalan admin platform
 *  mengganti nama/nama pengguna/surel/kata sandi sendiri sejak akun ini
 *  tidak lagi bisa membuka /api/profile (endpoint tenant, akun ini tidak
 *  punya baris `users` sama sekali).
 * ============================================================================
 */
const USERNAME_REGEX = /^[a-z0-9_-]{3,50}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_EXPIRES_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;

// PUT /api/platform-auth/profile — { name?, currentPassword?, newPassword? }
const updateProfile = asyncHandler(async (req, res) => {
  const { name, currentPassword, newPassword } = req.body;
  const adminId = req.platformAdmin.id;

  const [[admin]] = await pool.query(`SELECT * FROM platform_admins WHERE id = :id AND deleted_at IS NULL`, { id: adminId });
  if (!admin) return res.status(404).json({ message: 'Akun tidak ditemukan.' });

  if (newPassword) {
    if (!currentPassword) {
      return res.status(400).json({ message: 'Kata sandi saat ini wajib diisi untuk mengganti kata sandi.' });
    }
    if (!(await bcrypt.compare(currentPassword, admin.password_hash))) {
      return res.status(401).json({ message: 'Kata sandi saat ini salah.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Kata sandi minimal 8 karakter.' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `UPDATE platform_admins SET password_hash = :passwordHash, token_version = token_version + 1 WHERE id = :id`,
      { id: adminId, passwordHash }
    );
    await logAudit({ platformAdminId: adminId, tenantId: null, action: 'update', entityType: 'platform_admin_password', entityId: adminId });
  }

  if (name !== undefined) {
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Nama wajib diisi.' });
    }
    await pool.query(`UPDATE platform_admins SET name = :name WHERE id = :id`, { id: adminId, name: String(name).trim() });
    await logAudit({ platformAdminId: adminId, tenantId: null, action: 'update', entityType: 'platform_admin_profile', entityId: adminId });
  }

  const [[updated]] = await pool.query(
    `SELECT id, username, name, email, status, token_version FROM platform_admins WHERE id = :id`, { id: adminId }
  );

  const responseBody = { message: 'Profil berhasil diperbarui.', admin: updated };
  if (newPassword) {
    responseBody.token = signPlatformToken(updated);
  }
  res.json(responseBody);
});

// PUT /api/platform-auth/profile/username — { username } (SELALU diri sendiri)
const updateUsername = asyncHandler(async (req, res) => {
  const { username } = req.body;
  const adminId = req.platformAdmin.id;

  const normalized = String(username || '').toLowerCase().trim();
  if (!USERNAME_REGEX.test(normalized)) {
    return res.status(400).json({ message: 'Nama pengguna hanya boleh huruf kecil, angka, garis bawah (_), tanda minus (-), minimal 3 karakter.' });
  }

  const [dupe] = await pool.query(`SELECT id FROM platform_admins WHERE username = :username AND id != :id AND deleted_at IS NULL`, { username: normalized, id: adminId });
  if (dupe[0]) return res.status(409).json({ message: 'Nama pengguna sudah dipakai.' });

  await pool.query(`UPDATE platform_admins SET username = :username WHERE id = :id`, { username: normalized, id: adminId });
  await logAudit({ platformAdminId: adminId, tenantId: null, action: 'update', entityType: 'platform_admin_username', entityId: adminId });

  res.json({ message: 'Nama pengguna berhasil diperbarui.' });
});

// POST /api/platform-auth/profile/email/otp/request — { newEmail }
const requestEmailOtp = asyncHandler(async (req, res) => {
  const { newEmail } = req.body;
  const adminId = req.platformAdmin.id;

  if (!newEmail || !EMAIL_REGEX.test(newEmail)) {
    return res.status(400).json({ message: 'Alamat surel baru tidak valid.' });
  }
  if (newEmail.toLowerCase() === req.platformAdmin.email.toLowerCase()) {
    return res.status(400).json({ message: 'Surel baru sama dengan surel saat ini.' });
  }

  const [dupe] = await pool.query(`SELECT id FROM platform_admins WHERE email = :email AND id != :id AND deleted_at IS NULL`, { email: newEmail, id: adminId });
  if (dupe[0]) return res.status(409).json({ message: 'Surel tersebut sudah dipakai.' });

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000);

  await pool.query(
    `INSERT INTO platform_admin_email_otps (platform_admin_id, new_email, otp_code, attempts, expires_at)
     VALUES (:adminId, :newEmail, :otp, 0, :expiresAt)
     ON CONFLICT (platform_admin_id) DO UPDATE SET new_email = :newEmail, otp_code = :otp, attempts = 0, expires_at = :expiresAt`,
    { adminId, newEmail, otp, expiresAt }
  );

  try {
    // tenantId: null -> getBranding() jatuh ke default ZASETA, sesuai --
    // akun ini memang tidak "milik" tenant mana pun.
    await sendEmailChangeOtp({ to: newEmail, otp, expiresInMinutes: OTP_EXPIRES_MINUTES, tenantId: null });
  } catch (err) {
    console.error('Gagal mengirim email OTP admin platform:', err.message);
    return res.status(502).json({ message: 'Gagal mengirim surel OTP. Coba lagi beberapa saat lagi.' });
  }

  res.json({ message: `Kode OTP telah dikirim ke ${newEmail}. Berlaku ${OTP_EXPIRES_MINUTES} menit.` });
});

// POST /api/platform-auth/profile/email/otp/verify — { otp }
const verifyEmailOtp = asyncHandler(async (req, res) => {
  const { otp } = req.body;
  const adminId = req.platformAdmin.id;

  if (!otp) return res.status(400).json({ message: 'Kode OTP wajib diisi.' });

  const [[record]] = await pool.query(`SELECT * FROM platform_admin_email_otps WHERE platform_admin_id = :adminId`, { adminId });
  if (!record) return res.status(400).json({ message: 'Tidak ada permintaan ganti surel yang aktif. Silakan mulai lagi.' });

  if (new Date(record.expires_at) < new Date()) {
    await pool.query(`DELETE FROM platform_admin_email_otps WHERE platform_admin_id = :adminId`, { adminId });
    return res.status(400).json({ message: 'Kode OTP sudah kedaluwarsa. Silakan minta kode baru.' });
  }
  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    await pool.query(`DELETE FROM platform_admin_email_otps WHERE platform_admin_id = :adminId`, { adminId });
    return res.status(429).json({ message: 'Terlalu banyak percobaan salah. Silakan minta kode baru.' });
  }
  if (String(otp).trim() !== record.otp_code) {
    await pool.query(`UPDATE platform_admin_email_otps SET attempts = attempts + 1 WHERE platform_admin_id = :adminId`, { adminId });
    return res.status(400).json({ message: 'Kode OTP salah.' });
  }

  const [dupe] = await pool.query(`SELECT id FROM platform_admins WHERE email = :email AND id != :id AND deleted_at IS NULL`, { email: record.new_email, id: adminId });
  if (dupe[0]) {
    await pool.query(`DELETE FROM platform_admin_email_otps WHERE platform_admin_id = :adminId`, { adminId });
    return res.status(409).json({ message: 'Surel tersebut baru saja dipakai. Silakan mulai lagi.' });
  }

  await pool.query(`UPDATE platform_admins SET email = :email WHERE id = :id`, { email: record.new_email, id: adminId });
  await pool.query(`DELETE FROM platform_admin_email_otps WHERE platform_admin_id = :adminId`, { adminId });
  await logAudit({ platformAdminId: adminId, tenantId: null, action: 'update', entityType: 'platform_admin_email', entityId: adminId, newValues: { email: record.new_email } });

  const [[updated]] = await pool.query(`SELECT id, username, name, email, status FROM platform_admins WHERE id = :id`, { id: adminId });
  res.json({ message: 'Surel berhasil diperbarui.', admin: updated });
});

module.exports = { updateProfile, updateUsername, requestEmailOtp, verifyEmailOtp };
