# Migrations (histori)

Semua perubahan di file-file `migration_*.sql` di folder ini **sudah digabung ke dalam
`backend/schema.postgres.sql`** (sumber kebenaran skema saat ini — BUKAN `schema.sql`,
berkas MySQL/MariaDB lama yang sudah diarsipkan, lihat catatan di kepala berkas itu
sendiri). Untuk instalasi baru, cukup jalankan `schema.postgres.sql` — tidak perlu
menjalankan file-file di folder ini satu per satu.

File-file ini disimpan hanya sebagai referensi/histori, dan untuk database **lama** yang
sudah berjalan sebelum suatu fitur ditambahkan (misalnya sebelum modul Lokasi ada). Kalau
database kamu sudah lama berjalan dan belum pernah menjalankan migration tertentu, jalankan
migration yang relevan sesuai urutan kronologis di bawah (diurutkan dari cap waktu berkas
sungguhan, bukan cuma tebakan — perhatikan terutama migration_saas_multitenancy_phase1.sql:
banyak migration SESUDAHNYA di daftar ini mengasumsikan tenant_id sudah ada di mana-mana).

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
| 12 | `migration_add_audit_export_action.sql` | Tambah aksi `export` pada ENUM `audit_logs.action` |
| 13 | `migration_add_assignment_and_lifecycle.sql` | Bangkitkan `asset_assignments` (serah terima) + kolom garansi & penyusutan |
| 14 | `migration_add_app_settings.sql` | Tambah tabel `app_settings` — nama aplikasi, nama perusahaan, dan logo |
| 15 | `migration_add_lifecycle_and_departments.sql` | Tambah tabel `departments`, status `hilang`/`dihapuskan`, dan kolom penghapusan aset |
| 16 | `migration_add_user_permissions.sql` | Tambah tabel `user_permissions` — hak akses per pengguna per menu, menggantikan peran bertingkat |
| 17 | `migration_add_stock_opname.sql` | Tambah tabel `stock_opnames` & `stock_opname_items` — pemeriksaan fisik aset dan laporan selisihnya |
| 18 | `migration_add_asset_attachments_and_bast.sql` | Tambah tabel `asset_attachments` (lampiran berkas) + kolom nomor Berita Acara Serah Terima pada `asset_assignments` |
| 19 | `migration_add_reminders_maintenance.sql` | Tambah tabel `asset_reminders` (pengingat bertanggal, bisa berulang) & `asset_maintenances` (jadwal/riwayat servis) |
| 20 | `migration_add_consumables.sql` | Tambah tabel `consumables` & `consumable_transactions` — stok barang habis pakai (ATK, kebersihan, dst.) |
| 21 | `migration_add_asset_requests.sql` | Tambah tabel `asset_requests` — pengajuan, tinjauan, dan pemenuhan permintaan aset karyawan |
| 22 | `migration_add_token_version.sql` | Tambah kolom `token_version` di users — mencabut token JWT lama seketika saat kata sandi diganti |
| 23 | `migration_add_zecode_chat.sql` | Tambah tabel riwayat obrolan Zecode — asisten AI internal via Ollama lokal (fitur ini kemudian diganti chatbot panduan statis, lihat #36) |
| 24 | `migration_add_password_reset_otp.sql` | Tambah tabel `password_reset_otps` untuk fitur "Lupa Kata Sandi" |
| 25 | `migration_saas_multitenancy_phase1.sql` | **Fase 1 SaaS** — fondasi multi-tenant: tabel `tenants` + kolom `tenant_id` di semua tabel yang datanya milik satu perusahaan, constraint unik jadi per-tenant (bukan global lagi) |
| 26 | `migration_billing_phase4.sql` | **Fase 4 SaaS** — billing awal: limit paket & permintaan upgrade manual (diverifikasi admin platform, belum ada payment gateway) |
| 27 | `migration_billing_phase4_previous_plan.sql` | Perbaikan atas #26 — simpan snapshot paket SEBELUM permintaan upgrade, supaya riwayat tidak salah tampil "upgrade dari paket sendiri ke paket sendiri" setelah disetujui |
| 28 | `migration_add_google_oauth.sql` | Tambah kolom `users.google_id` untuk "Masuk/Daftar dengan Google" |
| 29 | `migration_billing_yearly_cycle.sql` | Tambah siklus tagihan tahunan (10x harga bulanan, konvensi "2 bulan gratis") sebagai alternatif siklus bulanan |
| 30 | `migration_billing_subscriptions.sql` | Tambah tabel `subscriptions` & `invoices` — riwayat langganan production-ready di belakang cache `tenants.plan` |
| 31 | `migration_plans_catalog_db.sql` | Pindahkan katalog paket dari array statis di kode (`config/plans.js`) ke tabel `plans` sungguhan, dikelola admin platform lewat menu Katalog Paket |
| 32 | `migration_upgrade_request_price_snapshot.sql` | Simpan snapshot harga di `plan_upgrade_requests` SAAT diajukan (bukan diambil ulang dari katalog saat disetujui) — susulan #31 supaya perubahan harga admin platform tidak mengubah tagihan pengajuan yang sudah berjalan |
| 33 | `migration_consumable_qr.sql` | Tambah kode QR/barcode untuk barang habis pakai (sebelumnya hanya aset tetap yang bisa dipindai) |
| 34 | `migration_consumable_asset_type.sql` | Satukan kategori barang habis pakai dengan "Kategori Aset" (`asset_types`) — sebelumnya sistem kategori terpisah & tidak bisa dikelola tenant |
| 35 | `migration_add_password_is_set.sql` | Tambah kolom `password_is_set` di users — akun daftar via Google boleh membuat kata sandi di Profil tanpa kata sandi lama |
| 36 | `migration_remove_zecode_permission.sql` | Bersihkan baris izin modul 'zecode' (Zecode AI diganti chatbot panduan statis); tabel riwayat obrolan lama (#23) tidak dihapus |
| 37 | `migration_pakasir_self_serve_billing.sql` | Tambah kolom transaksi Pakasir di `plan_upgrade_requests` (`payment_provider`, `order_id`, `provider_transaction_id`, `paid_at`) & lebarkan status; upgrade paket berbayar kini dibayar & dikonfirmasi otomatis lewat Pakasir, bukan lagi transfer manual + verifikasi admin |
| 38 | `migration_add_testimonials.sql` | Tambah `users.login_count`/`users.testimonial_status` & tabel `testimonials` — popup minta testimoni tiap kelipatan 3 login, ditinjau admin platform sebelum tampil di landing page |
| 39 | `migration_separate_platform_admins.sql` | **Fase 5 SaaS (keamanan)** — pisahkan admin platform total dari pengguna tenant: tabel `platform_admins` sendiri (tanpa tenant_id), login & JWT terpisah, `audit_logs.tenant_id` jadi opsional + kolom `platform_admin_id` |
| 40 | `migration_platform_admin_google_login.sql` | Tambah "Masuk dengan Google" untuk admin platform — susulan #39, kolom `platform_admins.google_id` (UNIQUE, beda dari `users.google_id` yang tidak unik) |
| — | `migration_purge_test_data.sql` | **Opsional & destruktif** — bersih-bersih data uji coba spesifik (bukan bagian dari urutan wajib, baca catatan di dalam filenya sebelum dijalankan) |
