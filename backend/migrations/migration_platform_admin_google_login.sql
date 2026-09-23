-- Tambah login "Masuk dengan Google" untuk admin platform, susulan
-- migration_separate_platform_admins.sql.
--
-- UNIQUE (beda dari users.google_id yang TIDAK unik -- satu akun Google bisa
-- dipakai di banyak tenant sekaligus) karena platform_admins adalah tabel
-- global tunggal tanpa tenant_id -- satu akun Google hanya boleh tertaut ke
-- SATU admin platform.
ALTER TABLE platform_admins ADD COLUMN google_id VARCHAR(255) NULL UNIQUE;
