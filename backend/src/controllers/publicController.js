const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');
const { performCreateRequest } = require('./requestController');
const { sendContactMessage } = require('../utils/mailer');
const { normalizeSlug, isValidSlugFormat, isReservedSlug } = require('../utils/tenantSlug');

const CONTACT_CATEGORIES = { saran: 'Saran & Kritik', kerjasama: 'Ajak Kerja Sama', lainnya: 'Lainnya' };

/**
 * Tenant untuk rute PUBLIK (tanpa sesi login) — belum ada resolusi
 * subdomain/URL per tenant (itu pekerjaan Fase 2/3, saat penyediaan tenant &
 * deployment sungguhan disiapkan; lihat catatan yang sama di
 * authController.login). Untuk sekarang, satu-satunya/tenant paling aktif
 * dipakai sebagai bawaan. Begitu subdomain per tenant berjalan, INI
 * satu-satunya tempat yang perlu diubah — bukan menulis ulang tiap rute
 * publik satu per satu.
 */
async function resolvePublicTenantId() {
  const [rows] = await pool.query(
    `SELECT id FROM tenants WHERE status IN ('active','trial') ORDER BY id ASC LIMIT 1`
  );
  return rows[0]?.id ?? null;
}

// GET /api/public/scan/:code — dipanggil dari halaman scan publik, TANPA AUTH
const scanAsset = asyncHandler(async (req, res) => {
  const { code } = req.params;

  /* Kode QR sendiri sudah unik secara global (UUID acak, lihat
     utils/qrGenerator.js) — TIDAK perlu disaring tenant_id di sini, karena
     satu kode hanya mungkin cocok dengan SATU aset di SATU tenant, seperti
     apa pun cara kode itu ditebak/didapat. */
  const [qrRows] = await pool.query(`SELECT asset_id FROM qr_codes WHERE code = :code`, { code });
  if (!qrRows[0]) {
    return res.status(404).json({ message: 'QR code tidak valid atau tidak ditemukan.' });
  }
  const assetId = qrRows[0].asset_id;

  const [assetRows] = await pool.query(
    `SELECT a.id, a.tenant_id, a.asset_code, a.name, a.brand, a.model, a.spec_detail, a.status, a.purchase_date, a.vendor,
            c.name AS category_name, l.name AS location_name, sl.name AS sub_location_name
     FROM assets a
     JOIN asset_categories c ON c.id = a.category_id
     LEFT JOIN locations l ON l.id = a.location_id
     LEFT JOIN sub_locations sl ON sl.id = a.sub_location_id
     WHERE a.id = :assetId AND a.deleted_at IS NULL`,
    { assetId }
  );
  const asset = assetRows[0];
  if (!asset) return res.status(404).json({ message: 'Aset tidak ditemukan atau sudah tidak aktif.' });

  const [customFieldRows] = await pool.query(
    `SELECT cf.field_label, cf.field_type, v.value_text
     FROM asset_custom_fields cf
     LEFT JOIN asset_custom_field_values v ON v.custom_field_id = cf.id AND v.asset_id = :assetId
     WHERE cf.is_active = TRUE AND v.value_text IS NOT NULL
     ORDER BY cf.sort_order ASC`,
    { assetId }
  );

  // Update statistik scan + audit log (anonim, tanpa user_id — tenant diturunkan dari asetnya sendiri)
  await pool.query(`UPDATE qr_codes SET scan_count = scan_count + 1, last_scanned_at = NOW() WHERE code = :code`, { code });
  await logAudit({ userId: null, tenantId: asset.tenant_id, action: 'scan', entityType: 'asset', entityId: assetId, ipAddress: req.ip });

  const { tenant_id, ...publicAsset } = asset; // tidak perlu ikut terkirim ke klien publik
  res.json({ ...publicAsset, customFields: customFieldRows });
});

