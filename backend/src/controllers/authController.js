const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const { loadPermissions } = require('../middleware/auth');
const { signToken } = require('../utils/token');
const { sendPasswordResetOtp, sendSignupVerificationOtp, sendTenantWelcome } = require('../utils/mailer');
const { verifyGoogleCredential } = require('../utils/googleAuth');
const { fullAccess } = require('../config/modules');
const { resolveRoleId, writePermissions, USERNAME_REGEX } = require('./userController');
const { normalizeSlug, isValidSlugFormat, isReservedSlug, SLUG_MIN, SLUG_MAX } = require('../utils/tenantSlug');
const { activateSubscription } = require('../services/subscriptionService');

const OTP_EXPIRES_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;
const MIN_PASSWORD_LENGTH = 8;
const MAX_USERNAME_LENGTH = 50; // batas kolom users.username — lihat pengecekan panjang gabungan di signup()

// POST /api/auth/login
//
// Username/surel HANYA unik DI DALAM satu tenant (lihat migrasi
// migration_saas_multitenancy_phase1.sql) — dua perusahaan berbeda BOLEH
// sama-sama punya pengguna "admin".
//
// `slug` (opsional, Fase 5 Tahap 2 SaaS) — dikirim halaman masuk KHUSUS satu
// tenant (mis. /rms/login) supaya pencarian akunnya langsung DI DALAM tenant
// itu saja, bukan mencoba SEMUA tenant seperti di bawah. Halaman Masuk
// UNIVERSAL (/login, tanpa slug) masih belum tahu tenant mana yang dituju —
// SEMUA akun yang cocok identifier-nya dicoba, dan kata sandi sendiri yang
// jadi pembeda: hanya akun yang kata sandinya benar-benar cocok yang
// berhasil masuk. Perilaku ini SENGAJA dipertahankan (bukan dihapus begitu
// slug ada) karena /login tanpa slug masih dipakai dan harus tetap berfungsi.
const login = asyncHandler(async (req, res) => {
  const { username, password, slug } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Nama pengguna/surel dan kata sandi wajib diisi.' });
  }

  const identifier = username.toLowerCase();

  let tenantId = null;
  if (slug) {
    const [[tenant]] = await pool.query(`SELECT id FROM tenants WHERE slug = :slug LIMIT 1`, { slug: normalizeSlug(slug) });
    if (!tenant) {
      return res.status(404).json({ message: 'Perusahaan dengan kode ini tidak ditemukan.' });
    }
    tenantId = tenant.id;
  }

  const [candidates] = await pool.query(
    `SELECT u.id, u.tenant_id, u.username, u.name, u.email, u.password_hash, u.status, u.token_version, u.email_verified_at, r.name AS role,
            u.login_count AS "loginCount", u.testimonial_status AS "testimonialStatus"
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE (u.username = :identifier OR u.email = :identifier) AND u.deleted_at IS NULL AND u.status = 'active'
     ${tenantId ? 'AND u.tenant_id = :tenantId' : ''}`,
    tenantId ? { identifier, tenantId } : { identifier }
  );

  let user = null;
  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop
    if (await bcrypt.compare(password, candidate.password_hash)) { user = candidate; break; }
  }

  if (!user) {
    return res.status(401).json({ message: 'Nama pengguna/surel atau kata sandi salah.' });
  }

  /* Akun hasil pendaftaran mandiri (signup) belum bisa masuk sebelum surelnya
     diverifikasi (lihat catatan users.email_verified_at) -- pesan & kode ini
     dipakai frontend untuk mengarahkan ke layar verifikasi, bukan sekadar
     menampilkan galat generik "kata sandi salah". */
  if (!user.email_verified_at) {
    return res.status(403).json({
      message: 'Surel akun ini belum diverifikasi. Cek kotak masuk Anda, atau minta kode baru.',
      code: 'EMAIL_NOT_VERIFIED',
      identifier: user.username,
    });
  }

  const token = signToken(user);

  /* login_count dipakai TestimonialPrompt.jsx (frontend) untuk menawarkan
     popup testimoni tiap kelipatan 3 login -- lihat migration_add_testimonials.sql.
     Dihitung di JS dari nilai yang SUDAH terbaca di query `candidates` di
     atas (bukan lewat `RETURNING login_count` di sini) -- lapisan
     kompatibilitas mysql2 di config/db.js cuma mengekspos SATU kolom
     pertama RETURNING sebagai `insertId`, bukan seluruh baris, jadi
     RETURNING banyak kolom sekaligus tidak bisa dibaca dari sini. */
  const loginCount = (user.loginCount || 0) + 1;
  const { testimonialStatus } = user;
  await pool.query(`UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = :id`, { id: user.id });
  await logAudit({ userId: user.id, action: 'login', entityType: 'user', entityId: user.id, ipAddress: req.ip });

  /* Izin ikut dikirim saat login supaya menu & tombol langsung tampil sesuai
     hak akses, tanpa perlu satu permintaan tambahan. Ini hanya untuk tampilan —
     penegakan yang sesungguhnya tetap di middleware setiap endpoint. */
  const permissions = await loadPermissions(user);

  res.json({
    token,
    user: {
      id: user.id, tenantId: user.tenant_id, username: user.username, name: user.name,
      email: user.email, role: user.role, permissions,
      loginCount, testimonialStatus,
    },
  });
});

