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
async function getBranding(tenantId) {
  try {
    const [rows] = await pool.query(`SELECT app_name, company_name FROM app_settings WHERE tenant_id = :tenantId`, { tenantId });
    return {
      appName: rows[0]?.app_name || 'ZASETA',
      companyName: rows[0]?.company_name || '',
    };
  } catch {
    return { appName: 'ZASETA', companyName: '' };
  }
}

/** Isi surel sering memuat teks yang diketik bebas oleh pengguna (nama aset,
    catatan, dst.) — WAJIB di-escape sebelum disisipkan ke HTML, supaya
    markup yang kebetulan (atau sengaja) diketik di sana tidak ikut dirender
    sebagai HTML sungguhan oleh klien surel penerima. */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ============================================================================
 *  SISTEM DESAIN SUREL
 * ============================================================================
 *  Warna diturunkan dari frontend/tailwind.config.js (token brand/info/
 *  warning/danger/ink RMS) supaya surel terasa satu identitas dengan
 *  aplikasinya, bukan template generik — ditulis ulang sebagai hex karena
 *  email tidak bisa membaca token Tailwind.
 *
 *  Font: system-font stack (bukan Google Fonts). Banyak klien surel utama
 *  (Outlook desktop, sejumlah webmail korporat) memblokir @import/<link>
 *  Google Fonts sama sekali — mengandalkannya berarti sebagian besar
 *  penerima cuma melihat fallback-nya. Stack di bawah otomatis memakai
 *  Segoe UI di Windows, San Francisco di Mac/iOS, dan Roboto di Android:
 *  kesan geometris-modern yang sama seperti Inter (dipakai di aplikasi web),
 *  tanpa bergantung pada font yang mungkin gagal dimuat.
 *
 *  Skala ukuran teks dibatasi ke 12/14/16/18/24 — tangga yang sama dipakai
 *  konsisten di semua level (badge, isi, judul), bukan angka acak per elemen.
 * ============================================================================
 */
const FONT = "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;";

const BRAND_DARK = '#1c6433';
const BRAND = '#237d3f';
const BRAND_TINT = '#ddf3dd';
const INK_900 = '#1c2534';
const INK_600 = '#475569';
const INK_50 = '#f8fafc';
const BORDER = '#e2e8f0';
const WHITE = '#ffffff';

const SEVERITY = {
  // label: dicetak sebagai teks di badge — makna tidak boleh bergantung
  // hanya pada warna (lihat WCAG 1.4.1 "Use of Color").
  danger: { color: '#a13624', bg: '#fdf2f0', label: 'MENDESAK' },
  warning: { color: '#a9700f', bg: '#fffaf0', label: 'PERHATIAN' },
  info: { color: '#255d8d', bg: '#eef7fc', label: 'INFO' },
};

/**
 * Teks preheader tersembunyi — cuplikan yang muncul di daftar kotak masuk
 * (Gmail/Outlook) di sebelah subjek, sebelum surelnya dibuka. Tanpa ini,
 * klien surel menebak sendiri dari teks pertama yang ditemukan di HTML
 * (sering kali jadi hal acak yang tidak informatif). Dipadatkan dengan
 * spasi-lebar-nol supaya sisa badan surel tidak ikut "bocor" ke pratinjau.
 */
function preheaderHtml(text) {
  const padding = '&#8203;&nbsp;'.repeat(80);
  return `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(text)}${padding}</div>`;
}

/**
 * Kerangka HTML dipakai bersama oleh SEMUA surel aplikasi ini (OTP, digest
 * notifikasi, dan surel baru di masa depan) — satu tempat untuk header/
 * footer/lebar kartu, supaya penerima selalu mengenali "ini dari sistem
 * yang sama" sekalipun isinya beda. Tabel + inline style (bukan flexbox/
 * grid/<style> blok) karena itu satu-satunya subset CSS yang konsisten
 * dirender di Outlook desktop, webmail, dan klien seluler sekaligus.
 */
function emailShell({ preheader, eyebrow, bodyHtml, signature }) {
  return `
    ${preheaderHtml(preheader)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: ${INK_50}; padding: 32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background: ${WHITE}; border-radius: 12px; overflow: hidden; border: 1px solid ${BORDER};">

          <tr><td style="background: ${BRAND_DARK}; padding: 24px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="${FONT} font-size: 18px; font-weight: 700; color: ${WHITE};">${escapeHtml(signature.appName)}</td>
              <td align="right" style="${FONT} font-size: 12px; color: ${BRAND_TINT};">${escapeHtml(eyebrow)}</td>
            </tr></table>
          </td></tr>

          <tr><td style="padding: 32px;">${bodyHtml}</td></tr>

          <tr><td style="padding: 18px 32px; background: ${INK_50}; border-top: 1px solid ${BORDER};">
            <p style="${FONT} margin: 0; font-size: 12px; color: ${INK_600}; line-height: 1.6;">
              Surel otomatis dari ${escapeHtml(signature.text)}.<br />
              Ini surel otomatis, mohon tidak dibalas.
            </p>
          </td></tr>

        </table>
      </td></tr>
    </table>
  `;
}

