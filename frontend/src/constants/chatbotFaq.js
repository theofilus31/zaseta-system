/**
 * Bank tanya-jawab untuk chatbot statis Zecode (components/zecode/ZecodeWidget.jsx).
 *
 * Tidak ada AI/server di balik ini — semua jawaban ditulis di sini. Menambah
 * atau memperbaiki jawaban cukup dengan menyunting berkas ini.
 *
 * - `a`        jawaban; **tebal** dan baris baru didukung.
 * - `links`    tombol "buka halaman" di bawah jawaban ({ to, label }).
 * - `keywords` kata kunci tambahan agar pertanyaan yang diketik bebas tetap
 *              ketemu (dicocokkan bersama teks pertanyaan `q`).
 *
 * Nama menu & tombol harus persis seperti di aplikasi — periksa lagi kalau
 * label di halaman diganti.
 */

export const FAQ_CATEGORIES = [
  {
    key: 'mulai',
    label: 'Memulai',
    icon: 'fa-rocket',
    items: [
      {
        id: 'mulai-urutan',
        q: 'Bagaimana urutan mulai memakai Zaseta?',
        a: 'Urutan yang paling lancar:\n1. Isi **data acuan** dulu: Lokasi, Kode Barang/Aset, dan (opsional) Kategori Aset & Departemen.\n2. Tambahkan aset satu per satu, atau impor banyak sekaligus lewat CSV.\n3. Cetak label QR dan tempel di aset.\n4. Buat akun untuk rekan tim di Manajemen Pengguna dan atur hak aksesnya.',
        links: [{ to: '/locations', label: 'Lokasi' }, { to: '/categories', label: 'Kode Barang/Aset' }, { to: '/assets', label: 'Daftar Aset' }],
        keywords: ['mulai', 'awal', 'pertama', 'panduan', 'tutorial', 'langkah'],
      },
      {
        id: 'mulai-tautan-masuk',
        q: 'Bagaimana cara membagikan tautan masuk perusahaan ke rekan?',
        a: 'Di **Dasbor**, klik tombol **Salin Tautan Masuk** di kanan atas. Tautannya berbentuk `alamat-aplikasi/kode-perusahaan/login` — kirim ke rekan yang akan diberi akun.',
        links: [{ to: '/dashboard', label: 'Dasbor' }],
        keywords: ['tautan', 'link', 'login', 'masuk', 'bagikan', 'undang', 'kode perusahaan'],
      },
      {
        id: 'mulai-menu-hilang',
        q: 'Kenapa saya tidak bisa membuka menu tertentu?',
        a: 'Akses tiap menu diatur per pengguna. Kalau menu tidak muncul atau ditolak, hak akses akun Anda belum diberikan. Minta **administrator** membukanya lewat Manajemen Pengguna.',
        keywords: ['menu', 'akses', 'izin', 'tidak bisa', 'ditolak', 'hilang', 'permission', 'menu tidak muncul', 'menu hilang', 'muncul'],
      },
    ],
  },
  {
    key: 'aset',
    label: 'Aset',
    icon: 'fa-laptop',
    items: [
      {
        id: 'aset-tambah',
        q: 'Bagaimana cara menambah aset baru?',
        a: 'Buka **Daftar Aset** lalu klik **Tambah Aset**. Yang wajib diisi adalah **Lokasi** dan **Kode Barang/Aset**; sisanya (nama, merek, model, spesifikasi, kondisi, dst.) bisa dilengkapi belakangan lewat **Ubah Aset**.',
        links: [{ to: '/assets/new', label: 'Tambah Aset' }],
        keywords: ['tambah', 'buat', 'input', 'daftar', 'aset baru', 'catat'],
      },
      {
        id: 'aset-kode',
        q: 'Bagaimana kode aset dibuat?',
        a: 'Kode aset disusun **otomatis** oleh sistem dari lokasi + sub lokasi + kode barang + nomor urut, contoh `HO/GA/laptop/0001`. Anda tidak perlu mengetiknya, dan kode tidak ikut berubah saat data aset diubah.',
        keywords: ['kode', 'nomor', 'penomoran', 'otomatis', 'format'],
      },
      {
        id: 'aset-kategori-lokasi-belum-ada',
        q: 'Kategori atau lokasi belum ada di form aset, bagaimana?',
        a: 'Di form aset, klik **+ Buat Baru** di samping isian Lokasi atau Kategori Aset untuk menambahkannya langsung tanpa keluar dari form. Kode Barang/Aset ditambah lewat menu **Kode Barang/Aset**.',
        links: [{ to: '/categories', label: 'Kode Barang/Aset' }, { to: '/asset-types', label: 'Kategori Aset' }],
        keywords: ['kategori', 'lokasi', 'belum ada', 'buat baru', 'tidak muncul', 'dropdown'],
      },
      {
        id: 'aset-impor',
        q: 'Bagaimana cara mengimpor banyak aset sekaligus (CSV)?',
        a: '1. Isi dulu Kode Barang/Aset, Kategori Aset, dan Lokasi di menunya masing-masing.\n2. Di **Daftar Aset** klik **Impor CSV**.\n3. Klik **Unduh Template CSV** (isinya hanya header), isi data mulai baris ke-2, simpan sebagai CSV.\n4. Unggah berkasnya. Kolom wajib: `location` dan `category`. Kode aset dibuat otomatis oleh server.\n\nPanduan lengkap kolom ada di popup Impor CSV.',
        links: [{ to: '/assets', label: 'Daftar Aset' }],
        keywords: ['impor', 'import', 'csv', 'excel', 'unggah', 'upload', 'banyak', 'massal', 'template'],
      },
      {
        id: 'aset-ekspor',
        q: 'Bagaimana cara mengekspor data aset?',
        a: 'Di **Daftar Aset**, gunakan tombol **Ekspor CSV** di bagian atas tabel. Hasilnya mengikuti filter yang sedang aktif, jadi terapkan filter dulu kalau hanya butuh sebagian data.',
        links: [{ to: '/assets', label: 'Daftar Aset' }],
        keywords: ['ekspor', 'export', 'unduh', 'download', 'excel', 'csv'],
      },
      {
        id: 'aset-ubah-hapus',
        q: 'Bagaimana cara mengubah atau menghapus aset?',
        a: 'Buka aset dari **Daftar Aset**, lalu klik **Ubah Aset** atau **Hapus**. Aset yang dihapus masuk ke **Tempat Sampah**, jadi masih bisa dipulihkan.',
        links: [{ to: '/assets', label: 'Daftar Aset' }, { to: '/trash', label: 'Tempat Sampah' }],
        keywords: ['ubah', 'edit', 'hapus', 'delete', 'ganti', 'koreksi'],
      },
      {
        id: 'aset-status',
        q: 'Apa arti status aset?',
        a: '**Idle** — tersedia, belum dipakai.\n**Dipakai** — sedang digunakan/diserahkan ke seseorang.\n**Dipindah** — baru dipindahkan lokasinya.\n**Dijual** — sedang dijual (butuh nilai jual bersih).\n**Terjual** — sudah laku (butuh harga jual).\n**Hilang** dan **Dihapuskan** — sudah tidak ada di perusahaan.\n\nStatus berbeda dengan **kondisi** fisik: Baik, Rusak Ringan, atau Rusak Berat.',
        keywords: ['status', 'idle', 'dipakai', 'dijual', 'terjual', 'dipindah', 'hilang', 'kondisi', 'arti'],
      },
      {
        id: 'aset-pindah',
        q: 'Bagaimana cara memindahkan aset ke lokasi lain?',
        a: 'Di **Daftar Aset**, centang satu atau beberapa aset lalu klik **Pindah Lokasi** pada bilah aksi yang muncul, kemudian tentukan lokasi dan sub lokasi tujuan. Status aset otomatis menjadi **Dipindah**.',
        links: [{ to: '/assets', label: 'Daftar Aset' }],
        keywords: ['pindah', 'pindahkan', 'mutasi', 'lokasi baru', 'transfer'],
      },
      {
        id: 'aset-serah-terima',
        q: 'Bagaimana cara menyerahkan aset ke karyawan (serah terima)?',
        a: 'Buka detail aset lalu klik **Serahkan Aset**, isi penerima dan tanggal serah terima. Saat aset kembali, klik **Terima Kembali**. Berita acara (BAST) serah maupun pengembalian bisa dicetak dari **Riwayat Serah Terima**.',
        keywords: ['serah', 'serah terima', 'bast', 'berita acara', 'pinjam', 'karyawan', 'kembali', 'pengembalian', 'pemegang'],
      },
      {
        id: 'aset-jual',
        q: 'Bagaimana cara menandai aset dijual atau terjual?',
        a: 'Di **Daftar Aset**, centang aset lalu klik **Dijual** (isi nilai jual bersih) atau **Terjual** (isi harga jual, tanggal opsional) pada bilah aksi yang muncul.',
        links: [{ to: '/assets', label: 'Daftar Aset' }],
        keywords: ['jual', 'dijual', 'terjual', 'harga', 'lelang'],
      },
      {
        id: 'aset-bidang-kustom',
        q: 'Bisakah menambah kolom data sendiri pada aset?',
        a: 'Bisa, lewat menu **Bidang Kustom**. Kolom yang Anda buat di sana akan muncul sebagai isian tambahan di form aset, dan tampil di detail aset.',
        links: [{ to: '/custom-fields', label: 'Bidang Kustom' }],
        keywords: ['kolom', 'bidang', 'kustom', 'custom', 'tambahan', 'field'],
      },
    ],
  },
  {
    key: 'qr',
    label: 'Label QR',
    icon: 'fa-qrcode',
    items: [
      {
        id: 'qr-cetak',
        q: 'Bagaimana cara mencetak label QR?',
        a: 'Satu aset: buka detail aset lalu klik **Cetak Label**.\nBanyak aset: buka menu **Cetak Kode Batang**, centang aset-asetnya, lalu cetak. Atur skala printer ke **100%** (ukuran asli) supaya QR terbaca.',
        links: [{ to: '/cetak-barcode-massal', label: 'Cetak Kode Batang' }],
        keywords: ['cetak', 'print', 'label', 'qr', 'barcode', 'kode batang', 'stiker'],
      },
      {
        id: 'qr-scan',
        q: 'Apa yang terjadi kalau QR dipindai?',
        a: 'Orang yang **belum login** melihat kartu info ringkas aset (nama, kode, lokasi, status) — hanya baca. **Petugas yang sudah login** dan punya izin melihat data lengkap serta aksi cepat. Untuk barang habis pakai, petugas bisa langsung mencatat **Stok Masuk/Keluar**.',
        keywords: ['scan', 'pindai', 'memindai', 'qr', 'kamera', 'publik', 'hasil'],
      },
      {
        id: 'qr-ulang',
        q: 'QR rusak atau tidak terbaca, bagaimana?',
        a: 'Di detail aset (atau detail barang habis pakai), pada kartu **Kode QR** klik **Buat Ulang**. Kode baru dibuat, lalu cetak ulang labelnya. Label lama tidak berlaku lagi.',
        keywords: ['rusak', 'tidak terbaca', 'ulang', 'regenerate', 'reset', 'ganti qr'],
      },
    ],
  },
  {
    key: 'stok',
    label: 'Barang Habis Pakai',
    icon: 'fa-boxes-stacked',
    items: [
      {
        id: 'stok-tambah',
        q: 'Bagaimana cara menambah barang habis pakai (ATK, dll.)?',
        a: 'Buka **Barang Habis Pakai** lalu klik **Tambah Barang**. Isi nama, kategori (sama dengan Kategori Aset), lokasi, stok awal, dan **stok minimum**. Satuan otomatis "pcs".',
        links: [{ to: '/consumables', label: 'Barang Habis Pakai' }],
        keywords: ['atk', 'habis pakai', 'consumable', 'tambah', 'barang', 'stok awal', 'perlengkapan'],
      },
      {
        id: 'stok-catat',
        q: 'Bagaimana mencatat stok masuk dan stok keluar?',
        a: 'Buka detail barangnya lalu klik **Stok Masuk**, **Stok Keluar**, atau **Penyesuaian** (untuk koreksi hasil hitung fisik). Cara cepat: pindai QR barangnya saat sudah login, lalu pilih Stok Masuk/Keluar.',
        keywords: ['stok masuk', 'stok keluar', 'penyesuaian', 'kurangi', 'tambah stok', 'ambil', 'pakai'],
      },
      {
        id: 'stok-menipis',
        q: 'Bagaimana tahu stok yang menipis?',
        a: 'Tiap barang punya **stok minimum**. Kalau stok sama dengan atau di bawahnya, barang ditandai menipis, dan muncul di bagian **Perlu Perhatian** pada Dasbor.',
        links: [{ to: '/dashboard', label: 'Dasbor' }],
        keywords: ['menipis', 'habis', 'minimum', 'peringatan', 'notifikasi', 'sisa'],
      },
    ],
  },
  {
    key: 'opname',
    label: 'Stok Opname',
    icon: 'fa-clipboard-check',
    items: [
      {
        id: 'opname-mulai',
        q: 'Apa itu stok opname dan bagaimana memulainya?',
        a: 'Stok opname adalah pemeriksaan fisik aset untuk mencocokkan data dengan kenyataan. Buka **Stok Opname**, klik **Sesi Baru** (beri nama, pilih lokasi, dan opsional sub lokasi atau kode barang), lalu pindai atau ketik kode aset satu per satu. Klik **Selesaikan** di akhir untuk melihat laporan selisih.',
        links: [{ to: '/opname', label: 'Stok Opname' }],
        keywords: ['opname', 'audit', 'cek fisik', 'pemeriksaan', 'selisih', 'inventarisasi', 'sensus'],
      },
    ],
  },
  {
    key: 'permintaan',
    label: 'Permintaan Aset',
    icon: 'fa-hand-point-right',
    items: [
      {
        id: 'minta-ajukan',
        q: 'Bagaimana karyawan mengajukan permintaan aset?',
        a: 'Karyawan tidak perlu punya akun. Di menu **Permintaan Aset**, klik **Salin Tautan Publik**, lalu bagikan ke karyawan. Mereka mengisi formulir di halaman itu, dan nomor permintaan dibuat otomatis.',
        links: [{ to: '/requests', label: 'Permintaan Aset' }],
        keywords: ['permintaan', 'ajukan', 'request', 'minta', 'formulir', 'karyawan', 'pengajuan'],
      },
      {
        id: 'minta-tinjau',
        q: 'Bagaimana meninjau permintaan aset?',
        a: 'Buka **Permintaan Aset**, klik permintaannya, lalu klik **Setujui** atau **Tolak**. Permintaan yang disetujui diselesaikan dengan **Penuhi Permintaan** setelah asetnya diberikan. Alurnya: diajukan → disetujui/ditolak → dipenuhi.',
        links: [{ to: '/requests', label: 'Permintaan Aset' }],
        keywords: ['tinjau', 'setujui', 'tolak', 'approve', 'reject', 'dipenuhi', 'review'],
      },
    ],
  },
  {
    key: 'akun',
    label: 'Akun & Pengguna',
    icon: 'fa-user-shield',
    items: [
      {
        id: 'akun-tambah',
        q: 'Bagaimana menambah pengguna dan mengatur hak aksesnya?',
        a: 'Buka **Manajemen Pengguna** lalu tambah pengguna. Kata sandi sementara dikirim ke surelnya. Hak akses diatur **per menu** (lihat, tambah, ubah, hapus) lewat matriks izin, jadi tiap orang hanya melihat menu yang diizinkan.',
        links: [{ to: '/users', label: 'Manajemen Pengguna' }],
        keywords: ['pengguna', 'user', 'akun', 'tambah', 'hak akses', 'izin', 'role', 'peran', 'staf'],
      },
      {
        id: 'akun-lupa',
        q: 'Saya lupa kata sandi, bagaimana?',
        a: 'Di halaman masuk klik **Lupa kata sandi?**, masukkan nama pengguna atau surel, lalu masukkan kode OTP yang dikirim ke surel Anda dan buat kata sandi baru.',
        keywords: ['lupa', 'kata sandi', 'password', 'reset', 'otp', 'tidak bisa masuk'],
      },
      {
        id: 'akun-profil',
        q: 'Bagaimana mengganti kata sandi, nama, atau surel saya?',
        a: 'Buka halaman **Profil**. Nama dan kata sandi diubah langsung (ganti kata sandi butuh kata sandi saat ini). Surel diganti dengan kode OTP yang dikirim ke alamat baru. Akun yang mendaftar lewat Google bisa **membuat kata sandi** di sini tanpa kata sandi lama.',
        links: [{ to: '/profile', label: 'Profil' }],
        keywords: ['profil', 'ganti', 'password', 'kata sandi', 'nama', 'email', 'surel', 'google'],
      },
    ],
  },
  {
    key: 'laporan',
    label: 'Laporan & Riwayat',
    icon: 'fa-chart-line',
    items: [
      {
        id: 'laporan-penyusutan',
        q: 'Di mana laporan penyusutan aset?',
        a: 'Buka menu **Laporan**. Nilai buku dan penyusutan tiap aset dihitung otomatis, dan bisa dilihat per periode dan per departemen.',
        links: [{ to: '/reports/depreciation', label: 'Laporan Penyusutan' }],
        keywords: ['laporan', 'penyusutan', 'depresiasi', 'nilai buku', 'akuntansi', 'keuangan'],
      },
      {
        id: 'laporan-riwayat',
        q: 'Bagaimana melihat siapa yang mengubah data?',
        a: 'Buka **Riwayat Aktivitas**. Semua perubahan data (siapa, kapan, apa) tercatat di sana. Riwayat ini hanya bisa dilihat, tidak bisa diubah.',
        links: [{ to: '/audit-logs', label: 'Riwayat Aktivitas' }],
        keywords: ['riwayat', 'aktivitas', 'audit', 'log', 'siapa', 'histori', 'jejak'],
      },
      {
        id: 'laporan-sampah',
        q: 'Bagaimana memulihkan aset yang terhapus?',
        a: 'Buka **Tempat Sampah**, lalu **pulihkan** asetnya. Untuk benar-benar membuangnya, pilih **hapus permanen** — perlu dilakukan kalau ingin menghapus Kode Barang atau Lokasi yang masih dipakai aset terhapus tersebut.',
        links: [{ to: '/trash', label: 'Tempat Sampah' }],
        keywords: ['sampah', 'pulihkan', 'restore', 'terhapus', 'kembalikan', 'hapus permanen'],
      },
    ],
  },
  {
    key: 'pengaturan',
    label: 'Pengaturan & Langganan',
    icon: 'fa-sliders',
    items: [
      {
        id: 'set-logo',
        q: 'Bagaimana mengganti logo dan nama perusahaan?',
        a: 'Buka **Pengaturan**. Ada tiga logo: **Ikon** (persegi, untuk sidebar dan tab peramban), **Logo Penuh Latar Terang** (halaman pindai QR), dan **Logo Penuh Latar Gelap** (halaman masuk). Format PNG/JPG/WEBP, maksimal 1 MB.',
        links: [{ to: '/settings', label: 'Pengaturan' }],
        keywords: ['logo', 'nama perusahaan', 'brand', 'merek', 'identitas', 'tampilan', 'ikon'],
      },
      {
        id: 'set-paket',
        q: 'Bagaimana melihat paket dan mengajukan upgrade langganan?',
        a: 'Buka **Langganan** untuk melihat paket saat ini beserta pemakaian (jumlah aset, pengguna, lokasi). Klik upgrade untuk mengajukan paket yang lebih tinggi; pembayaran diverifikasi manual lewat transfer bank oleh tim kami, lalu paket diaktifkan.',
        links: [{ to: '/billing', label: 'Langganan' }],
        keywords: ['paket', 'langganan', 'upgrade', 'harga', 'bayar', 'invoice', 'billing', 'limit', 'batas'],
      },
      {
        id: 'set-limit',
        q: 'Muncul pesan batas paket tercapai, bagaimana?',
        a: 'Tiap paket punya batas jumlah aset, pengguna, dan lokasi. Kalau batas tercapai, penambahan data baru ditolak sampai Anda **upgrade paket** di menu Langganan. Data yang sudah ada tidak hilang.',
        links: [{ to: '/billing', label: 'Langganan' }],
        keywords: ['batas', 'limit', 'penuh', 'tercapai', 'kuota', 'tidak bisa tambah'],
      },
    ],
  },
];

