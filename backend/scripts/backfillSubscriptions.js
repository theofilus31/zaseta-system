/**
 * ============================================================================
 *  BACKFILL SUBSCRIPTIONS — jalankan SEKALI setelah
 *  migration_billing_subscriptions.sql diterapkan (lihat catatan di migrasi
 *  itu — kenapa ini script Node, bukan INSERT SQL murni: harga harus dibaca
 *  dari config/plans.js, satu-satunya sumber kebenaran harga).
 * ============================================================================
 *  Aman dijalankan berkali-kali (idempotent) — tenant yang SUDAH punya baris
 *  subscriptions 'active'/'trialing' dilewati, tidak dibuat dobel.
 *
 *  Jalankan: node scripts/backfillSubscriptions.js
 * ============================================================================
 */
const pool = require('../src/config/db');
const { getPlan } = require('../src/config/plans');

async function main() {
  const [tenants] = await pool.query(
    `SELECT t.id, t.plan, t.billing_cycle AS "billingCycle", t.plan_expires_at AS "planExpiresAt", t.created_at AS "createdAt"
     FROM tenants t
     WHERE t.plan != 'free'
       AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.tenant_id = t.id AND s.status IN ('active', 'trialing'))`
  );

  let created = 0;
  for (const tenant of tenants) {
    const plan = getPlan(tenant.plan);
    if (!plan) continue; // paket tidak dikenal katalog — data tidak konsisten, lewati saja

    const cycle = tenant.billingCycle === 'yearly' ? 'yearly' : 'monthly';
    const price = cycle === 'yearly' ? plan.priceYearly : plan.price;

    // eslint-disable-next-line no-await-in-loop
    await pool.query(
      `INSERT INTO subscriptions (tenant_id, plan_id, billing_cycle, status, price, currency, current_period_start, current_period_end, provider)
       VALUES (:tenantId, :planId, :billingCycle, 'active', :price, 'IDR', :startedAt, :periodEnd, 'manual')`,
      {
        tenantId: tenant.id, planId: tenant.plan, billingCycle: cycle, price: price || 0,
        startedAt: tenant.createdAt, periodEnd: tenant.planExpiresAt,
      }
    );
    created += 1;
  }

  console.log(`Backfill selesai: ${created} baris subscriptions dibuat untuk ${tenants.length} tenant berpaket berbayar.`);
  process.exit(0);
}

main().catch((err) => { console.error('Backfill gagal:', err.message); process.exit(1); });