/**
 * Kirim kode OTP ke alamat surel baru saat pengguna mengganti surel masuk.
 */
async function sendEmailChangeOtp({ to, otp, expiresInMinutes, tenantId }) {
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const { appName, companyName } = await getBranding(tenantId);
  const signature = { appName, text: companyName ? `${appName} — ${companyName}` : appName };

  const bodyHtml = `
    <p style="${FONT} margin: 0 0 4px; font-size: 16px; font-weight: 700; color: ${INK_900};">Kode Verifikasi Ganti Surel</p>
    <p style="${FONT} margin: 0 0 24px; font-size: 14px; color: ${INK_600}; line-height: 1.6;">
      Kami menerima permintaan untuk mengganti alamat surel masuk akun <strong>${escapeHtml(signature.text)}</strong> Anda menjadi alamat surel ini.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr><td align="center" style="background: ${INK_50}; border: 1px dashed ${BORDER}; border-radius: 10px; padding: 20px;">
        <span style="${FONT} font-size: 32px; font-weight: 700; letter-spacing: 8px; color: ${BRAND_DARK};">${escapeHtml(otp)}</span><br />
        <span style="${FONT} font-size: 12px; color: ${INK_600};">Berlaku selama ${expiresInMinutes} menit</span>
      </td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 16px;">
      <tr>
        <td width="4" style="background: ${SEVERITY.danger.color}; border-radius: 3px; font-size: 0; line-height: 0;">&nbsp;</td>
        <td style="padding: 12px 0 12px 14px; background: ${SEVERITY.danger.bg}; border-radius: 0 6px 6px 0;">
          <span style="${FONT} font-size: 12px; font-weight: 700; color: ${SEVERITY.danger.color};">${SEVERITY.danger.label}</span><br />
          <span style="${FONT} font-size: 13px; color: ${INK_900};">Jangan bagikan kode ini kepada siapa pun, termasuk pihak yang mengaku sebagai admin/staf TI.</span>
        </td>
      </tr>
    </table>

    <p style="${FONT} margin: 0; font-size: 12px; color: ${INK_600}; line-height: 1.6;">Jika Anda tidak meminta perubahan ini, abaikan surel ini — surel masuk Anda tidak akan berubah.</p>
  `;

  await getTransporter().sendMail({
    from: fromAddress,
    to,
    subject: `Kode Verifikasi Ganti Surel — ${appName}`,
    text: `Kode verifikasi Anda: ${otp}\n\nKode ini berlaku selama ${expiresInMinutes} menit. Jangan bagikan kode ini kepada siapa pun, termasuk pihak yang mengaku sebagai admin/staf TI.\n\nJika Anda tidak meminta perubahan surel ini, abaikan pesan ini.`,
    html: emailShell({
      preheader: `Kode verifikasi Anda: ${otp} — berlaku ${expiresInMinutes} menit.`,
      eyebrow: 'Verifikasi Surel',
      bodyHtml,
      signature,
    }),
  });
}

/**
 * Kirim kode OTP untuk fitur "Lupa Kata Sandi" — ke alamat surel yang SUDAH
 * terdaftar di akun (bukan alamat yang diketik bebas, beda dari
 * sendEmailChangeOtp yang memang untuk memverifikasi surel BARU).
 */
