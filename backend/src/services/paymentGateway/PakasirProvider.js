const pool = require('../../config/db');
const PaymentGatewayInterface = require('./PaymentGatewayInterface');

/**
 * ============================================================================
 *  PROVIDER — PAKASIR (API v2, https://pakasir.com/p/docs)
 * ============================================================================
 *  Satu-satunya payment gateway aktif untuk billing (lihat
 *  billingController.requestPlanChange/handlePakasirWebhook — upgrade paket
 *  berbayar dibayar & dikonfirmasi lewat provider ini, tidak ada lagi jalur
 *  transfer manual). Metode bawaan 'payment_link' -- Pakasir menghasilkan
 *  satu halaman checkout hosted yang mendukung QRIS & VA sekaligus, jadi
 *  tenant tidak perlu memilih metode di sisi kita.
 *
 *  Kontrak dengan pemanggil:
 *  - `invoiceNumber` dipakai APA ADANYA sebagai `order_id` Pakasir — di
 *    billingController ini adalah plan_upgrade_requests.order_id, BUKAN
 *    invoices.invoice_number (nomor akuntansi kita sendiri, baru dibuat
 *    setelah lunas). API Pakasir bersifat "find or create": memanggil
 *    create-transaction dengan order_id yang sama & parameter identik
 *    mengembalikan transaksi yang sama, jadi retry di sisi kita aman tanpa
 *    membuat transaksi dobel.
 *  - `txn_id` yang dikembalikan Pakasir disimpan pemanggil sendiri (kolom
 *    provider_transaction_id) -- getPaymentStatus() & webhook verification
 *    BUTUH nilai ini untuk cross-check ke API status.
 *
 *  KEAMANAN WEBHOOK: dokumentasi Pakasir sendiri TIDAK memakai signature
 *  kriptografis, cuma header `X-Secret` yang dicocokkan APA ADANYA, dan
 *  secara eksplisit menyarankan cross-check ke endpoint status transaksi
 *  sebelum mempercayai payload webhook (lihat handleWebhook di bawah) --
 *  jadi status yang "benar" SELALU dari hasil cross-check itu, payload
 *  webhook cuma sinyal "cek sekarang", bukan sumber kebenaran.
 * ============================================================================
 */

const BASE_URL = 'https://app.pakasir.com';
const DEFAULT_METHOD = 'payment_link';

/** completed/pending/canceled (Pakasir) -> paid/pending/canceled (invoices.status). */
const STATUS_MAP = { completed: 'paid', pending: 'pending', canceled: 'canceled' };

class PakasirProvider extends PaymentGatewayInterface {
  constructor({ slug, apiKey, webhookSecret } = {}) {
    super();
    this.slug = slug ?? process.env.PAKASIR_SLUG;
    this.apiKey = apiKey ?? process.env.PAKASIR_API_KEY;
    this.webhookSecret = webhookSecret ?? process.env.PAKASIR_WEBHOOK_SECRET;
  }

  _assertConfigured() {
    if (!this.slug || !this.apiKey) {
      throw new Error('Pakasir belum dikonfigurasi -- isi PAKASIR_SLUG dan PAKASIR_API_KEY di .env.');
    }
  }

  async _request(path, { method = 'GET', body } = {}) {
    this._assertConfigured();
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'X-Api-Key': this.apiKey,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }

