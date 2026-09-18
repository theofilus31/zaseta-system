-- Seed data awal: roles, permissions dasar, dan 1 akun admin
-- Password default akun admin: Admin123! (WAJIB diganti setelah login pertama)
-- Hash di bawah dihasilkan dengan bcrypt (10 rounds) dari password tersebut

-- CATATAN: roles (admin/it_staff/viewer) TIDAK diinsert di sini lagi --
-- schema.postgres.sql sudah menyisipkannya sendiri tepat setelah membuat
-- tabel roles. Dulu seed.sql ini menginsertnya lagi dan berakhir dengan
-- "duplicate key value violates unique constraint roles_name_key".
--
-- CATATAN LAMA: blok "INSERT INTO permissions (...)" yang dulu ada di sini
-- sudah DIHAPUS. Tabel `permissions` & `role_permissions` tidak lagi dibuat
-- oleh schema.sql (lihat migration_cleanup_unused_schema.sql) karena RBAC
-- dicek langsung dari nama role di middleware/auth.js.

-- Tenant #1 -- schema.postgres.sql (Fase 1 SaaS) mewajibkan setiap user
-- punya tenant_id, jadi harus ada minimal satu tenant sebelum insert users.
INSERT INTO tenants (slug, company_name, status, plan) VALUES
  ('default', 'Zaseta Demo', 'active', 'business');

-- Ganti password_hash ini dengan hasil bcrypt password pilihan Anda sendiri:
--   node -e "console.log(require('bcryptjs').hashSync('password_anda', 10))"
-- is_platform_admin = TRUE supaya akun ini juga bisa masuk /platform/* (panel
-- admin platform lintas tenant, Fase 5 SaaS) -- bukan cuma admin tenant biasa.
-- email_verified_at diisi NOW() -- akun bawaan seed bukan hasil pendaftaran
-- mandiri, jadi tidak perlu (dan tidak bisa) melalui alur verifikasi OTP
-- (lihat catatan users.email_verified_at dan authController.signup).
INSERT INTO users (tenant_id, username, role_id, is_platform_admin, name, email, password_hash, email_verified_at) VALUES
  ((SELECT id FROM tenants WHERE slug = 'default'), 'admin', 1, TRUE, 'Administrator', 'admin@example.com', '$2a$10$replace.with.a.real.bcrypt.hash.generated.locally', NOW());

INSERT INTO asset_categories (tenant_id, name, slug, description) VALUES
  ((SELECT id FROM tenants WHERE slug = 'default'), 'Laptop', 'laptop', 'Laptop dan notebook'),
  ((SELECT id FROM tenants WHERE slug = 'default'), 'Monitor', 'monitor', 'Layar monitor eksternal'),
  ((SELECT id FROM tenants WHERE slug = 'default'), 'Printer', 'printer', 'Printer dan scanner'),
  ((SELECT id FROM tenants WHERE slug = 'default'), 'Networking', 'networking', 'Router, switch, access point');

INSERT INTO asset_custom_fields (tenant_id, category_id, field_key, field_label, field_type, is_required, sort_order) VALUES
  ((SELECT id FROM tenants WHERE slug = 'default'), NULL, 'warranty_expiry', 'Tanggal Berakhir Garansi', 'date', FALSE, 1),
  ((SELECT id FROM tenants WHERE slug = 'default'), (SELECT id FROM asset_categories WHERE slug = 'laptop'), 'ram_gb', 'RAM (GB)', 'number', FALSE, 2),
  ((SELECT id FROM tenants WHERE slug = 'default'), (SELECT id FROM asset_categories WHERE slug = 'laptop'), 'storage_type', 'Tipe Storage', 'select', FALSE, 3);

UPDATE asset_custom_fields SET field_options = '["HDD","SSD","NVMe"]' WHERE field_key = 'storage_type';