/**
 * GET /api/auth/me
 * Dipakai frontend untuk menyegarkan izin tanpa login ulang — berguna ketika
 * administrator baru saja mengubah hak akses pengguna yang sedang aktif.
 * req.user sudah berisi izin terbaru dari database (lihat middleware auth).
 */
const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});

/**
 * POST /api/auth/forgot-password — { identifier } (nama pengguna atau surel)
 *
 * Mengirim kode OTP 6 digit ke alamat surel yang SUDAH terdaftar di akun
 * tersebut — bukan alamat yang diketik pemohon saat itu juga, supaya fitur
 * ini tidak bisa dipakai mengirim kode ke surel siapa pun secara bebas.
 *
 * Balasannya SELALU sama entah akunnya ditemukan atau tidak — kalau pesannya
 * beda ("akun tidak ditemukan" vs "kode terkirim"), endpoint ini bisa dipakai
 * menebak nama pengguna/surel mana saja yang terdaftar di sistem (sama
 * seperti alasan pesan galat login sengaja tidak membedakan keduanya).
 *
 * Username/surel hanya unik PER TENANT (lihat catatan di atas fungsi login),
 * dan halaman ini belum tahu tenant mana yang dituju — kalau kebetulan dua
 * perusahaan berbeda punya pengguna dengan identifier yang sama persis,
 * kode dikirim ke SEMUA akun yang cocok (masing-masing surelnya sendiri),
 * bukan cuma salah satu yang dipilih sembarangan.
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { identifier } = req.body;
  const genericMessage = 'Kalau akun dengan nama pengguna/surel itu terdaftar dan aktif, kode atur ulang telah dikirim ke surel yang terdaftar di akun tersebut.';

  if (!identifier) {
    return res.status(400).json({ message: 'Nama pengguna atau surel wajib diisi.' });
  }

  const id = identifier.toLowerCase().trim();
  const [candidates] = await pool.query(
    `SELECT id, tenant_id, email, status FROM users WHERE (username = :id OR email = :id) AND deleted_at IS NULL AND status = 'active'`,
    { id }
  );

  for (const user of candidates) {
    const otp = String(Math.floor(100000 + Math.random() * 900000)); // 6 digit
    const expiresAt = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000);

    // eslint-disable-next-line no-await-in-loop
    await pool.query(
      `INSERT INTO password_reset_otps (user_id, otp_code, attempts, expires_at)
       VALUES (:userId, :otp, 0, :expiresAt)
       ON CONFLICT (user_id) DO UPDATE SET otp_code = :otp, attempts = 0, expires_at = :expiresAt`,
      { userId: user.id, otp, expiresAt }
    );

    try {
      // eslint-disable-next-line no-await-in-loop
      await sendPasswordResetOtp({ to: user.email, otp, expiresInMinutes: OTP_EXPIRES_MINUTES, tenantId: user.tenant_id });
    } catch (err) {
      // Tetap balas pesan generik — jangan bocorkan ke pemanggil bahwa akunnya
      // ada tapi pengiriman surelnya gagal (mis. konfigurasi SMTP bermasalah).
      console.error('Gagal mengirim surel atur ulang kata sandi:', err.message);
    }
  }

  res.json({ message: genericMessage });
});

/**
 * POST /api/auth/reset-password — { identifier, otp, newPassword }
 * Menyelesaikan alur "Lupa Kata Sandi": cocokkan kode OTP, lalu ganti kata sandi.
 *
 * Sama seperti forgotPassword: kalau identifier ini cocok dengan pengguna di
 * BEBERAPA tenant sekaligus, kode OTP-nya sendiri yang jadi pembeda — dicoba
 * ke tiap akun yang cocok, dan yang kodenya benar-benar cocok itulah yang
 * diproses. Percobaan yang gagal pada kandidat LAIN (bukan pemilik kode ini)
 * tidak ikut menambah hitungan attempts miliknya — supaya akun tenant lain
 * yang kebetulan namanya sama tidak ikut kena penalti dari percobaan yang
 * bukan ditujukan untuknya.
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { identifier, otp, newPassword } = req.body;
  if (!identifier || !otp || !newPassword) {
    return res.status(400).json({ message: 'Nama pengguna/surel, kode OTP, dan kata sandi baru wajib diisi.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'Kata sandi minimal 8 karakter.' });
  }

  const id = identifier.toLowerCase().trim();
  const [candidateUsers] = await pool.query(
    `SELECT id FROM users WHERE (username = :id OR email = :id) AND deleted_at IS NULL AND status = 'active'`,
    { id }
  );
  // Pesan galat SAMA seperti "kode salah" di bawah — jangan bedakan "akun tidak ada" dari "kode salah".
  if (candidateUsers.length === 0) {
    return res.status(400).json({ message: 'Kode OTP salah atau sudah kedaluwarsa.' });
  }

  let user = null;
  let record = null;
  for (const candidate of candidateUsers) {
    // eslint-disable-next-line no-await-in-loop
    const [otpRows] = await pool.query(`SELECT * FROM password_reset_otps WHERE user_id = :userId`, { userId: candidate.id });
    if (otpRows[0] && String(otp).trim() === otpRows[0].otp_code) { user = candidate; record = otpRows[0]; break; }
  }

  if (!user) {
    /* Tidak ada kandidat yang kodenya cocok — supaya ini tidak jadi celah
       menebak kode OTP tanpa batas (satu identifier ambigu = beberapa kali
       coba gratis), tetap naikkan attempts SEMUA kandidat yang punya kode
       aktif, seolah masing-masing menerima satu percobaan gagal. */
    for (const candidate of candidateUsers) {
      // eslint-disable-next-line no-await-in-loop
      await pool.query(`UPDATE password_reset_otps SET attempts = attempts + 1 WHERE user_id = :userId`, { userId: candidate.id });
    }
    return res.status(400).json({ message: 'Kode OTP salah.' });
  }

  if (new Date(record.expires_at) < new Date()) {
    await pool.query(`DELETE FROM password_reset_otps WHERE user_id = :userId`, { userId: user.id });
    return res.status(400).json({ message: 'Kode OTP sudah kedaluwarsa. Silakan minta kode baru.' });
  }
  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    await pool.query(`DELETE FROM password_reset_otps WHERE user_id = :userId`, { userId: user.id });
    return res.status(400).json({ message: 'Terlalu banyak percobaan kode yang salah. Silakan minta kode baru.' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  /* token_version dinaikkan supaya sesi yang mungkin sedang aktif di
     perangkat lain (mis. kata sandi bocor, itulah sebabnya direset) langsung
     tidak berlaku — sama seperti alur ganti kata sandi di halaman Profil. */
  await pool.query(
    `UPDATE users SET password_hash = :passwordHash, password_is_set = TRUE, token_version = token_version + 1 WHERE id = :id`,
    { id: user.id, passwordHash }
  );
  await pool.query(`DELETE FROM password_reset_otps WHERE user_id = :userId`, { userId: user.id });
  await logAudit({ userId: user.id, action: 'update', entityType: 'user_password', entityId: user.id, ipAddress: req.ip });

  res.json({ message: 'Kata sandi berhasil diperbarui. Silakan masuk dengan kata sandi baru.' });
});

