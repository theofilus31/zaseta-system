-- =====================================================================
-- Migrasi: Membebaskan nomor urut (sequence_no) aset yang SUDAH TERLANJUR
-- dihapus (soft-delete) sebelum perbaikan ini diterapkan.
--
-- Kenapa perlu: sebelumnya, saat aset dihapus, sequence_no & asset_code-nya
-- tetap tersimpan apa adanya. Karena kolom sequence_no & asset_code punya
-- UNIQUE constraint, nomor itu jadi "terkunci selamanya" walau asetnya
-- sudah tidak tampil di daftar (kelihatan kosong padahal masih terpakai).
--
-- Yang dilakukan migrasi ini untuk tiap aset yang sudah dihapus:
--   1. sequence_no -> NULL (nomornya dibebaskan, bisa dipakai aset baru)
--   2. asset_code  -> ditambah akhiran "-DEL-{id}" (supaya tidak bentrok
--      UNIQUE constraint dengan aset baru yang nanti memakai nomor sama,
--      tapi datanya tetap tersimpan utuh untuk histori/audit)
--
-- Aman dijalankan berkali-kali (idempotent) — hanya menyentuh baris yang
-- deleted_at TERISI dan sequence_no MASIH ada (belum pernah dibebaskan).
--   mysql -u <user> -p it_asset_inventory < migration_release_deleted_sequence_no.sql
-- =====================================================================

UPDATE assets
SET asset_code = CONCAT(asset_code, '-DEL-', id),
    sequence_no = NULL
WHERE deleted_at IS NOT NULL
  AND sequence_no IS NOT NULL;
