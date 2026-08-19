-- =====================================================================
--  Pengingat Bertanggal, Pemeliharaan, dan Pemberitahuan
-- =====================================================================
--  Tiga kemampuan yang saling melengkapi — dua tabel baru di sini, dan
--  keduanya sama-sama dibaca oleh satu titik akhir baru (/api/notifications)
--  yang menggabungkan garansi, pengingat, dan pemeliharaan jadi satu daftar
--  "perlu ditindaklanjuti" di lonceng bagian atas aplikasi.
--
--  1. asset_reminders — pengingat bebas per aset (perpanjangan lisensi,
--     servis berkala, asuransi, kontrak sewa) yang selama ini tidak punya
--     tempat sama sekali. Beda dari garansi (satu tanggal tetap): pengingat
--     bisa BERULANG. Recurrence disimpan di baris yang sama, bukan riwayat
--     terpisah — begitu ditandai selesai, tanggalnya dimajukan ke periode
--     berikutnya (lihat reminderController.completeReminder), sehingga satu
--     baris cukup untuk pengingat yang berulang bertahun-tahun.
--
--  2. asset_maintenances — jadwal dan riwayat servis/kalibrasi/perbaikan.
--     Beda dari pengingat: setiap pemeliharaan adalah PERISTIWA sendiri
--     (ada vendor, biaya, hasil), bukan sekadar tanggal yang berulang —
--     jadi setiap siklus servis dicatat sebagai baris baru, mirip pola
--     asset_assignments (satu baris = satu peristiwa, riwayat tidak dihapus).
--
--  Aman dijalankan pada database berisi data, dan aman dijalankan berulang.
--
--  Jalankan:
--    mysql -u <user> -p it_asset_inventory < backend/migrations/migration_add_reminders_maintenance.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PENGINGAT BERTANGGAL
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS asset_reminders (
    id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    asset_id       BIGINT UNSIGNED NOT NULL,

    title          VARCHAR(150) NOT NULL,          -- mis. "Perpanjangan Lisensi Antivirus"
    reminder_date  DATE NOT NULL,
    recurrence     ENUM('none','monthly','quarterly','yearly') NOT NULL DEFAULT 'none',
    notes          VARCHAR(500) NULL,

    -- FALSE = pengingat sekali-jalan yang sudah ditandai selesai. Pengingat
    -- berulang tidak pernah nonaktif sendiri — hanya tanggalnya yang maju.
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,

    created_by     BIGINT UNSIGNED NULL,
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_reminder_asset      FOREIGN KEY (asset_id)   REFERENCES assets(id) ON DELETE CASCADE,
    CONSTRAINT fk_reminder_created_by FOREIGN KEY (created_by) REFERENCES users(id)  ON DELETE SET NULL,

    INDEX idx_reminder_asset (asset_id),
    INDEX idx_reminder_due (is_active, reminder_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 2. PEMELIHARAAN (jadwal + riwayat servis/kalibrasi/perbaikan)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS asset_maintenances (
    id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    asset_id          BIGINT UNSIGNED NOT NULL,

    maintenance_type  ENUM('preventive','corrective','calibration','other') NOT NULL DEFAULT 'preventive',
    title             VARCHAR(150) NOT NULL,          -- mis. "Servis AC 3 Bulanan"
    description       VARCHAR(500) NULL,

    scheduled_date    DATE NOT NULL,
    completed_date    DATE NULL,
    status            ENUM('dijadwalkan','selesai','dibatalkan') NOT NULL DEFAULT 'dijadwalkan',

    vendor            VARCHAR(150) NULL,
    cost              DECIMAL(15,2) NULL,
    result_note       VARCHAR(500) NULL,              -- catatan hasil, diisi saat ditandai selesai

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
