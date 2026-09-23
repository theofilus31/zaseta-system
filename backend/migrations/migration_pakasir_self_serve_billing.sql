-- Pembayaran manual (transfer bank + verifikasi admin platform) DIHAPUS dari
-- alur ganti paket tenant -- upgrade ke paket berbayar kini dibayar langsung
-- lewat Pakasir (payment gateway, lihat services/paymentGateway/PakasirProvider.js)
-- dan dikonfirmasi OTOMATIS lewat webhook, bukan lagi ditinjau manusia.
-- Pindah ke paket TANPA biaya (Free) diterapkan seketika (tidak ada uang
-- untuk diverifikasi siapa pun).
--
-- Kolom baru di plan_upgrade_requests untuk melacak transaksi Pakasir:
ALTER TABLE plan_upgrade_requests ADD COLUMN payment_provider VARCHAR(20) NOT NULL DEFAULT 'pakasir';
ALTER TABLE plan_upgrade_requests ADD COLUMN order_id VARCHAR(60) NULL UNIQUE;
ALTER TABLE plan_upgrade_requests ADD COLUMN provider_transaction_id VARCHAR(150) NULL;
ALTER TABLE plan_upgrade_requests ADD COLUMN paid_at TIMESTAMP NULL;

-- 'paid'    = dikonfirmasi lunas oleh webhook Pakasir (menggantikan 'approved'
--             untuk baris BARU).
-- 'applied' = perubahan ke paket TANPA biaya (Free), diterapkan seketika
--             tanpa pembayaran.
-- 'canceled'= checkout dibatalkan tenant, atau transaksi Pakasir dibatalkan/
--             kedaluwarsa.
-- 'approved'/'rejected' DIPERTAHANKAN di CHECK ini HANYA supaya baris LAMA
-- (dari alur verifikasi manual sebelum migrasi ini) tetap valid dibaca --
-- tidak ada baris BARU yang akan berstatus itu lagi.
ALTER TABLE plan_upgrade_requests DROP CONSTRAINT plan_upgrade_requests_status_check;
ALTER TABLE plan_upgrade_requests ADD CONSTRAINT plan_upgrade_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'paid', 'applied', 'canceled'));
