-- =====================================================================
-- Migrasi: Menambahkan info penjualan aset (tanggal jual & harga jual)
--   mysql -u <user> -p it_asset_inventory < migration_add_asset_sold_info.sql
-- =====================================================================

ALTER TABLE assets
    ADD COLUMN sold_date  DATE NULL AFTER purchase_price,
    ADD COLUMN sold_price DECIMAL(15,2) NULL AFTER sold_date;
