-- ============================================================================
--  SUBSCRIPTIONS & INVOICES — fondasi billing production-ready
-- ============================================================================
--  tenants.plan/plan_expires_at/billing_cycle TETAP dipertahankan sebagai
--  cache "state terkini" (dibaca planLimits.js, dashboard, dll) — ini
--  menambah RIWAYAT di baliknya, bukan menggantikannya. Lihat catatan di
--  schema.postgres.sql bagian 27 untuk penjelasan lengkap tiap kolom.
-- ============================================================================

CREATE TABLE subscriptions (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id               BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_id                 VARCHAR(50) NOT NULL,
    billing_cycle           VARCHAR(10) NOT NULL DEFAULT 'monthly'
                                CHECK (billing_cycle IN ('monthly', 'yearly')),
    status                  VARCHAR(20) NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'expired')),
    price                   NUMERIC(14,2) NOT NULL,
    currency                VARCHAR(3) NOT NULL DEFAULT 'IDR',
    started_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    current_period_start    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    current_period_end      TIMESTAMP NULL,
    canceled_at             TIMESTAMP NULL,
    trial_ends_at           TIMESTAMP NULL,
    provider                VARCHAR(30) NOT NULL DEFAULT 'manual',
    created_by              BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_tenant_status ON subscriptions(tenant_id, status);
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE invoices (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id               BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    subscription_id         BIGINT NULL REFERENCES subscriptions(id) ON DELETE SET NULL,
    invoice_number          VARCHAR(40) NOT NULL UNIQUE,
    amount                  NUMERIC(14,2) NOT NULL,
    currency                VARCHAR(3) NOT NULL DEFAULT 'IDR',
    status                  VARCHAR(20) NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'canceled')),
    payment_method          VARCHAR(50) NULL,
    paid_at                 TIMESTAMP NULL,
    due_at                  TIMESTAMP NULL,
    provider                VARCHAR(30) NOT NULL DEFAULT 'manual',
    provider_transaction_id VARCHAR(150) NULL,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX idx_invoices_subscription ON invoices(subscription_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Backfill tenant berpaket berbayar yang sudah aktif SEKARANG (satu baris
-- subscriptions 'active' merefleksikan state tenants.plan saat ini, supaya
-- Riwayat Tagihan tidak kosong total begitu fitur ini tayang) SENGAJA
-- dilakukan lewat script Node terpisah (lihat scripts/backfillSubscriptions.js
-- dijalankan sekali setelah migrasi ini), bukan INSERT SQL murni di sini —
-- harga per paket harus dibaca dari config/plans.js (satu-satunya sumber
-- kebenaran, lihat rule "jangan hardcode harga di banyak tempat"), dan SQL
-- polos tidak bisa mengimpor file JS itu.
