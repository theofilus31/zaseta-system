/**
 * ============================================================================
 *  ANTARMUKA PROVIDER PEMBAYARAN (fondasi payment gateway production-ready)
 * ============================================================================
 *  Kelas dasar murni sebagai KONTRAK, bukan implementasi. Setiap provider
 *  (ManualTransferProvider sekarang, MidtransProvider/XenditProvider nanti)
 *  meng-extend ini dan mengisi kelima method-nya sendiri — subscriptionService
 *  & billingController HANYA bicara lewat kontrak ini (via getPaymentGateway
 *  di index.js), tidak pernah memanggil SDK provider tertentu secara
 *  langsung. Supaya ganti/tambah provider nanti tidak menyentuh business
 *  logic billing sama sekali.
 * ============================================================================
 */
class PaymentGatewayInterface {
  /** Mulai proses pembayaran satu invoice — provider gateway sungguhan
   *  mengembalikan { checkoutUrl }, provider manual mengembalikan instruksi
   *  transfer (tidak ada redirect ke luar). */
  async createCheckout(_params) {
    throw new Error(`${this.constructor.name} belum mengimplementasikan createCheckout()`);
  }

  /** Status pembayaran satu invoice, dibaca dari sumber kebenaran provider
   *  itu sendiri (API gateway sungguhan) atau tabel invoices (manual). */
  async getPaymentStatus(_params) {
    throw new Error(`${this.constructor.name} belum mengimplementasikan getPaymentStatus()`);
  }

  /** Buat subscription baru di SISI PROVIDER (relevan untuk provider dengan
   *  recurring billing sungguhan; pencatatan subscription internal Zaseta
   *  sendiri selalu lewat services/subscriptionService.js, bukan di sini). */
  async createSubscription(_params) {
    throw new Error(`${this.constructor.name} belum mengimplementasikan createSubscription()`);
  }

  /** Batalkan subscription di sisi provider (menghentikan recurring charge
   *  berikutnya) — TIDAK berarti data tenant langsung dihapus/diturunkan,
   *  itu keputusan subscriptionService, bukan provider. */
  async cancelSubscription(_params) {
    throw new Error(`${this.constructor.name} belum mengimplementasikan cancelSubscription()`);
  }

  /** Terima & proses notifikasi webhook dari provider (pembayaran
   *  berhasil/gagal, langganan diperbarui, dst). */
  async handleWebhook(_payload) {
    throw new Error(`${this.constructor.name} belum mengimplementasikan handleWebhook()`);
  }
}

module.exports = PaymentGatewayInterface;