async function sendPasswordResetOtp({ to, otp, expiresInMinutes, tenantId }) {
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const { appName, companyName } = await getBranding(tenantId);
  const signature = { appName, text: companyName ? `${appName} — ${companyName}` : appName };

  const bodyHtml = `
    <p style="${FONT} margin: 0 0 4px; font-size: 16px; font-weight: 700; color: ${INK_900};">Kode Atur Ulang Kata Sandi</p>
    <p style="${FONT} margin: 0 0 24px; font-size: 14px; color: ${INK_600}; line-height: 1.6;">
      Kami menerima permintaan untuk mengatur ulang kata sandi akun <strong>${escapeHtml(signature.text)}</strong> Anda. Masukkan kode di bawah ini pada halaman Masuk untuk melanjutkan.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr><td align="center" style="background: ${INK_50}; border: 1px dashed ${BORDER}; border-radius: 10px; padding: 20px;">
        <span style="${FONT} font-size: 32px; font-weight: 700; letter-spacing: 8px; color: ${BRAND_DARK};">${escapeHtml(otp)}</span><br />
        <span style="${FONT} font-size: 12px; color: ${INK_600};">Berlaku selama ${expiresInMinutes} menit</span>
      </td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 16px;">
      <tr>
        <td width="4" style="background: ${SEVERITY.danger.color}; border-radius: 3px; font-size: 0; line-height: 0;">&nbsp;</td>
        <td style="padding: 12px 0 12px 14px; background: ${SEVERITY.danger.bg}; border-radius: 0 6px 6px 0;">
          <span style="${FONT} font-size: 12px; font-weight: 700; color: ${SEVERITY.danger.color};">${SEVERITY.danger.label}</span><br />
          <span style="${FONT} font-size: 13px; color: ${INK_900};">Jangan bagikan kode ini kepada siapa pun, termasuk pihak yang mengaku sebagai admin/staf TI.</span>
        </td>
      </tr>
    </table>

    <p style="${FONT} margin: 0; font-size: 12px; color: ${INK_600}; line-height: 1.6;">Jika Anda tidak meminta pengaturan ulang ini, abaikan surel ini — kata sandi Anda tidak akan berubah.</p>
  `;

  await getTransporter().sendMail({
    from: fromAddress,
    to,
    subject: `Kode Atur Ulang Kata Sandi — ${appName}`,
    text: `Kode atur ulang kata sandi Anda: ${otp}\n\nKode ini berlaku selama ${expiresInMinutes} menit. Jangan bagikan kode ini kepada siapa pun, termasuk pihak yang mengaku sebagai admin/staf TI.\n\nJika Anda tidak meminta pengaturan ulang ini, abaikan pesan ini.`,
    html: emailShell({
      preheader: `Kode atur ulang kata sandi Anda: ${otp} — berlaku ${expiresInMinutes} menit.`,
      eyebrow: 'Atur Ulang Kata Sandi',
      bodyHtml,
      signature,
    }),
  });
}

/**
 * Kirim kode verifikasi surel saat PENDAFTARAN MANDIRI perusahaan baru
 * (authController.signup) — akun administrator pertama tenant baru tidak
 * bisa masuk sebelum kode ini dikonfirmasi (lihat verifySignupEmail),
 * supaya alamat surel yang diketik sungguh-sungguh milik pendaftarnya
 * sebelum tenant itu dipakai. TIDAK berlaku untuk akun yang dibuatkan
 * admin (userController.createUser dst.) — lihat catatan
 * users.email_verified_at di schema.postgres.sql.
 */
async function sendSignupVerificationOtp({ to, otp, expiresInMinutes, companyName }) {
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const signature = { appName: 'ZASETA', text: 'ZASETA' };

  const bodyHtml = `
    <p style="${FONT} margin: 0 0 4px; font-size: 16px; font-weight: 700; color: ${INK_900};">Verifikasi Surel Anda</p>
    <p style="${FONT} margin: 0 0 24px; font-size: 14px; color: ${INK_600}; line-height: 1.6;">
      Satu langkah lagi untuk mengaktifkan ruang kerja <strong>${escapeHtml(companyName)}</strong> di ZASETA. Masukkan kode di bawah ini pada layar pendaftaran untuk melanjutkan.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr><td align="center" style="background: ${INK_50}; border: 1px dashed ${BORDER}; border-radius: 10px; padding: 20px;">
        <span style="${FONT} font-size: 32px; font-weight: 700; letter-spacing: 8px; color: ${BRAND_DARK};">${escapeHtml(otp)}</span><br />
        <span style="${FONT} font-size: 12px; color: ${INK_600};">Berlaku selama ${expiresInMinutes} menit</span>
      </td></tr>
    </table>

    <p style="${FONT} margin: 0; font-size: 12px; color: ${INK_600}; line-height: 1.6;">Jika Anda tidak mendaftarkan perusahaan ini di ZASETA, abaikan surel ini.</p>
  `;

  await getTransporter().sendMail({
    from: fromAddress,
    to,
    subject: `Kode Verifikasi Surel — ZASETA`,
    text: `Kode verifikasi surel Anda: ${otp}\n\nKode ini berlaku selama ${expiresInMinutes} menit untuk mengaktifkan ruang kerja ${companyName} di ZASETA.\n\nJika Anda tidak mendaftarkan perusahaan ini, abaikan pesan ini.`,
    html: emailShell({
      preheader: `Kode verifikasi surel Anda: ${otp} — berlaku ${expiresInMinutes} menit.`,
      eyebrow: 'Verifikasi Surel',
      bodyHtml,
      signature,
    }),
  });
}

/**
 * Kirim rincian akun (nama pengguna + kata sandi sementara) saat administrator
 * menambahkan pengguna baru — admin tidak lagi menentukan kata sandinya
 * sendiri, jadi TIDAK PERNAH tahu/menyimpan kata sandi orang lain; hanya
 * dikirim satu kali ke surel pengguna baru itu sendiri.
 */
