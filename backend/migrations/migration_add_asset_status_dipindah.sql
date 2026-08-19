-- =====================================================================
-- Migrasi: Menambahkan status "dipindah" pada aset.
--
--   Dipakai oleh fitur pindah lokasi massal: saat satu atau beberapa aset
--   dipilih lalu dipindahkan ke lokasi/sub lokasi baru, status aset
--   otomatis berubah menjadi "dipindah" dan location_id/sub_location_id
--   ikut diperbarui — namun id dan asset_code aset TIDAK berubah.
--
--   Jalankan: mysql -u <user> -p it_asset_inventory < migration_add_asset_status_dipindah.sql
-- =====================================================================

ALTER TABLE assets
    MODIFY COLUMN status ENUM('active','in_repair','in_storage','disposed','lost','dipindah') NOT NULL DEFAULT 'active';
