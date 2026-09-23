/**
 * ============================================================================
 *  KATALOG MODUL & IZIN (sisi frontend)
 * ============================================================================
 *  Cermin dari backend/src/config/modules.js. Keduanya HARUS tetap sinkron —
 *  kalau menambah modul di sana, tambahkan juga di sini. Tidak bisa di-import
 *  langsung karena backend CommonJS dan frontend ESM, dan keduanya paket npm
 *  terpisah.
 *
 *  Salinan ini hanya untuk menyusun tampilan (menu, matriks izin, label).
 *  Sumber kebenaran saat runtime tetap izin yang dikirim server bersama data
 *  pengguna — dan penegakan sesungguhnya ada di middleware backend.
 * ============================================================================
 */

export const ACTIONS = ['view', 'create', 'edit', 'delete'];

export const ACTION_LABEL = {
  view: 'Lihat',
  create: 'Tambah',
  edit: 'Ubah',
  delete: 'Hapus',
};

export const ACTION_HINT = {
  view: 'Membuka menu dan melihat isinya',
  create: 'Menambah data baru',
  edit: 'Mengubah data yang sudah ada',
  delete: 'Menghapus data',
};

export const MODULES = [
  {
    key: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: 'fa-chart-pie',
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

export const MODULE_BY_KEY = Object.fromEntries(MODULES.map((m) => [m.key, m]));

/**
 * Modul UTUH yang dikunci di paket Free — cermin dari FREE_LOCKED_MODULES di
 * backend/src/middleware/planLimits.js (penegakan sesungguhnya ada di sana;
 * daftar ini HANYA untuk tampilan, lihat ProtectedRoute.jsx & Sidebar.jsx).
 * Beda dari batas jumlah (maxAssets/dst, lihat plans.js) — ini menutup
 * modulnya sama sekali, bukan membatasi berapa banyak yang boleh dibuat.
 */
export const FREE_LOCKED_MODULES = new Set(['barcode', 'opname', 'consumables', 'requests', 'custom_fields']);

/** Urutan kelompok menu di sidebar dan di matriks izin. */
export const MODULE_GROUPS = ['Aset', 'Data Acuan', 'Laporan', 'Administrasi'];

/**
 * Peran bertingkat (Administrator / Staf IT / Peninjau) sudah TIDAK dipakai lagi.
 * Hak akses ditentukan sepenuhnya oleh matriks izin per menu. Yang tersisa hanya
 * pembedaan biner yang memang tidak bisa dihilangkan: administrator berakses
 * penuh, sisanya mengikuti matriks.
 */
export const accessLabel = (user) => (user?.role === 'admin' ? 'Administrator' : 'Pengguna');
export const accessTone = (user) => (user?.role === 'admin' ? 'danger' : 'neutral');
export const isAdminUser = (user) => user?.role === 'admin';