// GET /api/public/scan-consumable/:code — TANPA AUTH. Menyertakan angka stok
// apa adanya -- tujuan utama memindai barcode barang habis pakai justru
// "stok tinggal berapa", jadi menyembunyikannya di sini (beda dari versi awal
// fitur ini) hanya membuat pindaian tanpa login jadi tidak berguna. Beda
// kasus dari data uang/pelanggan di tempat lain sistem ini yang memang perlu
// dijaga -- level stok ATK/kebersihan bukan informasi rahasia.
const scanConsumable = asyncHandler(async (req, res) => {
  const { code } = req.params;

  const [qrRows] = await pool.query(`SELECT consumable_id FROM consumable_qr_codes WHERE code = :code`, { code });
  if (!qrRows[0]) {
    return res.status(404).json({ message: 'Kode QR tidak valid atau tidak ditemukan.' });
  }
  const consumableId = qrRows[0].consumable_id;

  const [rows] = await pool.query(
    `SELECT c.id, c.tenant_id, c.code, c.name, c.unit, c.current_stock, c.min_stock, l.name AS location_name, at.name AS asset_type_name
     FROM consumables c
     LEFT JOIN locations l ON l.id = c.location_id
     LEFT JOIN asset_types at ON at.id = c.asset_type_id
     WHERE c.id = :consumableId AND c.is_active = TRUE`,
    { consumableId }
  );
  const item = rows[0];
  if (!item) return res.status(404).json({ message: 'Barang tidak ditemukan atau sudah tidak aktif.' });

  await pool.query(`UPDATE consumable_qr_codes SET scan_count = scan_count + 1, last_scanned_at = NOW() WHERE code = :code`, { code });
  await logAudit({ userId: null, tenantId: item.tenant_id, action: 'scan', entityType: 'consumable', entityId: consumableId, ipAddress: req.ip });

  res.json({
    code: item.code, name: item.name, unit: item.unit,
    assetTypeName: item.asset_type_name,
    locationName: item.location_name,
    currentStock: item.current_stock,
    minStock: item.min_stock,
    lowStock: item.current_stock <= item.min_stock,
  });
});

// GET /api/public/categories — dropdown "Kode Barang/Aset" di form permintaan publik.
// Hanya id + nama, TANPA AUTH: tidak ada apa pun di sini yang rahasia.
const listPublicCategories = asyncHandler(async (req, res) => {
  const tenantId = await resolvePublicTenantId();
  const [rows] = await pool.query(
    `SELECT id, name FROM asset_categories WHERE tenant_id = :tenantId AND is_active = TRUE ORDER BY name ASC`,
    { tenantId }
  );
  res.json(rows);
});

// POST /api/public/requests — dipanggil dari halaman pengajuan permintaan aset
// publik, TANPA AUTH. Satu-satunya jalan orang luar (karyawan tanpa akun
// aplikasi) bisa mengajukan permintaan aset tanpa GA membuatkannya manual.
//
// Memakai performCreateRequest yang sama dengan form internal
// (requestController.createRequest) — supaya nomor permintaan, validasi, dan
// audit log-nya konsisten dari kedua jalur. userId diisi null (created_by
// nullable) karena tidak ada sesi login di sini.
const createPublicRequest = asyncHandler(async (req, res) => {
  const { requesterName, department, categoryId, itemName, reason, priority, neededBy, website } = req.body;

  /* Honeypot anti-bot: field tersembunyi di form yang manusia tidak akan
     pernah isi, tapi bot pengisi form otomatis biasanya mengisi semua field.
     Kalau terisi, balas seolah berhasil supaya bot tidak tahu ditolak —
     tapi jangan benar-benar simpan ke database. */
  if (String(website || '').trim()) {
    return res.status(201).json({ message: 'Permintaan berhasil diajukan.' });
  }

  const tenantId = await resolvePublicTenantId();
  const item = await performCreateRequest({
    tenantId, requesterName, department, categoryId, itemName, reason, priority, neededBy,
    userId: null, ip: req.ip,
  });
  res.status(201).json({ message: `Permintaan ${item.requestNo} berhasil diajukan.`, requestNo: item.requestNo });
});

/**
 * POST /api/public/contact — form "Hubungi Kami" di landing page (saran/
 * kritik, ajak kerja sama), TANPA AUTH. Sengaja hanya dikirim lewat surel
 * (sama seperti sendNewUserWelcome/sendPasswordResetOtp) — TIDAK disimpan
 * ke tabel mana pun, jadi kalau pengiriman surelnya gagal, pesannya hilang
 * tanpa jejak. Cukup untuk cakupan sekarang (satu pemilik produk membaca
 * suratnya sendiri); kalau volumenya nanti berarti, ganti jadi tabel +
 * halaman admin platform, sama seperti plan_upgrade_requests.
 */