async function sendNewUserWelcome({ to, name, username, password, loginUrl, tenantId }) {
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const { appName, companyName } = await getBranding(tenantId);
  const signature = { appName, text: companyName ? `${appName} — ${companyName}` : appName };

  const bodyHtml = `
    <p style="${FONT} margin: 0 0 4px; font-size: 16px; font-weight: 700; color: ${INK_900};">Selamat Datang, ${escapeHtml(name)}</p>
    <p style="${FONT} margin: 0 0 24px; font-size: 14px; color: ${INK_600}; line-height: 1.6;">
      Akun Anda di <strong>${escapeHtml(signature.text)}</strong> baru saja dibuatkan oleh administrator. Berikut rincian masuk Anda:
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr><td style="background: ${INK_50}; border: 1px dashed ${BORDER}; border-radius: 10px; padding: 20px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="${FONT} font-size: 11px; font-weight: 700; color: ${INK_600}; text-transform: uppercase; letter-spacing: 0.04em; padding-bottom: 3px;">Nama Pengguna</td></tr>
          <tr><td style="${FONT} font-size: 18px; font-weight: 700; color: ${BRAND_DARK}; padding-bottom: 16px;">${escapeHtml(username)}</td></tr>
          <tr><td style="${FONT} font-size: 11px; font-weight: 700; color: ${INK_600}; text-transform: uppercase; letter-spacing: 0.04em; padding-bottom: 3px;">Kata Sandi Sementara</td></tr>
          <tr><td style="font-family: 'JetBrains Mono', Consolas, monospace; font-size: 18px; font-weight: 700; letter-spacing: 1px; color: ${BRAND_DARK};">${escapeHtml(password)}</td></tr>
        </table>
      </td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr>
        <td width="4" style="background: ${SEVERITY.warning.color}; border-radius: 3px; font-size: 0; line-height: 0;">&nbsp;</td>
        <td style="padding: 12px 0 12px 14px; background: ${SEVERITY.warning.bg}; border-radius: 0 6px 6px 0;">
          <span style="${FONT} font-size: 12px; font-weight: 700; color: ${SEVERITY.warning.color};">${SEVERITY.warning.label}</span><br />
          <span style="${FONT} font-size: 13px; color: ${INK_900};">Ini kata sandi sementara. Segera masuk, lalu gantilah lewat menu Profil — atau gunakan "Lupa Kata Sandi" di halaman Masuk kapan saja untuk membuat kata sandi sendiri.</span>
        </td>
      </tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 8px auto 0;">
      <tr><td style="background: ${BRAND}; border-radius: 8px;">
        <a href="${loginUrl}" style="${FONT} display: inline-block; padding: 12px 28px; font-size: 14px; font-weight: 700; color: ${WHITE}; text-decoration: none;">Masuk Sekarang &rarr;</a>
      </td></tr>
    </table>
  `;

  await getTransporter().sendMail({
    from: fromAddress,
    to,
    subject: `Akun Anda di ${appName} Sudah Siap`,
    text: `Halo ${name},\n\nAkun Anda di ${signature.text} sudah dibuatkan.\n\nNama Pengguna: ${username}\nKata Sandi Sementara: ${password}\n\nIni kata sandi sementara — segera masuk lalu gantilah lewat menu Profil, atau gunakan "Lupa Kata Sandi" di halaman Masuk kapan saja untuk membuat kata sandi sendiri.\n\nMasuk: ${loginUrl}`,
    html: emailShell({
      preheader: `Nama pengguna: ${username} — kata sandi sementara sudah dibuatkan, buka surel ini untuk melihatnya.`,
      eyebrow: 'Akun Baru',
      bodyHtml,
      signature,
    }),
  });
}

/**
 * Kirim tautan masuk khusus tenant ke surel pendaftar begitu selesai daftar
 * mandiri (authController.signup, Fase 2/5 Tahap 1-2 SaaS). Beda dari
 * sendNewUserWelcome di atas (dikirim ADMIN saat menambah pengguna LAIN,
 * berisi kata sandi sementara): di sini pendaftar sudah menentukan kata
 * sandinya SENDIRI saat mengisi form, jadi tidak ada kata sandi untuk
 * dikirim — surel ini murni menyimpankan tautan masuk khusus tenant
 * (/:slug/login) supaya tidak hilang meski layar konfirmasi di Signup.jsx
 * sudah tertutup.
 *
 * Identitas pengirim SENGAJA "ZASETA" tetap (bukan getBranding() milik
 * tenant ini) — sama seperti sendUpgradeRequestNotification/sendContactMessage
 * (surel level PLATFORM) — karena tenant yang baru saja dibuat ini belum
 * tentu punya merek sendiri yang dikonfigurasi.
 */