/**
 * POST /api/auth/signup — pendaftaran MANDIRI perusahaan baru. TANPA AUTH.
 *
 * ============================================================================
 *  "Kode Perusahaan" (`companyCode`, mis. "RMS") diisi SENDIRI oleh pendaftar
 *  dan langsung jadi `tenants.slug` — bukan lagi diturunkan otomatis dari
 *  nama perusahaan. Dua konsekuensinya:
 *   1. Nama pengguna administrator otomatis diberi awalan kode ini
 *      ("administrator" -> "rms-administrator") — supaya identitas pengguna
 *      langsung terlihat milik tenant mana pun di layar lintas-tenant
 *      (mis. platformController.searchUsers/listTenants).
 *   2. Kode ini yang dipakai halaman masuk khusus tenant (`/rms/login`, lihat
 *      catatan di App.jsx) — jadi divalidasi lebih ketat daripada slug
 *      auto-generate dulu: format & kata-terlarangnya lihat utils/tenantSlug.js.
 *      Sengaja TIDAK ada auto-suffix angka saat bentrok (beda dari perilaku
 *      lama) — kode ini nanti dilihat & dipakai berulang oleh pendaftarnya
 *      sendiri, jadi kalau bentrok harus diberi tahu jelas, bukan diam-diam
 *      diganti jadi "rms-2" tanpa sepengetahuannya.
 * ============================================================================
 *
 * Membuat baris `tenants` (paket Free) SEKALIGUS pengguna administrator
 * pertamanya dalam SATU transaksi — supaya tidak ada tenant yang "yatim"
 * tanpa pengguna kalau prosesnya terhenti di tengah jalan. Username/surel
 * pendaftar tidak perlu dicek unik dulu (beda dari createUser di
 * userController): tenant ini baru saja dibuat, jadi pasti belum ada
 * pengguna lain yang bisa bentrok di dalamnya.
 *
 * Langsung mengembalikan token (bentuk responsnya sama seperti login) supaya
 * pendaftar langsung masuk ke dasbornya sendiri tanpa langkah tambahan.
 */
