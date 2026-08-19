-- =====================================================================
-- Migrasi: Menambahkan modul Lokasi & Sub Lokasi
-- Jalankan ini di database yang SUDAH ada datanya (tidak menghapus data apa pun)
-- Cara pakai:
--   mysql -u <user> -p it_asset_inventory < migration_add_locations.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS locations (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code            VARCHAR(50) NOT NULL UNIQUE,
    name            VARCHAR(150) NOT NULL,
    description     VARCHAR(255) NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sub_locations (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    location_id     BIGINT UNSIGNED NOT NULL,
    code            VARCHAR(50) NOT NULL,
    name            VARCHAR(150) NOT NULL,
    description     VARCHAR(255) NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_subloc_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
    UNIQUE KEY uq_subloc_code_per_location (location_id, code),
    INDEX idx_subloc_location (location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tambah kolom baru di tabel assets. Kolom `location` (teks bebas) yang lama TIDAK dihapus,
-- supaya data aset lama tetap tersimpan dan bisa ditampilkan sebagai fallback.
ALTER TABLE assets
    ADD COLUMN location_id BIGINT UNSIGNED NULL AFTER location,
    ADD COLUMN sub_location_id BIGINT UNSIGNED NULL AFTER location_id;

ALTER TABLE assets
    ADD CONSTRAINT fk_asset_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_asset_sub_location FOREIGN KEY (sub_location_id) REFERENCES sub_locations(id) ON DELETE SET NULL,
    ADD INDEX idx_asset_location_id (location_id),
    ADD INDEX idx_asset_sub_location_id (sub_location_id);
