const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { MODULE_BY_KEY, fullAccess } = require('../config/modules');

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
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ message: 'Token tidak valid atau kedaluwarsa.' });
  }

  try {
    /* Status, peran, DAN token_version ikut dibaca ulang: akun yang
       dinonaktifkan setelah token terbit harus langsung kehilangan akses,
       tidak menunggu token kedaluwarsa. */
    const [rows] = await pool.query(
      `SELECT u.id, u.username, u.name, u.email, u.status, u.token_version, r.name AS role
       FROM users u JOIN roles r ON r.id = u.role_id
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
    /* token_version dinaikkan setiap kali kata sandi akun ini diganti (lihat
       profileController & userController) — token yang diterbitkan sebelum
       kenaikan itu langsung ditolak di sini, tanpa menunggu masa berlakunya
       habis sendiri. Token lama dari sebelum kolom ini ada juga otomatis
       tidak cocok (payload.tokenVersion bernilai undefined), jadi ikut
       ditolak — perilaku yang benar, bukan celah. */
    if (payload.tokenVersion !== user.token_version) {
      return res.status(401).json({ message: 'Sesi ini sudah tidak berlaku. Silakan masuk kembali.' });
    }

    req.user = { ...user, permissions: await loadPermissions(user) };
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

module.exports = { authenticate, requirePermission, requireAnyPermission, requireRole, loadPermissions, userCan };
