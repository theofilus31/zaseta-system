-- ============================================================================
--  KATALOG PAKET PINDAH KE DATABASE (susulan billing Fase 4)
-- ============================================================================
--  Sebelumnya PLANS di backend/src/config/plans.js adalah array statis di
--  kode — mengubah harga/limit/fitur paket butuh deploy ulang. Sekarang
--  tabel `plans` sungguhan, dikelola admin platform lewat menu Katalog Paket
--  (GET/POST/PATCH/DELETE /api/platform/plans). `config/plans.js` (nama
--  berkas TETAP) sekarang jadi pemuat cache di memori, bukan array statis —
--  pola yang sama dengan utils/ipWhitelist.js.
--
--  SENGAJA BUKAN FK dari tenants.plan/subscriptions.plan_id/
--  plan_upgrade_requests.requested_plan — tenant vendor sendiri (dibuat
--  scripts/bootstrap-super-admin.js) memakai plan_id 'enterprise_custom'
--  yang BUKAN bagian katalog publik. Larangan hapus paket yang masih dipakai
--  ditegakkan di kode (platformController.deletePlan), bukan di database.
--
--  WAJIB backup database dulu sebelum menjalankan ini di data yang sudah
--  berjalan. Jalankan: psql -U <user> -d <database> -f migration_plans_catalog_db.sql
-- ============================================================================

CREATE TABLE plans (
    id                  VARCHAR(50) PRIMARY KEY,
    name                VARCHAR(100) NOT NULL,
    tagline             VARCHAR(255) NOT NULL DEFAULT '',
    price               INT NOT NULL DEFAULT 0,
    price_yearly        INT NULL,
    max_assets          INT NULL,
    max_users           INT NULL,
    location_limit      INT NULL,
    features            JSONB NOT NULL DEFAULT '[]'::jsonb,
    highlight           BOOLEAN NOT NULL DEFAULT FALSE,
    custom              BOOLEAN NOT NULL DEFAULT FALSE,
    self_serve          BOOLEAN NOT NULL DEFAULT TRUE,
    custom_pricing_hint VARCHAR(255) NULL,
    sort_order          INT NOT NULL DEFAULT 0,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_plans_sort_order ON plans(sort_order);
CREATE TRIGGER trg_plans_updated_at BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Nilai persis yang sebelumnya hardcode di config/plans.js — database yang
-- sudah berjalan TIDAK kehilangan/berubah apa pun setelah migrasi ini.
INSERT INTO plans (id, name, tagline, price, price_yearly, max_assets, max_users, location_limit, features, highlight, custom, self_serve, custom_pricing_hint, sort_order, is_active) VALUES
('free', 'Free', 'Untuk mencoba sistem — tidak perlu kartu pembayaran.', 0, 0, 100, 2, 1,
    '["100 aset","2 pengguna, 1 lokasi","Manajemen aset dasar","Dasbor ringkasan aset","Kode QR aset","Riwayat & ekspor data dasar","Dukungan komunitas"]'::jsonb,
    FALSE, FALSE, TRUE, NULL, 0, TRUE),
('starter', 'Starter', 'Perusahaan kecil yang mulai serius merapikan aset.', 99000, 990000, 1000, 5, NULL,
    '["1.000 aset, 5 pengguna","Multi-lokasi & sub-lokasi","Perpindahan (mutasi) aset","Manajemen pemeliharaan","Laporan lebih detail","Impor data dari Excel","QR/Barcode lanjutan","Dukungan prioritas"]'::jsonb,
    FALSE, FALSE, TRUE, NULL, 1, TRUE),
('business', 'Business', 'Paling banyak dipilih — tim IT/GA dengan banyak lokasi.', 249000, 2490000, 5000, 15, NULL,
    '["5.000 aset, 15 pengguna","Alur persetujuan (approval)","Peran & izin akses granular","Log audit","Penyusutan nilai aset","Laporan lanjutan","Impor & ekspor Excel","Dukungan prioritas"]'::jsonb,
    TRUE, FALSE, TRUE, NULL, 2, TRUE),
('enterprise', 'Enterprise', 'Organisasi besar — harga mulai dari, siap disesuaikan kebutuhan.', 599000, 5990000, 20000, 50, NULL,
    '["20.000+ aset, 50+ pengguna","Peran & izin akses lanjutan","Alur persetujuan lanjutan","Log audit lanjutan","Penyusutan aset & laporan kustom","Multi-cabang/lokasi tanpa batas","Akses API & dukungan integrasi","Dukungan prioritas/khusus"]'::jsonb,
    FALSE, FALSE, TRUE, 'Butuh kapasitas lebih besar atau kontrak/SLA khusus?', 3, TRUE);
