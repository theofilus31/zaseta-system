-- =====================================================================
-- Migrasi: Bersih-bersih skema yang tidak pernah dipakai oleh kode aplikasi.
--
-- Kenapa perlu: hasil audit terhadap kode di backend/src menunjukkan hal-hal
-- berikut TIDAK PERNAH direferensikan/dibaca/ditulis oleh controller atau
-- route manapun:
--
--   1. Tabel `asset_assignments` — fitur "siapa/departemen yang memegang
--      aset" pernah direncanakan di schema tapi tidak pernah dibangun
--      endpoint-nya. Tidak ada baris data.
--   2. Tabel `permissions` & `role_permissions` — hak akses yang BENAR-BENAR
--      dipakai aplikasi adalah pengecekan nama role langsung di
--      backend/src/middleware/auth.js (requireRole('admin', 'it_staff'),
--      dst.), bukan baca dari dua tabel ini. `role_permissions` tidak
--      pernah berisi data sama sekali.
--   3. Kolom `assets.location` (VARCHAR, free-text lokasi lama) — sudah
--      ditandai DEPRECATED di schema.sql sejak sebelum modul Lokasi ada,
--      tidak pernah diisi oleh endpoint manapun (yang dipakai sekarang
--      adalah location_id + sub_location_id), dan tidak pernah ditampilkan
--      di frontend. Index idx_asset_location ikut dihapus karena mengindex
--      kolom yang akan dibuang.
--
-- CATATAN: kode backend (backend/src/controllers/assetController.js) SUDAH
-- diupdate untuk berhenti membaca kolom `assets.location` di query
-- listAssets sebelum migrasi ini dijalankan — lihat commit yang menyertai
-- file ini. Jangan jalankan migrasi ini kalau kode backend yang berjalan
-- masih versi lama yang membaca kolom tersebut.
--
-- Aman dijalankan berkali-kali (idempotent) — pakai IF EXISTS di setiap DROP.
--   mysql -u <user> -p it_asset_inventory < migration_cleanup_unused_schema.sql
-- =====================================================================

-- 1 & 2. Drop tabel yang tidak pernah dipakai kode aplikasi.
-- Urutan drop: role_permissions duluan (punya FK ke permissions & roles),
-- baru permissions, baru asset_assignments (independen, FK ke assets & users).
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS asset_assignments;

-- 3. Drop kolom deprecated `location` di tabel assets beserta index-nya.
-- (Sintaks IF EXISTS untuk DROP INDEX/COLUMN didukung MariaDB 10.0.2+ —
-- sesuai versi server di dump kamu, 10.4.32-MariaDB.)
ALTER TABLE assets
  DROP INDEX IF EXISTS idx_asset_location;

ALTER TABLE assets
  DROP COLUMN IF EXISTS location;