const signup = asyncHandler(async (req, res) => {
  const { companyName, companyCode, name, email, username, password } = req.body;

  if (!companyName || !String(companyName).trim()) {
    return res.status(400).json({ message: 'Nama perusahaan wajib diisi.' });
  }

  const slug = normalizeSlug(companyCode);
  if (!slug) {
    return res.status(400).json({ message: 'Kode perusahaan wajib diisi.' });
  }
  if (!isValidSlugFormat(slug)) {
    return res.status(400).json({
      message: `Kode perusahaan hanya boleh huruf kecil, angka, dan minus di tengah (bukan di awal/akhir), ${SLUG_MIN}-${SLUG_MAX} karakter.`,
    });
  }
  if (isReservedSlug(slug)) {
    return res.status(400).json({ message: 'Kode perusahaan ini dipakai sistem — silakan pilih kode lain.' });
  }

  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: 'Nama Anda wajib diisi.' });
  }
  if (!email || !String(email).trim()) {
    return res.status(400).json({ message: 'Surel wajib diisi.' });
  }
  if (!username) {
    return res.status(400).json({ message: 'Nama pengguna wajib diisi.' });
  }
  const usernameRaw = String(username).toLowerCase().trim();
  if (!USERNAME_REGEX.test(usernameRaw)) {
    return res.status(400).json({
      message: 'Nama pengguna hanya boleh huruf kecil, angka, garis bawah (_), tanda minus (-), minimal 3 karakter.',
    });
  }
  // Awalan kode perusahaan WAJIB, ditambahkan di sini (bukan dipercaya dari
  // klien) — supaya aturannya tidak bisa dilewati lewat panggilan API langsung.
  const finalUsername = `${slug}-${usernameRaw}`;
  if (finalUsername.length > MAX_USERNAME_LENGTH) {
    return res.status(400).json({ message: 'Kode perusahaan + nama pengguna terlalu panjang. Perpendek salah satunya.' });
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ message: `Kata sandi minimal ${MIN_PASSWORD_LENGTH} karakter.` });
  }

  const [existingSlug] = await pool.query(`SELECT id FROM tenants WHERE slug = :slug LIMIT 1`, { slug });
  if (existingSlug.length > 0) {
    return res.status(409).json({ message: 'Kode perusahaan ini sudah dipakai. Silakan pilih kode lain.' });
  }

  const trimmedCompanyName = companyName.trim();
  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const passwordHash = await bcrypt.hash(password, 10);
  const roleId = await resolveRoleId(true); // administrator — pendaftar selalu jadi admin pertama tenant-nya sendiri

  const conn = await pool.getConnection();
  let tenantId, userId;
  try {
    await conn.beginTransaction();

    let tenantResult;
    try {
      tenantResult = (await conn.query(
        /* status='active' langsung (bukan 'trial') karena paket Free (lihat
           config/plans.js) tidak berbatas waktu — tidak ada apa pun yang
           "kedaluwarsa" untuk didudukkan sebagai masa percobaan. 'trial'
           tetap ada di enum untuk dipakai nanti kalau paket BERBAYAR
           menawarkan masa coba gratis. */
        `INSERT INTO tenants (slug, company_name, status, plan) VALUES (:slug, :companyName, 'active', 'free') RETURNING id`,
        { slug, companyName: trimmedCompanyName }
      ))[0];
    } catch (err) {
      // Balapan langka dengan pendaftar lain yang kebetulan pakai kode sama
      // persis di antara pengecekan di atas dan INSERT ini — pesannya sama
      // seperti pengecekan awal, BUKAN retry-suffix diam-diam (lihat komentar
      // di atas fungsi ini).
      // '23505' = unique_violation, kode SQLSTATE PostgreSQL untuk bentrok
      // UNIQUE/PRIMARY KEY — padanan 'ER_DUP_ENTRY' mysql2 yang dipakai di sini sebelumnya.
      if (err.code === '23505') {
        const conflict = new Error('Kode perusahaan ini sudah dipakai. Silakan pilih kode lain.');
        conflict.statusCode = 409;
        throw conflict;
      }
      throw err;
    }
    tenantId = tenantResult.insertId;

    const [userResult] = await conn.query(
      `INSERT INTO users (tenant_id, username, role_id, name, email, password_hash, status)
       VALUES (:tenantId, :username, :roleId, :name, :email, :passwordHash, 'active')
       RETURNING id`,
      { tenantId, username: finalUsername, roleId, name: trimmedName, email: trimmedEmail, passwordHash }
    );
    userId = userResult.insertId;

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err.statusCode === 409) {
      return res.status(409).json({ message: err.message });
    }
    throw err;
  } finally {
    conn.release();
  }

  /* Administrator tetap diberi baris izin penuh supaya matriksnya di menu
     Manajemen Pengguna memperlihatkan keadaan sebenarnya — sama seperti
     createUser di userController, meski penegakannya lewat jalur khusus di
     middleware (role admin selalu full access, lihat loadPermissions).
     Hasilnya tidak perlu ditampung -- baru relevan ditampilkan setelah
     verifikasi (lihat verifySignupEmail), bukan di respons signup ini. */
  await writePermissions(userId, fullAccess());

  // Best-effort — tenant SUDAH punya tenants.plan='free' dari INSERT di atas
  // (transaksinya sendiri sudah commit), jadi baris subscriptions ini murni
  // supaya riwayat langganannya lengkap sejak hari pertama (rule "user baru
  // selalu Free, tercatat di subscription history"), bukan syarat mutlak
  // pendaftaran berhasil.
  try {
    await activateSubscription({ tenantId, planId: 'free', createdBy: userId });
  } catch (err) {
    console.error('Gagal mencatat subscription Free awal:', err.message);
  }

  await logAudit({
    userId, tenantId, action: 'create', entityType: 'tenant', entityId: tenantId,
    newValues: { companyName: trimmedCompanyName, slug, adminUsername: finalUsername },
    ipAddress: req.ip,
  });

  /* Belum bisa langsung masuk -- users.email_verified_at baru terisi setelah
     kode OTP di bawah ini diverifikasi (lihat verifySignupEmail). Tautan
     "selamat datang" (sendTenantWelcome, dengan tautan masuk khusus tenant
     ini) baru dikirim SETELAH verifikasi berhasil -- mengirimkannya sekarang
     percuma, tautannya belum bisa dipakai masuk sama sekali. */
  const otp = String(Math.floor(100000 + Math.random() * 900000)); // 6 digit
  const expiresAt = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000);
  await pool.query(
    `INSERT INTO signup_verification_otps (user_id, otp_code, attempts, expires_at) VALUES (:userId, :otp, 0, :expiresAt)`,
    { userId, otp, expiresAt }
  );

  // Beda dari surel best-effort lain di tempat ini: TANPA surel ini pendaftar
  // tidak punya cara sama sekali untuk memverifikasi akunnya, jadi kegagalan
  // kirim WAJIB diberi tahu jelas ke pendaftar (bukan diam-diam ditelan) --
  // dia masih bisa minta kode baru lewat resendSignupVerification begitu
  // SMTP-nya pulih, tanpa perlu mendaftar ulang dari awal.
  let emailSent = true;
  try {
    await sendSignupVerificationOtp({
      to: trimmedEmail, otp, expiresInMinutes: OTP_EXPIRES_MINUTES, companyName: trimmedCompanyName,
    });
  } catch (err) {
    console.error('Gagal mengirim surel verifikasi pendaftaran:', err.message);
    emailSent = false;
  }

  res.status(201).json({
    tenantSlug: slug,
    identifier: finalUsername,
    needsVerification: true,
    message: emailSent
      ? `Kode verifikasi telah dikirim ke ${trimmedEmail}. Masukkan kodenya untuk mengaktifkan akun Anda.`
      : `Pendaftaran berhasil, tapi pengiriman surel kode verifikasi gagal. Coba minta kode baru dari layar verifikasi begitu siap.`,
  });
});

