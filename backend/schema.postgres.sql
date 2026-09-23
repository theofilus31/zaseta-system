-- =====================================================================
-- ZASETA — Asset Inventory System — Database Schema (PostgreSQL 15+)
-- =====================================================================
--  Sumber kebenaran skema mulai sekarang, MENGGANTIKAN `schema.sql` (MySQL/
--  MariaDB) + seluruh `migrations/*.sql`. File-file MySQL lama itu SENGAJA
--  dibiarkan utuh sebagai arsip sejarah proyek, tidak dihapus — tapi tidak
--  lagi dipakai untuk membangun database.
--
--  Ini SATU berkas skema AKHIR (bukan riwayat migrasi bertahap) — dibangun
--  dari `schema.sql` + kelima migrasi terbaru yang belum sempat digabung ke
--  sana (multi-tenancy Fase 1, billing Fase 4 + snapshot previous_plan,
--  password_reset_otps, zecode_chat). Ditulis begini karena instalasi baru
--  selalu mulai dari kosong — tidak ada gunanya mewarisi langkah ALTER
--  bertingkat dari riwayat MySQL-nya (mis. `assets.status` yang nilai
--  ENUM-nya berubah 3 kali sepanjang sejarah proyek).
--
--  Jalankan: psql -U <user> -d <database> -f schema.postgres.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Fungsi bersama: auto-touch kolom updated_at pada setiap UPDATE.
-- Padanan `... ON UPDATE CURRENT_TIMESTAMP` MySQL, yang tidak ada
-- setaranya secara inline di PostgreSQL — satu trigger dipasang ke
-- setiap tabel yang punya kolom updated_at (lihat tiap CREATE TRIGGER
-- di bawah).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 1. ROLES — label & preset, BUKAN penentu akses (lihat catatan di
--    schema.sql lama: hak akses sesungguhnya ada di user_permissions,
--    ditegakkan middleware/auth.js -> requirePermission()). Peran
--    'admin' selalu berakses penuh tanpa melihat tabel izin.
-- =====================================================================
CREATE TABLE roles (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            VARCHAR(50) NOT NULL UNIQUE,
    description     VARCHAR(255) NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER trg_roles_updated_at BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Data wajib — resolveRoleId() di userController.js mencari baris ini
-- lewat NAMA (bukan id tetap), tapi baris itu sendiri harus ada dulu
-- supaya signup/tambah-pengguna pertama tidak gagal.
INSERT INTO roles (name, description) VALUES
    ('admin', 'Akses penuh: kelola aset, kategori, custom field, dan user'),
    ('it_staff', 'Input dan update aset, generate/print QR'),
    ('viewer', 'Akses baca saja ke daftar dan detail aset');

-- =====================================================================
-- 2. TENANTS (Fase 1 SaaS — fondasi multi-tenant)
-- =====================================================================
CREATE TABLE tenants (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug            VARCHAR(63) NOT NULL UNIQUE,   -- kode perusahaan, dipakai di /:slug/login (Fase 5)
    company_name    VARCHAR(150) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'trial'
                        CHECK (status IN ('trial','active','suspended')),
    plan            VARCHAR(50) NOT NULL DEFAULT 'free',
    plan_expires_at TIMESTAMP NULL,                -- kosong = tanpa batas waktu (billing Fase 4)
    billing_cycle   VARCHAR(10) NULL                -- 'monthly'/'yearly' siklus aktif, NULL utk Free — lihat migration_billing_yearly_cycle.sql
                        CHECK (billing_cycle IS NULL OR billing_cycle IN ('monthly', 'yearly')),
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 3. USERS
-- =====================================================================
CREATE TABLE users (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id           BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    username            VARCHAR(50) NOT NULL,
    role_id             BIGINT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    name                VARCHAR(150) NOT NULL,
    email               VARCHAR(150) NOT NULL,
    password_hash       VARCHAR(255) NOT NULL,
    google_id           VARCHAR(255) NULL,  -- klaim "sub" token Google — lihat migration_add_google_oauth.sql
    password_is_set     BOOLEAN NOT NULL DEFAULT TRUE,  -- FALSE = akun daftar via Google, belum punya kata sandi — lihat migration_add_password_is_set.sql
    status              VARCHAR(20) NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','inactive')),
    token_version       INT NOT NULL DEFAULT 1,
    email_verified_at   TIMESTAMP NULL,  -- NULL = belum verifikasi surel (lihat authController.signup/verifySignupEmail).
                                          -- Cuma ditegakkan untuk akun hasil PENDAFTARAN MANDIRI (signup) --
                                          -- akun yang dibuatkan admin (userController.createUser,
                                          -- platformController.createPlatformAdmin) & seed.sql langsung
                                          -- diisi NOW() saat dibuat, tidak pernah perlu verifikasi sendiri.
    last_login_at       TIMESTAMP NULL,
    login_count         INT NOT NULL DEFAULT 0,  -- lihat migration_add_testimonials.sql
    testimonial_status  VARCHAR(20) NOT NULL DEFAULT 'none'
                            CHECK (testimonial_status IN ('none', 'skipped', 'submitted')),
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at          TIMESTAMP NULL,
    CONSTRAINT uq_user_tenant_username UNIQUE (tenant_id, username),
    CONSTRAINT uq_user_tenant_email UNIQUE (tenant_id, email),
    CONSTRAINT uq_user_tenant_google_id UNIQUE (tenant_id, google_id)
);
CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_users_role ON users(role_id);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_username ON users(username);
CREATE INDEX idx_user_tenant ON users(tenant_id);
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 4. ASSET CATEGORIES ("Kode Barang/Aset")
-- =====================================================================
CREATE TABLE asset_categories (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    parent_id       BIGINT NULL REFERENCES asset_categories(id) ON DELETE SET NULL,
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(120) NOT NULL,
    description     VARCHAR(255) NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_category_tenant_slug UNIQUE (tenant_id, slug)
);
CREATE INDEX idx_category_parent ON asset_categories(parent_id);
CREATE INDEX idx_category_tenant ON asset_categories(tenant_id);
CREATE TRIGGER trg_asset_categories_updated_at BEFORE UPDATE ON asset_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 5. ASSET TYPES ("Kategori Aset" — klasifikasi tampilan, BEDA dari
--    asset_categories di atas yang menyusun asset_code)
-- =====================================================================
CREATE TABLE asset_types (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    description     VARCHAR(255) NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_type_tenant_name UNIQUE (tenant_id, name)
);
CREATE INDEX idx_type_tenant ON asset_types(tenant_id);
CREATE TRIGGER trg_asset_types_updated_at BEFORE UPDATE ON asset_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 6. DEPARTMENTS (divisi pemilik aset — dipindah lebih awal dari posisi
--    aslinya di schema.sql supaya FK assets.department_id bisa langsung
--    inline, bukan ALTER TABLE terpisah setelahnya)
-- =====================================================================
CREATE TABLE departments (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id    BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code         VARCHAR(30) NOT NULL,
    name         VARCHAR(150) NOT NULL,
    description  VARCHAR(255) NULL,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_department_tenant_code UNIQUE (tenant_id, code)
);
CREATE INDEX idx_department_active ON departments(is_active);
CREATE INDEX idx_department_tenant ON departments(tenant_id);
CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 7. LOCATIONS & SUB LOCATIONS
-- =====================================================================
CREATE TABLE locations (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code            VARCHAR(50) NOT NULL,
    name            VARCHAR(150) NOT NULL,
    description     VARCHAR(255) NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_location_tenant_code UNIQUE (tenant_id, code)
);
CREATE INDEX idx_location_tenant ON locations(tenant_id);
CREATE TRIGGER trg_locations_updated_at BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE sub_locations (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    location_id     BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    code            VARCHAR(50) NOT NULL,
    name            VARCHAR(150) NOT NULL,
    description     VARCHAR(255) NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_subloc_code_per_location UNIQUE (location_id, code)
);
CREATE INDEX idx_subloc_location ON sub_locations(location_id);
CREATE INDEX idx_subloc_tenant ON sub_locations(tenant_id);
CREATE TRIGGER trg_sub_locations_updated_at BEFORE UPDATE ON sub_locations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 8. CUSTOM FIELDS (EAV pattern)
-- =====================================================================
CREATE TABLE asset_custom_fields (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id     BIGINT NULL REFERENCES asset_categories(id) ON DELETE CASCADE,
    field_key       VARCHAR(100) NOT NULL,
    field_label     VARCHAR(150) NOT NULL,
    field_type      VARCHAR(20) NOT NULL DEFAULT 'text'
                        CHECK (field_type IN ('text','number','date','boolean','select','textarea')),
    field_options   JSONB NULL,
    is_required     BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_field_per_tenant_category UNIQUE (tenant_id, category_id, field_key)
);
CREATE INDEX idx_cf_category ON asset_custom_fields(category_id);
CREATE INDEX idx_customfield_tenant ON asset_custom_fields(tenant_id);
CREATE TRIGGER trg_asset_custom_fields_updated_at BEFORE UPDATE ON asset_custom_fields
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 9. ASSETS
--    Pencarian teks (name/brand/model/serial_number): MySQL memakai
--    FULLTEXT INDEX + MATCH...AGAINST (lihat assetController.js) —
--    padanan PostgreSQL-nya kolom tsvector TERSIMPAN (generated column)
--    + indeks GIN, dicari lewat to_tsquery() (lihat buildAssetFilter()
--    yang juga dikonversi, Tahap 3).
-- =====================================================================
CREATE TABLE assets (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id               BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    asset_code              VARCHAR(50) NOT NULL,
    sequence_no             INT NULL,
    category_id             BIGINT NOT NULL REFERENCES asset_categories(id) ON DELETE RESTRICT,
    asset_type_id           BIGINT NULL REFERENCES asset_types(id) ON DELETE SET NULL,
    name                    VARCHAR(150) NOT NULL,
    brand                   VARCHAR(100) NULL,
    model                   VARCHAR(100) NULL,
    serial_number           VARCHAR(150) NULL,
    spec_detail             TEXT NULL,
    condition_status        VARCHAR(20) NOT NULL DEFAULT 'baik'
                                CHECK (condition_status IN ('baik','rusak_ringan','rusak_berat')),
    -- 7 status: dijual, terjual, dipindah (baru pindah lokasi, menunggu
    -- konfirmasi Dipakai/Idle), dipakai, idle, hilang (raib/dicuri),
    -- dihapuskan (resmi dikeluarkan dari inventaris: musnah/afkir/hibah).
    status                  VARCHAR(20) NOT NULL DEFAULT 'idle'
                                CHECK (status IN ('dijual','terjual','dipindah','dipakai','idle','hilang','dihapuskan')),
    location_id             BIGINT NULL REFERENCES locations(id) ON DELETE SET NULL,
    department_id           BIGINT NULL REFERENCES departments(id) ON DELETE SET NULL,
    sub_location_id         BIGINT NULL REFERENCES sub_locations(id) ON DELETE SET NULL,
    origin_location_id      BIGINT NULL REFERENCES locations(id) ON DELETE SET NULL,
    origin_sub_location_id  BIGINT NULL REFERENCES sub_locations(id) ON DELETE SET NULL,
    purchase_date           DATE NULL,
    purchase_price          NUMERIC(15,2) NULL,
    warranty_expiry         DATE NULL,
    useful_life_months      SMALLINT NULL,
    salvage_value           NUMERIC(15,2) NULL,
    sale_value_net          NUMERIC(15,2) NULL,
    sold_date               DATE NULL,
    sold_price               NUMERIC(15,2) NULL,
    retired_date             DATE NULL,
    retired_reason           VARCHAR(500) NULL,
    retired_doc_no            VARCHAR(100) NULL,
    vendor                   VARCHAR(150) NULL,
    notes                    TEXT NULL,
    created_by               BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    updated_by                BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at                TIMESTAMP NULL,
    search_vector TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('simple',
            coalesce(name,'') || ' ' || coalesce(brand,'') || ' ' ||
            coalesce(model,'') || ' ' || coalesce(serial_number,'')
        )
    ) STORED,
    CONSTRAINT uq_asset_tenant_code UNIQUE (tenant_id, asset_code),
    CONSTRAINT uq_asset_tenant_sequence UNIQUE (tenant_id, sequence_no)
);
CREATE INDEX idx_asset_category ON assets(category_id);
CREATE INDEX idx_asset_type ON assets(asset_type_id);
CREATE INDEX idx_asset_status ON assets(status);
CREATE INDEX idx_asset_location_id ON assets(location_id);
CREATE INDEX idx_asset_sub_location_id ON assets(sub_location_id);
CREATE INDEX idx_asset_origin_location ON assets(origin_location_id);
CREATE INDEX idx_asset_origin_sub_location ON assets(origin_sub_location_id);
CREATE INDEX idx_asset_warranty ON assets(warranty_expiry);
CREATE INDEX idx_asset_department ON assets(department_id);
CREATE INDEX idx_asset_tenant ON assets(tenant_id);
CREATE INDEX ftx_asset_search ON assets USING GIN (search_vector);
CREATE TRIGGER trg_assets_updated_at BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 10. ASSET ASSIGNMENTS (custody)
-- =====================================================================
CREATE TABLE asset_assignments (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    asset_id          BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    holder_name       VARCHAR(150) NOT NULL,
    holder_contact    VARCHAR(150) NULL,
    department        VARCHAR(150) NULL,
    assigned_at       DATE NOT NULL,
    assigned_by       BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    assign_note       VARCHAR(500) NULL,
    returned_at       DATE NULL,
    returned_by       BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    return_note       VARCHAR(500) NULL,
    return_condition  VARCHAR(20) NULL CHECK (return_condition IN ('baik','rusak_ringan','rusak_berat')),
    doc_no            VARCHAR(30) NULL UNIQUE,
    return_doc_no     VARCHAR(30) NULL UNIQUE,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_assignment_asset ON asset_assignments(asset_id, returned_at);
CREATE INDEX idx_assignment_holder ON asset_assignments(holder_name);
CREATE INDEX idx_assignment_active ON asset_assignments(returned_at);
CREATE TRIGGER trg_asset_assignments_updated_at BEFORE UPDATE ON asset_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 11. ASSET ATTACHMENTS
-- =====================================================================
CREATE TABLE asset_attachments (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    asset_id     BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    category     VARCHAR(20) NOT NULL DEFAULT 'other'
                    CHECK (category IN ('invoice','warranty','manual','photo','other')),
    file_name    VARCHAR(255) NOT NULL,
    mime_type    VARCHAR(100) NOT NULL,
    file_size    INT NOT NULL,
    data         TEXT NOT NULL,
    notes        VARCHAR(500) NULL,
    uploaded_by  BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_attachment_asset ON asset_attachments(asset_id, category);

-- =====================================================================
-- 12. EMAIL CHANGE OTP / PASSWORD RESET OTP
-- =====================================================================
CREATE TABLE email_change_otps (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    new_email       VARCHAR(150) NOT NULL,
    otp_code        VARCHAR(10) NOT NULL,
    attempts        INT NOT NULL DEFAULT 0,
    expires_at      TIMESTAMP NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE password_reset_otps (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    otp_code        VARCHAR(10) NOT NULL,
    attempts        INT NOT NULL DEFAULT 0,
    expires_at      TIMESTAMP NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Verifikasi surel saat PENDAFTARAN MANDIRI (signup) -- lihat catatan
-- users.email_verified_at dan authController.signup/verifySignupEmail.
CREATE TABLE signup_verification_otps (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    otp_code        VARCHAR(10) NOT NULL,
    attempts        INT NOT NULL DEFAULT 0,
    expires_at      TIMESTAMP NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- 13. CUSTOM FIELD VALUES
-- =====================================================================
CREATE TABLE asset_custom_field_values (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    asset_id            BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    custom_field_id     BIGINT NOT NULL REFERENCES asset_custom_fields(id) ON DELETE CASCADE,
    value_text          TEXT NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_asset_field UNIQUE (asset_id, custom_field_id)
);
CREATE INDEX idx_cfv_asset ON asset_custom_field_values(asset_id);
CREATE INDEX idx_cfv_field ON asset_custom_field_values(custom_field_id);
CREATE TRIGGER trg_asset_custom_field_values_updated_at BEFORE UPDATE ON asset_custom_field_values
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 14. QR CODES
-- =====================================================================
CREATE TABLE qr_codes (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    asset_id        BIGINT NOT NULL UNIQUE REFERENCES assets(id) ON DELETE CASCADE,
    code            VARCHAR(100) NOT NULL UNIQUE,
    image_path      TEXT NULL,
    scan_url        VARCHAR(255) NOT NULL,
    generated_by    BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    generated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_scanned_at TIMESTAMP NULL,
    scan_count      INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_qr_code ON qr_codes(code);

-- =====================================================================
-- 15. ASSET STATUS HISTORIES
-- =====================================================================
CREATE TABLE asset_status_histories (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    asset_id        BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    old_status      VARCHAR(50) NULL,
    new_status      VARCHAR(50) NOT NULL,
    changed_by      BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    changed_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes           VARCHAR(255) NULL
);
CREATE INDEX idx_history_asset ON asset_status_histories(asset_id, changed_at);

-- =====================================================================
-- 15B. PLATFORM ADMINS (admin lintas tenant — TERPISAH TOTAL dari `users`,
--      demi keamanan: lihat migration_separate_platform_admins.sql. Login,
--      bentuk JWT (utils/token.js signPlatformToken, `type: 'platform'`),
--      dan middleware (middleware/auth.js authenticatePlatform) semuanya
--      sendiri, tidak menumpang jalur pengguna tenant sama sekali. TANPA
--      tenant_id — akun ini murni identitas staf platform, tidak pernah
--      "milik" tenant mana pun.
-- =====================================================================
CREATE TABLE platform_admins (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username        VARCHAR(50) NOT NULL UNIQUE,
    name            VARCHAR(150) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','inactive')),
    token_version   INT NOT NULL DEFAULT 1,
    last_login_at   TIMESTAMP NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at      TIMESTAMP NULL
);
CREATE TRIGGER trg_platform_admins_updated_at BEFORE UPDATE ON platform_admins
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Padanan email_change_otps (tabel punya `users`), tidak bisa dipakai
-- langsung karena FK-nya ke users(id) — admin platform tidak pernah hidup
-- di tabel itu.
CREATE TABLE platform_admin_email_otps (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    platform_admin_id   BIGINT NOT NULL UNIQUE REFERENCES platform_admins(id) ON DELETE CASCADE,
    new_email           VARCHAR(150) NOT NULL,
    otp_code            VARCHAR(10) NOT NULL,
    attempts            INT NOT NULL DEFAULT 0,
    expires_at          TIMESTAMP NOT NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- 16. AUDIT LOGS
-- =====================================================================
-- tenant_id NULLABLE + platform_admin_id: aksi admin platform (lintas
-- tenant, mis. kelola katalog paket) tidak selalu punya satu tenant yang
-- relevan, dan actor-nya hidup di tabel platform_admins yang terpisah dari
-- `users` sejak migration_separate_platform_admins.sql -- lihat catatan
-- panjang di utils/auditLogger.js.
CREATE TABLE audit_logs (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id           BIGINT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id             BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    platform_admin_id   BIGINT NULL REFERENCES platform_admins(id) ON DELETE SET NULL,
    action              VARCHAR(20) NOT NULL
                            CHECK (action IN ('create','update','delete','scan','login','logout','export')),
    entity_type         VARCHAR(50) NOT NULL,
    entity_id           BIGINT NULL,
    old_values          JSONB NULL,
    new_values          JSONB NULL,
    ip_address          VARCHAR(45) NULL,
    user_agent          VARCHAR(255) NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_platform_admin ON audit_logs(platform_admin_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
CREATE INDEX idx_audit_tenant ON audit_logs(tenant_id);

-- =====================================================================
-- 17. USER PERMISSIONS
-- =====================================================================
CREATE TABLE user_permissions (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module_key   VARCHAR(50) NOT NULL,
    can_view     BOOLEAN NOT NULL DEFAULT FALSE,
    can_create   BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit     BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_module UNIQUE (user_id, module_key)
);
CREATE INDEX idx_userperm_user ON user_permissions(user_id);
CREATE TRIGGER trg_user_permissions_updated_at BEFORE UPDATE ON user_permissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 18. APP SETTINGS (merek per-tenant — satu baris per tenant sejak
--     multi-tenant, lihat settingsController.readSettings() yang
--     membuat baris otomatis kalau belum ada untuk tenant tsb.)
-- =====================================================================
CREATE TABLE app_settings (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id     BIGINT NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    app_name      VARCHAR(100) NOT NULL DEFAULT 'Asset Inventory',
    company_name  VARCHAR(150) NOT NULL DEFAULT 'Perusahaan Anda',
    tagline       VARCHAR(255) NULL,
    logo_icon     TEXT NULL,
    logo_light    TEXT NULL,
    logo_dark     TEXT NULL,
    logo_version  INT NOT NULL DEFAULT 1,
    updated_by    BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER trg_app_settings_updated_at BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 19. STOCK OPNAME
-- =====================================================================
CREATE TABLE stock_opnames (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id             BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code                  VARCHAR(30) NOT NULL,
    name                  VARCHAR(150) NOT NULL,
    scope_location_id     BIGINT NULL REFERENCES locations(id) ON DELETE SET NULL,
    scope_sub_location_id BIGINT NULL REFERENCES sub_locations(id) ON DELETE SET NULL,
    scope_category_id     BIGINT NULL REFERENCES asset_categories(id) ON DELETE SET NULL,
    status                VARCHAR(20) NOT NULL DEFAULT 'berjalan'
                              CHECK (status IN ('berjalan','selesai','dibatalkan')),
    notes                 VARCHAR(500) NULL,
    created_by            BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    finished_by           BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    finished_at           TIMESTAMP NULL,
    created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_opname_tenant_code UNIQUE (tenant_id, code)
);
CREATE INDEX idx_opname_status ON stock_opnames(status, created_at);
CREATE INDEX idx_opname_tenant ON stock_opnames(tenant_id);
CREATE TRIGGER trg_stock_opnames_updated_at BEFORE UPDATE ON stock_opnames
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE stock_opname_items (
    id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    opname_id                BIGINT NOT NULL REFERENCES stock_opnames(id) ON DELETE CASCADE,
    asset_id                 BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    expected_location_id     BIGINT NULL REFERENCES locations(id) ON DELETE SET NULL,
    expected_sub_location_id BIGINT NULL REFERENCES sub_locations(id) ON DELETE SET NULL,
    expected_condition       VARCHAR(20) NULL CHECK (expected_condition IN ('baik','rusak_ringan','rusak_berat')),
    result                   VARCHAR(20) NOT NULL DEFAULT 'belum'
                                  CHECK (result IN ('belum','ditemukan','salah_lokasi','tidak_ditemukan')),
    found_location_id        BIGINT NULL REFERENCES locations(id) ON DELETE SET NULL,
    found_sub_location_id    BIGINT NULL REFERENCES sub_locations(id) ON DELETE SET NULL,
    found_condition          VARCHAR(20) NULL CHECK (found_condition IN ('baik','rusak_ringan','rusak_berat')),
    note                     VARCHAR(500) NULL,
    checked_by               BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    checked_at               TIMESTAMP NULL,
    created_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_opname_asset UNIQUE (opname_id, asset_id)
);
CREATE INDEX idx_opname_item_result ON stock_opname_items(opname_id, result);
CREATE TRIGGER trg_stock_opname_items_updated_at BEFORE UPDATE ON stock_opname_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 20. ASSET REMINDERS
-- =====================================================================
CREATE TABLE asset_reminders (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id      BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    asset_id       BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    title          VARCHAR(150) NOT NULL,
    reminder_date  DATE NOT NULL,
    recurrence     VARCHAR(20) NOT NULL DEFAULT 'none'
                       CHECK (recurrence IN ('none','monthly','quarterly','yearly')),
    notes          VARCHAR(500) NULL,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_by     BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_reminder_asset ON asset_reminders(asset_id);
CREATE INDEX idx_reminder_due ON asset_reminders(is_active, reminder_date);
CREATE INDEX idx_reminder_tenant ON asset_reminders(tenant_id);
CREATE TRIGGER trg_asset_reminders_updated_at BEFORE UPDATE ON asset_reminders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 21. ASSET MAINTENANCES
-- =====================================================================
CREATE TABLE asset_maintenances (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id         BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    asset_id          BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    maintenance_type  VARCHAR(20) NOT NULL DEFAULT 'preventive'
                          CHECK (maintenance_type IN ('preventive','corrective','calibration','other')),
    title             VARCHAR(150) NOT NULL,
    description       VARCHAR(500) NULL,
    scheduled_date    DATE NOT NULL,
    completed_date    DATE NULL,
    status            VARCHAR(20) NOT NULL DEFAULT 'dijadwalkan'
                          CHECK (status IN ('dijadwalkan','selesai','dibatalkan')),
    vendor            VARCHAR(150) NULL,
    cost              NUMERIC(15,2) NULL,
    result_note       VARCHAR(500) NULL,
    created_by        BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    completed_by      BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_maintenance_asset ON asset_maintenances(asset_id);
CREATE INDEX idx_maintenance_due ON asset_maintenances(status, scheduled_date);
CREATE INDEX idx_maintenance_tenant ON asset_maintenances(tenant_id);
CREATE TRIGGER trg_asset_maintenances_updated_at BEFORE UPDATE ON asset_maintenances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 22. CONSUMABLES (barang habis pakai) + kartu stok
-- =====================================================================
-- Kategori barang habis pakai memakai asset_types (bagian 5) YANG SAMA
-- dengan "Kategori Aset" di Daftar Aset -- satu daftar kategori dikelola
-- dari satu tempat untuk aset maupun barang habis pakai, bukan sistem
-- kategori terkunci terpisah (lihat migration_consumable_asset_type.sql).
CREATE TABLE consumables (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id      BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code           VARCHAR(30) NOT NULL,
    name           VARCHAR(150) NOT NULL,
    asset_type_id  BIGINT NULL REFERENCES asset_types(id) ON DELETE SET NULL,
    unit           VARCHAR(20) NOT NULL DEFAULT 'pcs',
    current_stock  INT NOT NULL DEFAULT 0,
    min_stock      INT NOT NULL DEFAULT 0,
    location_id    BIGINT NULL REFERENCES locations(id) ON DELETE SET NULL,
    notes          VARCHAR(500) NULL,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_by     BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_consumable_tenant_code UNIQUE (tenant_id, code)
);
CREATE INDEX idx_consumable_active ON consumables(is_active);
CREATE INDEX idx_consumable_low_stock ON consumables(is_active, current_stock);
CREATE INDEX idx_consumable_tenant ON consumables(tenant_id);
CREATE INDEX idx_consumable_asset_type ON consumables(asset_type_id);
CREATE TRIGGER trg_consumables_updated_at BEFORE UPDATE ON consumables
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE consumable_transactions (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    consumable_id   BIGINT NOT NULL REFERENCES consumables(id) ON DELETE CASCADE,
    type            VARCHAR(20) NOT NULL CHECK (type IN ('masuk','keluar','penyesuaian')),
    quantity        INT NOT NULL,
    balance_after   INT NOT NULL,
    vendor          VARCHAR(150) NULL,
    unit_price      NUMERIC(15,2) NULL,
    requested_by    VARCHAR(150) NULL,
    department      VARCHAR(150) NULL,
    notes           VARCHAR(500) NULL,
    created_by      BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_consumable_txn_item ON consumable_transactions(consumable_id, created_at);

-- Kode QR/barcode barang habis pakai — struktur identik dengan qr_codes
-- (bagian 14) tapi tabel terpisah, BUKAN kolom nullable tambahan di
-- qr_codes: satu tabel qr_codes yang harus menampung dua jenis entitas
-- (asset_id ATAU consumable_id, salah satu NULL) akan memaksa constraint
-- UNIQUE-nya jadi rumit dan berisiko meregresi alur pindai aset yang sudah
-- lama berjalan. Dipindai lewat /scan-consumable/:code (beda dari
-- /scan/:code aset), lihat consumableQrController.js & publicController.js.
CREATE TABLE consumable_qr_codes (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    consumable_id   BIGINT NOT NULL UNIQUE REFERENCES consumables(id) ON DELETE CASCADE,
    code            VARCHAR(100) NOT NULL UNIQUE,
    image_path      TEXT NULL,
    scan_url        VARCHAR(255) NOT NULL,
    generated_by    BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    generated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_scanned_at TIMESTAMP NULL,
    scan_count      INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_consumable_qr_code ON consumable_qr_codes(code);

-- =====================================================================
-- 23. ASSET REQUESTS
-- =====================================================================
CREATE TABLE asset_requests (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id          BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    request_no         VARCHAR(30) NOT NULL,
    requester_name     VARCHAR(150) NOT NULL,
    department         VARCHAR(150) NULL,
    category_id        BIGINT NULL REFERENCES asset_categories(id) ON DELETE SET NULL,
    item_name          VARCHAR(150) NOT NULL,
    reason             VARCHAR(500) NULL,
    priority           VARCHAR(20) NOT NULL DEFAULT 'sedang'
                            CHECK (priority IN ('rendah','sedang','tinggi')),
    needed_by          DATE NULL,
    status             VARCHAR(20) NOT NULL DEFAULT 'diajukan'
                            CHECK (status IN ('diajukan','disetujui','ditolak','dipenuhi','dibatalkan')),
    review_note        VARCHAR(500) NULL,
    reviewed_by        BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at        TIMESTAMP NULL,
    fulfilled_asset_id BIGINT NULL REFERENCES assets(id) ON DELETE SET NULL,
    fulfilled_by       BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    fulfilled_at       TIMESTAMP NULL,
    created_by         BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_request_tenant_no UNIQUE (tenant_id, request_no)
);
CREATE INDEX idx_request_status ON asset_requests(status, created_at);
CREATE INDEX idx_request_tenant ON asset_requests(tenant_id);
CREATE TRIGGER trg_asset_requests_updated_at BEFORE UPDATE ON asset_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 24. ZECODE — asisten AI internal (percakapan MILIK PRIBADI tiap
--     pengguna, lihat catatan lengkap di migrations/migration_add_zecode_chat.sql)
-- =====================================================================
CREATE TABLE chat_conversations (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        VARCHAR(150) NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_chat_conv_user ON chat_conversations(user_id, updated_at);
CREATE TRIGGER trg_chat_conversations_updated_at BEFORE UPDATE ON chat_conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE chat_messages (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversation_id   BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    role              VARCHAR(10) NOT NULL CHECK (role IN ('user','assistant')),
    content           TEXT NOT NULL,
    intent            VARCHAR(50) NULL,
    action_type       VARCHAR(50) NULL,
    action_payload    JSONB NULL,
    action_status     VARCHAR(20) NOT NULL DEFAULT 'none'
                           CHECK (action_status IN ('none','pending','confirmed','cancelled')),
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_chat_msg_conversation ON chat_messages(conversation_id, created_at);

-- =====================================================================
-- 25. BILLING — permintaan upgrade paket manual (Fase 4 SaaS, sampai
--     ada payment gateway sungguhan)
-- =====================================================================
CREATE TABLE plan_upgrade_requests (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    requested_plan  VARCHAR(50) NOT NULL,
    previous_plan   VARCHAR(50) NULL,   -- snapshot paket SAAT permintaan dibuat (lihat catatan riwayat migrasi)
    billing_cycle   VARCHAR(10) NOT NULL DEFAULT 'monthly'  -- 'monthly'/'yearly' — lihat migration_billing_yearly_cycle.sql
                        CHECK (billing_cycle IN ('monthly', 'yearly')),
    price           NUMERIC(14,2) NULL,   -- snapshot harga SAAT DIAJUKAN (lihat migration_upgrade_request_price_snapshot.sql)
                                            -- — dipakai activateSubscription() saat disetujui, BUKAN harga katalog
                                            -- SAAT ITU, supaya perubahan harga di menu Katalog Paket sesudah tenant
                                            -- mengajukan tidak diam-diam mengubah jumlah yang ditagihkan.
    currency        VARCHAR(3) NOT NULL DEFAULT 'IDR',
    note            TEXT NULL,
    -- 'paid' (dikonfirmasi webhook Pakasir) & 'applied' (paket Free, tanpa
    -- biaya) menggantikan 'approved' untuk baris BARU -- lihat
    -- migration_pakasir_self_serve_billing.sql. 'approved'/'rejected'
    -- dipertahankan hanya supaya baris LAMA (alur verifikasi manual sebelum
    -- migrasi itu) tetap valid dibaca.
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected','paid','applied','canceled')),
    requested_by    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reviewed_by     BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at     TIMESTAMP NULL,
    admin_note      TEXT NULL,
    -- Lihat migration_pakasir_self_serve_billing.sql.
    payment_provider          VARCHAR(20) NOT NULL DEFAULT 'pakasir',
    order_id                  VARCHAR(60) NULL UNIQUE,   -- order_id yang dikirim ke Pakasir create-transaction
    provider_transaction_id   VARCHAR(150) NULL,          -- txn_id dari Pakasir
    paid_at                   TIMESTAMP NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_upgrade_tenant ON plan_upgrade_requests(tenant_id);
CREATE INDEX idx_upgrade_status ON plan_upgrade_requests(status);
CREATE TRIGGER trg_plan_upgrade_requests_updated_at BEFORE UPDATE ON plan_upgrade_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 26. DAFTAR PUTIH IP (Fase 5 SaaS susulan) — khusus admin platform
-- =====================================================================
-- BUKAN tenant-scoped -- pembatas laju (rate limiter) di middleware/
-- loginLimiter.js, passwordResetLimiter.js, signupLimiter.js,
-- publicLimiter.js berlaku GLOBAL per alamat IP, di luar konteks tenant
-- mana pun, jadi daftar putihnya juga global. Lihat utils/ipWhitelist.js
-- untuk cache di memori yang dipakai tiap permintaan (bukan query ulang
-- tabel ini di setiap request).
CREATE TABLE ip_whitelist (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ip_address      VARCHAR(45) NOT NULL UNIQUE,   -- cukup untuk IPv4 & IPv6
    label           VARCHAR(150) NULL,
    created_by      BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- 27. SUBSCRIPTIONS & INVOICES (susulan billing Fase 4 — fondasi untuk
--     payment gateway sungguhan, lihat migration_billing_subscriptions.sql)
-- =====================================================================
-- `tenants.plan`/`plan_expires_at`/`billing_cycle` TETAP jadi cache "state
-- terkini" yang dibaca planLimits.js/dashboard/dll (banyak kode sudah baca
-- dari situ) — `subscriptions` adalah RIWAYAT/CATATAN di baliknya, satu baris
-- per periode langganan, ditulis oleh billingController.resolveUpgradeRequest
-- & platformController.updateTenantPlan lewat services/subscriptionService.js.
-- Hanya SATU baris per tenant yang boleh 'active'/'trialing' sekaligus
-- (ditegakkan di service, bukan constraint DB, supaya siklus ganti-paket bisa
-- direkam sebagai "yang lama pindah ke status lain, yang baru dibuat" dalam
-- satu transaksi — bukan diedit di tempat).
CREATE TABLE subscriptions (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id               BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_id                 VARCHAR(50) NOT NULL,   -- lihat tabel `plans` di bawah — SENGAJA bukan FK (lihat catatannya)
    billing_cycle           VARCHAR(10) NOT NULL DEFAULT 'monthly'
                                CHECK (billing_cycle IN ('monthly', 'yearly')),
    status                  VARCHAR(20) NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'expired')),
    price                   NUMERIC(14,2) NOT NULL,   -- snapshot harga SAAT dibuat — plans.js bisa berubah nanti
    currency                VARCHAR(3) NOT NULL DEFAULT 'IDR',
    started_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    current_period_start    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    current_period_end      TIMESTAMP NULL,   -- NULL = tanpa batas waktu (Free, atau koreksi admin manual permanen)
    canceled_at             TIMESTAMP NULL,
    trial_ends_at           TIMESTAMP NULL,
    provider                VARCHAR(30) NOT NULL DEFAULT 'manual',   -- lihat services/paymentGateway/
    created_by              BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
-- Query paling sering: "langganan aktif tenant X saat ini".
CREATE INDEX idx_subscriptions_tenant_status ON subscriptions(tenant_id, status);
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Satu baris per tagihan (bukan per periode langganan) — untuk provider
-- 'manual' saat ini dibuat berbarengan dengan subscriptions (lihat
-- subscriptionService.recordApprovedUpgrade), berstatus langsung 'paid'
-- karena verifikasi transfer SUDAH terjadi sebelum admin menyetujui. Provider
-- gateway sungguhan nanti akan membuat baris 'pending' dulu lewat
-- createCheckout(), baru 'paid' lewat handleWebhook().
CREATE TABLE invoices (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id               BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    subscription_id         BIGINT NULL REFERENCES subscriptions(id) ON DELETE SET NULL,
    invoice_number          VARCHAR(40) NOT NULL UNIQUE,
    amount                  NUMERIC(14,2) NOT NULL,
    currency                VARCHAR(3) NOT NULL DEFAULT 'IDR',
    status                  VARCHAR(20) NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'canceled')),
    payment_method          VARCHAR(50) NULL,   -- mis. 'bank_transfer', diisi provider
    paid_at                 TIMESTAMP NULL,
    due_at                  TIMESTAMP NULL,
    provider                VARCHAR(30) NOT NULL DEFAULT 'manual',
    provider_transaction_id VARCHAR(150) NULL,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX idx_invoices_subscription ON invoices(subscription_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 28. KATALOG PAKET (susulan billing Fase 4 — sebelumnya hardcode di
--     backend/src/config/plans.js, lihat migration_plans_catalog_db.sql)
-- =====================================================================
-- Sekarang tabel sungguhan, dikelola admin platform lewat menu Katalog
-- Paket — TAPI SENGAJA BUKAN FK dari tenants.plan/subscriptions.plan_id/
-- plan_upgrade_requests.requested_plan: tenant vendor sendiri (dibuat
-- scripts/bootstrap-super-admin.js) memakai plan_id 'enterprise_custom'
-- yang BUKAN bagian katalog publik (tidak self-serve, tidak tampil di
-- halaman Harga) — kalau dipaksa FK, baris itu butuh entri katalog palsu
-- cuma supaya lolos constraint. Sebagai gantinya, larangan hapus paket yang
-- masih dipakai tenant/subscription/permintaan ditegakkan di kode
-- (platformController.deletePlan), bukan di database.
--
-- `config/plans.js` (nama berkas TETAP, isinya sekarang pemuat cache, bukan
-- array statis) memuat seluruh baris ke memori saat server menyala dan
-- menyegarkan ulang cache-nya setiap kali admin platform menambah/
-- mengubah/menghapus paket — pola yang sama dengan utils/ipWhitelist.js.
-- `max_assets`/`max_users`/`location_limit` NULL = TANPA BATAS. `price`
-- 0 = paket gratis (Free). `is_active = FALSE` = paket "dipensiunkan":
-- tidak muncul lagi di katalog publik/pilihan upgrade mandiri, tapi TETAP
-- bisa di-resolve untuk tenant lama yang masih memakainya (grandfathered) —
-- jangan pernah dihapus fisik satu paket yang masih dipakai siapa pun.
-- Paket 'free' tidak boleh dihapus ATAU dinonaktifkan lewat kode apa pun —
-- signup mandiri (authController) dan penurunan otomatis saat kedaluwarsa
-- (jobs/planExpiry.js -> subscriptionService.downgradeToFreeOnExpiry)
-- keduanya mengasumsikan paket ini SELALU ada dan SELALU gratis.
CREATE TABLE plans (
    id                  VARCHAR(50) PRIMARY KEY,   -- slug, mis. 'free'/'starter' — dipakai apa adanya di tenants.plan dst.
    name                VARCHAR(100) NOT NULL,
    tagline             VARCHAR(255) NOT NULL DEFAULT '',
    price               INT NOT NULL DEFAULT 0,          -- harga bulanan (IDR), 0 = gratis
    price_yearly        INT NULL,                        -- harga SETAHUN PENUH, NULL = tidak ditawarkan tahunan
    max_assets          INT NULL,                        -- NULL = tanpa batas
    max_users           INT NULL,
    location_limit      INT NULL,
    features            JSONB NOT NULL DEFAULT '[]'::jsonb,
    highlight           BOOLEAN NOT NULL DEFAULT FALSE,  -- badge "Paling Populer" di halaman Harga
    custom              BOOLEAN NOT NULL DEFAULT FALSE,  -- true = harga khusus/"hubungi sales"
    self_serve          BOOLEAN NOT NULL DEFAULT TRUE,   -- boleh diajukan lewat alur upgrade mandiri tenant
    custom_pricing_hint VARCHAR(255) NULL,               -- microcopy CTA sekunder, lihat config/plans.js lama
    sort_order          INT NOT NULL DEFAULT 0,          -- urutan "tingkatan" — dipakai isUpgrade()/tierIndex(), BUKAN harga mentah
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_plans_sort_order ON plans(sort_order);
CREATE TRIGGER trg_plans_updated_at BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO plans (id, name, tagline, price, price_yearly, max_assets, max_users, location_limit, features, highlight, custom, self_serve, custom_pricing_hint, sort_order, is_active) VALUES
('free', 'Free', 'Untuk mencoba sistem — tidak perlu kartu pembayaran.', 0, 0, 100, 2, 1,
    '["100 aset","2 pengguna, 1 lokasi","Manajemen aset dasar","Dasbor ringkasan aset","Kode QR aset","Riwayat & ekspor data dasar","Dukungan komunitas"]'::jsonb,
    FALSE, FALSE, TRUE, NULL, 0, TRUE),
('starter', 'Starter', 'Perusahaan kecil yang mulai serius merapikan aset.', 99000, 990000, 1000, 5, NULL,
    '["1.000 aset, 5 pengguna","Multi-lokasi & sub-lokasi","Perpindahan (mutasi) aset","Manajemen pemeliharaan","Laporan lebih detail","Impor data dari Excel","QR/Barcode lanjutan","Dukungan prioritas"]'::jsonb,
    FALSE, FALSE, TRUE, NULL, 1, TRUE),
('business', 'Business', 'Paling banyak dipilih — tim IT/GA dengan banyak lokasi.', 249000, 2490000, 5000, 15, NULL,
    '["5.000 aset, 15 pengguna","Alur persetujuan (approval)","Peran & izin akses granular","Log audit","Penyusutan nilai aset","Laporan lanjutan","Impor & ekspor Excel","Dukungan prioritas"]'::jsonb,
    TRUE, FALSE, TRUE, NULL, 2, TRUE),
('enterprise', 'Enterprise', 'Organisasi besar — harga mulai dari, siap disesuaikan kebutuhan.', 599000, 5990000, 20000, 50, NULL,
    '["20.000+ aset, 50+ pengguna","Peran & izin akses lanjutan","Alur persetujuan lanjutan","Log audit lanjutan","Penyusutan aset & laporan kustom","Multi-cabang/lokasi tanpa batas","Akses API & dukungan integrasi","Dukungan prioritas/khusus"]'::jsonb,
    FALSE, FALSE, TRUE, 'Butuh kapasitas lebih besar atau kontrak/SLA khusus?', 3, TRUE);

-- Testimoni pelanggan -- lihat migration_add_testimonials.sql
CREATE TABLE testimonials (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    author_name     VARCHAR(150) NOT NULL,
    author_role     VARCHAR(150) NULL,
    company_name    VARCHAR(150) NOT NULL,
    rating          SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    message         TEXT NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by     BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at     TIMESTAMP NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_testimonials_status ON testimonials(status);
CREATE INDEX idx_testimonials_tenant ON testimonials(tenant_id);
