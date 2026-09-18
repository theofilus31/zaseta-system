-- =====================================================================
-- Migrasi: Fase 1 SaaS — fondasi multi-tenant
-- =====================================================================
--  Sistem ini sebelumnya dibangun untuk SATU perusahaan saja — tidak ada
--  konsep "tenant" di mana pun, dan constraint unik (username, kode aset,
--  slug kategori, dst.) berlaku GLOBAL. Migrasi ini menambahkan tabel
--  `tenants` + kolom `tenant_id` ke tabel-tabel yang datanya memang milik
--  satu perusahaan tertentu, dan mengubah constraint unik yang tadinya
--  global jadi unik PER TENANT.
--
--  Seluruh data yang SUDAH ADA (perusahaan yang sedang dipakai sekarang)
--  otomatis jadi "Tenant #1" (slug 'default') — tidak ada data yang hilang
--  atau perlu dipindah manual.
--
--  Tabel yang SENGAJA TIDAK diberi tenant_id langsung (cukup lewat induknya):
--  asset_assignments, asset_attachments, asset_custom_field_values, qr_codes,
--  asset_status_histories, user_permissions, stock_opname_items,
--  consumable_transactions, chat_conversations, chat_messages,
--  email_change_otps, password_reset_otps — semua selalu diakses lewat ID
--  induknya (asset_id/user_id/dst.) yang sudah tenant-scoped, jadi kolom
--  langsung di sini hanya menambah kerumitan tanpa manfaat isolasi tambahan.
--  `roles` juga sengaja tetap global — cuma label peran ('admin'/'it_staff'),
--  bukan data milik tenant tertentu.
--
--  Jalankan: mysql -u <user> -p it_asset_inventory < migration_saas_multitenancy_phase1.sql
--  WAJIB backup database dulu sebelum menjalankan ini di data yang sudah berisi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABEL TENANTS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    slug            VARCHAR(63) NOT NULL UNIQUE,   -- dipakai di subdomain: {slug}.namaapp.com
    company_name    VARCHAR(150) NOT NULL,
    status          ENUM('trial','active','suspended') NOT NULL DEFAULT 'trial',
    plan            VARCHAR(50) NOT NULL DEFAULT 'starter',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Perusahaan yang sudah pakai sistem ini sekarang -> Tenant #1.
INSERT INTO tenants (slug, company_name, status, plan)
SELECT 'default', COALESCE(NULLIF(company_name, ''), 'Perusahaan Anda'), 'active', 'enterprise'
FROM app_settings WHERE id = 1
ON DUPLICATE KEY UPDATE slug = slug;

-- ---------------------------------------------------------------------
-- 2. TAMBAH tenant_id KE TABEL "DATA UTAMA" (yang dilist/difilter sendiri)
--    Pola tiap tabel: tambah kolom (nullable) -> isi semua baris lama ke
--    Tenant #1 -> wajibkan NOT NULL -> pasang FK + index -> perbaiki
--    constraint unik yang tadinya global jadi per-tenant.
-- ---------------------------------------------------------------------

-- users ------------------------------------------------------------
ALTER TABLE users ADD COLUMN tenant_id BIGINT UNSIGNED NULL AFTER id;
UPDATE users SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL;
ALTER TABLE users MODIFY COLUMN tenant_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE users ADD CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE users DROP INDEX username;
ALTER TABLE users DROP INDEX email;
ALTER TABLE users ADD UNIQUE KEY uq_user_tenant_username (tenant_id, username);
ALTER TABLE users ADD UNIQUE KEY uq_user_tenant_email (tenant_id, email);
ALTER TABLE users ADD INDEX idx_user_tenant (tenant_id);

-- asset_categories ("Kode Barang/Aset") ------------------------------
ALTER TABLE asset_categories ADD COLUMN tenant_id BIGINT UNSIGNED NULL AFTER id;
UPDATE asset_categories SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL;
ALTER TABLE asset_categories MODIFY COLUMN tenant_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE asset_categories ADD CONSTRAINT fk_category_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE asset_categories DROP INDEX slug;
ALTER TABLE asset_categories ADD UNIQUE KEY uq_category_tenant_slug (tenant_id, slug);
ALTER TABLE asset_categories ADD INDEX idx_category_tenant (tenant_id);

