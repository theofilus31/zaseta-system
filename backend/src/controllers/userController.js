const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const logAudit = require('../utils/auditLogger');

const { MODULES, ADMIN_ROLE, DEFAULT_ROLE, sanitizePermissions, fullAccess } = require('../config/modules');

const USERNAME_REGEX = /^[a-z0-9_-]{3,50}$/;

/**
 * Terjemahkan penanda "administrator" jadi role_id.
 * Peran tidak lagi dipilih pengguna — hanya dua kemungkinan: administrator
 * (akses penuh) atau pengguna biasa yang aksesnya diatur matriks izin.
 */
async function resolveRoleId(isAdmin) {
  const name = isAdmin ? ADMIN_ROLE : DEFAULT_ROLE;
  const [rows] = await pool.query(`SELECT id FROM roles WHERE name = :name LIMIT 1`, { name });
  if (!rows[0]) throw new Error(`Peran internal "${name}" tidak ada di database.`);
  return rows[0].id;
}

/** Baca izin satu pengguna jadi bentuk { moduleKey: ['view', ...] }. */
async function readPermissions(userId) {
  const [rows] = await pool.query(
    `SELECT module_key, can_view, can_create, can_edit, can_delete
     FROM user_permissions WHERE user_id = :userId`,
    { userId }
  );

  const map = {};
  for (const r of rows) {
    if (!r.can_view) continue;
    const actions = ['view'];
    if (r.can_create) actions.push('create');
    if (r.can_edit) actions.push('edit');
    if (r.can_delete) actions.push('delete');
    map[r.module_key] = actions;
  }
  return map;
}

/**
 * Tulis ulang izin seorang pengguna. Baris lama dihapus dulu supaya modul yang
 * dicabut benar-benar hilang — kalau hanya di-upsert, modul yang tidak lagi
 * dikirim akan tertinggal dan diam-diam tetap memberi akses.
 */
async function writePermissions(userId, permissions) {
  const clean = sanitizePermissions(permissions);

  await pool.query(`DELETE FROM user_permissions WHERE user_id = :userId`, { userId });

  for (const [moduleKey, actions] of Object.entries(clean)) {
    await pool.query(
      `INSERT INTO user_permissions (user_id, module_key, can_view, can_create, can_edit, can_delete)
       VALUES (:userId, :moduleKey, TRUE, :canCreate, :canEdit, :canDelete)`,
      {
        userId, moduleKey,
        canCreate: actions.includes('create'),
        canEdit: actions.includes('edit'),
        canDelete: actions.includes('delete'),
      }
    );
  }
  return clean;
}

// GET /api/users
const listUsers = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.name, u.email, u.status, u.last_login_at, u.created_at,
            r.name AS role, r.id AS role_id, (r.name = 'admin') AS is_admin,
            (SELECT COUNT(*) FROM user_permissions p WHERE p.user_id = u.id AND p.can_view) AS module_count
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.deleted_at IS NULL
     ORDER BY u.created_at DESC`
  );

  /* Administrator selalu berakses penuh lewat middleware, jadi hitungan
     modulnya diambil dari katalog — bukan dari tabel izin yang bisa saja
     belum pernah diisi untuk akun itu. */
  res.json(rows.map((u) => ({
    ...u,
    is_admin: Boolean(u.is_admin),
    module_count: u.role === 'admin' ? MODULES.length : Number(u.module_count) || 0,
  })));
});

// GET /api/users/modules — katalog menu & aksi untuk membangun matriks izin
const getModuleCatalog = asyncHandler(async (req, res) => {
  res.json({ modules: MODULES });
});

// GET /api/users/:id
const getUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.name, u.email, u.status, r.name AS role, r.id AS role_id
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = :id AND u.deleted_at IS NULL`,
    { id }
  );
  if (!rows[0]) return res.status(404).json({ message: 'User tidak ditemukan.' });

  const isAdmin = rows[0].role === ADMIN_ROLE;
  const permissions = isAdmin ? fullAccess() : await readPermissions(id);
  res.json({ ...rows[0], is_admin: isAdmin, permissions });
});

