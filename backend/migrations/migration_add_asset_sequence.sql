-- =====================================================================
-- Migrasi: Menambahkan nomor urut global untuk auto-generate kode aset
-- Jalankan di database yang SUDAH ada datanya (tidak menghapus data apa pun)
--   mysql -u <user> -p it_asset_inventory < migration_add_asset_sequence.sql
-- =====================================================================

ALTER TABLE assets
    ADD COLUMN sequence_no INT UNSIGNED NULL AFTER asset_code,
    ADD UNIQUE INDEX uq_asset_sequence_no (sequence_no);

-- Catatan: aset yang sudah ada sebelumnya akan punya sequence_no = NULL (tidak masalah,
-- MySQL mengizinkan banyak NULL dalam kolom UNIQUE). Aset lama tetap tampil normal,
-- hanya saja nomor urutnya tidak ikut diperhitungkan dalam skema auto-generate baru ini.
