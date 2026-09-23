const ManualTransferProvider = require('./ManualTransferProvider');
const PakasirProvider = require('./PakasirProvider');

const PROVIDERS = {
  manual: () => new ManualTransferProvider(),
  pakasir: () => new PakasirProvider(),
  // midtrans: () => new MidtransProvider(...), // susulan begitu kredensial tersedia
  // xendit: () => new XenditProvider(...),     // susulan begitu kredensial tersedia
};

/**
 * Satu titik masuk untuk semua kode lain (subscriptionService,
 * billingController) — jangan `new ManualTransferProvider()` langsung di
 * luar sini, supaya provider aktif bisa ditentukan lewat konfigurasi
 * (env var PAYMENT_GATEWAY_PROVIDER) tanpa menyentuh business logic.
 */
function getPaymentGateway(providerName = process.env.PAYMENT_GATEWAY_PROVIDER || 'manual') {
  const factory = PROVIDERS[providerName];
  if (!factory) throw new Error(`Provider pembayaran "${providerName}" tidak dikenal.`);
  return factory();
}

module.exports = { getPaymentGateway };
