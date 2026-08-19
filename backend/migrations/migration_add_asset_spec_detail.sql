-- =====================================================================
-- Migrasi: Menambahkan kolom Spec Detail (spesifikasi detail) pada aset
--   Bisa diisi teks bebas, termasuk list bernomor (1. ... 2. ... dst)
--   yang nantinya ditampilkan sebagai list menurun di halaman publik.
--   mysql -u <user> -p it_asset_inventory < migration_add_asset_spec_detail.sql
-- =====================================================================

ALTER TABLE assets
    ADD COLUMN spec_detail TEXT NULL AFTER serial_number;
