-- =====================================================================
--  Stok Opname (pemeriksaan fisik aset)
-- =====================================================================
--  Selama ini sistem hanya menyimpan apa yang PERNAH dicatat, bukan apa
--  yang benar-benar masih ada di ruangan. Tidak ada satu pun tempat untuk
--  menjawab pertanyaan yang selalu muncul di akhir tahun: "dari 300 aset di
--  daftar, berapa yang tadi benar-benar kita lihat?".
--
--  Dua tabel di bawah ini merekam satu putaran pemeriksaan fisik:
--
--    stock_opnames       — sesi pemeriksaan. Punya CAKUPAN (lokasi / sub
--                          lokasi / kategori) supaya opname bisa dikerjakan
--                          per ruangan, tidak harus seluruh kantor sekaligus.
--
--    stock_opname_items  — daftar periksa sesi itu. Diisi sekali saat sesi
--                          dibuka: satu baris per aset yang masuk cakupan.
--
--  Kenapa daftar periksanya di-SNAPSHOT, bukan dihitung ulang dari tabel
--  assets setiap kali dibuka? Karena inti opname adalah membandingkan
--  keadaan CATATAN saat sesi dimulai dengan keadaan NYATA di lapangan.
--  Kalau daftarnya ikut berubah saat ada orang memindahkan aset di tengah
--  pemeriksaan, selisihnya jadi tidak bisa dipertanggungjawabkan — dan
--  justru selisih itulah satu-satunya keluaran yang berguna dari opname.
--  Karena itu lokasi & kondisi yang tercatat ikut disalin ke baris item.
--
--  Aman dijalankan pada database berisi data, dan aman dijalankan berulang:
--  seluruhnya CREATE TABLE IF NOT EXISTS, tidak ada tabel lama yang disentuh.
--
--  Jalankan:
--    mysql -u <user> -p it_asset_inventory < backend/migrations/migration_add_stock_opname.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. SESI OPNAME
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_opnames (
    id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    code                  VARCHAR(30) NOT NULL,           -- OPN/2026/0001
    name                  VARCHAR(150) NOT NULL,          -- "Opname Lantai 2 — Agustus 2026"

    -- Cakupan. NULL di ketiganya = seluruh aset aktif.
    scope_location_id     BIGINT UNSIGNED NULL,
    scope_sub_location_id BIGINT UNSIGNED NULL,
    scope_category_id     BIGINT UNSIGNED NULL,

    -- berjalan  : masih boleh diperiksa
    -- selesai   : dikunci, hasilnya jadi laporan selisih
    -- dibatalkan: ditutup tanpa kesimpulan
    status                ENUM('berjalan','selesai','dibatalkan') NOT NULL DEFAULT 'berjalan',

    notes                 VARCHAR(500) NULL,

    created_by            BIGINT UNSIGNED NULL,
    finished_by           BIGINT UNSIGNED NULL,
    finished_at           TIMESTAMP NULL,

    created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_opname_code (code),

    CONSTRAINT fk_opname_location     FOREIGN KEY (scope_location_id)     REFERENCES locations(id)     ON DELETE SET NULL,
    CONSTRAINT fk_opname_sub_location FOREIGN KEY (scope_sub_location_id) REFERENCES sub_locations(id) ON DELETE SET NULL,
    CONSTRAINT fk_opname_category     FOREIGN KEY (scope_category_id)     REFERENCES asset_categories(id)    ON DELETE SET NULL,
    CONSTRAINT fk_opname_created_by   FOREIGN KEY (created_by)            REFERENCES users(id)         ON DELETE SET NULL,
    CONSTRAINT fk_opname_finished_by  FOREIGN KEY (finished_by)           REFERENCES users(id)         ON DELETE SET NULL,

    INDEX idx_opname_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 2. DAFTAR PERIKSA
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_opname_items (
    id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    opname_id               BIGINT UNSIGNED NOT NULL,
    asset_id                BIGINT UNSIGNED NOT NULL,

    -- Keadaan menurut CATATAN, dibekukan saat sesi dibuka.
    expected_location_id     BIGINT UNSIGNED NULL,
    expected_sub_location_id BIGINT UNSIGNED NULL,
    expected_condition       ENUM('baik','rusak_ringan','rusak_berat') NULL,

    -- belum          : belum disentuh petugas
    -- ditemukan      : ada, di tempat yang benar
    -- salah_lokasi   : ada, tapi bukan di lokasi yang tercatat
    -- tidak_ditemukan: sudah dicari, tidak ketemu
    result                  ENUM('belum','ditemukan','salah_lokasi','tidak_ditemukan') NOT NULL DEFAULT 'belum',

    -- Keadaan NYATA saat diperiksa.
    found_location_id       BIGINT UNSIGNED NULL,
    found_sub_location_id   BIGINT UNSIGNED NULL,
    found_condition         ENUM('baik','rusak_ringan','rusak_berat') NULL,

    note                    VARCHAR(500) NULL,
    checked_by              BIGINT UNSIGNED NULL,
    checked_at              TIMESTAMP NULL,

    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Satu aset hanya boleh muncul sekali dalam satu sesi. Ini juga yang
    -- membuat pemindaian berulang atas label yang sama tidak menggandakan
    -- baris — hal yang pasti terjadi saat petugas ragu apakah tadi sudah
    -- terpindai atau belum.
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

-- ---------------------------------------------------------------------
-- 3. IZIN MENU BARU
-- ---------------------------------------------------------------------
--  Menu "Stok Opname" ikut aturan izin per pengguna seperti menu lain.
--  Administrator tidak perlu diberi baris apa pun (aksesnya penuh secara
--  bawaan), tapi pengguna biasa yang sebelumnya boleh mengubah aset hampir
--  pasti juga yang akan menjalankan opname — jadi mereka diberi akses awal
--  di sini supaya menunya tidak muncul kosong tanpa sebab.
--
--  Hanya menyentuh pengguna yang BELUM punya baris untuk modul ini, jadi
--  pencabutan akses yang sudah dilakukan administrator tidak dibatalkan
--  kalau migrasi ini kebetulan dijalankan dua kali.
INSERT INTO user_permissions (user_id, module_key, can_view, can_create, can_edit, can_delete)
SELECT up.user_id, 'opname', TRUE, TRUE, TRUE, FALSE
FROM user_permissions up
WHERE up.module_key = 'assets'
  AND up.can_edit = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM (SELECT * FROM user_permissions) x
    WHERE x.user_id = up.user_id AND x.module_key = 'opname'
  );
