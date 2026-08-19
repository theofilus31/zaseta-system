-- =====================================================================
-- Asset Inventory System — Database Schema (MySQL 8.0+ / MariaDB 10.4+)
-- Engine: InnoDB, Charset: utf8mb4
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================================
-- 1. ROLES (RBAC berbasis nama role — lihat catatan di bawah)
-- =====================================================================

CREATE TABLE roles (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(50) NOT NULL UNIQUE,          -- admin, it_staff, client
    description     VARCHAR(255) NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- CATATAN: peran kini berfungsi sebagai LABEL dan PRESET, bukan lagi sebagai
-- penentu akses. Hak akses sesungguhnya disimpan per-pengguna per-menu di
-- tabel user_permissions (bagian 11 di bawah) dan ditegakkan oleh
-- backend/src/middleware/auth.js -> requirePermission(modul, aksi).
-- Pengecualian: peran 'admin' selalu berakses penuh tanpa melihat tabel izin.
--
-- Tabel permissions & role_permissions yang lama sudah dihapus lewat
-- migration_cleanup_unused_schema.sql karena tidak pernah dipakai kode.

-- =====================================================================
-- 2. USERS
-- =====================================================================

CREATE TABLE users (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username        VARCHAR(50) NOT NULL UNIQUE,          -- dipakai untuk login (lihat migration_add_username.sql, sudah digabung di sini)
    role_id         BIGINT UNSIGNED NOT NULL,
    name            VARCHAR(150) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
    token_version   INT UNSIGNED NOT NULL DEFAULT 1,      -- naik = mencabut semua token JWT lama akun ini
    last_login_at   TIMESTAMP NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at      TIMESTAMP NULL,                       -- soft delete
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT,
    INDEX idx_users_role (role_id),
    INDEX idx_users_status (status),
    INDEX idx_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Catatan: client/user yang hanya scan QR TIDAK butuh row di tabel users,
-- karena halaman scan bersifat publik/read-only tanpa login.

-- =====================================================================
-- 3. ASSET CATEGORIES
-- =====================================================================

CREATE TABLE asset_categories (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parent_id       BIGINT UNSIGNED NULL,                 -- mendukung sub-kategori (nested)
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(120) NOT NULL UNIQUE,
    description     VARCHAR(255) NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_category_parent FOREIGN KEY (parent_id) REFERENCES asset_categories(id) ON DELETE SET NULL,
    INDEX idx_category_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 3b. ASSET TYPES / KATEGORI ASET
--   Catatan: ini BEDA dengan asset_categories (= "Kode Barang/Aset", dipakai
--   untuk menyusun asset_code). Tabel ini murni klasifikasi/tampilan aset
--   (mis: Elektronik, Furniture, Kendaraan) dan tidak memengaruhi kode aset.
-- =====================================================================

CREATE TABLE asset_types (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(100) NOT NULL UNIQUE,
    description     VARCHAR(255) NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 4. CUSTOM FIELDS (EAV pattern — fleksibel tanpa ALTER TABLE)
-- =====================================================================

CREATE TABLE asset_custom_fields (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category_id     BIGINT UNSIGNED NULL,                 -- NULL = berlaku global untuk semua kategori
    field_key       VARCHAR(100) NOT NULL,                -- machine-readable key: warranty_expiry
    field_label     VARCHAR(150) NOT NULL,                -- human-readable label: "Tanggal Berakhir Garansi"
    field_type      ENUM('text','number','date','boolean','select','textarea') NOT NULL DEFAULT 'text',
    field_options   JSON NULL,                            -- untuk type=select: ["Opsi A","Opsi B"]
    is_required     BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_cf_category FOREIGN KEY (category_id) REFERENCES asset_categories(id) ON DELETE CASCADE,
    UNIQUE KEY uq_field_per_category (category_id, field_key),
    INDEX idx_cf_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 4b. LOCATIONS & SUB LOCATIONS
-- =====================================================================

CREATE TABLE locations (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code            VARCHAR(50) NOT NULL UNIQUE,          -- kode lokasi, mis: HO, BDG, SBY
    name            VARCHAR(150) NOT NULL,
    description     VARCHAR(255) NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sub_locations (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    location_id     BIGINT UNSIGNED NOT NULL,             -- induk lokasi
    code            VARCHAR(50) NOT NULL,                 -- kode sub lokasi, unik di dalam lokasi induknya
    name            VARCHAR(150) NOT NULL,
    description     VARCHAR(255) NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_subloc_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
    UNIQUE KEY uq_subloc_code_per_location (location_id, code),
    INDEX idx_subloc_location (location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 5. ASSETS
-- =====================================================================

CREATE TABLE assets (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    asset_code      VARCHAR(50) NOT NULL UNIQUE,          -- kode unik aset, auto-generate: {KODE_LOKASI}/{KODE_SUB_LOKASI}/{SLUG_KATEGORI}/{NOMOR_URUT}
    sequence_no     INT UNSIGNED NULL UNIQUE,              -- nomor urut global (bagian terakhir dari asset_code), dipakai untuk memastikan nomor tidak pernah dobel
    category_id     BIGINT UNSIGNED NOT NULL,
    asset_type_id   BIGINT UNSIGNED NULL,                 -- kategori aset (asset_types), TERPISAH dari kode barang/aset di atas
    name            VARCHAR(150) NOT NULL,
    brand           VARCHAR(100) NULL,
    model           VARCHAR(100) NULL,
    serial_number   VARCHAR(150) NULL,
    spec_detail     TEXT NULL,                            -- spesifikasi detail aset, bisa berupa list bernomor (1. ... 2. ...)
    condition_status ENUM('baik','rusak_ringan','rusak_berat') NOT NULL DEFAULT 'baik',
    -- 5 status: dijual (ditawarkan utk dijual), terjual (sudah laku), dipindah (baru pindah lokasi,
    -- menunggu dikonfirmasi Dipakai/Idle), dipakai (sedang dipakai), idle (nganggur/standby)
    -- hilang     : raib/dicuri, masih dicari pertanggungjawabannya
    -- dihapuskan : resmi dikeluarkan dari inventaris (musnah, afkir, hibah)
    status          ENUM('dijual','terjual','dipindah','dipakai','idle','hilang','dihapuskan') NOT NULL DEFAULT 'idle',
    location_id     BIGINT UNSIGNED NULL,
    department_id   BIGINT UNSIGNED NULL,                 -- divisi penanggung jawab aset
    sub_location_id BIGINT UNSIGNED NULL,
    origin_location_id     BIGINT UNSIGNED NULL,          -- lokasi sebelum status "dipindah" diset; dipakai untuk auto-detect kembali ke lokasi semula
    origin_sub_location_id BIGINT UNSIGNED NULL,
    purchase_date   DATE NULL,
    purchase_price  DECIMAL(15,2) NULL,
    warranty_expiry DATE NULL,                            -- tanggal berakhir garansi; dipakai untuk peringatan di Dasbor
    useful_life_months SMALLINT UNSIGNED NULL,            -- masa manfaat (bulan), dasar penyusutan garis lurus
    salvage_value   DECIMAL(15,2) NULL,                   -- nilai residu di akhir masa manfaat
    sale_value_net  DECIMAL(15,2) NULL,                   -- Harga Jual/Net, diisi manual saat status diubah ke "Dijual"
    sold_date       DATE NULL,
    sold_price      DECIMAL(15,2) NULL,                   -- harga transaksi aktual, diisi manual saat status diubah ke "Terjual"
    retired_date    DATE NULL,                            -- tanggal aset dinyatakan hilang/dihapuskan
    retired_reason  VARCHAR(500) NULL,                    -- wajib diisi saat status hilang/dihapuskan
    retired_doc_no  VARCHAR(100) NULL,                    -- nomor berita acara/laporan kehilangan
    vendor          VARCHAR(150) NULL,
    notes           TEXT NULL,
    created_by      BIGINT UNSIGNED NULL,
    updated_by      BIGINT UNSIGNED NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at      TIMESTAMP NULL,                       -- soft delete agar histori/audit tetap utuh
    CONSTRAINT fk_asset_category FOREIGN KEY (category_id) REFERENCES asset_categories(id) ON DELETE RESTRICT,
    CONSTRAINT fk_asset_type FOREIGN KEY (asset_type_id) REFERENCES asset_types(id) ON DELETE SET NULL,
    CONSTRAINT fk_asset_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
    CONSTRAINT fk_asset_sub_location FOREIGN KEY (sub_location_id) REFERENCES sub_locations(id) ON DELETE SET NULL,
    CONSTRAINT fk_asset_origin_location FOREIGN KEY (origin_location_id) REFERENCES locations(id) ON DELETE SET NULL,
    CONSTRAINT fk_asset_origin_sub_location FOREIGN KEY (origin_sub_location_id) REFERENCES sub_locations(id) ON DELETE SET NULL,
    CONSTRAINT fk_asset_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_asset_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_asset_category (category_id),
    INDEX idx_asset_type (asset_type_id),
    INDEX idx_asset_status (status),
    INDEX idx_asset_location_id (location_id),
    INDEX idx_asset_sub_location_id (sub_location_id),
    INDEX idx_asset_origin_location (origin_location_id),
    INDEX idx_asset_origin_sub_location (origin_sub_location_id),
    INDEX idx_asset_warranty (warranty_expiry),
    INDEX idx_asset_department (department_id),
    FULLTEXT INDEX ftx_asset_search (name, brand, model, serial_number)  -- mendukung fitur search
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 5c. ASSET ASSIGNMENTS (custody — siapa yang sedang memegang aset)
--   Pemegang dicatat sebagai TEKS, bukan FK ke users: tabel users hanya
--   berisi akun aplikasi (admin/it_staff/viewer), bukan seluruh karyawan.
--   Satu aset hanya boleh punya satu penugasan aktif (returned_at IS NULL) —
--   aturan itu ditegakkan di controller, karena UNIQUE tidak bisa dipakai
--   (setiap NULL dianggap nilai yang berbeda oleh MySQL/MariaDB).
-- =====================================================================

CREATE TABLE asset_assignments (
    id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    asset_id          BIGINT UNSIGNED NOT NULL,
    holder_name       VARCHAR(150) NOT NULL,              -- nama karyawan pemegang
    holder_contact    VARCHAR(150) NULL,                  -- surel/telepon, opsional
    department        VARCHAR(150) NULL,
    assigned_at       DATE NOT NULL,
    assigned_by       BIGINT UNSIGNED NULL,
    assign_note       VARCHAR(500) NULL,
    returned_at       DATE NULL,                          -- NULL = masih dipegang
    returned_by       BIGINT UNSIGNED NULL,
    return_note       VARCHAR(500) NULL,
    return_condition  ENUM('baik','rusak_ringan','rusak_berat') NULL,
    -- Nomor Berita Acara Serah Terima (BAST) — dibuat sekali, saat pertama kali
    -- dicetak (bukan saat baris ini dibuat), supaya serah terima yang tidak
    -- pernah dicetak tidak ikut memakai nomor urut dan membuatnya berlubang.
    doc_no            VARCHAR(30) NULL,
    return_doc_no     VARCHAR(30) NULL,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_assignment_asset       FOREIGN KEY (asset_id)    REFERENCES assets(id) ON DELETE CASCADE,
    CONSTRAINT fk_assignment_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id)  ON DELETE SET NULL,
    CONSTRAINT fk_assignment_returned_by FOREIGN KEY (returned_by) REFERENCES users(id)  ON DELETE SET NULL,
    UNIQUE KEY uq_assignment_doc_no (doc_no),
    UNIQUE KEY uq_assignment_return_doc_no (return_doc_no),
    INDEX idx_assignment_asset (asset_id, returned_at),
    INDEX idx_assignment_holder (holder_name),
    INDEX idx_assignment_active (returned_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 5d. ASSET ATTACHMENTS (lampiran berkas: faktur, garansi, manual, foto)
--   Disimpan sebagai base64 di LONGTEXT — pola yang sama dengan
--   qr_codes.image_path dan app_settings.logo_*, supaya konsisten dengan cara
--   aplikasi ini sudah menyimpan berkas selama ini.
-- =====================================================================

CREATE TABLE asset_attachments (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    asset_id     BIGINT UNSIGNED NOT NULL,
    category     ENUM('invoice','warranty','manual','photo','other') NOT NULL DEFAULT 'other',
    file_name    VARCHAR(255) NOT NULL,
    mime_type    VARCHAR(100) NOT NULL,
    file_size    INT UNSIGNED NOT NULL,
    data         LONGTEXT NOT NULL,
    notes        VARCHAR(500) NULL,
    uploaded_by  BIGINT UNSIGNED NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_attachment_asset       FOREIGN KEY (asset_id)    REFERENCES assets(id) ON DELETE CASCADE,
    CONSTRAINT fk_attachment_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id)  ON DELETE SET NULL,
    INDEX idx_attachment_asset (asset_id, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 5b. EMAIL CHANGE OTP (verifikasi saat user ganti email login sendiri)
-- =====================================================================

CREATE TABLE email_change_otps (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT UNSIGNED NOT NULL UNIQUE,      -- 1 permintaan aktif per user, request baru menimpa yang lama
    new_email       VARCHAR(150) NOT NULL,
    otp_code        VARCHAR(10) NOT NULL,
    attempts        INT UNSIGNED NOT NULL DEFAULT 0,       -- percobaan verifikasi salah, dibatasi max 5x (lihat controller)
    expires_at      TIMESTAMP NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_email_otp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 6. CUSTOM FIELD VALUES (nilai aktual per aset)
-- =====================================================================

CREATE TABLE asset_custom_field_values (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    asset_id            BIGINT UNSIGNED NOT NULL,
    custom_field_id     BIGINT UNSIGNED NOT NULL,
    value_text          TEXT NULL,                        -- menyimpan semua tipe sebagai text/JSON string
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_cfv_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    CONSTRAINT fk_cfv_field FOREIGN KEY (custom_field_id) REFERENCES asset_custom_fields(id) ON DELETE CASCADE,
    UNIQUE KEY uq_asset_field (asset_id, custom_field_id),  -- satu aset, satu nilai per field
    INDEX idx_cfv_asset (asset_id),
    INDEX idx_cfv_field (custom_field_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- CATATAN: bagian "ASSET ASSIGNMENTS" (siapa/departemen yang memegang aset)
-- sengaja TIDAK ada di sini — tabel asset_assignments sudah dihapus lewat
-- migration_cleanup_unused_schema.sql karena tidak pernah dibangun endpoint
-- atau UI-nya (fitur direncanakan tapi belum pernah diimplementasi).
-- =====================================================================

-- =====================================================================
-- 8. QR CODES
-- =====================================================================

CREATE TABLE qr_codes (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    asset_id        BIGINT UNSIGNED NOT NULL UNIQUE,       -- 1 aset = 1 QR aktif
    code            VARCHAR(100) NOT NULL UNIQUE,          -- token unik dalam URL, misal UUID
    image_path      LONGTEXT NULL,                          -- base64 data URL gambar QR yang digenerate
    scan_url         VARCHAR(255) NOT NULL,                -- URL lengkap yang di-encode dalam QR
    generated_by    BIGINT UNSIGNED NULL,
    generated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_scanned_at TIMESTAMP NULL,
    scan_count      INT UNSIGNED NOT NULL DEFAULT 0,
    CONSTRAINT fk_qr_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    CONSTRAINT fk_qr_generated_by FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_qr_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 9. ASSET STATUS HISTORIES
-- =====================================================================

CREATE TABLE asset_status_histories (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    asset_id        BIGINT UNSIGNED NOT NULL,
    old_status      VARCHAR(50) NULL,
    new_status      VARCHAR(50) NOT NULL,
    changed_by      BIGINT UNSIGNED NULL,
    changed_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes           VARCHAR(255) NULL,
    CONSTRAINT fk_history_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    CONSTRAINT fk_history_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_history_asset (asset_id, changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 10. AUDIT LOGS (generik untuk semua entity)
-- =====================================================================

CREATE TABLE audit_logs (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT UNSIGNED NULL,                 -- NULL jika aksi dari client anonim (mis. scan)
    action          ENUM('create','update','delete','scan','login','logout','export') NOT NULL,
    entity_type     VARCHAR(50) NOT NULL,                 -- 'asset', 'asset_category', dst.
    entity_id       BIGINT UNSIGNED NULL,
    old_values      JSON NULL,                            -- snapshot sebelum perubahan
    new_values      JSON NULL,                             -- snapshot setelah perubahan
    ip_address      VARCHAR(45) NULL,
    user_agent      VARCHAR(255) NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_audit_entity (entity_type, entity_id),
    INDEX idx_audit_user (user_id),
    INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- 11. USER PERMISSIONS (izin per-pengguna per-menu)
--   Menggantikan kontrol akses yang dulu hanya bersandar pada nama peran.
--   `roles` tetap ada sebagai label + preset pengisi cepat matriks izin.
--   Peran `admin` TIDAK dibatasi tabel ini — aksesnya selalu penuh lewat
--   middleware (lihat backend/src/middleware/auth.js). Itu katup pengaman:
--   kalau akses administrator ikut bergantung pada baris di sini, satu
--   kesalahan centang bisa mengunci semua orang keluar dari menu Manajemen
--   Pengguna tanpa ada cara memperbaikinya dari dalam aplikasi.
--   Daftar module_key yang sah ada di backend/src/config/modules.js.
-- =====================================================================

CREATE TABLE user_permissions (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id      BIGINT UNSIGNED NOT NULL,
    module_key   VARCHAR(50) NOT NULL,
    can_view     BOOLEAN NOT NULL DEFAULT FALSE,
    can_create   BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit     BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_userperm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_user_module (user_id, module_key),
    INDEX idx_userperm_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 12. APP SETTINGS (merek: nama aplikasi, nama perusahaan, logo)
--   Membuat aplikasi tidak terikat ke satu perusahaan. Logo disimpan sebagai
--   data URL base64 — pola yang sama dengan qr_codes.image_path — sehingga
--   tidak perlu direktori unggahan dan cadangan database ikut membawa logonya.
--   Tabel ini hanya berisi SATU baris (id = 1).
-- =====================================================================

CREATE TABLE app_settings (
    id            TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
    app_name      VARCHAR(100) NOT NULL DEFAULT 'Asset Inventory',
    company_name  VARCHAR(150) NOT NULL DEFAULT 'Perusahaan Anda',
    tagline       VARCHAR(255) NULL,
    logo_icon     LONGTEXT NULL,              -- ikon persegi: sidebar, topbar, favicon
    logo_light    LONGTEXT NULL,              -- logo penuh untuk latar terang
    logo_dark     LONGTEXT NULL,              -- logo penuh untuk latar gelap
    logo_version  INT UNSIGNED NOT NULL DEFAULT 1,  -- penanda versi untuk cache gambar
    updated_by    BIGINT UNSIGNED NULL,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_settings_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_settings_single_row CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO app_settings (id) VALUES (1);

-- =====================================================================
-- 13. DEPARTMENTS (divisi pemilik aset)
--   Berbeda dari asset_assignments.department yang berupa teks bebas dan
--   hanya berlaku selama aset dipegang seseorang: kolom assets.department_id
--   menempel pada asetnya sendiri, sehingga aset yang tidak dipegang siapa pun
--   (AC ruang rapat, meja kosong) tetap punya penanggung jawab dan bisa masuk
--   laporan per divisi.
-- =====================================================================

CREATE TABLE departments (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code         VARCHAR(30) NOT NULL UNIQUE,     -- mis. FIN, GA, IT, MKT
    name         VARCHAR(150) NOT NULL,
    description  VARCHAR(255) NULL,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_department_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Relasi aset -> departemen dipasang di sini karena tabel departments baru
-- dibuat di atas; pada instalasi baru urutannya harus setelah tabelnya ada.
ALTER TABLE assets
  ADD CONSTRAINT fk_asset_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;


-- =====================================================================
-- 14. STOCK OPNAME (pemeriksaan fisik aset)
--   stock_opnames      = satu putaran pemeriksaan, punya cakupan
--                        (lokasi / sub lokasi / kategori) supaya opname bisa
--                        dikerjakan per ruangan, tidak harus sekantor sekaligus.
--   stock_opname_items = daftar periksanya, dibekukan sekali saat sesi dibuka.
--
--   Daftar periksa sengaja di-SNAPSHOT, bukan dihitung ulang dari tabel assets
--   setiap kali dibuka: inti opname adalah membandingkan keadaan CATATAN saat
--   sesi dimulai dengan keadaan NYATA di lapangan. Kalau daftarnya ikut berubah
--   saat ada orang memindahkan aset di tengah pemeriksaan, selisihnya tidak bisa
--   dipertanggungjawabkan — padahal selisih itulah satu-satunya keluaran yang
--   berguna dari opname.
-- =====================================================================

CREATE TABLE stock_opnames (
    id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    code                  VARCHAR(30) NOT NULL,           -- OPN/2026/0001
    name                  VARCHAR(150) NOT NULL,

    scope_location_id     BIGINT UNSIGNED NULL,           -- NULL semua = seluruh aset aktif
    scope_sub_location_id BIGINT UNSIGNED NULL,
    scope_category_id     BIGINT UNSIGNED NULL,

    status                ENUM('berjalan','selesai','dibatalkan') NOT NULL DEFAULT 'berjalan',
    notes                 VARCHAR(500) NULL,

    created_by            BIGINT UNSIGNED NULL,
    finished_by           BIGINT UNSIGNED NULL,
    finished_at           TIMESTAMP NULL,

    created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_opname_code (code),

    CONSTRAINT fk_opname_location     FOREIGN KEY (scope_location_id)     REFERENCES locations(id)        ON DELETE SET NULL,
    CONSTRAINT fk_opname_sub_location FOREIGN KEY (scope_sub_location_id) REFERENCES sub_locations(id)    ON DELETE SET NULL,
    CONSTRAINT fk_opname_category     FOREIGN KEY (scope_category_id)     REFERENCES asset_categories(id) ON DELETE SET NULL,
    CONSTRAINT fk_opname_created_by   FOREIGN KEY (created_by)            REFERENCES users(id)            ON DELETE SET NULL,
    CONSTRAINT fk_opname_finished_by  FOREIGN KEY (finished_by)           REFERENCES users(id)            ON DELETE SET NULL,

    INDEX idx_opname_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE stock_opname_items (
    id                       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    opname_id                BIGINT UNSIGNED NOT NULL,
    asset_id                 BIGINT UNSIGNED NOT NULL,

    -- Keadaan menurut CATATAN, dibekukan saat sesi dibuka.
    expected_location_id     BIGINT UNSIGNED NULL,
    expected_sub_location_id BIGINT UNSIGNED NULL,
    expected_condition       ENUM('baik','rusak_ringan','rusak_berat') NULL,

    result                   ENUM('belum','ditemukan','salah_lokasi','tidak_ditemukan') NOT NULL DEFAULT 'belum',

    -- Keadaan NYATA saat diperiksa.
    found_location_id        BIGINT UNSIGNED NULL,
    found_sub_location_id    BIGINT UNSIGNED NULL,
    found_condition          ENUM('baik','rusak_ringan','rusak_berat') NULL,

    note                     VARCHAR(500) NULL,
    checked_by               BIGINT UNSIGNED NULL,
    checked_at               TIMESTAMP NULL,

    created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Satu aset sekali per sesi. Ini juga yang membuat pemindaian berulang atas
    -- label yang sama tidak menggandakan baris — hal yang pasti terjadi saat
    -- petugas ragu apakah tadi sudah terpindai atau belum.
    UNIQUE KEY uq_opname_asset (opname_id, asset_id),

    CONSTRAINT fk_opname_item_opname     FOREIGN KEY (opname_id)                REFERENCES stock_opnames(id) ON DELETE CASCADE,
    CONSTRAINT fk_opname_item_asset      FOREIGN KEY (asset_id)                 REFERENCES assets(id)        ON DELETE CASCADE,
    CONSTRAINT fk_opname_item_exp_loc    FOREIGN KEY (expected_location_id)     REFERENCES locations(id)     ON DELETE SET NULL,
    CONSTRAINT fk_opname_item_exp_sub    FOREIGN KEY (expected_sub_location_id) REFERENCES sub_locations(id) ON DELETE SET NULL,
    CONSTRAINT fk_opname_item_found_loc  FOREIGN KEY (found_location_id)        REFERENCES locations(id)     ON DELETE SET NULL,
    CONSTRAINT fk_opname_item_found_sub  FOREIGN KEY (found_sub_location_id)    REFERENCES sub_locations(id) ON DELETE SET NULL,
    CONSTRAINT fk_opname_item_checked_by FOREIGN KEY (checked_by)               REFERENCES users(id)         ON DELETE SET NULL,

    INDEX idx_opname_item_result (opname_id, result)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =====================================================================
-- 15. ASSET REMINDERS (pengingat bertanggal, bisa berulang)
--   Beda dari garansi (satu tanggal tetap): recurrence memajukan tanggalnya
--   sendiri saat ditandai selesai (lihat reminderController.completeReminder),
--   jadi satu baris cukup untuk pengingat yang berulang bertahun-tahun.
-- =====================================================================

CREATE TABLE asset_reminders (
    id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    asset_id       BIGINT UNSIGNED NOT NULL,
    title          VARCHAR(150) NOT NULL,
    reminder_date  DATE NOT NULL,
    recurrence     ENUM('none','monthly','quarterly','yearly') NOT NULL DEFAULT 'none',
    notes          VARCHAR(500) NULL,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_by     BIGINT UNSIGNED NULL,
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_reminder_asset      FOREIGN KEY (asset_id)   REFERENCES assets(id) ON DELETE CASCADE,
    CONSTRAINT fk_reminder_created_by FOREIGN KEY (created_by) REFERENCES users(id)  ON DELETE SET NULL,
    INDEX idx_reminder_asset (asset_id),
    INDEX idx_reminder_due (is_active, reminder_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 16. ASSET MAINTENANCES (jadwal + riwayat servis/kalibrasi/perbaikan)
--   Setiap pemeliharaan adalah PERISTIWA sendiri (vendor, biaya, hasil
--   berbeda tiap kali) — beda dari pengingat yang cukup satu baris berulang.
-- =====================================================================

CREATE TABLE asset_maintenances (
    id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    asset_id          BIGINT UNSIGNED NOT NULL,
    maintenance_type  ENUM('preventive','corrective','calibration','other') NOT NULL DEFAULT 'preventive',
    title             VARCHAR(150) NOT NULL,
    description       VARCHAR(500) NULL,
    scheduled_date    DATE NOT NULL,
    completed_date    DATE NULL,
    status            ENUM('dijadwalkan','selesai','dibatalkan') NOT NULL DEFAULT 'dijadwalkan',
    vendor            VARCHAR(150) NULL,
    cost              DECIMAL(15,2) NULL,
    result_note       VARCHAR(500) NULL,
    created_by        BIGINT UNSIGNED NULL,
    completed_by      BIGINT UNSIGNED NULL,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_maintenance_asset        FOREIGN KEY (asset_id)     REFERENCES assets(id) ON DELETE CASCADE,
    CONSTRAINT fk_maintenance_created_by   FOREIGN KEY (created_by)   REFERENCES users(id)  ON DELETE SET NULL,
    CONSTRAINT fk_maintenance_completed_by FOREIGN KEY (completed_by) REFERENCES users(id)  ON DELETE SET NULL,
    INDEX idx_maintenance_asset (asset_id),
    INDEX idx_maintenance_due (status, scheduled_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =====================================================================
-- 17. CONSUMABLES (barang habis pakai) + kartu stok
--   Beda dari aset tetap: barang di sini dibeli untuk DIPAKAI HABIS, bukan
--   dipinjam-kembalikan. Stok terkini disimpan langsung di consumables
--   (denormalized untuk kecepatan baca) dan HANYA boleh berubah lewat
--   transaksi di consumable_transactions — lihat consumableController.js.
-- =====================================================================

CREATE TABLE consumables (
    id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code           VARCHAR(30) NOT NULL,
    name           VARCHAR(150) NOT NULL,
    category       ENUM('atk','kebersihan','it_supplies','lainnya') NOT NULL DEFAULT 'lainnya',
    unit           VARCHAR(20) NOT NULL DEFAULT 'pcs',
    current_stock  INT NOT NULL DEFAULT 0,
    min_stock      INT UNSIGNED NOT NULL DEFAULT 0,
    location_id    BIGINT UNSIGNED NULL,
    notes          VARCHAR(500) NULL,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_by     BIGINT UNSIGNED NULL,
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_consumable_code (code),
    CONSTRAINT fk_consumable_location   FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
    CONSTRAINT fk_consumable_created_by FOREIGN KEY (created_by)  REFERENCES users(id)     ON DELETE SET NULL,
    INDEX idx_consumable_active (is_active),
    INDEX idx_consumable_low_stock (is_active, current_stock)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE consumable_transactions (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    consumable_id   BIGINT UNSIGNED NOT NULL,
    type            ENUM('masuk','keluar','penyesuaian') NOT NULL,
    quantity        INT NOT NULL,
    balance_after   INT NOT NULL,
    vendor          VARCHAR(150) NULL,
    unit_price      DECIMAL(15,2) NULL,
    requested_by    VARCHAR(150) NULL,
    department      VARCHAR(150) NULL,
    notes           VARCHAR(500) NULL,
    created_by      BIGINT UNSIGNED NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_consumable_txn_item       FOREIGN KEY (consumable_id) REFERENCES consumables(id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_txn_created_by FOREIGN KEY (created_by)    REFERENCES users(id)       ON DELETE SET NULL,
    INDEX idx_consumable_txn_item (consumable_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =====================================================================
-- 18. ASSET REQUESTS (permintaan aset)
--   Arah sebaliknya dari serah terima biasa: karyawan MEMINTA sesuatu, GA
--   meninjau, baru dipenuhi. Begitu dipenuhi, permintaan ini sungguh-sungguh
--   menjadi baris baru di asset_assignments lewat performCheckOut() yang
--   sama dipakai halaman Serahkan Aset — bukan catatan yang berdiri sendiri.
-- =====================================================================

CREATE TABLE asset_requests (
    id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    request_no         VARCHAR(30) NOT NULL,
    requester_name     VARCHAR(150) NOT NULL,
    department         VARCHAR(150) NULL,
    category_id        BIGINT UNSIGNED NULL,
    item_name          VARCHAR(150) NOT NULL,
    reason             VARCHAR(500) NULL,
    priority           ENUM('rendah','sedang','tinggi') NOT NULL DEFAULT 'sedang',
    needed_by          DATE NULL,
    status             ENUM('diajukan','disetujui','ditolak','dipenuhi','dibatalkan') NOT NULL DEFAULT 'diajukan',
    review_note        VARCHAR(500) NULL,
    reviewed_by        BIGINT UNSIGNED NULL,
    reviewed_at        TIMESTAMP NULL,
    fulfilled_asset_id BIGINT UNSIGNED NULL,
    fulfilled_by       BIGINT UNSIGNED NULL,
    fulfilled_at       TIMESTAMP NULL,
    created_by         BIGINT UNSIGNED NULL,
    created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_request_no (request_no),
    CONSTRAINT fk_request_category        FOREIGN KEY (category_id)        REFERENCES asset_categories(id) ON DELETE SET NULL,
    CONSTRAINT fk_request_reviewed_by     FOREIGN KEY (reviewed_by)        REFERENCES users(id)            ON DELETE SET NULL,
    CONSTRAINT fk_request_fulfilled_asset FOREIGN KEY (fulfilled_asset_id) REFERENCES assets(id)           ON DELETE SET NULL,
    CONSTRAINT fk_request_fulfilled_by    FOREIGN KEY (fulfilled_by)       REFERENCES users(id)            ON DELETE SET NULL,
    CONSTRAINT fk_request_created_by      FOREIGN KEY (created_by)         REFERENCES users(id)            ON DELETE SET NULL,
    INDEX idx_request_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Catatan: Laporan Penyusutan (menu Laporan) tidak menambah tabel baru —
-- dihitung langsung dari kolom yang sudah ada di assets (purchase_date,
-- purchase_price, useful_life_months, salvage_value, department_id).
