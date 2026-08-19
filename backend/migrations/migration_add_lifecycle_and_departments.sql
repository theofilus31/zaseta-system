-- =====================================================================
--  TAHAP 1 — Siklus hidup aset yang utuh + kepemilikan departemen
-- =====================================================================
--  Dua celah yang menghambat pemakaian oleh bagian General Affairs:
--
--  1. TIDAK ADA STATUS UNTUK ASET YANG KELUAR BUKAN KARENA DIJUAL.
--     Status lama hanya mengenal dijual/terjual/dipindah/dipakai/idle.
--     Aset yang HILANG atau DIHAPUSKAN (rusak total lalu dimusnahkan) tidak
--     punya tempat — satu-satunya pilihan adalah menghapus datanya, dan itu
--     justru menyembunyikan barang yang paling perlu dipertanggungjawabkan.
--     Keduanya kini jadi status tersendiri, disertai kolom berita acara.
--
--  2. ASET TIDAK PUNYA PEMILIK DEPARTEMEN.
--     Aset punya lokasi, tapi departemen hanya melekat pada data custody —
--     sehingga aset yang tidak dipegang siapa pun (AC ruang rapat, meja
--     kosong) tidak punya penanggung jawab, dan laporan "aset milik Divisi X"
--     — format paling umum di GA — tidak bisa dibuat.
--
--  Aman dijalankan pada database berisi data: seluruhnya penambahan.
--  Menambah nilai di akhir ENUM tidak mengubah baris yang sudah ada.
--
--  Jalankan:
--    mysql -u <user> -p it_asset_inventory < backend/migrations/migration_add_lifecycle_and_departments.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. DEPARTEMEN
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code         VARCHAR(30) NOT NULL UNIQUE,     -- mis. FIN, GA, IT, MKT
    name         VARCHAR(150) NOT NULL,           -- mis. Finance & Accounting
    description  VARCHAR(255) NULL,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_department_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 2. STATUS BARU + KOLOM BERITA ACARA
-- ---------------------------------------------------------------------
-- 'hilang'     : raib/dicuri, masih dicari pertanggungjawabannya
-- 'dihapuskan' : resmi dikeluarkan dari inventaris (musnah, afkir, hibah)
ALTER TABLE assets
  MODIFY COLUMN status
    ENUM('dijual','terjual','dipindah','dipakai','idle','hilang','dihapuskan')
    NOT NULL DEFAULT 'idle';

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS department_id    BIGINT UNSIGNED NULL COMMENT 'Departemen pemilik/penanggung jawab aset',
  ADD COLUMN IF NOT EXISTS retired_date     DATE NULL            COMMENT 'Tanggal aset dinyatakan hilang/dihapuskan',
  ADD COLUMN IF NOT EXISTS retired_reason   VARCHAR(500) NULL    COMMENT 'Alasan — wajib diisi saat status hilang/dihapuskan',
  ADD COLUMN IF NOT EXISTS retired_doc_no   VARCHAR(100) NULL    COMMENT 'Nomor berita acara/laporan kehilangan';

-- Dipisah dari ADD COLUMN karena MariaDB menolak referensi kolom yang baru
-- dibuat pada pernyataan ALTER yang sama.
--
-- IF NOT EXISTS penting di sini: tanpa itu, menjalankan ulang migrasi ini
-- berhenti dengan "errno: 121 Duplicate key on write or update" karena nama
-- constraint-nya sudah terpakai — padahal sisa berkas ini sudah aman diulang.
ALTER TABLE assets
  ADD CONSTRAINT fk_asset_department FOREIGN KEY IF NOT EXISTS (department_id) REFERENCES departments(id) ON DELETE SET NULL;

ALTER TABLE assets
  ADD INDEX IF NOT EXISTS idx_asset_department (department_id);

-- ---------------------------------------------------------------------
-- 3. Departemen awal — diambil dari yang sudah terlanjur diketik di custody
-- ---------------------------------------------------------------------
-- Nama departemen selama ini ditulis bebas di asset_assignments.department.
-- Nilai yang sudah ada dipindahkan jadi baris master supaya tidak hilang;
-- kodenya diturunkan dari nama dan boleh dirapikan lagi lewat menu Departemen.
INSERT INTO departments (code, name)
SELECT UPPER(LEFT(REPLACE(department, ' ', ''), 10)) AS code, department
FROM (
    SELECT DISTINCT TRIM(department) AS department
    FROM asset_assignments
    WHERE department IS NOT NULL AND TRIM(department) <> ''
) AS sumber
ON DUPLICATE KEY UPDATE departments.name = departments.name;
