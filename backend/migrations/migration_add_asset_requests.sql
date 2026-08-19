-- =====================================================================
--  Permintaan Aset (asset requests)
-- =====================================================================
--  Sebelumnya, cara satu-satunya sebuah aset berpindah tangan adalah GA
--  langsung memutuskan "serahkan aset ini ke orang itu". Tidak ada jalur untuk
--  arah sebaliknya: karyawan MEMINTA sesuatu, lalu permintaannya ditinjau
--  sebelum benar-benar dipenuhi. Tabel ini menambahkan alur itu, dan sengaja
--  berakhir di titik yang sama dengan alur serah terima yang sudah ada
--  (asset_assignments) — begitu permintaan dipenuhi, ia sungguh-sungguh
--  menjadi penugasan aset seperti biasa, bukan catatan yang berdiri sendiri.
--
--  Status: diajukan -> disetujui/ditolak -> dipenuhi (dari disetujui)
--                                        -> dibatalkan (dari diajukan/disetujui)
--
--  Aman dijalankan pada database berisi data, dan aman dijalankan berulang.
--
--  Jalankan:
--    mysql -u <user> -p it_asset_inventory < backend/migrations/migration_add_asset_requests.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS asset_requests (
    id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    request_no         VARCHAR(30) NOT NULL,               -- REQ/2026/0001, dibuat otomatis saat diajukan

    -- Peminta dicatat sebagai TEKS, bukan FK ke users — sama seperti
    -- asset_assignments.holder_name — karena peminta umumnya karyawan biasa
    -- tanpa akun aplikasi.
    requester_name     VARCHAR(150) NOT NULL,
    department         VARCHAR(150) NULL,

    category_id        BIGINT UNSIGNED NULL,               -- opsional: membantu menyaring calon aset saat pemenuhan
    item_name          VARCHAR(150) NOT NULL,               -- apa yang diminta, teks bebas (mis. "Laptop untuk staf baru")
    reason             VARCHAR(500) NULL,
    priority           ENUM('rendah','sedang','tinggi') NOT NULL DEFAULT 'sedang',
    needed_by          DATE NULL,

    status             ENUM('diajukan','disetujui','ditolak','dipenuhi','dibatalkan') NOT NULL DEFAULT 'diajukan',
    review_note        VARCHAR(500) NULL,                  -- alasan tolak, atau catatan saat menyetujui
    reviewed_by        BIGINT UNSIGNED NULL,
    reviewed_at        TIMESTAMP NULL,

    -- Diisi saat dipenuhi: aset mana yang dipakai memenuhi permintaan ini,
    -- dan otomatis membuat baris baru di asset_assignments (lihat
    -- requestController.fulfillRequest -> assignmentController.performCheckOut).
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

-- ---------------------------------------------------------------------
-- IZIN MENU BARU
-- ---------------------------------------------------------------------
--  Sama seperti pola migrasi sebelumnya: pengguna yang sudah boleh mengubah
--  aset (menyetujui/memenuhi permintaan pada dasarnya adalah bentuk lain dari
--  serah terima aset) diberi akses awal ke menu ini. Hanya menyentuh
--  pengguna yang BELUM punya baris untuk modul ini.
INSERT INTO user_permissions (user_id, module_key, can_view, can_create, can_edit, can_delete)
SELECT up.user_id, 'requests', TRUE, TRUE, TRUE, TRUE
FROM user_permissions up
WHERE up.module_key = 'assets'
  AND up.can_edit = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM (SELECT * FROM user_permissions) x
    WHERE x.user_id = up.user_id AND x.module_key = 'requests'
  );
