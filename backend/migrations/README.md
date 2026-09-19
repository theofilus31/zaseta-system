# Migrations (histori)

Semua perubahan di file-file `migration_*.sql` di folder ini **sudah digabung ke dalam
`backend/schema.sql`**. Untuk instalasi baru, cukup jalankan `schema.sql` — tidak perlu
menjalankan file-file di folder ini satu per satu.

File-file ini disimpan hanya sebagai referensi/histori, dan untuk database **lama** yang
sudah berjalan sebelum suatu fitur ditambahkan (misalnya sebelum modul Lokasi ada). Kalau
database kamu sudah lama berjalan dan belum pernah menjalankan migration tertentu, jalankan
migration yang relevan sesuai urutan tanggal di bawah:

| Urutan | File | Keterangan |
|---|---|---|
| 1 | `migration_add_asset_type_and_condition.sql` | Tambah tabel `asset_types` & kolom kondisi aset |
| 2 | `migration_add_asset_sequence.sql` | Tambah nomor urut global untuk kode aset |
| 3 | `migration_add_locations.sql` | Tambah modul Lokasi & Sub Lokasi |
| 4 | `migration_add_asset_spec_detail.sql` | Tambah kolom spesifikasi detail aset |
| 5 | `migration_add_asset_sold_info.sql` | Tambah info tanggal & harga jual |
| 6 | `migration_add_asset_status_dipindah.sql` | Tambah status "dipindah" |
| 7 | `migration_status_revamp_v2.sql` | Revamp status jadi 5 status baru + `sale_value_net` + lokasi asal |
| 8 | `migration_release_deleted_sequence_no.sql` | Perbaikan pembebasan nomor urut aset yang dihapus |
| 9 | `migration_add_username.sql` | Tambah kolom `username` di tabel `users` |
| 10 | `migration_add_email_change_otp.sql` | Tambah tabel `email_change_otps` untuk fitur ganti email mandiri via OTP |
| 11 | `migration_cleanup_unused_schema.sql` | Hapus tabel & kolom yang tidak pernah dipakai kode aplikasi: `asset_assignments`, `permissions`, `role_permissions`, dan kolom `assets.location` (deprecated) |
| 12 | `migration_add_user_permissions.sql` | Tambah tabel `user_permissions` — hak akses per pengguna per menu, menggantikan peran bertingkat |
| 13 | `migration_add_assignment_and_lifecycle.sql` | Bangkitkan `asset_assignments` (serah terima) + kolom garansi & penyusutan |
| 14 | `migration_add_audit_export_action.sql` | Tambah aksi `export` pada ENUM `audit_logs.action` |
| 15 | `migration_add_app_settings.sql` | Tambah tabel `app_settings` — nama aplikasi, nama perusahaan, dan logo |
| 16 | `migration_add_lifecycle_and_departments.sql` | Tambah tabel `departments`, status `hilang`/`dihapuskan`, dan kolom penghapusan aset |
| 17 | `migration_add_stock_opname.sql` | Tambah tabel `stock_opnames` & `stock_opname_items` — pemeriksaan fisik aset dan laporan selisihnya |
| 18 | `migration_add_asset_attachments_and_bast.sql` | Tambah tabel `asset_attachments` (lampiran berkas) + kolom nomor Berita Acara Serah Terima pada `asset_assignments` |
| 19 | `migration_add_reminders_maintenance.sql` | Tambah tabel `asset_reminders` (pengingat bertanggal, bisa berulang) & `asset_maintenances` (jadwal/riwayat servis) |
| 20 | `migration_add_consumables.sql` | Tambah tabel `consumables` & `consumable_transactions` — stok barang habis pakai (ATK, kebersihan, dst.) |
| 21 | `migration_add_asset_requests.sql` | Tambah tabel `asset_requests` — pengajuan, tinjauan, dan pemenuhan permintaan aset karyawan |
| 22 | `migration_add_token_version.sql` | Tambah kolom `token_version` di users — mencabut token JWT lama seketika saat kata sandi diganti |
| 23 | `migration_add_password_is_set.sql` | Tambah kolom `password_is_set` di users — akun daftar via Google boleh membuat kata sandi di Profil tanpa kata sandi lama |
| — | `migration_purge_test_data.sql` | **Opsional & destruktif** — bersih-bersih data uji coba spesifik (bukan bagian dari urutan wajib, baca catatan di dalam filenya sebelum dijalankan) |
