-- =====================================================================
--  Pengaturan Merek (nama aplikasi, nama perusahaan, logo)
-- =====================================================================
--  Membuat aplikasi ini tidak lagi terikat ke satu perusahaan. Sebelumnya
--  nama "PT Rukun Mitra Sejati" dan berkas logo tertulis langsung di dalam
--  kode, sehingga memakainya di perusahaan lain berarti menyunting kode.
--
--  Logo disimpan sebagai data URL base64 di kolom LONGTEXT — pola yang sama
--  dengan qr_codes.image_path yang sudah dipakai sejak awal. Konsekuensinya:
--  tidak perlu direktori unggahan, tidak ada masalah hak akses berkas, dan
--  cadangan database otomatis ikut membawa logonya.
--
--  Supaya ukurannya tidak membebani, logo TIDAK dikirim lewat endpoint
--  pengaturan biasa; ada endpoint gambar tersendiri yang menyajikannya
--  dengan header cache (lihat settingsController).
--
--  Tabel ini sengaja hanya berisi SATU baris (id = 1).
--
--  Jalankan:
--    mysql -u <user> -p it_asset_inventory < backend/migrations/migration_add_app_settings.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS app_settings (
    id            TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
    app_name      VARCHAR(100) NOT NULL DEFAULT 'Asset Inventory',
    company_name  VARCHAR(150) NOT NULL DEFAULT 'Perusahaan Anda',
    tagline       VARCHAR(255) NULL,          -- kalimat pendek di halaman masuk

    -- Data URL base64, mis. "data:image/png;base64,iVBOR..."
    logo_icon     LONGTEXT NULL,              -- ikon persegi: sidebar, topbar, favicon
    logo_light    LONGTEXT NULL,              -- logo penuh untuk latar terang
    logo_dark     LONGTEXT NULL,              -- logo penuh untuk latar gelap

    -- Dinaikkan setiap logo berubah, dipakai sebagai penanda versi pada URL
    -- gambar supaya cache peramban ikut disegarkan.
    logo_version  INT UNSIGNED NOT NULL DEFAULT 1,

    updated_by    BIGINT UNSIGNED NULL,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_settings_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
    -- Kunci pengaman: mustahil ada baris kedua
    CONSTRAINT chk_settings_single_row CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Baris awal. Nama perusahaan diisi nilai yang sedang berlaku supaya instalasi
-- yang sudah berjalan tidak berubah tampilannya setelah migrasi ini.
INSERT INTO app_settings (id, app_name, company_name, tagline)
VALUES (
    1,
    'Asset Inventory',
    'PT Rukun Mitra Sejati',
    'Mencatat, memindahkan, dan menelusuri seluruh aset perusahaan dari satu tempat.'
)
ON DUPLICATE KEY UPDATE id = id;   -- sudah ada = biarkan apa adanya
