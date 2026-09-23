const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { MODULE_BY_KEY, fullAccess } = require('../config/modules');
const { getPlan } = require('../config/plans');

/**
 * Memverifikasi JWT dari header Authorization: Bearer <token>, lalu memuat
 * izin pengguna dari database.
 *
 * Izin sengaja DIBACA ULANG setiap permintaan, bukan disimpan di dalam token.
 * Token berlaku 8 jam; kalau izin ikut dibekukan di sana, pencabutan akses
 * baru terasa setelah pengguna login ulang — tidak bisa diterima untuk sesuatu
 * yang justru dipakai membatasi akses. Biayanya satu query beriondeks per
 * permintaan, jauh lebih murah daripada risiko akses basi.
 */
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Token tidak ditemukan. Silakan login.' });
  }

  let payload;
  try {
    // Algoritma disebutkan eksplisit (bukan cuma dipercaya dari header token
    // itu sendiri) — tidak ada celah yang bisa dieksploitasi di sini sekarang
    // (tidak ada kunci asimetris di arsitektur ini), tapi ini praktik baik
    // standar untuk mencegah kelas serangan "algorithm confusion" kalau
    // arsitektur otentikasi berubah nanti.
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    return res.status(401).json({ message: 'Token tidak valid atau kedaluwarsa.' });
  }

  // Token admin platform (lihat authenticatePlatform di bawah) TIDAK BOLEH
  // dipakai di jalur tenant ini — dua sesi ini terpisah total sejak
  // migration_separate_platform_admins.sql, bukan cuma dibedakan lewat satu
  // flag di baris yang sama.
  if (payload.type === 'platform') {
    return res.status(401).json({ message: 'Token tidak valid untuk aplikasi ini.' });
  }

  try {
    /* Status, peran, DAN token_version ikut dibaca ulang: akun yang
       dinonaktifkan setelah token terbit harus langsung kehilangan akses,
       tidak menunggu token kedaluwarsa. tenant_id ikut dibaca dari database
       (bukan cuma dipercaya dari payload token) supaya perusahaan yang
       ditangguhkan (tenants.status = 'suspended') bisa langsung diblokir
       tanpa menunggu semua tokennya kedaluwarsa satu-satu. */
    const [rows] = await pool.query(
      `SELECT u.id, u.tenant_id, u.username, u.name, u.email, u.status, u.token_version,
              u.login_count AS "loginCount", u.testimonial_status AS "testimonialStatus",
              r.name AS role, t.status AS tenant_status, t.plan
       FROM users u
       JOIN roles r ON r.id = u.role_id
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = :id AND u.deleted_at IS NULL LIMIT 1`,
      { id: payload.id }
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({ message: 'Akun tidak ditemukan lagi. Silakan masuk kembali.' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ message: 'Akun Anda dinonaktifkan. Hubungi administrator.' });
    }
    /* Langganan perusahaan (tenant) ini dihentikan/ditangguhkan — SEMUA
       penggunanya kehilangan akses seketika, bukan cuma satu akun. Dicek di
       sini (bukan hanya saat login) supaya penangguhan langsung terasa pada
       permintaan berikutnya, sama seperti alasan status akun & token_version
       di atas dan di bawah. */
    if (user.tenant_status !== 'active' && user.tenant_status !== 'trial') {
      return res.status(403).json({ message: 'Langganan perusahaan Anda sedang tidak aktif. Hubungi penyedia layanan.' });
    }
    /* token_version dinaikkan setiap kali kata sandi akun ini diganti (lihat
       profileController & userController) — token yang diterbitkan sebelum
       kenaikan itu langsung ditolak di sini, tanpa menunggu masa berlakunya
       habis sendiri. Token lama dari sebelum kolom ini ada juga otomatis
       tidak cocok (payload.tokenVersion bernilai undefined), jadi ikut
       ditolak — perilaku yang benar, bukan celah. */
    if (payload.tokenVersion !== user.token_version) {
      return res.status(401).json({ message: 'Sesi ini sudah tidak berlaku. Silakan masuk kembali.' });
    }

    /* planName = label siap-tampil ("Starter", dst.) untuk sidebar/topbar --
       tenant.plan sendiri cuma slug ("starter"). Fallback ke slug apa
       adanya untuk nilai yang bukan bagian katalog publik (mis.
       'enterprise_custom' -- lihat catatan di migration_plans_catalog_db.sql). */
    req.user = {
      ...user,
      planName: getPlan(user.plan)?.name || user.plan,
      permissions: await loadPermissions(user),
    };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Peta izin pengguna: { moduleKey: ['view','create',...] }.
 * Administrator selalu mendapat akses penuh tanpa melihat tabel izin — ini
 * katup pengaman supaya tidak ada keadaan di mana seluruh administrator
 * terkunci dari menu Manajemen Pengguna dan tidak bisa memperbaikinya lagi.
 */
async function loadPermissions(user) {
  if (user.role === 'admin') return fullAccess();

  const [rows] = await pool.query(
    `SELECT module_key, can_view, can_create, can_edit, can_delete
     FROM user_permissions WHERE user_id = :id`,
    { id: user.id }
  );

  const map = {};
  for (const r of rows) {
    const mod = MODULE_BY_KEY[r.module_key];
    if (!mod || !r.can_view) continue; // tanpa hak lihat, modulnya dianggap tertutup

    const actions = ['view'];
    if (r.can_create && mod.actions.includes('create')) actions.push('create');
    if (r.can_edit && mod.actions.includes('edit')) actions.push('edit');
    if (r.can_delete && mod.actions.includes('delete')) actions.push('delete');
    map[r.module_key] = actions;
  }
  return map;
}

function userCan(user, moduleKey, action = 'view') {
  return Boolean(user?.permissions?.[moduleKey]?.includes(action));
}

/**
 * Menjaga satu endpoint: requirePermission('assets', 'create')
 */
function requirePermission(moduleKey, action = 'view') {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Belum terautentikasi.' });
    }
    if (!userCan(req.user, moduleKey, action)) {
      const label = MODULE_BY_KEY[moduleKey]?.label || moduleKey;
      const verb = { view: 'membuka', create: 'menambah data di', edit: 'mengubah data di', delete: 'menghapus data di' }[action] || action;
      return res.status(403).json({ message: `Anda tidak memiliki izin untuk ${verb} menu ${label}.` });
    }
    next();
  };
}

