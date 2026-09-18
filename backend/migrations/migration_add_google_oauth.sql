-- Masuk/Daftar dengan Google (lihat authController.googleLogin/googleSignup).
--
-- google_id = klaim "sub" dari token Google (ID unik akun Google itu,
-- tidak pernah berubah walau alamat surelnya diganti). UNIQUE per-tenant
-- (bukan global) supaya konsisten dengan uq_user_tenant_email/username --
-- satu akun Google yang sama boleh dipakai masuk ke beberapa tenant
-- berbeda (mis. konsultan IT yang menangani beberapa klien).
ALTER TABLE users ADD COLUMN google_id VARCHAR(255) NULL;
ALTER TABLE users ADD CONSTRAINT uq_user_tenant_google_id UNIQUE (tenant_id, google_id);
CREATE INDEX idx_users_google_id ON users(google_id);