/**
 * POST /api/auth/verify-signup-email — { identifier, otp } — TANPA AUTH.
 * Menyelesaikan gerbang verifikasi surel signup(): cocokkan kode OTP, tandai
 * `email_verified_at`, baru kirim surel selamat datang (tautan masuknya baru
 * sekarang benar-benar bisa dipakai), dan langsung balas token seperti login
 * — sama seperti resetPassword, supaya pendaftar langsung masuk ke dasbornya
 * tanpa langkah tambahan begitu berhasil verifikasi.
 *
 * Pola pencocokan & pembatasan percobaannya sama persis seperti resetPassword
 * di atas (baca catatan di sana) — hanya tabel OTP dan efek akhirnya beda.
 */
const verifySignupEmail = asyncHandler(async (req, res) => {
  const { identifier, otp } = req.body;
  if (!identifier || !otp) {
    return res.status(400).json({ message: 'Nama pengguna/surel dan kode OTP wajib diisi.' });
  }

  const id = identifier.toLowerCase().trim();
  const [candidateUsers] = await pool.query(
    `SELECT id, tenant_id, username, name, email FROM users
     WHERE (username = :id OR email = :id) AND deleted_at IS NULL AND email_verified_at IS NULL`,
    { id }
  );
  if (candidateUsers.length === 0) {
    return res.status(400).json({ message: 'Kode OTP salah atau sudah kedaluwarsa.' });
  }

  let user = null;
  let record = null;
  for (const candidate of candidateUsers) {
    // eslint-disable-next-line no-await-in-loop
    const [otpRows] = await pool.query(`SELECT * FROM signup_verification_otps WHERE user_id = :userId`, { userId: candidate.id });
    if (otpRows[0] && String(otp).trim() === otpRows[0].otp_code) { user = candidate; record = otpRows[0]; break; }
  }

  if (!user) {
    for (const candidate of candidateUsers) {
      // eslint-disable-next-line no-await-in-loop
      await pool.query(`UPDATE signup_verification_otps SET attempts = attempts + 1 WHERE user_id = :userId`, { userId: candidate.id });
    }
    return res.status(400).json({ message: 'Kode OTP salah.' });
  }

  if (new Date(record.expires_at) < new Date()) {
    await pool.query(`DELETE FROM signup_verification_otps WHERE user_id = :userId`, { userId: user.id });
    return res.status(400).json({ message: 'Kode OTP sudah kedaluwarsa. Silakan minta kode baru.' });
  }
  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    await pool.query(`DELETE FROM signup_verification_otps WHERE user_id = :userId`, { userId: user.id });
    return res.status(400).json({ message: 'Terlalu banyak percobaan kode yang salah. Silakan minta kode baru.' });
  }

  await pool.query(`UPDATE users SET email_verified_at = NOW() WHERE id = :id`, { id: user.id });
  await pool.query(`DELETE FROM signup_verification_otps WHERE user_id = :userId`, { userId: user.id });
  await logAudit({ userId: user.id, tenantId: user.tenant_id, action: 'update', entityType: 'user_email_verified', entityId: user.id, ipAddress: req.ip });

  const [[tenantRow]] = await pool.query(`SELECT slug, company_name AS "companyName" FROM tenants WHERE id = :tenantId`, { tenantId: user.tenant_id });

  // Surel selamat datang best-effort seperti biasa -- gagal kirim di sini
  // tidak menghalangi verifikasi yang sudah berhasil dari tetap dianggap sah.
  try {
    const baseUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    await sendTenantWelcome({
      to: user.email, name: user.name, companyName: tenantRow.companyName, username: user.username,
      loginUrl: `${baseUrl}/${tenantRow.slug}/login`,
    });
  } catch (err) {
    console.error('Gagal mengirim surel selamat datang tenant baru:', err.message);
  }

  // Pendaftar signup() SELALU jadi admin pertama tenant-nya sendiri (lihat
  // catatan di atas signup) -- tidak perlu query ulang role_id/permissions,
  // sama seperti respons signup() yang lama sebelum gerbang verifikasi ini ada.
  const token = signToken({
    id: user.id, tenant_id: user.tenant_id, username: user.username,
    name: user.name, email: user.email, role: 'admin', token_version: 1,
  });

  res.json({
    token,
    tenantSlug: tenantRow.slug,
    user: {
      id: user.id, tenantId: user.tenant_id, username: user.username, name: user.name,
      email: user.email, role: 'admin', permissions: fullAccess(),
    },
  });
});