/**
 * Lolos kalau SALAH SATU izin terpenuhi. Dipakai untuk endpoint daftar master
 * data (kategori, lokasi, dst.) yang juga dibutuhkan hanya sebagai isi dropdown
 * di form aset — tanpa ini, pengguna yang boleh menambah aset tapi tidak diberi
 * menu Lokasi akan mendapati dropdown lokasinya kosong dan formnya buntu.
 *
 * Pemakaian: requireAnyPermission('categories.view', 'assets.view')
 */
function requireAnyPermission(...specs) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Belum terautentikasi.' });
    }
    const ok = specs.some((spec) => {
      const [moduleKey, action = 'view'] = spec.split('.');
      return userCan(req.user, moduleKey, action);
    });
    if (!ok) {
      return res.status(403).json({ message: 'Anda tidak memiliki izin untuk data ini.' });
    }
    next();
  };
}

/**
 * Masih dipakai untuk hal yang memang melekat pada peran, bukan pada menu —
 * saat ini hanya penggantian nama pengguna orang lain di halaman Profil.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Belum terautentikasi.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Anda tidak memiliki akses untuk aksi ini.' });
    }
    next();
  };
}

/**
 * Menjaga SELURUH endpoint admin platform (routes/platformRoutes.js,
 * routes/platformAuthRoutes.js) — sesi TERPISAH TOTAL dari authenticate()
 * tenant di atas sejak migration_separate_platform_admins.sql. Admin
 * platform tidak lagi punya baris `users` sama sekali, jadi tidak bisa
 * menumpang authenticate() lalu dicek satu flag seperti dulu
 * (requirePlatformAdmin) — perlu jalur verifikasi & pemuatan akun sendiri.
 */
async function authenticatePlatform(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Token tidak ditemukan. Silakan login.' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    return res.status(401).json({ message: 'Token tidak valid atau kedaluwarsa.' });
  }

  // Token pengguna tenant TIDAK BOLEH dipakai di jalur admin platform ini —
  // lihat penolakan simetrisnya (`type === 'platform'`) di authenticate().
  if (payload.type !== 'platform') {
    return res.status(401).json({ message: 'Token tidak valid untuk aplikasi ini.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT id, username, name, email, status, token_version
       FROM platform_admins WHERE id = :id AND deleted_at IS NULL LIMIT 1`,
      { id: payload.id }
    );

    const admin = rows[0];
    if (!admin) {
      return res.status(401).json({ message: 'Akun tidak ditemukan lagi. Silakan masuk kembali.' });
    }
    if (admin.status !== 'active') {
      return res.status(403).json({ message: 'Akun Anda dinonaktifkan.' });
    }
    if (payload.tokenVersion !== admin.token_version) {
      return res.status(401).json({ message: 'Sesi ini sudah tidak berlaku. Silakan masuk kembali.' });
    }

    req.platformAdmin = admin;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticate, requirePermission, requireAnyPermission, requireRole, authenticatePlatform, loadPermissions, userCan };
