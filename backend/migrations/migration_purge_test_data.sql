-- =====================================================================
-- Migrasi (OPSIONAL, DESTRUKTIF): Bersih-bersih data uji coba/testing.
--
-- Beda dengan migration_cleanup_unused_schema.sql (yang mengubah STRUKTUR
-- tabel dan aman untuk instalasi manapun), file ini menghapus DATA spesifik
-- yang teridentifikasi sebagai sisa testing saat audit database kamu:
--
--   1. Aset "TEST1"–"TEST5" dkk (id 14-20) yang SUDAH soft-deleted
--      (deleted_at terisi) — dihapus permanen (hard delete). Ini akan ikut
--      menghapus baris terkait di qr_codes, asset_status_histories, dan
--      asset_custom_field_values lewat ON DELETE CASCADE. Baris di
--      audit_logs TIDAK ikut terhapus (tidak ada FK ke situ) — histori
--      audit tetap utuh untuk jejak, hanya entity_id-nya akan menunjuk ke
--      aset yang sudah tidak ada.
--   2. Lokasi `HO-LWG` (id 1, is_active=0) — kelihatan seperti percobaan
--      awal sebelum `HO-LW` (id 2) dibuat, sama-sama "Head Office Lawang".
--      Hanya dihapus kalau TIDAK ada aset (aktif maupun soft-deleted) yang
--      masih mereferensikannya.
--   3. Custom field `kategori_aset` (id 4, category_id NULL, is_active=0) —
--      field percobaan yang sudah dinonaktifkan dan tidak terpasang ke
--      kategori manapun.
--
-- PENTING — BACA DULU SEBELUM MENJALANKAN:
--   - Ini permanen (hard delete), bukan soft-delete. Backup database dulu.
--   - ID-ID di bawah (14-20, lokasi id 1, custom field id 4) sesuai dump
--     yang diaudit (it_asset_inventory__2_.sql). Cek dulu ID di database
--     kamu SAAT INI masih sama sebelum menjalankan — kalau sudah berubah,
--     sesuaikan filternya.
--   - TIDAK idempotent seperti migration lain — setelah baris-barisnya
--     terhapus, menjalankan ulang file ini tidak akan berbuat apa-apa lagi
--     (aman dijalankan ulang, hanya saja tidak ada efek kedua kalinya).
--
--   mysql -u <user> -p it_asset_inventory < migration_purge_test_data.sql
-- =====================================================================

-- 1. Hard-delete aset testing yang sudah soft-deleted.
DELETE FROM assets
WHERE deleted_at IS NOT NULL
  AND name IN ('TEST1', 'TEST2', 'TEST3', 'TEST4', 'TEST5', 'TEST', 'test12');

-- 2. Hapus lokasi dummy `HO-LWG`, HANYA kalau sudah tidak ada aset yang
-- mereferensikannya sama sekali (termasuk yang soft-deleted, karena FK
-- assets.location_id/origin_location_id masih ON DELETE SET NULL, bukan
-- CASCADE — jadi secara teknis aman, tapi kita tetap jaga-jaga di sini).
DELETE FROM locations
WHERE code = 'HO-LWG'
  AND is_active = 0
  AND NOT EXISTS (
    SELECT 1 FROM assets
    WHERE assets.location_id = locations.id
       OR assets.origin_location_id = locations.id
  );

-- 3. Hapus custom field percobaan yang sudah dinonaktifkan & tidak terpasang
-- ke kategori manapun (category_id NULL berarti field ini belum pernah
-- benar-benar dipasangkan, jadi asset_custom_field_values-nya juga kosong).
DELETE FROM asset_custom_fields
WHERE field_key = 'kategori_aset'
  AND category_id IS NULL
  AND is_active = 0;