/**
 * POST /api/auth/resend-signup-verification — { identifier } — TANPA AUTH.
 * Sama persis polanya seperti forgotPassword: balasan generik entah akunnya
 * ditemukan atau tidak (dan entah sudah terverifikasi atau tidak), supaya
 * endpoint ini tidak bisa dipakai menebak akun mana yang terdaftar/belum
 * diverifikasi.
 */
const resendSignupVerification = asyncHandler(async (req, res) => {
  const { identifier } = req.body;
  const genericMessage = 'Kalau akun dengan nama pengguna/surel itu terdaftar dan belum diverifikasi, kode verifikasi baru telah dikirim ke surel yang terdaftar di akun tersebut.';

  if (!identifier) {
    return res.status(400).json({ message: 'Nama pengguna atau surel wajib diisi.' });
  }

  const id = identifier.toLowerCase().trim();
  const [candidates] = await pool.query(
    `SELECT u.id, u.email, t.company_name AS "companyName" FROM users u JOIN tenants t ON t.id = u.tenant_id
     WHERE (u.username = :id OR u.email = :id) AND u.deleted_at IS NULL AND u.email_verified_at IS NULL`,
    { id }
  );

  for (const user of candidates) {
    const otp = String(Math.floor(100000 + Math.random() * 900000)); // 6 digit
    const expiresAt = new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000);

    // eslint-disable-next-line no-await-in-loop
    await pool.query(
      `INSERT INTO signup_verification_otps (user_id, otp_code, attempts, expires_at)
       VALUES (:userId, :otp, 0, :expiresAt)
       ON CONFLICT (user_id) DO UPDATE SET otp_code = :otp, attempts = 0, expires_at = :expiresAt`,
      { userId: user.id, otp, expiresAt }
    );

    try {
      // eslint-disable-next-line no-await-in-loop
      await sendSignupVerificationOtp({ to: user.email, otp, expiresInMinutes: OTP_EXPIRES_MINUTES, companyName: user.companyName });
    } catch (err) {
      console.error('Gagal mengirim ulang surel verifikasi pendaftaran:', err.message);
    }
  }

  res.json({ message: genericMessage });
});

/** Nama pengguna awal dari bagian sebelum "@" surel Google — dibersihkan
    supaya cocok USERNAME_REGEX (huruf kecil/angka/_/- saja, minimal 3
    karakter). Awalan kode perusahaan tetap ditambahkan di pemanggilnya,
    sama seperti signup() biasa. */
function usernameFromEmail(email) {
  const local = String(email).split('@')[0].toLowerCase();
  const cleaned = local.replace(/[^a-z0-9_-]/g, '');
  return cleaned.length >= 3 ? cleaned : `pengguna${Date.now().toString().slice(-6)}`;
}

/**
 * POST /api/auth/google-login — { credential, slug? } — TANPA AUTH.
 *
 * `credential` = ID token JWT dari Google Identity Services (frontend) —
 * diverifikasi lewat verifyGoogleCredential(), TIDAK PERNAH dipercaya
 * mentah-mentah. Pola pencarian tenant sama seperti login() biasa (lihat
 * catatan di atasnya): dengan `slug` dicari khusus di tenant itu saja,
 * tanpa slug dicoba di semua tenant.
 *
 * Beda dari login() lewat kata sandi: di sini tidak ada kata sandi untuk
 * membedakan akun mana yang dimaksud kalau surelnya kebetulan terdaftar di
 * BEBERAPA tenant sekaligus — makanya kalau itu terjadi di halaman Masuk
 * UNIVERSAL (tanpa slug), pengguna diminta memakai tautan masuk khusus
 * perusahaannya (code MULTIPLE_TENANTS), bukan ditebak asal pilih salah satu.
 *
 * Akun yang match lewat surel (belum pernah pakai Google sebelumnya)
 * OTOMATIS ditautkan (google_id diisi) saat itu juga — supaya pengguna lama
 * yang sudah punya akun kata sandi tidak perlu langkah "hubungkan akun"
 * terpisah, cukup langsung tekan tombol Google dan surelnya cocok.
 */
