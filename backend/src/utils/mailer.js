const nodemailer = require('nodemailer');
const pool = require('../config/db');

// Semua kredensial SMTP diambil dari .env — JANGAN pernah hardcode di sini.
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error('Konfigurasi SMTP belum lengkap di .env (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS).');
  }

  const port = Number(SMTP_PORT);
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465, // port 465 = implicit TLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  return transporter;
}

/**
 * Nama aplikasi & perusahaan untuk isi surel, diambil dari pengaturan merek.
 * Kalau tabelnya belum ada (mis. migrasi belum dijalankan), dipakai nilai
 * bawaan — kegagalan membaca merek tidak boleh membuat OTP gagal terkirim.
 */
async function getBranding() {
  try {
    const [rows] = await pool.query(`SELECT app_name, company_name FROM app_settings WHERE id = 1`);
    return {
      appName: rows[0]?.app_name || 'Asset Inventory',
      companyName: rows[0]?.company_name || '',
    };
  } catch {
    return { appName: 'Asset Inventory', companyName: '' };
  }
}

/**
 * Kirim kode OTP ke alamat surel baru saat pengguna mengganti surel masuk.
 */
async function sendEmailChangeOtp({ to, otp, expiresInMinutes }) {
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const { appName, companyName } = await getBranding();
  const signature = companyName ? `${appName} — ${companyName}` : appName;

  await getTransporter().sendMail({
    from: fromAddress,
    to,
    subject: `Kode Verifikasi Ganti Surel — ${appName}`,
    text: `Kode verifikasi Anda: ${otp}\n\nKode ini berlaku selama ${expiresInMinutes} menit. Jangan bagikan kode ini kepada siapa pun, termasuk pihak yang mengaku sebagai admin/staf TI.\n\nJika Anda tidak meminta perubahan surel ini, abaikan pesan ini.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <p>Halo,</p>
        <p>Kami menerima permintaan untuk mengganti alamat surel masuk akun ${signature} Anda menjadi alamat surel ini.</p>
        <p>Kode verifikasi Anda:</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 6px; margin: 16px 0;">${otp}</p>
        <p>Kode ini berlaku selama <strong>${expiresInMinutes} menit</strong>.</p>
        <p style="color: #b91c1c;">Jangan bagikan kode ini kepada siapa pun, termasuk pihak yang mengaku sebagai admin/staf TI.</p>
        <p style="color: #6b7280; font-size: 13px;">Jika Anda tidak meminta perubahan ini, abaikan surel ini — surel masuk Anda tidak akan berubah.</p>
      </div>
    `,
  });
}

module.exports = { sendEmailChangeOtp };