async function sendTenantWelcome({ to, name, companyName, username, loginUrl }) {
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const signature = { appName: 'ZASETA', text: 'ZASETA' };

  const bodyHtml = `
    <p style="${FONT} margin: 0 0 4px; font-size: 16px; font-weight: 700; color: ${INK_900};">Selamat Datang, ${escapeHtml(name)}</p>
    <p style="${FONT} margin: 0 0 24px; font-size: 14px; color: ${INK_600}; line-height: 1.6;">
      Ruang kerja <strong>${escapeHtml(companyName)}</strong> Anda di ZASETA sudah siap. Simpan surel ini — tautan di bawah adalah pintu masuk khusus perusahaan Anda, supaya tidak tercampur dengan tenant lain.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr><td style="background: ${INK_50}; border: 1px dashed ${BORDER}; border-radius: 10px; padding: 20px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="${FONT} font-size: 11px; font-weight: 700; color: ${INK_600}; text-transform: uppercase; letter-spacing: 0.04em; padding-bottom: 3px;">Nama Pengguna</td></tr>
          <tr><td style="${FONT} font-size: 18px; font-weight: 700; color: ${BRAND_DARK}; padding-bottom: 16px;">${escapeHtml(username)}</td></tr>
          <tr><td style="${FONT} font-size: 11px; font-weight: 700; color: ${INK_600}; text-transform: uppercase; letter-spacing: 0.04em; padding-bottom: 3px;">Tautan Masuk Khusus Perusahaan Anda</td></tr>
          <tr><td style="${FONT} font-size: 14px; word-break: break-all;"><a href="${loginUrl}" style="color: ${BRAND_DARK};">${escapeHtml(loginUrl)}</a></td></tr>
        </table>
      </td></tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 8px auto 0;">
      <tr><td style="background: ${BRAND}; border-radius: 8px;">
        <a href="${loginUrl}" style="${FONT} display: inline-block; padding: 12px 28px; font-size: 14px; font-weight: 700; color: ${WHITE}; text-decoration: none;">Masuk Sekarang &rarr;</a>
      </td></tr>
    </table>
  `;

  await getTransporter().sendMail({
    from: fromAddress,
    to,
    subject: `Ruang Kerja ${companyName} Sudah Siap — ZASETA`,
    text: `Halo ${name},\n\nRuang kerja ${companyName} Anda di ZASETA sudah siap.\n\nNama Pengguna: ${username}\nTautan Masuk Khusus Perusahaan Anda: ${loginUrl}\n\nSimpan tautan ini untuk masuk lagi nanti.`,
    html: emailShell({
      preheader: `Tautan masuk khusus ${companyName}: ${loginUrl}`,
      eyebrow: 'Selamat Datang',
      bodyHtml,
      signature,
    }),
  });
}

const CATEGORY_LABEL = {
  warranty: 'Garansi',
  reminder: 'Pengingat',
  maintenance: 'Pemeliharaan',
  consumable: 'Stok Barang Habis Pakai',
  request: 'Permintaan Aset',
};

/**
 * Ringkasan surel harian berisi item "perlu ditindaklanjuti" milik SATU
 * pengguna (garansi/pengingat/pemeliharaan yang jatuh tempo, stok menipis,
 * permintaan tertunda) — sumber datanya utils/notificationItems.js, sama
 * persis dengan yang ditampilkan lonceng notifikasi di dalam aplikasi.
 * Dipanggil dari jobs/notificationDigest.js, dijadwalkan lewat node-cron.
 */