export const ALL_FAQ_ITEMS = FAQ_CATEGORIES.flatMap((c) => c.items.map((item) => ({ ...item, category: c.key })));

const STOPWORDS = new Set([
  'yang', 'dan', 'atau', 'di', 'ke', 'dari', 'untuk', 'dengan', 'apa', 'bagaimana', 'gimana', 'cara',
  'kenapa', 'mengapa', 'bisa', 'apakah', 'saya', 'aku', 'kami', 'itu', 'ini', 'ada', 'tidak', 'nggak',
  'gak', 'tolong', 'mau', 'ingin', 'lah', 'dong', 'sih', 'kah', 'dalam', 'pada', 'akan', 'sudah',
]);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

const N_ITEMS = ALL_FAQ_ITEMS.length;

/* Kata utuh per entri: dari pertanyaan (`q`) dan dari kata kunci. Disiapkan
   sekali di sini, bukan tiap pencarian. */
const INDEX = ALL_FAQ_ITEMS.map((item) => ({
  item,
  qWords: new Set(tokenize(item.q)),
  keyWords: new Set(tokenize((item.keywords || []).join(' '))),
  text: `${item.q} ${(item.keywords || []).join(' ')}`.toLowerCase(),
}));

/* Kata yang muncul di banyak entri (mis. "aset", "stok") kurang membedakan,
   jadi bobotnya lebih kecil daripada kata langka (mis. "atk", "opname"). */
