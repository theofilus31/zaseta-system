-- =====================================================================
-- Migrasi: Tambah tabel password_reset_otps
--   Dipakai untuk fitur "Lupa Kata Sandi" di halaman Masuk — sebelum kata
--   sandi diganti, pengguna harus membuktikan kepemilikan akun lewat kode
--   OTP yang dikirim ke alamat surel yang SUDAH terdaftar di akunnya
--   (bukan alamat yang diketik bebas saat itu juga, seperti pola OTP ganti
--   surel yang sudah ada).
--   Jalankan: mysql -u <user> -p it_asset_inventory < migration_add_password_reset_otp.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS password_reset_otps (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT UNSIGNED NOT NULL UNIQUE,
    otp_code        VARCHAR(10) NOT NULL,
    attempts        INT UNSIGNED NOT NULL DEFAULT 0,
    expires_at      TIMESTAMP NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