const submitContact = asyncHandler(async (req, res) => {
  const { name, email, category, message, website } = req.body;

  // Honeypot anti-bot — sama seperti createPublicRequest di atas.
  if (String(website || '').trim()) {
    return res.status(201).json({ message: 'Pesan berhasil dikirim.' });
  }

  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: 'Nama wajib diisi.' });
  }
  if (!email || !String(email).trim()) {
    return res.status(400).json({ message: 'Surel wajib diisi.' });
  }
  if (!message || !String(message).trim()) {
    return res.status(400).json({ message: 'Pesan wajib diisi.' });
  }
  const categoryLabel = CONTACT_CATEGORIES[category] || CONTACT_CATEGORIES.lainnya;

  const [platformAdmins] = await pool.query(
    `SELECT email FROM users WHERE is_platform_admin = TRUE AND status = 'active' AND deleted_at IS NULL`
  );
  if (platformAdmins.length === 0) {
    // Tidak ada admin platform untuk dikirimi — bukan salah pengirim pesan.
    console.error('Gagal mengirim pesan kontak: tidak ada users.is_platform_admin=1 di database.');
    return res.status(503).json({ message: 'Formulir kontak sedang tidak tersedia. Coba lagi nanti atau hubungi kami langsung lewat surel.' });
  }

  try {
    await sendContactMessage({
      to: platformAdmins.map((a) => a.email).join(','),
      name: String(name).trim().slice(0, 150),
      email: String(email).trim().slice(0, 150),
      category: categoryLabel,
      message: String(message).trim().slice(0, 5000),
    });
  } catch (err) {
    console.error('Gagal mengirim surel pesan kontak:', err.message);
    return res.status(502).json({ message: 'Gagal mengirim pesan. Coba lagi sesaat lagi.' });
  }

  res.status(201).json({ message: 'Pesan berhasil dikirim. Terima kasih!' });
});

/**
 * GET /api/public/check-slug?code=rms — dipanggil langsung saat pendaftar
 * mengetik "Kode Perusahaan" di form Daftar, supaya tahu SEBELUM mengisi
 * seluruh form kalau kodenya sudah dipakai — bukan baru tahu setelah submit.
 * Aturan format/kata-terlarang sama persis dengan yang dipakai
 * authController.signup (lihat utils/tenantSlug.js), supaya keduanya tidak
 * pernah berbeda pendapat soal kode mana yang valid.
 */
const checkSlugAvailability = asyncHandler(async (req, res) => {
  const slug = normalizeSlug(req.query.code);

  if (!slug) return res.json({ available: false, reason: 'empty' });
  if (!isValidSlugFormat(slug)) return res.json({ available: false, reason: 'invalid_format' });
  if (isReservedSlug(slug)) return res.json({ available: false, reason: 'reserved' });

  const [rows] = await pool.query(`SELECT id FROM tenants WHERE slug = :slug LIMIT 1`, { slug });
  res.json({ available: rows.length === 0, reason: rows.length > 0 ? 'taken' : null });
});

/**
 * GET /api/public/resolve-username?username= — Fase 5 Tahap 3 SaaS.
 * Dipanggil halaman Masuk UNIVERSAL (Login.jsx) begitu pengguna selesai
 * mengetik nama pengguna, supaya bisa diarahkan langsung ke halaman masuk
 * KHUSUS tenant-nya (/:slug/login) — nama pengguna sekarang selalu berawalan
 * kode perusahaan (lihat authController.signup), jadi biasanya bisa
 * ditentukan tenant-nya sebelum kata sandi sekalipun diketik.
 *
 * SENGAJA dicocokkan lewat `username` SAJA (bukan surel juga, walau
 * authController.login menerima keduanya sebagai identifier) — surel tidak
 * membawa kode perusahaan secara desain, dan mencocokkan lewat surel di sini
 * akan membocorkan "surel ini terdaftar di perusahaan X" ke siapa pun yang
 * iseng menebak-nebak surel di halaman Masuk, sesuatu yang tidak perlu
 * dibuka pada endpoint publik ini.
 *
 * Kalau nama penggunanya cocok di LEBIH dari satu tenant (kemungkinan langka
 * tapi ada — lihat catatan di query di bawah) atau tidak cocok sama sekali,
 * sengaja balas `slug: null` (tidak coba menebak) — halaman Masuk lanjut
 * seperti biasa (coba semua tenant), bukan diam-diam salah arah.
 */
const resolveUsernameTenant = asyncHandler(async (req, res) => {
  const identifier = String(req.query.username || '').toLowerCase().trim();
  if (!identifier) return res.json({ slug: null });

  const [rows] = await pool.query(
    /* DISTINCT t.slug, bukan DISTINCT t.id — kalau (secara teori) dua tenant
       berbeda kebetulan punya baris users.username yang SAMA PERSIS (username
       cuma unik PER TENANT, lihat migration_saas_multitenancy_phase1.sql),
       LIMIT 2 di sini akan tetap mengembalikan 2 baris dan endpoint balas
       null (ambigu) — bukan asal pilih salah satu. */
    `SELECT DISTINCT t.slug
     FROM users u JOIN tenants t ON t.id = u.tenant_id
     WHERE u.username = :identifier AND u.deleted_at IS NULL AND u.status = 'active'
     LIMIT 2`,
    { identifier }
  );

  res.json({ slug: rows.length === 1 ? rows[0].slug : null });
});

module.exports = { scanAsset, scanConsumable, listPublicCategories, createPublicRequest, submitContact, checkSlugAvailability, resolveUsernameTenant };
