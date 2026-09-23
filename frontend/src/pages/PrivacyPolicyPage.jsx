import React from 'react';
import { NavBar, Footer } from './LandingPage.jsx';
import { PRODUCT_NAME } from '../constants/brand.js';

/**
 * ============================================================================
 *  KEBIJAKAN PRIVASI — PUBLIK
 * ============================================================================
 *  TEMPLATE AWAL, BUKAN NASKAH HUKUM JADI. Ditulis berdasarkan data yang
 *  BENAR-BENAR diproses sistem ini per audit kode (lihat komentar per bagian
 *  di bawah untuk sumbernya). Entitas & kontak sudah diisi (ZASETA, belum
 *  berbadan hukum resmi -- ganti begitu ada badan usaha terdaftar), tapi
 *  keseluruhan naskah SEBAIKNYA tetap ditinjau penasihat hukum sebelum
 *  dipakai mengikat pengguna berbayar sungguhan.
 * ============================================================================
 */

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-ink-900 mb-3">{title}</h2>
      <div className="space-y-3 text-[14.5px] leading-relaxed text-ink-600">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-white">
      <NavBar />

      <section className="mx-auto max-w-3xl px-4 sm:px-6 py-12 sm:py-16">
        <p className="text-[12px] font-bold uppercase tracking-wider text-brand-700 mb-2">Legal</p>
        <h1 className="text-[28px] sm:text-[32px] font-black tracking-tight text-ink-900 mb-2">Kebijakan Privasi</h1>
        <p className="text-sm text-ink-400 mb-10">Terakhir diperbarui: 18 September 2026</p>

        <Section title="1. Ringkasan">
          <p>
            Kebijakan ini menjelaskan data apa saja yang dikumpulkan {PRODUCT_NAME} ("kami", "Layanan"),
            untuk apa data itu dipakai, dan hak Anda atasnya. Berlaku untuk siapa pun yang mendaftar,
            login, atau memakai Layanan — baik sebagai administrator perusahaan pelanggan ("Tenant")
            maupun staf yang diundang ke dalamnya.
          </p>
        </Section>

        <Section title="2. Data yang Kami Kumpulkan">
          <p>Data akun: nama, alamat email, nama pengguna, dan kata sandi (disimpan dalam bentuk hash, tidak pernah teks polos).</p>
          <p>Data perusahaan (Tenant): nama perusahaan dan kode/slug yang Anda pilih saat mendaftar.</p>
          <p>
            Data yang Anda input ke dalam sistem: daftar aset, kategori, lokasi, pengguna internal Anda,
            dan seluruh catatan lain yang Anda buat untuk mengelola inventaris — sepenuhnya milik Anda
            (lihat Syarat & Ketentuan bagian Kepemilikan Data).
          </p>
          <p>Log teknis: alamat IP, waktu login/aktivitas, dan riwayat perubahan data (audit log) — untuk keamanan dan penelusuran masalah.</p>
          <p>Data pembayaran: bukti transfer yang Anda kirimkan saat mengajukan upgrade paket. Kami tidak menyimpan data kartu/rekening bank Anda di server kami.</p>
        </Section>

        <Section title="3. Bagaimana Data Digunakan">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Menjalankan dan memelihara Layanan (autentikasi, penegakan hak akses, penegakan batas paket).</li>
            <li>Mengirim email transaksional: kode OTP verifikasi/reset kata sandi, notifikasi pengajuan/persetujuan upgrade paket, dan ringkasan harian ("perlu ditindaklanjuti") bila Anda mengaktifkannya.</li>
            <li>Mendeteksi dan mencegah penyalahgunaan (mis. percobaan login berulang, pemindaian kode QR publik berlebihan).</li>
            <li>Menanggapi pesan yang Anda kirim lewat formulir Hubungi Kami.</li>
          </ul>
        </Section>

        <Section title="4. Berbagi Data ke Pihak Ketiga">
          <p>Kami tidak menjual data Anda. Data dibagikan ke pihak ketiga HANYA sejauh diperlukan Layanan berjalan:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong>Penyedia SMTP</strong> — untuk mengirimkan email OTP, notifikasi, dan ringkasan harian atas nama kami.</li>
            <li><strong>Pakasir</strong> — payment gateway yang memproses pembayaran upgrade paket Anda. Informasi transaksi (nominal, status pembayaran) dipertukarkan dengan Pakasir untuk mengaktifkan paket Anda; kami tidak pernah menerima atau menyimpan detail kartu/rekening pembayaran Anda sendiri.</li>
            <li><strong>Google Identity Services</strong> — bila Anda memilih masuk/daftar dengan Google, Google memverifikasi identitas Anda sebelum kami membuatkan/mencocokkan akun.</li>
            <li>Sebagaimana diwajibkan hukum yang berlaku (mis. permintaan resmi aparat penegak hukum).</li>
          </ul>
        </Section>

        <Section title="5. Keamanan Data">
          <p>
            Kata sandi disimpan sebagai hash (bcrypt), sesi memakai token yang bisa dicabut seketika saat
            kata sandi diganti atau akun dinonaktifkan, dan setiap tenant hanya bisa mengakses datanya sendiri
            (data antar-perusahaan pelanggan terpisah sepenuhnya di tingkat basis data). Tidak ada sistem yang
            100% kebal risiko — kami menerapkan praktik keamanan wajar, tapi tidak dapat menjamin keamanan mutlak.
          </p>
        </Section>

        <Section title="6. Berapa Lama Data Disimpan">
          <p>
            Data disimpan selama akun/langganan Anda aktif. Aset atau data yang Anda hapus masuk ke Tempat
            Sampah dan dapat dipulihkan untuk sementara sebelum dihapus permanen. Anda dapat meminta
            penghapusan akun dan seluruh data Tenant Anda dengan menghubungi kami (lihat bagian Kontak).
          </p>
        </Section>

        <Section title="7. Hak Anda">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Melihat dan mengubah data akun Anda sendiri lewat menu Profil.</li>
            <li>Meminta salinan data Tenant Anda (ekspor CSV sudah tersedia untuk beberapa data lewat aplikasi).</li>
            <li>Meminta penghapusan akun/data — hubungi kami lewat kontak di bawah.</li>
          </ul>
        </Section>

        <Section title="8. Cookie & Penyimpanan Lokal">
          <p>
            Kami tidak memakai cookie pelacak pihak ketiga atau alat analitik. Token sesi login disimpan di
            penyimpanan lokal peramban Anda (localStorage) untuk menjaga Anda tetap masuk.
          </p>
        </Section>

        <Section title="9. Perubahan Kebijakan Ini">
          <p>Kami dapat memperbarui kebijakan ini sewaktu-waktu. Perubahan berarti akan diinformasikan lewat aplikasi atau email.</p>
        </Section>

        <Section title="10. Kontak">
          <p>
            Pertanyaan seputar privasi dapat disampaikan lewat formulir Hubungi Kami di beranda, atau ke{' '}
            <a href="mailto:zaseta.support@gmail.com" className="font-medium text-brand-600 hover:text-brand-700 underline underline-offset-2">
              zaseta.support@gmail.com
            </a>{' '}
            atas nama {PRODUCT_NAME}.
          </p>
        </Section>
      </section>

      <Footer />
    </div>
  );
}
