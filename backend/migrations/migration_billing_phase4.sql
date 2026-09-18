-- =====================================================================
-- Migrasi: Fase 4 SaaS — billing (limit paket, permintaan upgrade manual)
-- =====================================================================
--  Belum ada payment gateway sungguhan — paket berbayar diaktifkan lewat
--  transfer manual yang diverifikasi seorang "admin platform" (lihat kolom
--  users.is_platform_admin di bawah), bukan checkout otomatis. Lihat
--  backend/src/config/plans.js untuk daftar paket & limitnya.
--
--  Jalankan: mysql -u <user> -p it_asset_inventory < migration_billing_phase4.sql
--  WAJIB backup database dulu sebelum menjalankan ini di data yang sudah berisi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Selaraskan nilai tenants.plan dengan slug paket baru
-- ---------------------------------------------------------------------
--  Tenant #1 (migrasi Fase 1) diberi plan='enterprise' sebagai penanda
--  "akses penuh tanpa batas" — dengan paket berjenjang sekarang, itu artinya
--  'enterprise_custom' (limit tak terbatas), bukan 'enterprise' biasa
--  (yang sekarang punya limit sungguhan: 20.000 aset / 50 pengguna).
UPDATE tenants SET plan = 'enterprise_custom' WHERE plan = 'enterprise';

ALTER TABLE tenants
    ADD COLUMN plan_expires_at DATETIME NULL AFTER plan;
-- Kosong = tidak ada batas waktu (paket gratis, atau paket berbayar yang
-- belum/tidak pernah diaktifkan lewat alur upgrade). Diisi saat admin
-- platform menyetujui permintaan upgrade (lihat billingController).

-- ---------------------------------------------------------------------
-- 2. Admin platform — SATU-SATUNYA yang boleh menyetujui/menolak
--    permintaan upgrade paket LINTAS TENANT. Bukan Fase 5 (super-admin)
--    penuh — cuma cukup untuk billing, supaya Fase 4 bisa jalan tanpa
--    menunggu panel admin lintas-tenant yang lengkap.
-- ---------------------------------------------------------------------
ALTER TABLE users
    ADD COLUMN is_platform_admin TINYINT(1) NOT NULL DEFAULT 0 AFTER role_id;

-- Tenant #1 ('default') adalah perusahaan yang sesungguhnya menjalankan
-- layanan ini — admin-adminnya otomatis jadi admin platform.
UPDATE users u
JOIN tenants t ON t.id = u.tenant_id
JOIN roles r ON r.id = u.role_id
SET u.is_platform_admin = 1
WHERE t.slug = 'default' AND r.name = 'admin';

-- ---------------------------------------------------------------------
-- 3. Permintaan upgrade paket (manual, sampai payment gateway ada)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plan_upgrade_requests (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id       BIGINT UNSIGNED NOT NULL,
    requested_plan  VARCHAR(50) NOT NULL,
    note            TEXT NULL,
    status          ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    requested_by    BIGINT UNSIGNED NOT NULL,
    reviewed_by     BIGINT UNSIGNED NULL,
    reviewed_at     DATETIME NULL,
    admin_note      TEXT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_upgrade_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_upgrade_requested_by FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_upgrade_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_upgrade_tenant (tenant_id),
    INDEX idx_upgrade_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
