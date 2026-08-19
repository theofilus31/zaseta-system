-- Seed data awal: roles, permissions dasar, dan 1 akun admin
-- Password default akun admin: Admin123! (WAJIB diganti setelah login pertama)
-- Hash di bawah dihasilkan dengan bcrypt (10 rounds) dari password tersebut

INSERT INTO roles (name, description) VALUES
  ('admin', 'Akses penuh: kelola aset, kategori, custom field, dan user'),
  ('it_staff', 'Input dan update aset, generate/print QR'),
  ('viewer', 'Akses baca saja ke daftar dan detail aset');

-- CATATAN: blok "INSERT INTO permissions (...)" yang dulu ada di sini sudah
-- DIHAPUS. Tabel `permissions` & `role_permissions` tidak lagi dibuat oleh
-- schema.sql (lihat migration_cleanup_unused_schema.sql) karena RBAC dicek
-- langsung dari nama role di middleware/auth.js. Selama blok itu masih ada,
-- seed.sql pasti gagal dengan error "Table 'permissions' doesn't exist".

-- Ganti password_hash ini dengan hasil bcrypt password pilihan Anda sendiri:
--   node -e "console.log(require('bcryptjs').hashSync('password_anda', 10))"
INSERT INTO users (username, role_id, name, email, password_hash) VALUES
  ('admin', 1, 'Administrator', 'admin@example.com', '$2a$10$replace.with.a.real.bcrypt.hash.generated.locally');

INSERT INTO asset_categories (name, slug, description) VALUES
  ('Laptop', 'laptop', 'Laptop dan notebook'),
  ('Monitor', 'monitor', 'Layar monitor eksternal'),
  ('Printer', 'printer', 'Printer dan scanner'),
  ('Networking', 'networking', 'Router, switch, access point');

INSERT INTO asset_custom_fields (category_id, field_key, field_label, field_type, is_required, sort_order) VALUES
  (NULL, 'warranty_expiry', 'Tanggal Berakhir Garansi', 'date', FALSE, 1),
  (1, 'ram_gb', 'RAM (GB)', 'number', FALSE, 2),
  (1, 'storage_type', 'Tipe Storage', 'select', FALSE, 3);

UPDATE asset_custom_fields SET field_options = '["HDD","SSD","NVMe"]' WHERE field_key = 'storage_type';