async function sendNotificationDigest({ to, userName, items, tenantId }) {
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const { appName, companyName } = await getBranding(tenantId);
  const signature = { appName, text: companyName ? `${appName} — ${companyName}` : appName };
  const baseUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');

  const grouped = {};
  for (const item of items) {
    (grouped[item.category] ||= []).push(item);
  }

  const itemRowHtml = (it) => {
    const sev = SEVERITY[it.severity] || SEVERITY.info;
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 8px;">
        <tr>
          <td width="4" style="background: ${sev.color}; border-radius: 3px; font-size: 0; line-height: 0;">&nbsp;</td>
          <td style="padding: 10px 14px 10px 14px; background: ${sev.bg}; border-radius: 0 6px 6px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="${FONT} font-size: 10px; font-weight: 700; color: ${WHITE}; background: ${sev.color}; border-radius: 4px; padding: 2px 6px; white-space: nowrap;">${sev.label}</td>
              <td style="width: 8px;">&nbsp;</td>
              <td style="${FONT} font-size: 14px; font-weight: 700;"><a href="${baseUrl}${it.link}" style="color: ${INK_900}; text-decoration: none;">${escapeHtml(it.assetName || it.title)}</a></td>
            </tr></table>
            ${it.assetCode ? `<span style="${FONT} font-size: 12px; color: ${INK_600}; background: ${WHITE}; border: 1px solid ${BORDER}; padding: 1px 6px; border-radius: 4px;">${escapeHtml(it.assetCode)}</span> ` : ''}
            <span style="${FONT} font-size: 12px; font-weight: 600; color: ${sev.color};">${escapeHtml(it.detail)}</span>
          </td>
        </tr>
      </table>`;
  };

  const sectionsHtml = Object.entries(grouped).map(([category, catItems]) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 10px;">
      <tr><td style="padding: 0 0 8px; border-bottom: 2px solid ${BORDER};">
        <span style="${FONT} font-size: 12px; font-weight: 700; color: ${INK_900}; text-transform: uppercase; letter-spacing: 0.04em;">${CATEGORY_LABEL[category] || category}</span>
        <span style="${FONT} font-size: 12px; color: ${INK_600};"> &middot; ${catItems.length}</span>
      </td></tr>
    </table>
    <div style="margin: 0 0 22px;">${catItems.map(itemRowHtml).join('')}</div>
  `).join('');

  const sectionsText = Object.entries(grouped).map(([category, catItems]) => (
    `${CATEGORY_LABEL[category] || category} (${catItems.length})\n` +
    catItems.map((it) => `- [${(SEVERITY[it.severity] || SEVERITY.info).label}] ${it.assetName || it.title} — ${it.detail}${it.assetCode ? ` (${it.assetCode})` : ''}: ${baseUrl}${it.link}`).join('\n')
  )).join('\n\n');

  const bodyHtml = `
    <p style="${FONT} margin: 0 0 4px; font-size: 16px; font-weight: 700; color: ${INK_900};">Halo, ${escapeHtml(userName)}</p>
    <p style="${FONT} margin: 0 0 24px; font-size: 14px; color: ${INK_600}; line-height: 1.6;">
      Ada <strong>${items.length} hal</strong> yang perlu ditindaklanjuti hari ini di ${escapeHtml(signature.text)}.
    </p>

    ${sectionsHtml}

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 8px auto 0;">
      <tr><td style="background: ${BRAND}; border-radius: 8px;">
        <a href="${baseUrl}" style="${FONT} display: inline-block; padding: 12px 28px; font-size: 14px; font-weight: 700; color: ${WHITE}; text-decoration: none;">Buka Aplikasi &rarr;</a>
      </td></tr>
    </table>
  `;

  await getTransporter().sendMail({
    from: fromAddress,
    to,
    subject: `[${appName}] ${items.length} hal perlu ditindaklanjuti hari ini`,
    text: `Halo ${userName},\n\nBerikut ringkasan yang perlu ditindaklanjuti di ${signature.text}:\n\n${sectionsText}\n\nBuka aplikasi: ${baseUrl}`,
    html: emailShell({
      preheader: `${items.length} hal perlu ditindaklanjuti: ${items.slice(0, 3).map((it) => it.assetName || it.title).join(', ')}${items.length > 3 ? ', ...' : ''}`,
      eyebrow: 'Ringkasan Harian',
      bodyHtml,
      signature,
    }),
  });
}

/**
 * Beritahu admin platform (users.is_platform_admin=1, lihat migration_billing_
 * phase4.sql) ada permintaan upgrade paket baru yang menunggu verifikasi
 * transfer manual. `to` boleh diisi alamat surel lebih dari satu (dipisah
 * koma) — nodemailer menerimanya langsung.
 */
