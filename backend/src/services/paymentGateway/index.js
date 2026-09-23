const PakasirProvider = require('./PakasirProvider');

const PROVIDERS = {
  pakasir: () => new PakasirProvider(),
  // midtrans: () => new MidtransProvider(...), // susulan begitu kredensial tersedia
  // xendit: () => new XenditProvider(...),     // susulan begitu kredensial tersedia
};

/**
 * Satu titik masuk untuk semua kode lain (billingController) — jangan
 * `new PakasirProvider()` langsung di luar sini, supaya provider aktif bisa
 * ditentukan lewat konfigurasi (env var PAYMENT_GATEWAY_PROVIDER) tanpa
 * menyentuh business logic.
 */
function getPaymentGateway(providerName = process.env.PAYMENT_GATEWAY_PROVIDER || 'pakasir') {
  const factory = PROVIDERS[providerName];
  if (!factory) throw new Error(`Provider pembayaran "${providerName}" tidak dikenal.`);
  return factory();
}

module.exports = { getPaymentGateway };
