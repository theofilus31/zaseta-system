-- =====================================================================
-- Migrasi: Revamp status aset jadi 5 status baru
--   (Dijual, Terjual, Dipindah, Dipakai, Idle) — MENGGANTI TOTAL
--   status lama (Aktif, Diperbaiki, Disimpan, Dibuang, Hilang).
--
--   1. Semua aset dengan status lama (active/in_repair/in_storage/
--      disposed/lost) di-set sementara jadi "idle" — silakan diatur
--      manual satu per satu setelah migrasi lewat menu Edit Aset.
--   2. Tambah kolom sale_value_net (Harga Jual/Net) — diisi manual
--      saat status diubah ke "Dijual".
--   3. Tambah kolom origin_location_id & origin_sub_location_id —
--      dipakai untuk auto-detect saat aset berstatus "Dipindah"
--      dikembalikan ke lokasi/sub lokasi semula (baru saat itu status
--      boleh diubah ke Dipakai/Idle).
--
--   Jalankan: mysql -u <user> -p it_asset_inventory < migration_status_revamp_v2.sql
-- =====================================================================

-- 1. Petakan status lama -> idle (sementara, akan diatur manual satu-satu)
UPDATE assets
SET status = 'idle'
WHERE status IN ('active', 'in_repair', 'in_storage', 'disposed', 'lost');

-- 2. Ganti definisi enum status jadi 5 status baru saja
ALTER TABLE assets
    MODIFY COLUMN status ENUM('dijual','terjual','dipindah','dipakai','idle') NOT NULL DEFAULT 'idle';

-- 3. Field harga jual/net (khusus status "Dijual", terpisah dari sold_price yang dipakai status "Terjual")
ALTER TABLE assets
    ADD COLUMN sale_value_net DECIMAL(15,2) NULL AFTER purchase_price;

-- 4. Lokasi asal (untuk fitur auto-detect kembali ke lokasi semula pada status "Dipindah")
ALTER TABLE assets
    ADD COLUMN origin_location_id BIGINT UNSIGNED NULL AFTER sub_location_id,
    ADD COLUMN origin_sub_location_id BIGINT UNSIGNED NULL AFTER origin_location_id,
    ADD CONSTRAINT fk_asset_origin_location FOREIGN KEY (origin_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_asset_origin_sub_location FOREIGN KEY (origin_sub_location_id) REFERENCES sub_locations(id) ON DELETE SET NULL,
    ADD INDEX idx_asset_origin_location (origin_location_id),
    ADD INDEX idx_asset_origin_sub_location (origin_sub_location_id);
