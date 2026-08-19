-- ============================================================
-- MIGRASI: Tambah kolom username di tabel users
-- ============================================================
-- Jalankan: mysql -u <user> -p it_asset_inventory < migration_add_username.sql

-- Tambah kolom username (NULL dulu agar bisa diisi)
ALTER TABLE users 
    ADD COLUMN username VARCHAR(50) NULL UNIQUE AFTER id;

-- Isi username dari email (ambil bagian sebelum @)
-- Handle duplikat dengan menambahkan angka
SET @row_number = 0;
SET @prev_base = '';

UPDATE users u
JOIN (
    SELECT id, 
           email,
           LOWER(SUBSTRING_INDEX(email, '@', 1)) AS base_username,
           @row_number := IF(@prev_base = LOWER(SUBSTRING_INDEX(email, '@', 1)), 
                             @row_number + 1, 
                             1) AS row_num,
           @prev_base := LOWER(SUBSTRING_INDEX(email, '@', 1))
    FROM users
    ORDER BY LOWER(SUBSTRING_INDEX(email, '@', 1)), id
) AS ranked ON u.id = ranked.id
SET u.username = IF(ranked.row_num = 1, 
                    ranked.base_username, 
                    CONCAT(ranked.base_username, ranked.row_num));

-- Sekarang username sudah terisi semua, ubah jadi NOT NULL
ALTER TABLE users MODIFY COLUMN username VARCHAR(50) NOT NULL;

-- Tambah index untuk performa login
CREATE INDEX idx_username ON users(username);