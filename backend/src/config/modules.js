/**
 * ============================================================================
 *  KATALOG MODUL & IZIN
 * ============================================================================
 *  Satu-satunya sumber kebenaran untuk "menu apa saja yang ada" dan "aksi apa
 *  saja yang masuk akal di menu itu". Dipakai oleh:
 *    - middleware/auth.js  → menegakkan izin di setiap endpoint
 *    - userController      → memvalidasi & mengirim katalog ke frontend
 *
 *  Frontend punya salinannya di frontend/src/constants/modules.js. Keduanya
 *  HARUS tetap sinkron — kalau menambah modul di sini, tambahkan juga di sana.
 *  (Tidak bisa di-import lintas paket karena backend CommonJS, frontend ESM
 *  dan keduanya berdiri sebagai paket npm terpisah.)
 * ============================================================================
 */

const ACTIONS = ['view', 'create', 'edit', 'delete'];

/**
 * `actions` membatasi kotak centang yang ditawarkan per modul. Modul yang
 * sifatnya murni membaca (Dasbor, Cetak Label, Riwayat Aktivitas) sengaja
 * hanya punya `view` — menawarkan "hapus" di sana cuma membingungkan.
 */
const MODULES = [
  {
    key: 'dashboard', label: 'Dasbor', path: '/dashboard', icon: 'fa-chart-pie',
    group: 'Aset', actions: ['view'],
    description: 'Ringkasan aset, nilai, dan hal yang perlu perhatian.',
  },
  {
    key: 'assets', label: 'Daftar Aset', path: '/assets', icon: 'fa-laptop',
    group: 'Aset', actions: ACTIONS,
    description: 'Data aset, serah terima, impor, dan ekspor.',
  },
  {
    key: 'barcode', label: 'Cetak Kode Batang', path: '/cetak-barcode-massal', icon: 'fa-print',
    group: 'Aset', actions: ['view'],
    description: 'Mencetak label QR satuan maupun massal.',
  },
  {
    key: 'opname', label: 'Stok Opname', path: '/opname', icon: 'fa-clipboard-check',
    group: 'Aset', actions: ACTIONS,
    description: 'Pemeriksaan fisik aset dan laporan selisihnya.',
  },
  {
    key: 'consumables', label: 'Barang Habis Pakai', path: '/consumables', icon: 'fa-boxes-stacked',
    group: 'Aset', actions: ACTIONS,
    description: 'Stok ATK, kebersihan, dan perlengkapan yang dipakai habis.',
  },
  {
    key: 'requests', label: 'Permintaan Aset', path: '/requests', icon: 'fa-hand-point-right',
    group: 'Aset', actions: ACTIONS,
    description: 'Pengajuan, tinjauan, dan pemenuhan permintaan aset karyawan.',
  },
  {
    key: 'zecode', label: 'Zecode AI', path: '/zecode', icon: 'fa-robot',
    group: 'Aset', actions: ['view'],
    description: 'Asisten AI internal untuk tanya-jawab data sistem.',
  },
  {
    key: 'categories', label: 'Kode Barang/Aset', path: '/categories', icon: 'fa-tags',
    group: 'Data Acuan', actions: ACTIONS,
    description: 'Kelompok barang yang menyusun kode aset.',
  },
  {
    key: 'asset_types', label: 'Kategori Aset', path: '/asset-types', icon: 'fa-layer-group',
    group: 'Data Acuan', actions: ACTIONS,
    description: 'Klasifikasi umum aset (Elektronik, Furniture, dst.).',
  },
  {
    key: 'locations', label: 'Lokasi', path: '/locations', icon: 'fa-location-dot',
    group: 'Data Acuan', actions: ACTIONS,
    description: 'Lokasi dan sub lokasi penempatan aset.',
  },
  {
    key: 'departments', label: 'Departemen', path: '/departments', icon: 'fa-building-user',
    group: 'Data Acuan', actions: ACTIONS,
    description: 'Divisi pemilik aset, dipakai untuk laporan per departemen.',
  },
  {
    key: 'custom_fields', label: 'Bidang Kustom', path: '/custom-fields', icon: 'fa-list-ul',
    group: 'Data Acuan', actions: ACTIONS,
    description: 'Kolom data tambahan pada form aset.',
  },
  {
    key: 'reports', label: 'Laporan', path: '/reports/depreciation', icon: 'fa-chart-line',
    group: 'Laporan', actions: ['view'],
    description: 'Laporan penyusutan aset per periode dan departemen.',
  },
  {
    key: 'audit_logs', label: 'Riwayat Aktivitas', path: '/audit-logs', icon: 'fa-clock-rotate-left',
    group: 'Laporan', actions: ['view'],
    description: 'Jejak seluruh perubahan data di sistem.',
  },
  {
    key: 'users', label: 'Manajemen Pengguna', path: '/users', icon: 'fa-user-shield',
    group: 'Administrasi', actions: ACTIONS,
    description: 'Akun pengguna beserta hak aksesnya.',
  },
  {
    key: 'trash', label: 'Tempat Sampah', path: '/trash', icon: 'fa-trash-can',
    group: 'Administrasi', actions: ['view', 'edit', 'delete'],
    description: 'Aset yang sudah dihapus — pulihkan, atau hapus permanen supaya kode barang/lokasinya bisa dihapus.',
  },
  {
    key: 'settings', label: 'Pengaturan', path: '/settings', icon: 'fa-sliders',
    group: 'Administrasi', actions: ['view', 'edit'],
    description: 'Nama aplikasi, nama perusahaan, dan logo.',
  },
  {
    key: 'billing', label: 'Langganan', path: '/billing', icon: 'fa-credit-card',
    group: 'Administrasi', actions: ['view'],
    description: 'Paket, pemakaian, dan pengajuan upgrade langganan.',
  },
];

