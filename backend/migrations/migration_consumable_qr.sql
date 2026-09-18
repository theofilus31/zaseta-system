-- ============================================================================
--  KODE QR/BARCODE UNTUK BARANG HABIS PAKAI
-- ============================================================================
--  Sebelumnya cuma aset tetap yang bisa dipindai (qr_codes, /scan/:code).
--  Barang habis pakai (consumables) sekarang juga bisa diberi label QR/barcode
--  sendiri — begitu dipindai petugas yang berhak, muncul tombol "Stok Masuk"
--  dan "Stok Keluar" langsung di tempat, tanpa perlu membuka menu Barang
--  Habis Pakai dan mencari barangnya lagi satu per satu.
--
--  Tabel TERPISAH dari qr_codes (bukan kolom nullable tambahan di sana) —
--  satu tabel yang harus menampung dua jenis entitas (asset_id ATAU
--  consumable_id, salah satu NULL) akan memaksa constraint UNIQUE-nya jadi
--  rumit dan berisiko meregresi alur pindai aset yang sudah lama berjalan.
--
--  Rute pindai juga terpisah: /scan-consumable/:code (BUKAN /scan/:code yang
--  sudah ada) — lihat consumableQrController.js, publicController.js
--  (scanConsumable), dan frontend/src/pages/ConsumablePublicScanPage.jsx.
--
--  Barang yang sudah ada SEBELUM migrasi ini tidak dibuatkan baris di sini
--  secara otomatis (tidak ada backfill) — QR-nya dibuat on-demand begitu
--  pertama kali dibuka lewat "Cetak Barcode" (lihat
--  consumableQrController.getConsumableQr).
-- ============================================================================

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