const googleLogin = asyncHandler(async (req, res) => {
  const { credential, slug } = req.body;
  if (!credential) {
    return res.status(400).json({ message: 'Token Google wajib diisi.' });
  }

  let profile;
  try {
    profile = await verifyGoogleCredential(credential);
  } catch (err) {
    return res.status(401).json({ message: 'Verifikasi akun Google gagal. Coba lagi.' });
  }

  let tenantId = null;
  if (slug) {
    const [[tenant]] = await pool.query(`SELECT id FROM tenants WHERE slug = :slug LIMIT 1`, { slug: normalizeSlug(slug) });
    if (!tenant) {
      return res.status(404).json({ message: 'Perusahaan dengan kode ini tidak ditemukan.' });
    }
    tenantId = tenant.id;
  }

  const selectCols = `u.id, u.tenant_id, u.username, u.name, u.email, u.status, u.token_version, u.email_verified_at, r.name AS role,
                      u.login_count AS "loginCount", u.testimonial_status AS "testimonialStatus"`;

  const [byGoogleId] = await pool.query(
    `SELECT ${selectCols} FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.google_id = :googleId AND u.deleted_at IS NULL AND u.status = 'active'
     ${tenantId ? 'AND u.tenant_id = :tenantId' : ''}`,
    tenantId ? { googleId: profile.googleId, tenantId } : { googleId: profile.googleId }
  );

  let user = byGoogleId[0] || null;

  if (!user) {
    const [byEmail] = await pool.query(
      `SELECT ${selectCols} FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.email = :email AND u.google_id IS NULL AND u.deleted_at IS NULL AND u.status = 'active'
       ${tenantId ? 'AND u.tenant_id = :tenantId' : ''}`,
      tenantId ? { email: profile.email, tenantId } : { email: profile.email }
    );

    if (byEmail.length > 1) {
      return res.status(409).json({
        message: 'Surel ini terdaftar di beberapa perusahaan. Masuk lewat tautan khusus perusahaan Anda untuk memilih yang benar.',
        code: 'MULTIPLE_TENANTS',
      });
    }
    if (byEmail.length === 1) {
      [user] = byEmail;
      await pool.query(`UPDATE users SET google_id = :googleId WHERE id = :id`, { googleId: profile.googleId, id: user.id });
    }
  }

  if (!user) {
    return res.status(404).json({
      message: 'Belum ada akun ZASETA dengan surel Google ini.',
      code: 'NO_ACCOUNT_FOUND',
      googleName: profile.name,
      googleEmail: profile.email,
    });
  }

  if (!user.email_verified_at) {
    return res.status(403).json({
      message: 'Surel akun ini belum diverifikasi. Cek kotak masuk Anda, atau minta kode baru.',
      code: 'EMAIL_NOT_VERIFIED',
      identifier: user.username,
    });
  }

  const token = signToken(user);
  // Lihat catatan sama di login() soal kenapa loginCount dihitung di JS,
  // bukan lewat RETURNING banyak kolom di UPDATE ini.
  const loginCount = (user.loginCount || 0) + 1;
  const { testimonialStatus } = user;
  await pool.query(`UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = :id`, { id: user.id });
  await logAudit({ userId: user.id, action: 'login', entityType: 'user', entityId: user.id, ipAddress: req.ip });
  const permissions = await loadPermissions(user);

  res.json({
    token,
    user: {
      id: user.id, tenantId: user.tenant_id, username: user.username, name: user.name,
      email: user.email, role: user.role, permissions,
      loginCount, testimonialStatus,
    },
  });
});

/**
 * POST /api/auth/google-signup — { credential, companyName, companyCode } — TANPA AUTH.
 *
 * Padanan signup() untuk pendaftar yang memilih "Daftar dengan Google" —
 * nama & surel DIAMBIL DARI TOKEN GOOGLE YANG SUDAH DIVERIFIKASI (bukan dari
 * body permintaan, supaya tidak bisa dipalsukan lewat panggilan API
 * langsung), dan karena Google sendiri sudah memverifikasi surel itu,
 * TIDAK PERLU lagi gerbang kode OTP seperti signup() biasa —
 * email_verified_at langsung diisi NOW() dan tokennya langsung dikembalikan,
 * sama seperti hasil akhir verifySignupEmail().
 *
 * Nama pengguna diturunkan dari bagian sebelum "@" surelnya (lihat
 * usernameFromEmail) karena tidak ada langkah mengetik nama pengguna sendiri
 * di alur ini — tetap diberi awalan kode perusahaan seperti biasa.
 *
 * password_hash tabel users NOT NULL, jadi diisi hash acak yang TIDAK PERNAH
 * diketahui/dipakai siapa pun — akun ini hanya bisa masuk lewat Google
 * sampai pemiliknya sendiri mengatur kata sandi lewat "Lupa Kata Sandi".
 */
