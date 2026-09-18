-- =====================================================================
-- Migrasi: Fase 4 SaaS — simpan snapshot paket SEBELUM permintaan upgrade
-- =====================================================================
--  Perbaikan atas migration_billing_phase4.sql: listUpgradeRequests semula
--  mengambil "paket sekarang" lewat JOIN langsung ke tenants.plan — begitu
--  sebuah permintaan DISETUJUI (yang mengubah tenants.plan), riwayatnya ikut
--  berubah seolah tenant itu "upgrade dari paket barunya sendiri ke paket
--  barunya sendiri". Kolom ini menyimpan snapshot paket SAAT permintaan
--  dibuat, supaya riwayat tetap benar walau paket tenant sudah berubah lagi.
--
--  Jalankan: mysql -u <user> -p it_asset_inventory < migration_billing_phase4_previous_plan.sql
-- =====================================================================

ALTER TABLE plan_upgrade_requests
    ADD COLUMN previous_plan VARCHAR(50) NULL AFTER requested_plan;

-- Isi data yang sudah ada (kalau ada) dengan tebakan terbaik: paket tenant
-- SAAT INI kalau requestnya masih pending (belum berubah), atau NULL kalau
-- sudah diputuskan (tidak ada cara menebak nilai lamanya lagi — baris lama
-- semacam ini seharusnya cuma data uji, bukan riwayat produksi sungguhan).
UPDATE plan_upgrade_requests r
JOIN tenants t ON t.id = r.tenant_id
SET r.previous_plan = t.plan
WHERE r.status = 'pending';
