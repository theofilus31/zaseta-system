-- =====================================================================
--  Izin per-pengguna per-menu
-- =====================================================================
--  Menggantikan kontrol akses yang sebelumnya hanya bersandar pada nama
--  peran (admin / it_staff / viewer). Sekarang setiap pengguna bisa
--  ditentukan sendiri: menu mana yang boleh dibuka, dan di menu itu boleh
--  melihat saja atau juga menambah / mengubah / menghapus.
--
--  Peran TIDAK dihapus — masih dipakai sebagai label dan sebagai preset
--  pengisi cepat matriks izin. Khusus peran `admin`, aksesnya tetap penuh
--  dan tidak dibatasi tabel ini (lihat middleware/auth.js): kalau akses
--  administrator ikut bergantung pada centang di sini, satu kesalahan bisa
--  mengunci semua orang keluar dari menu Manajemen Pengguna tanpa ada cara
--  memperbaikinya dari dalam aplikasi.
--
--  Aman dijalankan pada database berisi data, DAN aman dijalankan berulang:
--  seluruh pengguna lama otomatis diisikan izin yang setara dengan peran yang
--  mereka pegang sekarang, tapi HANYA kalau mereka belum punya izin sama
--  sekali. Pengguna yang izinnya sudah disesuaikan tidak akan tersentuh —
--  tanpa penjaga itu, menjalankan ulang migrasi ini akan mengembalikan akses
--  yang sudah sengaja dicabut.
--
--  Jalankan:
--    mysql -u <user> -p it_asset_inventory < backend/migrations/migration_add_user_permissions.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS user_permissions (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id      BIGINT UNSIGNED NOT NULL,
    module_key   VARCHAR(50) NOT NULL,   -- lihat backend/src/config/modules.js
    can_view     BOOLEAN NOT NULL DEFAULT FALSE,
    can_create   BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit     BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_userperm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_user_module (user_id, module_key),
    INDEX idx_userperm_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Backfill: samakan izin pengguna lama dengan peran yang sedang dipegang
-- ---------------------------------------------------------------------
-- Peran admin tidak perlu di-backfill (aksesnya penuh lewat middleware),
-- tapi tetap diisi agar matriks di layar memperlihatkan keadaan sebenarnya.

-- admin -> seluruh modul, seluruh aksi
INSERT INTO user_permissions (user_id, module_key, can_view, can_create, can_edit, can_delete)
SELECT u.id, m.module_key, TRUE, m.allow_write, m.allow_write, m.allow_write
FROM users u
JOIN roles r ON r.id = u.role_id
JOIN (
    SELECT 'dashboard'     AS module_key, FALSE AS allow_write
    UNION ALL SELECT 'assets',        TRUE
    UNION ALL SELECT 'barcode',       FALSE
    UNION ALL SELECT 'categories',    TRUE
    UNION ALL SELECT 'asset_types',   TRUE
    UNION ALL SELECT 'locations',     TRUE
    UNION ALL SELECT 'custom_fields', TRUE
    UNION ALL SELECT 'users',         TRUE
    UNION ALL SELECT 'audit_logs',    FALSE
) m
WHERE r.name = 'admin' AND u.deleted_at IS NULL
  /* Hanya pengguna yang belum punya izin sama sekali. Tanpa penjaga ini,
     menjalankan ulang migrasi akan mengembalikan akses yang sudah sengaja
     dicabut administrator lewat menu Manajemen Pengguna. */
  AND NOT EXISTS (SELECT 1 FROM user_permissions p WHERE p.user_id = u.id);

-- it_staff -> operasional penuh kecuali hapus; master data hanya lihat
INSERT INTO user_permissions (user_id, module_key, can_view, can_create, can_edit, can_delete)
SELECT u.id, m.module_key, TRUE, m.c, m.e, FALSE
FROM users u
JOIN roles r ON r.id = u.role_id
JOIN (
    SELECT 'dashboard'     AS module_key, FALSE AS c, FALSE AS e
    UNION ALL SELECT 'assets',        TRUE,  TRUE
    UNION ALL SELECT 'barcode',       FALSE, FALSE
    UNION ALL SELECT 'categories',    FALSE, FALSE
    UNION ALL SELECT 'asset_types',   FALSE, FALSE
    UNION ALL SELECT 'locations',     FALSE, FALSE
    UNION ALL SELECT 'custom_fields', FALSE, FALSE
) m
WHERE r.name = 'it_staff' AND u.deleted_at IS NULL
  /* Hanya pengguna yang belum punya izin sama sekali. Tanpa penjaga ini,
     menjalankan ulang migrasi akan mengembalikan akses yang sudah sengaja
     dicabut administrator lewat menu Manajemen Pengguna. */
  AND NOT EXISTS (SELECT 1 FROM user_permissions p WHERE p.user_id = u.id);

-- viewer -> hanya melihat dasbor, daftar aset, dan cetak label
INSERT INTO user_permissions (user_id, module_key, can_view, can_create, can_edit, can_delete)
SELECT u.id, m.module_key, TRUE, FALSE, FALSE, FALSE
FROM users u
JOIN roles r ON r.id = u.role_id
JOIN (
    SELECT 'dashboard' AS module_key
    UNION ALL SELECT 'assets'
    UNION ALL SELECT 'barcode'
) m
WHERE r.name = 'viewer' AND u.deleted_at IS NULL
  /* Hanya pengguna yang belum punya izin sama sekali. Tanpa penjaga ini,
     menjalankan ulang migrasi akan mengembalikan akses yang sudah sengaja
     dicabut administrator lewat menu Manajemen Pengguna. */
  AND NOT EXISTS (SELECT 1 FROM user_permissions p WHERE p.user_id = u.id);
