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
    key: 'dashboard', label: 'Dasbor', path: '/dashboard', icon: 'fa-chart-pie',
    group: 'Operasional', actions: ['view'],
    description: 'Ringkasan aset, nilai, dan hal yang perlu perhatian.',
  },
  {
    key: 'assets', label: 'Daftar Aset', path: '/assets', icon: 'fa-laptop',
    group: 'Operasional', actions: ACTIONS,
    description: 'Data aset, serah terima, impor, dan ekspor.',
  },
  {
    key: 'barcode', label: 'Cetak Kode Batang', path: '/cetak-barcode-massal', icon: 'fa-print',
    group: 'Operasional', actions: ['view'],
    description: 'Mencetak label QR satuan maupun massal.',
  },
  {
    key: 'opname', label: 'Stok Opname', path: '/opname', icon: 'fa-clipboard-check',
    group: 'Operasional', actions: ACTIONS,
    description: 'Pemeriksaan fisik aset dan laporan selisihnya.',
  },
  {
    key: 'consumables', label: 'Barang Habis Pakai', path: '/consumables', icon: 'fa-boxes-stacked',
    group: 'Operasional', actions: ACTIONS,
    description: 'Stok ATK, kebersihan, dan perlengkapan yang dipakai habis.',
  },
  {
    key: 'requests', label: 'Permintaan Aset', path: '/requests', icon: 'fa-hand-point-right',
    group: 'Operasional', actions: ACTIONS,
    description: 'Pengajuan, tinjauan, dan pemenuhan permintaan aset karyawan.',
  },
  {
    key: 'zecode', label: 'Zecode AI', path: '/zecode', icon: 'fa-robot',
    group: 'Operasional', actions: ['view'],
    description: 'Asisten AI internal untuk tanya-jawab data sistem.',
  },
  {
    key: 'categories', label: 'Kode Barang/Aset', path: '/categories', icon: 'fa-tags',
    group: 'Master Data', actions: ACTIONS,
    description: 'Kelompok barang yang menyusun kode aset.',
  },
  {
    key: 'asset_types', label: 'Kategori Aset', path: '/asset-types', icon: 'fa-layer-group',
    group: 'Master Data', actions: ACTIONS,
    description: 'Klasifikasi umum aset (Elektronik, Furniture, dst.).',
  },
  {
    key: 'locations', label: 'Lokasi', path: '/locations', icon: 'fa-location-dot',
    group: 'Master Data', actions: ACTIONS,
    description: 'Lokasi dan sub lokasi penempatan aset.',
  },
  {
    key: 'departments', label: 'Departemen', path: '/departments', icon: 'fa-building-user',
    group: 'Master Data', actions: ACTIONS,
    description: 'Divisi pemilik aset, dipakai untuk laporan per departemen.',
  },
  {
    key: 'custom_fields', label: 'Bidang Kustom', path: '/custom-fields', icon: 'fa-list-ul',
    group: 'Master Data', actions: ACTIONS,
    description: 'Kolom data tambahan pada form aset.',
  },
  {
    key: 'users', label: 'Manajemen Pengguna', path: '/users', icon: 'fa-user-shield',
    group: 'Administrasi', actions: ACTIONS,
    description: 'Akun pengguna beserta hak aksesnya.',
  },
  {
    key: 'reports', label: 'Laporan', path: '/reports/depreciation', icon: 'fa-chart-line',
    group: 'Administrasi', actions: ['view'],
    description: 'Laporan penyusutan aset per periode dan departemen.',
  },
  {
    key: 'audit_logs', label: 'Riwayat Aktivitas', path: '/audit-logs', icon: 'fa-clock-rotate-left',
    group: 'Administrasi', actions: ['view'],
    description: 'Jejak seluruh perubahan data di sistem.',
  },
  {
    key: 'settings', label: 'Pengaturan', path: '/settings', icon: 'fa-sliders',
    group: 'Administrasi', actions: ['view', 'edit'],
    description: 'Nama aplikasi, nama perusahaan, dan logo.',
  },
];

export const MODULE_BY_KEY = Object.fromEntries(MODULES.map((m) => [m.key, m]));

/** Urutan kelompok menu di sidebar dan di matriks izin. */
export const MODULE_GROUPS = ['Operasional', 'Master Data', 'Administrasi'];

/**
 * Peran bertingkat (Administrator / Staf IT / Peninjau) sudah TIDAK dipakai lagi.
 * Hak akses ditentukan sepenuhnya oleh matriks izin per menu. Yang tersisa hanya
 * pembedaan biner yang memang tidak bisa dihilangkan: administrator berakses
 * penuh, sisanya mengikuti matriks.
 */
export const accessLabel = (user) => (user?.role === 'admin' ? 'Administrator' : 'Pengguna');
export const accessTone = (user) => (user?.role === 'admin' ? 'danger' : 'neutral');
export const isAdminUser = (user) => user?.role === 'admin';