-- asset_types ("Kategori Aset") --------------------------------------
ALTER TABLE asset_types ADD COLUMN tenant_id BIGINT UNSIGNED NULL AFTER id;
UPDATE asset_types SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL;
ALTER TABLE asset_types MODIFY COLUMN tenant_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE asset_types ADD CONSTRAINT fk_type_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE asset_types DROP INDEX name;
ALTER TABLE asset_types ADD UNIQUE KEY uq_type_tenant_name (tenant_id, name);
ALTER TABLE asset_types ADD INDEX idx_type_tenant (tenant_id);

-- asset_custom_fields -------------------------------------------------
ALTER TABLE asset_custom_fields ADD COLUMN tenant_id BIGINT UNSIGNED NULL AFTER id;
UPDATE asset_custom_fields SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL;
ALTER TABLE asset_custom_fields MODIFY COLUMN tenant_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE asset_custom_fields ADD CONSTRAINT fk_customfield_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE asset_custom_fields DROP INDEX uq_field_per_category;
ALTER TABLE asset_custom_fields ADD UNIQUE KEY uq_field_per_tenant_category (tenant_id, category_id, field_key);
ALTER TABLE asset_custom_fields ADD INDEX idx_customfield_tenant (tenant_id);

-- locations -------------------------------------------------------------
ALTER TABLE locations ADD COLUMN tenant_id BIGINT UNSIGNED NULL AFTER id;
UPDATE locations SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL;
ALTER TABLE locations MODIFY COLUMN tenant_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE locations ADD CONSTRAINT fk_location_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE locations DROP INDEX code;
ALTER TABLE locations ADD UNIQUE KEY uq_location_tenant_code (tenant_id, code);
ALTER TABLE locations ADD INDEX idx_location_tenant (tenant_id);

-- sub_locations -----------------------------------------------------------
-- Constraint unik (location_id, code) TETAP BENAR tanpa perlu diubah karena
-- location_id sendiri sudah tenant-scoped secara transitif — tenant_id di
-- sini ditambahkan HANYA supaya query "semua sub lokasi tenant ini" tidak
-- perlu JOIN ke locations tiap kali.
ALTER TABLE sub_locations ADD COLUMN tenant_id BIGINT UNSIGNED NULL AFTER id;
UPDATE sub_locations SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL;
ALTER TABLE sub_locations MODIFY COLUMN tenant_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE sub_locations ADD CONSTRAINT fk_subloc_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE sub_locations ADD INDEX idx_subloc_tenant (tenant_id);

-- departments -------------------------------------------------------------
ALTER TABLE departments ADD COLUMN tenant_id BIGINT UNSIGNED NULL AFTER id;
UPDATE departments SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL;
ALTER TABLE departments MODIFY COLUMN tenant_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE departments ADD CONSTRAINT fk_department_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE departments DROP INDEX code;
ALTER TABLE departments ADD UNIQUE KEY uq_department_tenant_code (tenant_id, code);
ALTER TABLE departments ADD INDEX idx_department_tenant (tenant_id);

-- assets ------------------------------------------------------------------
ALTER TABLE assets ADD COLUMN tenant_id BIGINT UNSIGNED NULL AFTER id;
UPDATE assets SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL;
ALTER TABLE assets MODIFY COLUMN tenant_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE assets ADD CONSTRAINT fk_asset_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE assets DROP INDEX asset_code;
ALTER TABLE assets DROP INDEX sequence_no;
ALTER TABLE assets ADD UNIQUE KEY uq_asset_tenant_code (tenant_id, asset_code);
ALTER TABLE assets ADD UNIQUE KEY uq_asset_tenant_sequence (tenant_id, sequence_no);
ALTER TABLE assets ADD INDEX idx_asset_tenant (tenant_id);

