const pool = require('../../config/db');
const PaymentGatewayInterface = require('./PaymentGatewayInterface');

/**
 * Provider "pembayaran" transfer bank manual — satu-satunya provider aktif
 * saat ini, dipakai lewat getPaymentGateway() di index.js. TIDAK ADA API
 * eksternal: createCheckout cuma mengembalikan instruksi transfer dari
 * BILLING_TRANSFER_INFO (.env), dan pelunasannya BUKAN otomatis — admin
 * platform yang menandai lunas secara manual setelah memverifikasi transfer
 * (lihat billingController.resolveUpgradeRequest -> subscriptionService).
 *
 * Ini BUKAN "fake payment yang dianggap transaksi nyata" (lihat instruksi
 * proyek) — statusnya jujur apa adanya (provider: 'manual', tidak pernah
 * mengklaim sudah diverifikasi otomatis) sampai admin manusia yang benar-
 * benar memverifikasi transfernya.
 */
class ManualTransferProvider extends PaymentGatewayInterface {
  async createCheckout({ invoiceNumber, amount, currency = 'IDR' }) {
    return {
      provider: 'manual',
      checkoutUrl: null,
      instructions: process.env.BILLING_TRANSFER_INFO || null,
      invoiceNumber,
      amount,
      currency,
    };
  }

  async getPaymentStatus({ invoiceId }) {
    const [[row]] = await pool.query(`SELECT status FROM invoices WHERE id = :invoiceId`, { invoiceId });
    return { status: row?.status || 'pending' };
  }

  async createSubscription(params) {
    // Provider manual tidak punya recurring charge di sisi provider —
    // pencatatan subscription sungguhan (tabel subscriptions) sepenuhnya
    // tanggung jawab subscriptionService.js. Method ini sengaja no-op
    // supaya kontrak PaymentGatewayInterface tetap terpenuhi kalau dipanggil
    // generik dari kode yang sama juga dipakai provider lain nanti.
    return { provider: 'manual', externalSubscriptionId: null, ...params };
  }

  async cancelSubscription({ subscriptionId }) {
    return { provider: 'manual', subscriptionId, canceled: true };
  }

  async handleWebhook() {
    throw new Error('Provider manual tidak menerima webhook — tidak ada API eksternal untuk provider ini.');
  }
}

module.exports = ManualTransferProvider;
