-- =====================================================================
-- Migrasi: Menambahkan fitur "Kategori Aset" dan "Kondisi" pada aset,
--   serta kolom pendukung untuk fitur Import Aset.
--
--   - Tabel BARU: asset_types (Kategori Aset). Ini BEDA dengan tabel
--     asset_categories yang sudah ada (itu adalah "Kode Barang/Aset",
--     dipakai untuk menyusun asset_code). asset_types murni untuk
--     klasifikasi/tampilan aset (mis: Elektronik, Furniture, Kendaraan)
--     dan TIDAK memengaruhi format kode aset.
--   - Kolom BARU pada tabel assets: asset_type_id (FK ke asset_types)
--     dan condition_status (enum: baik / rusak_ringan / rusak_berat).
--
--   Jalankan: mysql -u <user> -p it_asset_inventory < migration_add_asset_type_and_condition.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS asset_types (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(100) NOT NULL UNIQUE,
    description     VARCHAR(255) NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE assets
    ADD COLUMN asset_type_id BIGINT UNSIGNED NULL AFTER category_id,
    ADD COLUMN condition_status ENUM('baik','rusak_ringan','rusak_berat') NOT NULL DEFAULT 'baik' AFTER spec_detail;

ALTER TABLE assets
    ADD CONSTRAINT fk_asset_type FOREIGN KEY (asset_type_id) REFERENCES asset_types(id) ON DELETE SET NULL,
    ADD INDEX idx_asset_type (asset_type_id);
