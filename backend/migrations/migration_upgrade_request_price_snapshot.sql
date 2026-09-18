-- ============================================================================
--  SNAPSHOT HARGA DI PERMINTAAN UPGRADE (susulan Katalog Paket jadi database)
-- ============================================================================
--  Sebelumnya plan_upgrade_requests TIDAK menyimpan harga sama sekali —
--  billingController.resolveUpgradeRequest mengambil harga LANGSUNG dari
--  katalog SAAT DISETUJUI, bukan saat tenant MENGAJUKAN. Selama katalog cuma
--  bisa diubah lewat deploy (jarang & lambat), risikonya kecil. Sekarang admin
--  platform bisa ubah harga instan lewat menu Katalog Paket — kalau ada yang
--  mengubah harga Starter SEMENTARA satu permintaan upgrade Starter sedang
--  menunggu disetujui, tenant itu akan ditagih harga BARU, bukan harga yang
--  dia lihat saat mengajukan. Kolom `price`/`currency` di sini mengunci harga
--  di titik pengajuan, dan billingController.resolveUpgradeRequest sekarang
--  memakai nilai ini (bukan mengambil ulang dari katalog) lewat
--  subscriptionService.activateSubscription({ priceOverride }).
--
--  `price` NULLABLE — permintaan LAMA yang sudah ada sebelum migrasi ini
--  tidak punya snapshot. Kalau salah satunya baru disetujui SETELAH migrasi
--  ini jalan, activateSubscription() fallback ke harga katalog SAAT ITU
--  (perilaku lama) HANYA untuk baris yang price-nya NULL.
--
--  WAJIB backup database dulu sebelum menjalankan ini di data yang sudah
--  berjalan. Jalankan: psql -U <user> -d <database> -f migration_upgrade_request_price_snapshot.sql
-- ============================================================================

ALTER TABLE plan_upgrade_requests ADD COLUMN price NUMERIC(14,2) NULL;
ALTER TABLE plan_upgrade_requests ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'IDR';
