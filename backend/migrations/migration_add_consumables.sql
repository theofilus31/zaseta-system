-- =====================================================================
--  Barang Habis Pakai (consumables)
-- =====================================================================
--  Kertas, toner, alat kebersihan, kabel — barang yang dibeli untuk DIPAKAI
--  HABIS, bukan dipinjam-kembalikan seperti aset tetap. Sistem ini sebelumnya
--  hanya mengerti barang yang punya identitas satu-satu (kode aset sendiri,
--  dipindah, diserahkan). Stok kertas 50 rim tidak punya tempat sama sekali.
--
--  Dua tabel:
--
--    consumables             — daftar barang (SKU) beserta stok TERKINI.
--                              Stok disimpan langsung di sini (denormalized)
--                              supaya daftar bisa ditampilkan cepat tanpa
--                              menjumlah seluruh riwayat transaksi setiap
--                              kali halaman dibuka — dan tetap konsisten
--                              karena HANYA endpoint transaksi yang boleh
--                              mengubahnya (lihat consumableController).
--
--    consumable_transactions — kartu stok: setiap penerimaan, pengeluaran,
--                              dan penyesuaian dicatat sebagai baris sendiri
--                              dan tidak pernah dihapus, sama seperti pola
--                              asset_assignments (satu baris = satu peristiwa).
--                              `balance_after` menyimpan hasil akhir sebagai
--                              snapshot, supaya kartu stok bisa dibaca tanpa
--                              menghitung ulang dari awal waktu.
--
--  Aman dijalankan pada database berisi data, dan aman dijalankan berulang.
--
--  Jalankan:
--    mysql -u <user> -p it_asset_inventory < backend/migrations/migration_add_consumables.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. BARANG (master + stok terkini)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consumables (
    id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    code           VARCHAR(30) NOT NULL,               -- BHP-0001, dibuat otomatis
    name           VARCHAR(150) NOT NULL,
    category       ENUM('atk','kebersihan','it_supplies','lainnya') NOT NULL DEFAULT 'lainnya',
    unit           VARCHAR(20) NOT NULL DEFAULT 'pcs',  -- satuan: pcs, box, rim, liter, dus, botol, dst.

    current_stock  INT NOT NULL DEFAULT 0,              -- HANYA diubah lewat consumable_transactions
    min_stock      INT UNSIGNED NOT NULL DEFAULT 0,     -- ambang batas untuk peringatan stok menipis

    location_id    BIGINT UNSIGNED NULL,                -- tempat penyimpanan, opsional
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

-- ---------------------------------------------------------------------
-- 2. KARTU STOK (riwayat masuk / keluar / penyesuaian)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consumable_transactions (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    consumable_id   BIGINT UNSIGNED NOT NULL,

    type            ENUM('masuk','keluar','penyesuaian') NOT NULL,
    quantity        INT NOT NULL,          -- selalu bernilai positif; arah ditentukan oleh `type`
    balance_after   INT NOT NULL,          -- stok setelah transaksi ini — snapshot untuk jejak audit

    -- Konteks "masuk" (penerimaan/pembelian)
    vendor          VARCHAR(150) NULL,
    unit_price      DECIMAL(15,2) NULL,

    -- Konteks "keluar" (permintaan/pemakaian). Peminta dicatat sebagai TEKS
    -- bebas — sama seperti asset_assignments.holder_name — karena penerima
    -- barang habis pakai umumnya karyawan biasa tanpa akun aplikasi.
    requested_by    VARCHAR(150) NULL,
    department      VARCHAR(150) NULL,

    notes           VARCHAR(500) NULL,
    created_by      BIGINT UNSIGNED NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_consumable_txn_item       FOREIGN KEY (consumable_id) REFERENCES consumables(id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_txn_created_by FOREIGN KEY (created_by)    REFERENCES users(id)       ON DELETE SET NULL,

    INDEX idx_consumable_txn_item (consumable_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 3. IZIN MENU BARU
-- ---------------------------------------------------------------------
--  Sama seperti pola pada migration_add_stock_opname.sql: pengguna yang
--  sudah boleh mengubah aset kemungkinan besar juga yang akan mencatat stok
--  barang habis pakai, jadi diberi akses awal supaya menunya tidak muncul
--  kosong tanpa sebab. Hanya menyentuh pengguna yang BELUM punya baris untuk
--  modul ini, jadi pencabutan akses oleh administrator tidak dibatalkan
--  kalau migrasi ini kebetulan dijalankan dua kali.
INSERT INTO user_permissions (user_id, module_key, can_view, can_create, can_edit, can_delete)
SELECT up.user_id, 'consumables', TRUE, TRUE, TRUE, TRUE
FROM user_permissions up
WHERE up.module_key = 'assets'
  AND up.can_edit = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM (SELECT * FROM user_permissions) x
    WHERE x.user_id = up.user_id AND x.module_key = 'consumables'
  );
