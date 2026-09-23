/**
 * ============================================================================
 *  ANTARMUKA PROVIDER PEMBAYARAN (fondasi payment gateway production-ready)
 * ============================================================================
 *  Kelas dasar murni sebagai KONTRAK, bukan implementasi. Setiap provider
 *  (PakasirProvider sekarang, MidtransProvider/XenditProvider nanti)
 *  meng-extend ini dan mengisi kelima method-nya sendiri — billingController
 *  HANYA bicara lewat kontrak ini (via getPaymentGateway di index.js), tidak
 *  pernah memanggil SDK provider tertentu secara langsung. Supaya ganti/
 *  tambah provider nanti tidak menyentuh business logic billing sama sekali.
 * ============================================================================
 */
class PaymentGatewayInterface {
  /** Mulai proses pembayaran satu invoice/transaksi — mengembalikan minimal
   *  { checkoutUrl } untuk diarahkan (redirect) ke halaman pembayaran hosted
   *  milik provider. */
  async createCheckout(_params) {
    throw new Error(`${this.constructor.name} belum mengimplementasikan createCheckout()`);
  }

  /** Status pembayaran, dibaca dari sumber kebenaran provider itu sendiri
   *  (API gateway sungguhan), bukan cuma dari tabel lokal kita. */
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