async function sendUpgradeRequestNotification({ to, tenantName, requesterName, requesterEmail, planName, note, reviewUrl }) {
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const signature = { appName: 'ZASETA', text: 'ZASETA' };

  const bodyHtml = `
    <p style="${FONT} margin: 0 0 4px; font-size: 16px; font-weight: 700; color: ${INK_900};">Permintaan Upgrade Paket Baru</p>
    <p style="${FONT} margin: 0 0 24px; font-size: 14px; color: ${INK_600}; line-height: 1.6;">
      <strong>${escapeHtml(tenantName)}</strong> mengajukan upgrade ke paket <strong>${escapeHtml(planName)}</strong>. Verifikasi transfernya lalu setujui/tolak lewat tautan di bawah.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr><td style="background: ${INK_50}; border: 1px dashed ${BORDER}; border-radius: 10px; padding: 20px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="${FONT} font-size: 11px; font-weight: 700; color: ${INK_600}; text-transform: uppercase; letter-spacing: 0.04em; padding-bottom: 3px;">Diajukan Oleh</td></tr>
          <tr><td style="${FONT} font-size: 14px; color: ${INK_900}; padding-bottom: 14px;">${escapeHtml(requesterName)} &lt;${escapeHtml(requesterEmail)}&gt;</td></tr>
          ${note ? `
          <tr><td style="${FONT} font-size: 11px; font-weight: 700; color: ${INK_600}; text-transform: uppercase; letter-spacing: 0.04em; padding-bottom: 3px;">Catatan</td></tr>
          <tr><td style="${FONT} font-size: 14px; color: ${INK_900};">${escapeHtml(note)}</td></tr>
          ` : ''}
        </table>
      </td></tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 8px auto 0;">
      <tr><td style="background: ${BRAND}; border-radius: 8px;">
        <a href="${reviewUrl}" style="${FONT} display: inline-block; padding: 12px 28px; font-size: 14px; font-weight: 700; color: ${WHITE}; text-decoration: none;">Tinjau Permintaan &rarr;</a>
      </td></tr>
    </table>
  `;

  await getTransporter().sendMail({
    from: fromAddress,
    to,
    subject: `[Billing] ${tenantName} minta upgrade ke ${planName}`,
    text: `${tenantName} mengajukan upgrade ke paket ${planName}.\n\nDiajukan oleh: ${requesterName} <${requesterEmail}>${note ? `\nCatatan: ${note}` : ''}\n\nTinjau: ${reviewUrl}`,
    html: emailShell({ preheader: `${tenantName} mengajukan upgrade ke paket ${planName}.`, eyebrow: 'Billing', bodyHtml, signature }),
  });
}

/**
 * Beritahu tenant yang mengajukan bahwa permintaan upgrade-nya sudah
 * diputuskan (disetujui/ditolak) admin platform.
 */
