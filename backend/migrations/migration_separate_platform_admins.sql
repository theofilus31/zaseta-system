-- Pisahkan admin platform dari pengguna tenant, demi keamanan.
--
-- SEBELUM migration ini: admin platform adalah baris `users` biasa (wajib
-- attached ke sebuah tenant lewat tenant_id NOT NULL) yang diberi tanda
-- `is_platform_admin = TRUE`, berbagi endpoint login, bentuk JWT, dan alur
-- lupa kata sandi yang SAMA PERSIS dengan pengguna tenant mana pun. Kalau
-- token/kredensial satu tenant bocor, penyerang cuma perlu menemukan baris
-- `users` yang kebetulan diberi flag itu untuk mendapat akses lintas tenant.
--
-- SESUDAH migration ini: admin platform punya tabel sendiri (`platform_admins`,
-- TANPA tenant_id sama sekali -- bukan cuma tenant_id yang dikosongkan),
-- endpoint login sendiri (/api/platform-auth/login, lihat
-- platformAuthController.js), dan bentuk JWT sendiri (`type: 'platform'`,
-- lihat utils/token.js signPlatformToken). authenticate() tenant biasa
-- (middleware/auth.js) menolak token bertipe 'platform', dan sebaliknya.
--
-- audit_logs.tenant_id dilonggarkan jadi NULLABLE + kolom platform_admin_id
-- ditambahkan -- aksi admin platform (kelola tenant, katalog paket, dst.)
-- TIDAK selalu punya satu tenant yang relevan, dan actor-nya sekarang hidup
-- di tabel yang beda dari `users` (lihat catatan panjang di
-- utils/auditLogger.js soal kenapa ini tidak bisa sekadar menaruh id admin
-- platform di kolom user_id yang di-FK ke `users`).

-- =====================================================================
-- 1. TABEL BARU: platform_admins
-- =====================================================================
CREATE TABLE platform_admins (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username        VARCHAR(50) NOT NULL UNIQUE,
    name            VARCHAR(150) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','inactive')),
    token_version   INT NOT NULL DEFAULT 1,
    last_login_at   TIMESTAMP NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at      TIMESTAMP NULL
);
CREATE TRIGGER trg_platform_admins_updated_at BEFORE UPDATE ON platform_admins
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Kode OTP ganti surel admin platform -- padanan email_change_otps punya
-- users, tapi tidak bisa dipakai langsung karena FK-nya ke users(id).
CREATE TABLE platform_admin_email_otps (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    platform_admin_id   BIGINT NOT NULL UNIQUE REFERENCES platform_admins(id) ON DELETE CASCADE,
    new_email           VARCHAR(150) NOT NULL,
    otp_code            VARCHAR(10) NOT NULL,
    attempts            INT NOT NULL DEFAULT 0,
    expires_at          TIMESTAMP NOT NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- 2. audit_logs: tenant_id jadi opsional + kolom actor admin platform
-- =====================================================================
ALTER TABLE audit_logs ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE audit_logs ADD COLUMN platform_admin_id BIGINT NULL REFERENCES platform_admins(id) ON DELETE SET NULL;
CREATE INDEX idx_audit_platform_admin ON audit_logs(platform_admin_id);

-- =====================================================================
-- 3. Migrasi data: baris admin platform lama di `users` -> `platform_admins`
--    (password_hash disalin APA ADANYA supaya kredensial masuknya tidak
--    berubah sama sekali -- yang berubah cuma TABEL tempatnya hidup).
-- =====================================================================
INSERT INTO platform_admins (username, name, email, password_hash, status, token_version, last_login_at, created_at)
SELECT username, name, email, password_hash,
       CASE WHEN status = 'active' THEN 'active' ELSE 'inactive' END,
       token_version, last_login_at, created_at
FROM users
WHERE is_platform_admin = TRUE AND deleted_at IS NULL;

-- =====================================================================
-- 4. Bersihkan jejak admin platform lama di `users` + drop kolom flag-nya
-- =====================================================================
DELETE FROM user_permissions WHERE user_id IN (SELECT id FROM users WHERE is_platform_admin = TRUE);
DELETE FROM users WHERE is_platform_admin = TRUE;
ALTER TABLE users DROP COLUMN is_platform_admin;
