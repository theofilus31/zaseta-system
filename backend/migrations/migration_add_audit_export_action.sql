-- =====================================================================
--  Menambah nilai 'export' ke ENUM audit_logs.action
-- =====================================================================
--  Dibutuhkan oleh fitur "Ekspor CSV" di Daftar Aset
--  (GET /api/assets/export). Mengunduh seluruh register aset adalah aksi
--  yang layak tercatat siapa pelakunya dan kapan — tapi ENUM lama hanya
--  mengenal create/update/delete/scan/login/logout, sehingga baris auditnya
--  akan ditolak database.
--
--  Aman dijalankan pada database yang sudah berisi data: ALTER ini hanya
--  MENAMBAH pilihan baru di akhir ENUM, tidak mengubah atau menghapus nilai
--  yang sudah ada, jadi seluruh baris audit lama tetap utuh.
--
--  Jalankan:
--    mysql -u <user> -p it_asset_inventory < backend/migrations/migration_add_audit_export_action.sql
-- =====================================================================

ALTER TABLE audit_logs
  MODIFY COLUMN action
    ENUM('create','update','delete','scan','login','logout','export') NOT NULL;
