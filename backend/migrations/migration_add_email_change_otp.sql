-- =====================================================================
-- Migrasi: Tambah tabel email_change_otps
--   Dipakai untuk fitur "Ganti Email" mandiri oleh user di halaman
--   Profil — sebelum email login berubah, user harus verifikasi OTP
--   yang dikirim ke alamat email baru.
--   Jalankan: mysql -u <user> -p it_asset_inventory < migration_add_email_change_otp.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS email_change_otps (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT UNSIGNED NOT NULL UNIQUE,
    new_email       VARCHAR(150) NOT NULL,
    otp_code        VARCHAR(10) NOT NULL,
    attempts        INT UNSIGNED NOT NULL DEFAULT 0,
    expires_at      TIMESTAMP NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_email_otp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