const MODULE_KEYS = MODULES.map((m) => m.key);
const MODULE_BY_KEY = Object.fromEntries(MODULES.map((m) => [m.key, m]));

/**
 * Peran bertingkat (admin / it_staff / viewer) sudah TIDAK dipakai lagi sebagai
 * penentu akses — hak akses sepenuhnya ditentukan tabel `user_permissions`
 * per pengguna per menu.
 *
 * Yang tersisa hanya pembedaan biner yang memang tidak bisa dihilangkan:
 *
 *   ADMIN_ROLE   — akses penuh, tidak dibatasi matriks izin. Ini katup
 *                  pengaman: kalau akses administrator ikut bergantung pada
 *                  centang di matriks, satu kesalahan bisa mengunci semua orang
 *                  keluar dari menu Manajemen Pengguna tanpa ada cara
 *                  memperbaikinya dari dalam aplikasi.
 *   DEFAULT_ROLE — dipakai untuk SEMUA pengguna non-administrator. Namanya
 *                  tinggal warisan; tidak lagi punya arti apa pun selain
 *                  mengisi kolom users.role_id yang NOT NULL.
 */
const ADMIN_ROLE = 'admin';
const DEFAULT_ROLE = 'it_staff';

/** Semua modul, semua aksi yang berlaku — bentuk izin untuk administrator. */
function fullAccess() {
  return Object.fromEntries(MODULES.map((m) => [m.key, [...m.actions]]));
}

/** Buang modul/aksi yang tidak dikenal supaya data kotor tidak masuk database. */
function sanitizePermissions(input) {
  const clean = {};
  if (!input || typeof input !== 'object') return clean;

  for (const [moduleKey, actions] of Object.entries(input)) {
    const mod = MODULE_BY_KEY[moduleKey];
    if (!mod || !Array.isArray(actions)) continue;

    const allowed = actions.filter((a) => mod.actions.includes(a));
    if (allowed.length === 0) continue;

    /* Aksi apa pun mensyaratkan `view`: tidak masuk akal bisa mengubah data di
       menu yang tidak boleh dibuka sama sekali. */
    if (!allowed.includes('view')) allowed.unshift('view');
    clean[moduleKey] = allowed;
  }
  return clean;
}

module.exports = {
  ACTIONS, MODULES, MODULE_KEYS, MODULE_BY_KEY,
  ADMIN_ROLE, DEFAULT_ROLE, fullAccess, sanitizePermissions,
};