const DOC_FREQ = new Map();
for (const e of INDEX) {
  for (const w of new Set([...e.qWords, ...e.keyWords])) DOC_FREQ.set(w, (DOC_FREQ.get(w) || 0) + 1);
}
const weightOf = (t) => Math.log(1 + N_ITEMS / (DOC_FREQ.get(t) || 1));

/**
 * Cari jawaban untuk pertanyaan yang diketik bebas. Tiap kata pengguna yang
 * cocok utuh dengan kata di pertanyaan/kata kunci entri dihargai 3x bobot
 * katanya; cocok sebagian (mis. "jual" di dalam "dijual") 1x. Frasa kata kunci
 * yang persis tercantum menambah skor.
 * Mengembalikan { best, related } — `best` null kalau tidak ada yang cocok.
 */
export function searchFaq(query) {
  const tokens = tokenize(query);
  const lowered = String(query || '').toLowerCase();
  if (tokens.length === 0) return { best: null, related: [] };

  const scored = INDEX.map((e) => {
    let score = 0;
    for (const t of tokens) {
      if (e.qWords.has(t) || e.keyWords.has(t)) score += 3 * weightOf(t);
      else if (e.text.includes(t)) score += weightOf(t);
    }
    for (const k of e.item.keywords || []) if (k.includes(' ') && lowered.includes(k)) score += 6;
    return { item: e.item, score };
  })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score);

  if (scored.length === 0) return { best: null, related: [] };
  return { best: scored[0].item, related: scored.slice(1, 3).map((x) => x.item) };
}