    if (!res.ok) {
      const err = new Error(data.message || `Pakasir mengembalikan status ${res.status}.`);
      err.status = res.status;
      err.pakasirResponse = data;
      throw err;
    }
    return data;
  }

  /**
   * Mulai transaksi baru. `paymentMethod` opsional -- default 'payment_link'
   * (checkoutUrl hosted, cocok untuk redirect dari halaman Langganan).
   * Metode lain ('qris', '*_va', dst., lihat pakasir.com/p/create-transaction)
   * mengembalikan `qrString`/`vaNumber` untuk dirender sendiri, TANPA
   * checkoutUrl -- pemanggil yang menentukan cara menampilkannya.
   */
  async createCheckout({ invoiceNumber, amount, paymentMethod = DEFAULT_METHOD }) {
    const data = await this._request(
      `/api/v2/create-transaction/${this.slug}/${encodeURIComponent(invoiceNumber)}`,
      { method: 'POST', body: { method: paymentMethod, amount: Math.round(Number(amount)) } }
    );

    return {
      provider: 'pakasir',
      providerTransactionId: data.txn_id,
      checkoutUrl: data.payment_link || null,
      paymentMethod: data.payment_method || paymentMethod,
      qrString: data.qr_string || null,
      vaNumber: data.va_number || null,
      amount: data.amount ?? amount,
      fee: data.fee ?? null,
      totalPayment: data.total_payment ?? null,
      expiredAt: data.expired_at || null,
      status: STATUS_MAP[data.status] || 'pending',
    };
  }

  /**
   * Status SUMBER KEBENARAN dari API Pakasir -- dipakai handleWebhook untuk
   * cross-check, dan bisa juga dipanggil langsung (mis. tombol "Cek Status"
   * manual) tanpa menunggu webhook. Rate limit Pakasir: 1 request/4 detik
   * PER TRANSAKSI (lihat pakasir.com/p/transaction-status) -- jangan
   * dipanggil dalam polling ketat.
   */
  async getPaymentStatus({ invoiceId }) {
    const [[invoice]] = await pool.query(
      `SELECT invoice_number, provider_transaction_id FROM invoices WHERE id = :invoiceId`,
      { invoiceId }
    );
    if (!invoice) return { status: 'pending' };
    if (!invoice.provider_transaction_id) return { status: 'pending' };

    const data = await this._request(
      `/api/v2/transaction-status/${this.slug}/${invoice.provider_transaction_id}`
    );
    return {
      status: STATUS_MAP[data.status] || 'pending',
      completedAt: data.completed_at || null,
      raw: data,
    };
  }

  /** Batalkan transaksi di sisi Pakasir -- dipakai kalau tenant membatalkan
   *  checkout atau invoice pending kedaluwarsa di sisi kita. Bukan bagian
   *  dari PaymentGatewayInterface (yang generik cuma tahu "subscription",
   *  bukan "transaksi sekali bayar"), jadi dipanggil langsung oleh
   *  billingController lewat instance provider, bukan lewat kontrak umum. */
  async cancelTransaction({ providerTransactionId }) {
    return this._request(`/api/v2/cancel-transaction/${this.slug}/${providerTransactionId}`, { method: 'POST' });
  }

  // Pakasir tidak punya recurring billing di sisi provider -- pencatatan
  // subscription internal selalu lewat subscriptionService.js, bukan di sini.
  async createSubscription(params) {
    return { provider: 'pakasir', externalSubscriptionId: null, ...params };
  }

  async cancelSubscription({ subscriptionId }) {
    return { provider: 'pakasir', subscriptionId, canceled: true };
  }

  /**
   * Verifikasi header X-Secret lalu cross-check ke API status transaksi --
   * TIDAK pernah mempercayai `payload.status` webhook mentah-mentah (lihat
   * catatan keamanan di kepala berkas ini). Melempar Error kalau secret
   * tidak cocok atau order_id tidak dikenali; controller pemanggil
   * (routes/billingRoutes.js) yang menerjemahkannya jadi respons HTTP.
   */
  async handleWebhook(payload, headers = {}) {
    if (!this.webhookSecret) {
      throw new Error('Pakasir belum dikonfigurasi -- isi PAKASIR_WEBHOOK_SECRET di .env.');
    }
    const receivedSecret = headers['x-secret'] || headers['X-Secret'];
    if (!receivedSecret || receivedSecret !== this.webhookSecret) {
      const err = new Error('Header X-Secret webhook Pakasir tidak cocok.');
      err.status = 401;
      throw err;
    }

    const { order_id: orderId, txn_id: txnId } = payload || {};
    if (!orderId || !txnId) {
      const err = new Error('Payload webhook Pakasir tidak lengkap (order_id/txn_id hilang).');
      err.status = 400;
      throw err;
    }

    const data = await this._request(`/api/v2/transaction-status/${this.slug}/${txnId}`);
    if (data.order_id && data.order_id !== orderId) {
      const err = new Error('order_id webhook tidak cocok dengan hasil cross-check status transaksi.');
      err.status = 409;
      throw err;
    }

    return {
      orderId,
      providerTransactionId: txnId,
      status: STATUS_MAP[data.status] || 'pending',
      amount: data.amount,
      completedAt: data.completed_at || null,
      isSandbox: Boolean(data.is_sandbox),
    };
  }
}

module.exports = PakasirProvider;
