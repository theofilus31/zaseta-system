-- =====================================================================
--  Lampiran Berkas Aset + Berita Acara Serah Terima (BAST)
-- =====================================================================
--  Dua kebutuhan yang berbeda tapi sering muncul bersamaan di audit aset:
--
--  1. LAMPIRAN BERKAS — faktur pembelian, kartu garansi, manual, atau foto
--     kondisi aset selama ini tidak punya tempat sama sekali di sistem.
--     Kalau finance minta bukti pembelian sebuah laptop, jawabannya masih
--     "coba saya cari di lemari arsip". Tabel asset_attachments menyimpan
--     berkas itu menempel langsung pada asetnya.
--
--     Disimpan sebagai base64 di kolom LONGTEXT — pola yang sama dengan
--     qr_codes.image_path dan app_settings.logo_*. Konsisten dengan cara
--     aplikasi ini menyimpan berkas selama ini: tidak ada folder unggahan
--     terpisah yang perlu ikut dipindah saat aplikasinya dipindah server.
--
--  2. BERITA ACARA SERAH TERIMA — setiap serah terima aset (asset_assignments)
--     sekarang bisa dicetak jadi dokumen formal bertanda tangan. Nomor
--     dokumennya dibuat SEKALI SAJA saat pertama kali dicetak (bukan saat
--     serah terima dicatat), supaya serah terima yang tidak pernah dicetak
--     tidak ikut memakai nomor urut — sama seperti pola nomor sesi opname.
--
--     Ada dua kolom nomor terpisah (doc_no untuk serah, return_doc_no untuk
--     kembali) karena satu baris asset_assignments mewakili SATU siklus
--     pinjam-kembali, dan keduanya adalah dokumen berbeda yang bisa dicetak
--     di waktu berbeda.
--
--  Aman dijalankan pada database berisi data, dan aman dijalankan berulang.
--
--  Jalankan:
--    mysql -u <user> -p it_asset_inventory < backend/migrations/migration_add_asset_attachments_and_bast.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LAMPIRAN BERKAS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS asset_attachments (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    asset_id     BIGINT UNSIGNED NOT NULL,

    category     ENUM('invoice','warranty','manual','photo','other') NOT NULL DEFAULT 'other',
    file_name    VARCHAR(255) NOT NULL,
    mime_type    VARCHAR(100) NOT NULL,
    file_size    INT UNSIGNED NOT NULL,          -- byte, disimpan terpisah supaya tidak perlu menghitung ulang dari base64
    data         LONGTEXT NOT NULL,              -- data URL base64 lengkap

    notes        VARCHAR(500) NULL,
    uploaded_by  BIGINT UNSIGNED NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_attachment_asset       FOREIGN KEY (asset_id)    REFERENCES assets(id) ON DELETE CASCADE,
    CONSTRAINT fk_attachment_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id)  ON DELETE SET NULL,

    INDEX idx_attachment_asset (asset_id, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 2. NOMOR BERITA ACARA PADA SERAH TERIMA
-- ---------------------------------------------------------------------
ALTER TABLE asset_assignments
  ADD COLUMN IF NOT EXISTS doc_no        VARCHAR(30) NULL COMMENT 'Nomor BAST serah, dibuat saat pertama kali dicetak',
  ADD COLUMN IF NOT EXISTS return_doc_no VARCHAR(30) NULL COMMENT 'Nomor BAST kembali, dibuat saat pertama kali dicetak';

ALTER TABLE asset_assignments
  ADD UNIQUE KEY IF NOT EXISTS uq_assignment_doc_no (doc_no),
  ADD UNIQUE KEY IF NOT EXISTS uq_assignment_return_doc_no (return_doc_no);
