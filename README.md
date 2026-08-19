# Asset Inventory System

Fullstack: **React (Vite) + Node.js/Express + MySQL**, dengan JWT auth, izin
per-menu, custom field dinamis (EAV), dan QR code generator.

Aplikasi ini **tidak terikat ke satu perusahaan**. Nama aplikasi, nama
perusahaan, dan logo diatur dari dalam aplikasi (menu **Pengaturan**), bukan
dengan menyunting kode — lihat bagian [Merek Aplikasi](#merek-aplikasi).

## Struktur Project

```
it-asset-inventory/
├── backend/
│   ├── schema.sql          # DDL seluruh tabel
│   ├── seed.sql            # Data awal: roles, kategori contoh, akun admin
│   ├── .env.example
│   └── src/
│       ├── config/db.js            # koneksi MySQL pool
│       ├── middleware/
│       │   ├── auth.js             # JWT verify + requireRole (RBAC)
│       │   └── errorHandler.js
│       ├── controllers/
│       │   ├── authController.js
│       │   ├── categoryController.js
│       │   ├── customFieldController.js
│       │   ├── assetController.js
│       │   ├── qrController.js
│       │   ├── publicController.js  # endpoint scan publik, tanpa auth
│       │   └── dashboardController.js
│       ├── routes/*.js
│       ├── utils/
│       │   ├── qrGenerator.js       # generate QR via package 'qrcode'
│       │   └── auditLogger.js       # tulis ke tabel audit_logs
│       ├── app.js
│       └── server.js
└── frontend/
    ├── .env.example
    ├── tailwind.config.js           # token desain: warna, bayangan, animasi
    └── src/
        ├── index.css                # base + kelas bersama (.field, .table-base, dst.)
        ├── api/axiosClient.js       # axios + interceptor JWT
        ├── context/
        │   ├── AuthContext.jsx      # state login + helper hasRole()
        │   └── NotificationContext.jsx  # toast & riwayat notifikasi
        ├── components/
        │   ├── Layout.jsx           # kerangka: sidebar + topbar + tab bawah
        │   ├── ProtectedRoute.jsx
        │   ├── layout/              # Sidebar, Topbar, BottomTabBar, ErrorToast
        │   ├── assets/              # tabel, kartu, filter, modal khusus aset
        │   └── ui/                  # design system (lihat bagian di bawah)
        └── pages/
            ├── Login.jsx
            ├── Dashboard.jsx
            ├── AssetList.jsx        # search, filter, pagination
            ├── AssetDetail.jsx
            ├── AssetForm.jsx        # tambah/edit + custom field dinamis
            ├── CategoryManagement.jsx
            ├── CustomFieldManagement.jsx
            ├── QRPrintPage.jsx
            └── PublicScanPage.jsx   # halaman publik saat client scan QR
```

## Design System (Frontend)

Seluruh tampilan mengambil gaya dari satu sumber. **Jangan menulis ulang deretan
class Tailwind untuk input, tabel, atau kartu di halaman baru** — pakai komponen
di `src/components/ui/`, supaya UI tetap terasa satu sistem.

### Warna

Palet diturunkan dari logo RMS dan didefinisikan di `tailwind.config.js`:

| Token     | Warna                | Dipakai untuk                                        |
|-----------|----------------------|------------------------------------------------------|
| `brand`   | Hijau `#47b648`      | Aksi utama, menu aktif, status *Menganggur*          |
| `info`    | Biru `#338ccb`       | Informasi netral, status *Dipakai*                   |
| `warning` | Kuning `#fca91c`     | Perlu perhatian, status *Dijual*, kondisi Rusak Ringan |
| `danger`  | Merah                | Aksi destruktif, kondisi Rusak Berat                 |
| `accent`  | Ungu                 | Status *Dipindahkan*                                 |
| `ink`     | Skala netral (slate) | **Semua** teks, garis, dan permukaan abu-abu         |

> Gunakan `ink-*`, bukan `gray-*`/`slate-*` bawaan Tailwind, agar netralnya seragam.

### Komponen `src/components/ui/`

| Berkas            | Isi                                                                    |
|-------------------|------------------------------------------------------------------------|
| `Button.jsx`      | `Button` (primary/secondary/subtle/ghost/destructive + `loading`), `SegmentedControl` |
| `Card.jsx`        | `Card`, `CardHeader`, `CardBody`, `CardFooter`                          |
| `Form.jsx`        | `TextField`, `SelectField`, `TextareaField`, `SearchInput`, `Checkbox`, `FormError` |
| `PasswordInput.jsx` | Input sandi dengan tombol lihat/sembunyikan                           |
| `Modal.jsx`       | Kerangka dialog (Esc untuk tutup, klik latar, kunci scroll)             |
| `PageHeader.jsx`  | `PageHeader` (judul + aksi), `MasterDataLayout` (form kiri, tabel kanan) |
| `Pagination.jsx`  | Navigasi halaman dengan elipsis                                         |
| `StatusBadge.jsx` | `StatusBadge`, `ConditionBadge`, `Badge`, dan `STATUS_CONFIG`            |
| `StatCard.jsx`    | Kartu KPI dasbor (bisa diklik menuju daftar terfilter)                   |
| `EmptyState.jsx`  | Keadaan kosong                                                          |
| `Skeleton.jsx`    | `Skeleton`, `SkeletonRows`, `SkeletonCards`, `SkeletonList`              |

`STATUS_CONFIG` di `StatusBadge.jsx` adalah **satu-satunya** tempat warna & label
status didefinisikan — donut di Dasbor, lencana di tabel, dan garis waktu di
halaman detail semuanya membacanya dari sana.

### Kelas bersama di `index.css`

`.field` / `.field-select` / `.field-sunken` (kontrol form), `.label`, `.hint`,
`.table-base` (+ baris `.is-selected`), `.progress-track` / `.progress-fill`,
`.scrollbar-slim`, `.dot-grid`, dan `.print-hide`.

Aplikasi ini **hanya memakai mode terang**. Tidak ada `darkMode` di konfigurasi
Tailwind, jadi jangan menambahkan varian `dark:` yang tidak akan pernah aktif.

## Cara Menjalankan

### 1. Database
```bash
mysql -u root -p -e "CREATE DATABASE it_asset_inventory"
mysql -u root -p it_asset_inventory < backend/schema.sql
mysql -u root -p it_asset_inventory < backend/seed.sql
```
> **Penting**: `seed.sql` berisi placeholder hash password. Generate hash asli sebelum insert:
> ```bash
> node -e "console.log(require('bcryptjs').hashSync('password_anda', 10))"
> ```
> Lalu ganti nilai `password_hash` pada `seed.sql` sebelum dijalankan, atau update langsung via SQL setelah insert.

### 2. Backend
```bash
cd backend
cp .env.example .env    # sesuaikan kredensial MySQL & JWT_SECRET
npm install
npm run dev             # jalan di http://localhost:4000
```

### 3. Frontend
```bash
cd frontend
cp .env.example .env    # sesuaikan VITE_API_URL jika perlu
npm install
npm run dev             # jalan di http://localhost:5173
```

## Merek Aplikasi

Menu **Pengaturan** (`/settings`) mengatur identitas yang tampil di seluruh
aplikasi. Tidak ada nama perusahaan atau berkas logo yang tertulis di dalam kode.

| Yang diatur | Tampil di |
|---|---|
| Nama Aplikasi | Sidebar, halaman Masuk, judul tab peramban |
| Nama Perusahaan | Bawah nama aplikasi, kaki halaman Masuk, kaki halaman Pindai QR publik |
| Kalimat Pengantar | Panel kiri halaman Masuk |
| Logo **Ikon** (persegi) | Sidebar, bilah atas, favicon |
| Logo **Terang** (penuh) | Halaman Masuk versi ponsel, halaman Pindai QR |
| Logo **Gelap** (penuh) | Panel gelap halaman Masuk |

Catatan penerapan:

- Logo disimpan sebagai **data URL base64** di tabel `app_settings` — pola yang
  sama dengan `qr_codes.image_path`. Tidak perlu direktori unggahan, tidak ada
  masalah hak akses berkas, dan cadangan database ikut membawa logonya.
- Logo **tidak** ikut di respons `/api/settings`; ada endpoint gambar tersendiri
  (`/api/public/branding/logo/:variant`) dengan `Cache-Control` panjang. URL-nya
  membawa `?v=<logo_version>` yang naik setiap logo diganti, jadi cache peramban
  tersegarkan tanpa mengorbankan performa.
- Endpoint merek bersifat **publik** karena halaman Masuk dan halaman Pindai QR
  menampilkannya sebelum ada sesi. Isinya memang tidak rahasia.
- Varian logo yang dikosongkan otomatis diganti kotak berisi huruf awal nama
  perusahaan, jadi instalasi baru tetap terlihat utuh tanpa mengunggah apa pun.

Butuh `migrations/migration_add_app_settings.sql`.

## Hak Akses (Izin per-Menu)

Akses **tidak lagi ditentukan nama peran**. Saat membuat/mengubah pengguna, admin
memilih menu mana yang boleh dibuka, lalu untuk tiap menu memilih aksi yang
diizinkan: **Lihat / Tambah / Ubah / Hapus**.

| Konsep | Keterangan |
|---|---|
| Modul (menu) | Didefinisikan di `backend/src/config/modules.js`, dicerminkan di `frontend/src/constants/modules.js`. Keduanya wajib tetap sinkron. |
| Penyimpanan | Tabel `user_permissions` — satu baris per pengguna per modul. |
| Penegakan | `middleware/auth.js` → `requirePermission(modul, aksi)` di setiap endpoint. |
| Administrator | Satu-satunya pembedaan yang tersisa: akses penuh, tidak dibatasi matriks. Dipilih lewat sakelar di form pengguna. |
| Akses publik | Scan QR → halaman detail aset tanpa login (`/scan/:code`). |

Beberapa aturan yang sengaja dibuat demikian:

- **Peran bertingkat (Staf IT / Peninjau) sudah dihapus** dari antarmuka dan API.
  Endpoint `/api/roles` ikut dihapus. Tabel `roles` masih ada hanya untuk mengisi
  kolom `users.role_id` yang NOT NULL dan menandai administrator.
- **Akun administrator selalu berakses penuh**, tidak dibatasi matriks. Kalau akses
  administrator ikut bergantung pada centang, satu kesalahan bisa mengunci semua
  orang keluar dari menu Manajemen Pengguna tanpa cara memperbaikinya dari dalam
  aplikasi.
- **Mencentang aksi apa pun otomatis menyalakan Lihat** — tidak masuk akal boleh
  mengubah data di menu yang tidak boleh dibuka. Ditegakkan di UI dan di backend.
- **Izin dibaca ulang dari database setiap permintaan**, bukan dibekukan di dalam
  JWT. Pencabutan akses langsung berlaku tanpa menunggu pengguna login ulang.
- **Daftar master data boleh dibaca pemegang izin lihat aset** lewat
  `requireAnyPermission`. Tanpa ini, pengguna yang boleh menambah aset tapi tidak
  diberi menu Lokasi akan menemui dropdown kosong dan formnya buntu.

Pembatasan di frontend (menu & tombol yang disembunyikan) murni demi kenyamanan.
Otorisasi sesungguhnya selalu dicek ulang di backend, jadi melewati UI lewat
devtools tidak memberi akses apa pun.

Butuh `migrations/migration_add_user_permissions.sql`. Migrasi itu sekaligus
mengisikan izin pengguna lama sesuai peran yang sedang dipegang, jadi tidak ada
yang tiba-tiba kehilangan akses.

## Alur Custom Field (EAV)

1. Admin buat field baru di halaman **Custom Field Management** — bisa global (semua kategori) atau spesifik kategori (`asset_custom_fields`).
2. Saat staff mengisi form aset, field yang relevan otomatis muncul sesuai kategori yang dipilih.
3. Nilai disimpan di `asset_custom_field_values`, terhubung ke aset via `asset_id` + `custom_field_id`.
4. Tidak perlu `ALTER TABLE` setiap kali ada field baru — sepenuhnya dinamis dari database.

## Alur QR Code

1. QR digenerate otomatis (`utils/qrGenerator.js`) saat aset baru dibuat — token unik (UUID) disisipkan ke URL `FRONTEND_URL/scan/:code`.
2. Staff bisa cetak dari halaman **Cetak QR** (`/assets/:id/qr`).
3. Saat di-scan, browser membuka `PublicScanPage.jsx` (tanpa login) yang memanggil `/api/public/scan/:code` — endpoint ini **tidak melewati middleware auth**.
4. Setiap scan tercatat di `qr_codes.scan_count` dan `audit_logs` (dengan `user_id = NULL` karena aksi anonim).

## Riwayat Aktivitas (Audit Log)

Menu **Riwayat Aktivitas** (`/audit-logs`, khusus admin) membaca tabel `audit_logs`
yang sejak awal sudah diisi oleh seluruh controller:

- Saring menurut aksi, jenis data, pengguna, dan rentang tanggal
- Cari berdasarkan nama pelaku atau nomor entitas
- Setiap baris bisa dibuka untuk melihat perbandingan **sebelum → sesudah**
  dari `old_values`/`new_values`
- Pemindaian QR anonim tampil sebagai "Anonim / publik" (`user_id` memang `NULL`)

Endpoint: `GET /api/audit-logs` dan `GET /api/audit-logs/filters`.

## Ekspor Aset

Tombol **Ekspor CSV** di Daftar Aset mengunduh **seluruh baris yang cocok dengan
filter aktif** — bukan hanya halaman yang sedang dibuka. Backend memakai
penyusun filter yang sama persis dengan endpoint daftar (`buildAssetFilter`),
jadi isi berkas selalu sama dengan yang terlihat di layar.

Endpoint: `GET /api/assets/export` (menerima query filter yang sama dengan `GET /api/assets`).
Aksi ini tercatat di audit log sebagai `export` — perlu menjalankan
`migrations/migration_add_audit_export_action.sql` pada database yang sudah berjalan.

## Penugasan Aset (Custody)

Menjawab "aset ini sedang dipegang siapa?" — kemampuan inti ITAM yang sebelumnya
tidak ada. Tabel `asset_assignments` pernah dirancang lalu dibuang; kini
dibangkitkan kembali beserta endpoint dan UI-nya.

- **Serahkan (check-out)** dari halaman detail aset → status otomatis jadi *Dipakai*
- **Terima kembali (check-in)** → status kembali *Menganggur*, dan kondisi fisik
  boleh dikoreksi saat barangnya diperiksa
- Satu aset hanya boleh punya satu penugasan aktif (ditegakkan di controller —
  `UNIQUE` tidak bisa dipakai karena MySQL menganggap tiap `NULL` berbeda)
- Riwayat serah terima tersimpan permanen dan tampil di halaman detail
- Pemegang dicatat sebagai **teks**, bukan relasi ke `users` — tabel itu hanya
  berisi akun aplikasi, sedangkan penerima aset umumnya karyawan tanpa akun

Endpoint: `GET/POST /api/assignments`, `PUT /api/assignments/:id/return`,
`GET /api/assignments/holders`.

## Garansi & Penyusutan

- `warranty_expiry` — aset yang garansinya mendekati habis muncul di Dasbor
  (ambang: sudah habis / ≤30 hari / 31–90 hari)
- `useful_life_months` + `salvage_value` — dasar **penyusutan garis lurus**.
  Nilai buku dihitung di `backend/src/utils/depreciation.js`, ikut tampil di
  halaman detail, kolom ekspor CSV, dan KPI Dasbor.
- Aset tanpa data pendukung sengaja **tidak** ditaksir — lebih baik menampilkan
  "belum dihitung" daripada angka yang menyesatkan bagian keuangan.

Keduanya butuh `migrations/migration_add_assignment_and_lifecycle.sql`.

## Siklus Hidup Aset & Departemen

**Status aset** kini mencakup seluruh cara aset keluar dari inventaris:

| Status | Arti |
|---|---|
| Menganggur / Dipakai | Masih dimiliki dan beroperasi |
| Dipindahkan | Sedang transisi antar lokasi |
| Dijual | Ditawarkan, masih dimiliki |
| Terjual | Sudah laku |
| **Hilang** | Raib/dicuri, masih dicari pertanggungjawabannya |
| **Dihapuskan** | Resmi dikeluarkan (musnah, afkir, hibah) |

*Hilang* dan *Dihapuskan* **wajib disertai alasan**, dan menyediakan kolom tanggal
serta nomor berita acara. Tanpa keduanya, aset bisa lenyap dari daftar aktif tanpa
ada yang bisa dimintai keterangan — itulah sebabnya validasinya ditegakkan di
backend, bukan hanya di form.

Ketiga status "keluar" (Terjual, Hilang, Dihapuskan) dikecualikan dari nilai
perolehan, nilai buku, dan peringatan garansi di Dasbor, serta tidak bisa
diserahkan ke siapa pun.

**Departemen** (`/departments`) adalah divisi pemilik aset. Berbeda dari
`asset_assignments.department` yang berupa teks bebas dan hanya berlaku selama
aset dipegang seseorang, `assets.department_id` menempel pada asetnya sendiri —
sehingga AC ruang rapat atau meja kosong tetap punya penanggung jawab dan bisa
masuk rekap per divisi.

Butuh `migrations/migration_add_lifecycle_and_departments.sql`. Migrasi itu
sekaligus memindahkan nama departemen yang sudah terlanjur diketik di data
custody menjadi baris master, jadi tidak ada yang perlu diketik ulang.

## Yang Perlu Dikembangkan Selanjutnya (di luar MVP)

- **Log pemeliharaan/perbaikan** dengan biaya per tindakan — saat ini kerusakan
  hanya tercatat sebagai `condition_status`, tanpa jejak apa yang sudah dikerjakan
- **Lampiran berkas** (foto aset, faktur, kartu garansi) — belum ada penyimpanan berkas
- **Stok opname terjadwal** — siklus verifikasi fisik dengan laporan selisih
- **Notifikasi terjadwal** (surel garansi akan habis, opname jatuh tempo) —
  saat ini peringatan hanya muncul kalau Dasbor dibuka
- **Manajemen lisensi software** (jumlah seat, tanggal perpanjangan)
- **Pemulihan dari tempat sampah** — soft delete sudah ada, UI restore belum
- Refresh token / rotasi JWT untuk sesi lebih aman
- Validasi input lebih ketat di backend (saat ini validasi minimal)
- Rate limiting untuk endpoint publik `/api/public/scan/:code` agar tidak disalahgunakan
- "Lupa password" / reset password mandiri oleh user (saat ini hanya admin yang bisa reset via Manajemen User)
- Endpoint aksi massal sesungguhnya (`PUT /api/assets/bulk`) — saat ini frontend
  mengirim satu permintaan per aset, dibatasi 5 permintaan bersamaan lewat
  `runInBatches` di `AssetList.jsx`. Cukup untuk ratusan aset, tapi satu endpoint
  transaksional akan lebih cepat dan lebih aman untuk ribuan baris.

## Modul Lokasi & Sub Lokasi

- **Lokasi** dan **Sub Lokasi** dikelola di menu **Lokasi** (khusus admin) — masing-masing punya kode unik (mis. Lokasi `HO`, Sub Lokasi `LT2` di bawah `HO`)
- Saat menambah/edit aset, field Lokasi berupa dropdown; Sub Lokasi otomatis terisi pilihannya begitu Lokasi dipilih (dan ter-reset kalau Lokasi diganti)
- Kolom `location` (teks bebas) yang lama **tetap ada** di database untuk data aset lama yang dibuat sebelum modul ini ada — tampilan otomatis fallback ke teks lama itu kalau `location_id` kosong
- Kalau database Anda **sudah berjalan dengan data sebelumnya**, jalankan `backend/migrations/migration_add_locations.sql` (bukan `schema.sql` dari awal) supaya data lama tidak hilang:
  ```bash
  mysql -u <user> -p it_asset_inventory < backend/migrations/migration_add_locations.sql
  ```