const googleSignup = asyncHandler(async (req, res) => {
  const { credential, companyName, companyCode } = req.body;
  if (!credential) {
    return res.status(400).json({ message: 'Token Google wajib diisi.' });
  }

  let profile;
  try {
    profile = await verifyGoogleCredential(credential);
  } catch (err) {
    return res.status(401).json({ message: 'Verifikasi akun Google gagal. Coba lagi.' });
  }

  if (!companyName || !String(companyName).trim()) {
    return res.status(400).json({ message: 'Nama perusahaan wajib diisi.' });
  }
  const slug = normalizeSlug(companyCode);
  if (!slug) {
    return res.status(400).json({ message: 'Kode perusahaan wajib diisi.' });
  }
  if (!isValidSlugFormat(slug)) {
    return res.status(400).json({
      message: `Kode perusahaan hanya boleh huruf kecil, angka, dan minus di tengah (bukan di awal/akhir), ${SLUG_MIN}-${SLUG_MAX} karakter.`,
    });
  }
  if (isReservedSlug(slug)) {
    return res.status(400).json({ message: 'Kode perusahaan ini dipakai sistem — silakan pilih kode lain.' });
  }

  const [existingSlug] = await pool.query(`SELECT id FROM tenants WHERE slug = :slug LIMIT 1`, { slug });
  if (existingSlug.length > 0) {
    return res.status(409).json({ message: 'Kode perusahaan ini sudah dipakai. Silakan pilih kode lain.' });
  }

  // Surel Google ini boleh jadi sudah terdaftar di tenant lain (lewat kata
  // sandi biasa ATAU Google) — bukan alasan menolak (satu akun Google boleh
  // dipakai di beberapa tenant, lihat catatan migration_add_google_oauth.sql),
  // jadi TIDAK ada pengecekan surel di sini, sama seperti signup() biasa.

  const trimmedCompanyName = companyName.trim();
  const finalUsername = `${slug}-${usernameFromEmail(profile.email)}`;
  if (finalUsername.length > MAX_USERNAME_LENGTH) {
    return res.status(400).json({ message: 'Kode perusahaan terlalu panjang digabung dengan surel Anda. Coba kode yang lebih pendek.' });
  }
  const passwordHash = await bcrypt.hash(crypto.randomUUID(), 10); // tidak pernah dipakai — lihat catatan di atas
  const roleId = await resolveRoleId(true);

  const conn = await pool.getConnection();
  let tenantId, userId;
  try {
    await conn.beginTransaction();

    let tenantResult;
    try {
      tenantResult = (await conn.query(
        `INSERT INTO tenants (slug, company_name, status, plan) VALUES (:slug, :companyName, 'active', 'free') RETURNING id`,
        { slug, companyName: trimmedCompanyName }
      ))[0];
    } catch (err) {
      if (err.code === '23505') {
        const conflict = new Error('Kode perusahaan ini sudah dipakai. Silakan pilih kode lain.');
        conflict.statusCode = 409;
        throw conflict;
      }
      throw err;
    }
    tenantId = tenantResult.insertId;

    const [userResult] = await conn.query(
      `INSERT INTO users (tenant_id, username, role_id, name, email, password_hash, password_is_set, google_id, status, email_verified_at)
       VALUES (:tenantId, :username, :roleId, :name, :email, :passwordHash, FALSE, :googleId, 'active', NOW())
       RETURNING id`,
      { tenantId, username: finalUsername, roleId, name: profile.name, email: profile.email, passwordHash, googleId: profile.googleId }
    );
    userId = userResult.insertId;

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (err.statusCode === 409) {
      return res.status(409).json({ message: err.message });
    }
    throw err;
  } finally {
    conn.release();
  }

  await writePermissions(userId, fullAccess());

  try {
    await activateSubscription({ tenantId, planId: 'free', createdBy: userId });
  } catch (err) {
    console.error('Gagal mencatat subscription Free awal:', err.message);
  }

  await logAudit({
    userId, tenantId, action: 'create', entityType: 'tenant', entityId: tenantId,
    newValues: { companyName: trimmedCompanyName, slug, adminUsername: finalUsername, via: 'google' },
    ipAddress: req.ip,
  });

  try {
    const baseUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    await sendTenantWelcome({
      to: profile.email, name: profile.name, companyName: trimmedCompanyName, username: finalUsername,
      loginUrl: `${baseUrl}/${slug}/login`,
    });
  } catch (err) {
    console.error('Gagal mengirim surel selamat datang tenant baru (Google):', err.message);
  }

  const token = signToken({
    id: userId, tenant_id: tenantId, username: finalUsername,
    name: profile.name, email: profile.email, role: 'admin', token_version: 1,
  });

  res.status(201).json({
    token,
    tenantSlug: slug,
    user: {
      id: userId, tenantId, username: finalUsername, name: profile.name,
      email: profile.email, role: 'admin', permissions: fullAccess(),
    },
  });
});

module.exports = {
  login, me, forgotPassword, resetPassword, signup, verifySignupEmail, resendSignupVerification,
  googleLogin, googleSignup,
};