// POST /api/users
const createUser = asyncHandler(async (req, res) => {
  const { username, name, email, password, status, permissions, isAdmin = false } = req.body;
  if (!username || !name || !email || !password) {
    return res.status(400).json({ message: 'Nama pengguna, nama, surel, dan kata sandi wajib diisi.' });
  }

  /* Pengguna non-administrator wajib punya minimal satu menu. Akun tanpa akses
     apa pun hanya akan bisa masuk lalu terjebak di halaman kosong. */
  if (!isAdmin && (!permissions || Object.keys(permissions).length === 0)) {
    return res.status(400).json({ message: 'Pilih minimal satu menu yang boleh diakses pengguna ini.' });
  }

  const normalizedUsername = username.toLowerCase();
  if (!USERNAME_REGEX.test(normalizedUsername)) {
    return res.status(400).json({
      message: 'Nama pengguna hanya boleh huruf kecil, angka, garis bawah (_), tanda minus (-), minimal 3 karakter.'
    });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: 'Kata sandi minimal 8 karakter.' });
  }

  const [existingUsername] = await pool.query(
    `SELECT id FROM users WHERE username = :username AND deleted_at IS NULL`,
    { username: normalizedUsername }
  );
  if (existingUsername[0]) {
    return res.status(409).json({ message: 'Nama pengguna sudah dipakai.' });
  }

  const [existingEmail] = await pool.query(`SELECT id FROM users WHERE email = :email AND deleted_at IS NULL`, { email });
  if (existingEmail[0]) {
    return res.status(409).json({ message: 'Surel sudah terdaftar.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const roleId = await resolveRoleId(isAdmin);
  const [result] = await pool.query(
    `INSERT INTO users (username, role_id, name, email, password_hash, status) VALUES (:username, :roleId, :name, :email, :passwordHash, :status)`,
    { username: normalizedUsername, roleId, name, email, passwordHash, status: status || 'active' }
  );

  /* Administrator tetap diberi baris izin penuh supaya matriksnya memperlihatkan
     keadaan sebenarnya — meski penegakannya lewat jalur khusus di middleware. */
  const savedPermissions = await writePermissions(result.insertId, isAdmin ? fullAccess() : permissions);

  await logAudit({
    userId: req.user.id, action: 'create', entityType: 'user', entityId: result.insertId,
    newValues: { username: normalizedUsername, name, email, isAdmin, status, permissions: savedPermissions },
  });

  res.status(201).json({ id: result.insertId, username: normalizedUsername, name, email, permissions: savedPermissions });
});

// PUT /api/users/:id
const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { username, name, email, status, password, permissions, isAdmin } = req.body;

  const [existingRows] = await pool.query(`SELECT id, email, username, role_id FROM users WHERE id = :id AND deleted_at IS NULL`, { id });
  if (!existingRows[0]) return res.status(404).json({ message: 'User tidak ditemukan.' });

  // Cegah admin menonaktifkan/menurunkan role akun sendiri secara tidak sengaja (opsional safety)
  if (Number(id) === req.user.id && status === 'inactive') {
    return res.status(400).json({ message: 'Anda tidak bisa menonaktifkan akun Anda sendiri.' });
  }

  let normalizedUsername = existingRows[0].username;
  if (username && username.toLowerCase() !== existingRows[0].username) {
    normalizedUsername = username.toLowerCase();
    if (!USERNAME_REGEX.test(normalizedUsername)) {
      return res.status(400).json({
        message: 'Nama pengguna hanya boleh huruf kecil, angka, garis bawah (_), tanda minus (-), minimal 3 karakter.'
      });
    }
    const [dupeUsername] = await pool.query(
      `SELECT id FROM users WHERE username = :username AND id != :id AND deleted_at IS NULL`,
      { username: normalizedUsername, id }
    );
    if (dupeUsername[0]) return res.status(409).json({ message: 'Nama pengguna sudah dipakai pengguna lain.' });
  }

  if (email && email !== existingRows[0].email) {
    const [dupe] = await pool.query(`SELECT id FROM users WHERE email = :email AND id != :id AND deleted_at IS NULL`, { email, id });
    if (dupe[0]) return res.status(409).json({ message: 'Surel sudah dipakai pengguna lain.' });
  }

  if (password) {
    if (password.length < 8) return res.status(400).json({ message: 'Kata sandi minimal 8 karakter.' });
    const passwordHash = await bcrypt.hash(password, 10);
    /* token_version dinaikkan supaya SEMUA token lama pengguna ini langsung
       tidak berlaku — beda dari profileController (ganti sandi sendiri), di
       sini yang memanggil endpoint adalah admin, bukan pemilik akun, jadi
       tidak ada token baru yang bisa/boleh diterbitkan untuknya lewat
       respons ini. Pengguna itu memang harus masuk ulang. */
    await pool.query(
      `UPDATE users SET password_hash = :passwordHash, token_version = token_version + 1 WHERE id = :id`,
      { id, passwordHash }
    );
  }

  /* isAdmin hanya diproses kalau memang dikirim — permintaan yang hanya
     mengubah nama/status tidak boleh diam-diam menurunkan hak akses. */
  const roleId = isAdmin === undefined
    ? existingRows[0].role_id
    : await resolveRoleId(isAdmin);

  await pool.query(
    `UPDATE users SET username = :username, name = :name, email = :email, role_id = :roleId, status = :status WHERE id = :id`,
    { id, username: normalizedUsername, name, email, roleId, status }
  );

  /* Matriks hanya ditulis ulang kalau memang dikirim. Permintaan yang hanya
     mengubah nama/status tidak boleh diam-diam menghapus izin yang sudah ada. */
  let savedPermissions;
  if (isAdmin === true) {
    savedPermissions = await writePermissions(id, fullAccess());
  } else if (permissions !== undefined) {
    savedPermissions = await writePermissions(id, permissions);
  }

  await logAudit({
    userId: req.user.id, action: 'update', entityType: 'user', entityId: id,
    newValues: { username: normalizedUsername, name, email, isAdmin, status, permissions: savedPermissions },
  });

  res.json({ message: 'User berhasil diperbarui.', permissions: savedPermissions });
});

// DELETE /api/users/:id (soft delete)
const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (Number(id) === req.user.id) {
    return res.status(400).json({ message: 'Anda tidak bisa menghapus akun Anda sendiri.' });
  }

  await pool.query(`UPDATE users SET deleted_at = NOW(), status = 'inactive' WHERE id = :id`, { id });
  await logAudit({ userId: req.user.id, action: 'delete', entityType: 'user', entityId: id });
  res.json({ message: 'User berhasil dihapus.' });
});

module.exports = { listUsers, getUser, createUser, updateUser, deleteUser, getModuleCatalog };