async function sendUpgradeRequestResolved({ to, planName, approved, adminNote, tenantId }) {
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const { appName, companyName } = await getBranding(tenantId);
  const signature = { appName, text: companyName ? `${appName} — ${companyName}` : appName };
  const tone = approved ? SEVERITY.info : SEVERITY.warning;

  const bodyHtml = `
    <p style="${FONT} margin: 0 0 4px; font-size: 16px; font-weight: 700; color: ${INK_900};">
      Permintaan Upgrade ke ${escapeHtml(planName)} ${approved ? 'Disetujui' : 'Ditolak'}
    </p>
    <p style="${FONT} margin: 0 0 24px; font-size: 14px; color: ${INK_600}; line-height: 1.6;">
      ${approved
        ? `Paket <strong>${escapeHtml(planName)}</strong> Anda sudah aktif sekarang. Terima kasih!`
        : `Permintaan upgrade ke paket <strong>${escapeHtml(planName)}</strong> belum bisa kami setujui.`}
    </p>

    ${adminNote ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 16px;">
      <tr>
        <td width="4" style="background: ${tone.color}; border-radius: 3px; font-size: 0; line-height: 0;">&nbsp;</td>
        <td style="padding: 12px 0 12px 14px; background: ${tone.bg}; border-radius: 0 6px 6px 0;">
          <span style="${FONT} font-size: 12px; font-weight: 700; color: ${tone.color};">CATATAN</span><br />
          <span style="${FONT} font-size: 13px; color: ${INK_900};">${escapeHtml(adminNote)}</span>
        </td>
      </tr>
    </table>
    ` : ''}

    <p style="${FONT} margin: 0; font-size: 12px; color: ${INK_600}; line-height: 1.6;">
      ${approved ? 'Buka menu Langganan untuk melihat rincian paket Anda.' : 'Hubungi kami kembali bila ingin mengajukan ulang atau punya pertanyaan.'}
    </p>
  `;

  await getTransporter().sendMail({
    from: fromAddress,
    to,
    subject: `[${appName}] Upgrade ke ${planName} ${approved ? 'disetujui' : 'ditolak'}`,
    text: `Permintaan upgrade ke paket ${planName} ${approved ? 'disetujui — paket Anda sudah aktif.' : 'belum bisa kami setujui.'}${adminNote ? `\n\nCatatan: ${adminNote}` : ''}`,
    html: emailShell({
      preheader: `Upgrade ke ${planName} ${approved ? 'disetujui' : 'ditolak'}.`,
      eyebrow: 'Billing',
      bodyHtml,
      signature,
    }),
  });
}

/**
 * Kirim pemberitahuan saat paket berbayar tenant kedaluwarsa dan otomatis
 * diturunkan ke Free — lihat jobs/planExpiry.js (dijadwalkan lewat node-cron
 * di server.js, sama seperti notificationDigest). `to` boleh diisi beberapa
 * alamat dipisah koma (dikirim ke semua administrator tenant tersebut).
 */
async function sendPlanExpiredNotice({ to, previousPlanName, tenantId }) {
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const { appName, companyName } = await getBranding(tenantId);
  const signature = { appName, text: companyName ? `${appName} — ${companyName}` : appName };
  const tone = SEVERITY.warning;

  const bodyHtml = `
    <p style="${FONT} margin: 0 0 4px; font-size: 16px; font-weight: 700; color: ${INK_900};">
      Paket ${escapeHtml(previousPlanName)} Anda Telah Berakhir
    </p>
    <p style="${FONT} margin: 0 0 24px; font-size: 14px; color: ${INK_600}; line-height: 1.6;">
      Masa aktif paket <strong>${escapeHtml(previousPlanName)}</strong> Anda sudah berakhir, jadi akun ini otomatis diturunkan ke paket <strong>Free</strong>. Data Anda tetap aman — hanya batas paket (jumlah aset/pengguna) yang berubah.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 16px;">
      <tr>
        <td width="4" style="background: ${tone.color}; border-radius: 3px; font-size: 0; line-height: 0;">&nbsp;</td>
        <td style="padding: 12px 0 12px 14px; background: ${tone.bg}; border-radius: 0 6px 6px 0;">
          <span style="${FONT} font-size: 13px; color: ${INK_900};">Perpanjang atau tingkatkan kembali lewat menu Langganan kapan pun.</span>
        </td>
      </tr>
    </table>
  `;

  await getTransporter().sendMail({
    from: fromAddress,
    to,
    subject: `[${appName}] Paket ${previousPlanName} berakhir — diturunkan ke Free`,
    text: `Masa aktif paket ${previousPlanName} Anda sudah berakhir, akun ini otomatis diturunkan ke paket Free. Perpanjang atau tingkatkan kembali lewat menu Langganan kapan pun.`,
    html: emailShell({
      preheader: `Paket ${previousPlanName} berakhir, diturunkan ke Free.`,
      eyebrow: 'Billing',
      bodyHtml,
      signature,
    }),
  });
}

/**
 * Kirim isi form "Hubungi Kami" di landing page (saran/kritik, ajak kerja
 * sama) ke admin platform. `to` boleh diisi beberapa alamat dipisah koma,
 * sama seperti sendUpgradeRequestNotification. `email` di sini adalah surel
 * BALASAN PENGIRIM (dipasang sebagai `replyTo`) — bukan penerima.
 */
async function sendContactMessage({ to, name, email, category, message }) {
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const signature = { appName: 'ZASETA', text: 'ZASETA' };

  const bodyHtml = `
    <p style="${FONT} margin: 0 0 4px; font-size: 16px; font-weight: 700; color: ${INK_900};">Pesan Baru dari Landing Page</p>
    <p style="${FONT} margin: 0 0 24px; font-size: 14px; color: ${INK_600}; line-height: 1.6;">
      Kategori: <strong>${escapeHtml(category)}</strong>
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px;">
      <tr><td style="background: ${INK_50}; border: 1px dashed ${BORDER}; border-radius: 10px; padding: 20px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="${FONT} font-size: 11px; font-weight: 700; color: ${INK_600}; text-transform: uppercase; letter-spacing: 0.04em; padding-bottom: 3px;">Dari</td></tr>
          <tr><td style="${FONT} font-size: 14px; color: ${INK_900}; padding-bottom: 16px;">${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</td></tr>
          <tr><td style="${FONT} font-size: 11px; font-weight: 700; color: ${INK_600}; text-transform: uppercase; letter-spacing: 0.04em; padding-bottom: 3px;">Pesan</td></tr>
          <tr><td style="${FONT} font-size: 14px; color: ${INK_900}; white-space: pre-line;">${escapeHtml(message)}</td></tr>
        </table>
      </td></tr>
    </table>

    <p style="${FONT} margin: 0; font-size: 12px; color: ${INK_600}; line-height: 1.6;">Balas surel ini langsung untuk membalas ${escapeHtml(name)}.</p>
  `;

  await getTransporter().sendMail({
    from: fromAddress,
    to,
    replyTo: email,
    subject: `[Kontak] ${category} — dari ${name}`,
    text: `Kategori: ${category}\nDari: ${name} <${email}>\n\n${message}`,
    html: emailShell({ preheader: `${category} dari ${name}: ${message.slice(0, 100)}`, eyebrow: 'Hubungi Kami', bodyHtml, signature }),
  });
}

module.exports = {
  sendEmailChangeOtp, sendPasswordResetOtp, sendSignupVerificationOtp, sendNewUserWelcome, sendNotificationDigest,
  sendUpgradeRequestNotification, sendUpgradeRequestResolved, sendPlanExpiredNotice,
  sendContactMessage, sendTenantWelcome,
};