-- stock_opnames -------------------------------------------------------------
ALTER TABLE stock_opnames ADD COLUMN tenant_id BIGINT UNSIGNED NULL AFTER id;
UPDATE stock_opnames SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL;
ALTER TABLE stock_opnames MODIFY COLUMN tenant_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE stock_opnames ADD CONSTRAINT fk_opname_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE stock_opnames DROP INDEX uq_opname_code;
ALTER TABLE stock_opnames ADD UNIQUE KEY uq_opname_tenant_code (tenant_id, code);
ALTER TABLE stock_opnames ADD INDEX idx_opname_tenant (tenant_id);

-- consumables -------------------------------------------------------------
ALTER TABLE consumables ADD COLUMN tenant_id BIGINT UNSIGNED NULL AFTER id;
UPDATE consumables SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL;
ALTER TABLE consumables MODIFY COLUMN tenant_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE consumables ADD CONSTRAINT fk_consumable_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE consumables DROP INDEX uq_consumable_code;
ALTER TABLE consumables ADD UNIQUE KEY uq_consumable_tenant_code (tenant_id, code);
ALTER TABLE consumables ADD INDEX idx_consumable_tenant (tenant_id);

-- asset_requests -------------------------------------------------------------
ALTER TABLE asset_requests ADD COLUMN tenant_id BIGINT UNSIGNED NULL AFTER id;
UPDATE asset_requests SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL;
ALTER TABLE asset_requests MODIFY COLUMN tenant_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE asset_requests ADD CONSTRAINT fk_request_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE asset_requests DROP INDEX uq_request_no;
ALTER TABLE asset_requests ADD UNIQUE KEY uq_request_tenant_no (tenant_id, request_no);
ALTER TABLE asset_requests ADD INDEX idx_request_tenant (tenant_id);

-- asset_reminders -------------------------------------------------------------
ALTER TABLE asset_reminders ADD COLUMN tenant_id BIGINT UNSIGNED NULL AFTER id;
UPDATE asset_reminders SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL;
ALTER TABLE asset_reminders MODIFY COLUMN tenant_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE asset_reminders ADD CONSTRAINT fk_reminder_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE asset_reminders ADD INDEX idx_reminder_tenant (tenant_id);

-- asset_maintenances -------------------------------------------------------------
ALTER TABLE asset_maintenances ADD COLUMN tenant_id BIGINT UNSIGNED NULL AFTER id;
UPDATE asset_maintenances SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL;
ALTER TABLE asset_maintenances MODIFY COLUMN tenant_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE asset_maintenances ADD CONSTRAINT fk_maintenance_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE asset_maintenances ADD INDEX idx_maintenance_tenant (tenant_id);

-- audit_logs -------------------------------------------------------------
ALTER TABLE audit_logs ADD COLUMN tenant_id BIGINT UNSIGNED NULL AFTER id;
UPDATE audit_logs SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL;
ALTER TABLE audit_logs MODIFY COLUMN tenant_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE audit_logs ADD INDEX idx_audit_tenant (tenant_id);

-- ---------------------------------------------------------------------
-- 3. app_settings — dari SATU baris global (id selalu 1, dijaga CHECK)
--    jadi SATU baris PER TENANT.
-- ---------------------------------------------------------------------
-- MariaDB pakai "DROP CONSTRAINT" untuk CHECK constraint (bukan "DROP CHECK"
-- ala MySQL 8) — server yang dipakai di sini MariaDB 10.4.
ALTER TABLE app_settings DROP CONSTRAINT chk_settings_single_row;
ALTER TABLE app_settings ADD COLUMN tenant_id BIGINT UNSIGNED NULL AFTER id;
UPDATE app_settings SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL;
ALTER TABLE app_settings MODIFY COLUMN tenant_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE app_settings MODIFY COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT;
ALTER TABLE app_settings ADD CONSTRAINT fk_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE app_settings ADD UNIQUE KEY uq_settings_tenant (tenant_id);

