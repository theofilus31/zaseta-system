import React from 'react';
import { NavBar, Footer } from './LandingPage.jsx';
import { PRODUCT_NAME } from '../constants/brand.js';

/**
 * ============================================================================
 *  SYARAT & KETENTUAN — PUBLIK
 * ============================================================================
 *  TEMPLATE AWAL, BUKAN NASKAH HUKUM JADI — lihat catatan yang sama di
 *  PrivacyPolicyPage.jsx. Entitas & kontak sudah diisi (ZASETA, belum
 *  berbadan hukum resmi -- ganti begitu ada badan usaha terdaftar), tapi
 *  naskah ini sebaiknya tetap ditinjau penasihat hukum sebelum mengikat
 *  pelanggan berbayar sungguhan.
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

export default function TermsOfServicePage() {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-white">
      <NavBar />

      <section className="mx-auto max-w-3xl px-4 sm:px-6 py-12 sm:py-16">
        <p className="text-[12px] font-bold uppercase tracking-wider text-brand-700 mb-2">Legal</p>
        <h1 className="text-[28px] sm:text-[32px] font-black tracking-tight text-ink-900 mb-2">Syarat &amp; Ketentuan</h1>
        <p className="text-sm text-ink-400 mb-10">Terakhir diperbarui: 18 September 2026</p>

        <Section title="1. Penerimaan Syarat">
          <p>
            Dengan mendaftar atau memakai {PRODUCT_NAME} ("Layanan"), Anda setuju terikat pada Syarat &amp;
            Ketentuan ini beserta Kebijakan Privasi kami. Bila Anda mendaftar atas nama sebuah perusahaan,
            Anda menyatakan berwenang mengikat perusahaan tersebut pada syarat ini.
          </p>
        </Section>

        <Section title="2. Akun & Tanggung Jawab Anda">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Anda bertanggung jawab menjaga kerahasiaan kata sandi akun Anda dan seluruh aktivitas yang terjadi di bawah akun tersebut.</li>
            <li>Administrator Tenant bertanggung jawab mengelola akses staf yang diundang ke ruang kerjanya sendiri.</li>
            <li>Segera beri tahu kami bila Anda menduga akun Anda diakses tanpa izin.</li>
          </ul>
        </Section>

        <Section title="3. Paket Langganan & Pembayaran">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Paket Free tersedia tanpa batas waktu, tunduk pada batas pemakaian (jumlah aset/pengguna/lokasi) yang berlaku saat itu.</li>
            <li>Paket berbayar diaktifkan setelah pembayaran (transfer manual) diverifikasi oleh tim kami — proses ini memerlukan waktu, bukan otomatis seketika.</li>
            <li>Harga paket dapat berubah sewaktu-waktu; perubahan harga tidak berlaku surut untuk pengajuan upgrade yang sudah Anda ajukan sebelum perubahan itu berlaku.</li>
            <li>Anda dapat membatalkan langganan kapan saja lewat menu Langganan — akses ke fitur paket tetap berlaku sampai akhir periode yang sudah dibayar, tidak ada pengembalian dana pro-rata untuk sisa periode berjalan kecuali disebutkan lain secara tertulis.</li>
            <li>Menurunkan paket (downgrade) tidak menghapus data yang sudah ada, tapi menahan penambahan data baru selama pemakaian Anda masih di atas batas paket baru.</li>
          </ul>
        </Section>

        <Section title="4. Penggunaan yang Dilarang">
          <p>Anda setuju untuk tidak:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Memakai Layanan untuk tujuan melanggar hukum yang berlaku.</li>
            <li>Mencoba mengakses data Tenant lain, atau bagian sistem yang tidak diberi izin kepada Anda.</li>
            <li>Melakukan scraping, pengujian beban, atau upaya lain yang dapat mengganggu ketersediaan Layanan bagi pengguna lain.</li>
            <li>Mengunggah konten yang melanggar hukum atau hak pihak ketiga ke dalam sistem.</li>
          </ul>
        </Section>

        <Section title="5. Kepemilikan Data">
          <p>
            Seluruh data yang Anda dan staf Anda input ke dalam Layanan (daftar aset, kategori, catatan, dst.)
            tetap menjadi milik Anda/Tenant Anda. Kami hanya memprosesnya untuk menjalankan Layanan sesuai
            Kebijakan Privasi. Anda dapat mengekspor data Anda kapan saja selama akun aktif.
          </p>
        </Section>

        <Section title="6. Ketersediaan Layanan">
          <p>
            Kami berupaya menjaga Layanan tetap tersedia, tetapi tidak menjamin operasional tanpa gangguan
            sepenuhnya. Pemeliharaan terjadwal akan diinformasikan sebelumnya bila memungkinkan.
          </p>
        </Section>

        <Section title="7. Batasan Tanggung Jawab">
          <p>
            Layanan disediakan "sebagaimana adanya". Sejauh diizinkan hukum yang berlaku, kami tidak
            bertanggung jawab atas kerugian tidak langsung, kehilangan keuntungan, atau kehilangan data
            yang timbul dari pemakaian Layanan, kecuali disebabkan kelalaian berat atau kesengajaan kami.
            Anda tetap bertanggung jawab menjaga cadangan (backup) data penting Anda sendiri secara berkala.
          </p>
        </Section>

        <Section title="8. Penghentian">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Anda dapat berhenti memakai Layanan dan meminta penghapusan akun kapan saja.</li>
            <li>Kami berhak menangguhkan atau mengakhiri akun yang terbukti melanggar Syarat & Ketentuan ini, dengan pemberitahuan sebelumnya bila memungkinkan kecuali pelanggaran itu berisiko terhadap keamanan Layanan atau pengguna lain.</li>
          </ul>
        </Section>

        <Section title="9. Perubahan Syarat">
          <p>Kami dapat memperbarui Syarat & Ketentuan ini sewaktu-waktu. Pemakaian berkelanjutan atas Layanan setelah perubahan berarti Anda menyetujui versi terbaru.</p>
        </Section>

        <Section title="10. Hukum yang Berlaku">
          <p>Syarat & Ketentuan ini diatur oleh dan ditafsirkan sesuai hukum Republik Indonesia.</p>
        </Section>

        <Section title="11. Kontak">
          <p>
            Pertanyaan seputar Syarat & Ketentuan ini dapat disampaikan lewat formulir Hubungi Kami di
            beranda, atau ke{' '}
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
