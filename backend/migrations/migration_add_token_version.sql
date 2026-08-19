-- =====================================================================
--  Pencabutan Token (token_version)
-- =====================================================================
--  Sebelum ini, token JWT yang sudah terbit tidak bisa dicabut sama sekali —
--  kalau kata sandi seseorang diganti (baik oleh dirinya sendiri, atau
--  dipaksa admin karena diduga bocor), token lama yang sudah beredar tetap
--  sah sampai masa berlakunya habis sendiri (8 jam).
--
--  token_version adalah angka penanda "generasi" token yang sah untuk akun
--  ini. Setiap token JWT membawa angka ini di dalamnya saat diterbitkan;
--  middleware/auth.js membandingkannya dengan angka yang tersimpan di baris
--  pengguna pada SETIAP permintaan (baris ini toh sudah dibaca ulang tiap
--  request untuk memeriksa status akun, jadi tidak ada biaya query tambahan).
--  Menaikkan angkanya membuat SEMUA token lama seketika tidak sah, tanpa
--  perlu daftar token yang diblokir satu per satu.
--
--  Dinaikkan saat: kata sandi diganti (baik lewat halaman Profil sendiri,
--  maupun dipaksa admin lewat Manajemen Pengguna).
--
--  Aman dijalankan pada database berisi data, dan aman dijalankan berulang.
--
--  Jalankan:
--    mysql -u <user> -p it_asset_inventory < backend/migrations/migration_add_token_version.sql
-- =====================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version INT UNSIGNED NOT NULL DEFAULT 1
    COMMENT 'Dinaikkan untuk mencabut semua token JWT lama akun ini';
