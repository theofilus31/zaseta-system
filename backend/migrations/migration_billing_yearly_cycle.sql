-- ============================================================================
--  SIKLUS TAGIHAN TAHUNAN (susulan Fase 4 SaaS)
-- ============================================================================
--  Sebelumnya cuma ada siklus bulanan (price di config/plans.js, expiry 30
--  hari tetap di billingController). Sekarang tenant bisa memilih bulanan
--  ATAU tahunan (priceYearly = price x 10, konvensi "2 bulan gratis") saat
--  mengajukan upgrade.
--
--  plan_upgrade_requests.billing_cycle → SIKLUS YANG DIAJUKAN, dicatat saat
--  request dibuat (createUpgradeRequest) — dipakai resolveUpgradeRequest saat
--  menyetujui untuk menghitung plan_expires_at (30 hari vs ~365 hari).
--
--  tenants.billing_cycle → SIKLUS YANG SEDANG AKTIF sekarang, diisi ulang
--  setiap kali upgrade disetujui, NULL untuk paket Free (tidak relevan) atau
--  saat diturunkan otomatis oleh jobs/planExpiry.js.
-- ============================================================================

ALTER TABLE plan_upgrade_requests ADD COLUMN billing_cycle VARCHAR(10) NOT NULL DEFAULT 'monthly';
ALTER TABLE plan_upgrade_requests ADD CONSTRAINT chk_upgrade_billing_cycle CHECK (billing_cycle IN ('monthly', 'yearly'));

ALTER TABLE tenants ADD COLUMN billing_cycle VARCHAR(10) NULL;
ALTER TABLE tenants ADD CONSTRAINT chk_tenant_billing_cycle CHECK (billing_cycle IS NULL OR billing_cycle IN ('monthly', 'yearly'));
