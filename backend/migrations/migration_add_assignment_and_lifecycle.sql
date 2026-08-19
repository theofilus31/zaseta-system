-- =====================================================================
--  Penugasan Aset (custody) + Data Siklus Hidup (garansi & penyusutan)
-- =====================================================================
--  Dua kemampuan yang ada di hampir semua sistem ITAM tapi belum ada di sini:
--
--  1. PENUGASAN — menjawab "siapa yang sedang memegang aset ini?".
--     Tabel asset_assignments pernah dirancang lalu dibuang lewat
--     migration_cleanup_unused_schema.sql karena endpoint-nya tidak pernah
--     dibangun. Dibangkitkan kembali di sini dengan bentuk yang benar-benar
--     dipakai kode.
--
--     Catatan desain: pemegang dicatat sebagai TEKS, bukan foreign key ke
--     tabel `users`. Alasannya, `users` hanya berisi akun aplikasi
--     (admin/it_staff/viewer) — bukan seluruh karyawan. Memaksa relasi ke
--     sana berarti setiap karyawan penerima laptop harus dibuatkan akun
--     login, yang jelas tidak diinginkan.
--
--  2. SIKLUS HIDUP — kolom untuk garansi dan penyusutan garis lurus.
--     Sistem sudah mencatat harga beli, tapi nilainya tidak pernah menyusut,
--     sehingga laporan nilai aset selalu memakai harga baru meski barangnya
--     sudah dipakai bertahun-tahun.
--
--  Aman dijalankan pada database berisi data — semuanya penambahan, tidak
--  ada kolom/tabel lama yang diubah atau dihapus.
--
--  Jalankan:
--    mysql -u <user> -p it_asset_inventory < backend/migrations/migration_add_assignment_and_lifecycle.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PENUGASAN ASET
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS asset_assignments (
    id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    asset_id          BIGINT UNSIGNED NOT NULL,

    holder_name       VARCHAR(150) NOT NULL,          -- nama karyawan pemegang
    holder_contact    VARCHAR(150) NULL,              -- surel/telepon, opsional
    department        VARCHAR(150) NULL,              -- divisi/bagian

    assigned_at       DATE NOT NULL,
    assigned_by       BIGINT UNSIGNED NULL,           -- akun aplikasi yang mencatat
    assign_note       VARCHAR(500) NULL,

    -- returned_at NULL = penugasan masih aktif (aset sedang dipegang)
    returned_at       DATE NULL,
    returned_by       BIGINT UNSIGNED NULL,
    return_note       VARCHAR(500) NULL,
    return_condition  ENUM('baik','rusak_ringan','rusak_berat') NULL,

    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_assignment_asset       FOREIGN KEY (asset_id)    REFERENCES assets(id) ON DELETE CASCADE,
    CONSTRAINT fk_assignment_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id)  ON DELETE SET NULL,
    CONSTRAINT fk_assignment_returned_by FOREIGN KEY (returned_by) REFERENCES users(id)  ON DELETE SET NULL,

    INDEX idx_assignment_asset (asset_id, returned_at),
    INDEX idx_assignment_holder (holder_name),
    INDEX idx_assignment_active (returned_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Aturan "satu aset hanya boleh punya SATU penugasan aktif" ditegakkan di
-- controller (assignmentController.checkOut), bukan lewat UNIQUE constraint —
-- MySQL/MariaDB memperlakukan setiap NULL sebagai nilai berbeda, sehingga
-- UNIQUE(asset_id, returned_at) justru tidak mencegah dua baris aktif.

-- ---------------------------------------------------------------------
-- 2. GARANSI & PENYUSUTAN
-- ---------------------------------------------------------------------
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS warranty_expiry     DATE NULL              COMMENT 'Tanggal berakhir garansi',
  ADD COLUMN IF NOT EXISTS useful_life_months  SMALLINT UNSIGNED NULL COMMENT 'Masa manfaat dalam bulan, untuk penyusutan garis lurus',
  ADD COLUMN IF NOT EXISTS salvage_value       DECIMAL(15,2) NULL     COMMENT 'Nilai residu di akhir masa manfaat';

ALTER TABLE assets
  ADD INDEX IF NOT EXISTS idx_asset_warranty (warranty_expiry);
