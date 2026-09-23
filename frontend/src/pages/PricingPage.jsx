import React from 'react';
import PricingCards from '../components/PricingCards.jsx';
import { NavBar, Footer } from './LandingPage.jsx';

/**
 * ============================================================================
 *  HALAMAN HARGA — PUBLIK (Fase 4 SaaS)
 * ============================================================================
 *  Sama seperti LandingPage.jsx: TIDAK memakai BrandingContext (itu identitas
 *  satu tenant pelanggan, salah kalau dipasang di halaman produk sendiri).
 *  Kartu paketnya (fetch + tampilan) ada di ../components/PricingCards.jsx —
 *  komponen yang SAMA dipakai section "Harga" di LandingPage.jsx, supaya
 *  keduanya tidak pernah menyimpang.
 * ============================================================================
 */

const FAQ = [
  {
    q: 'Bisa ganti paket kapan saja?',
    a: 'Bisa. Ajukan upgrade atau downgrade lewat menu Langganan di dalam aplikasi kapan saja — tidak terikat kontrak tahunan.',
  },
  {
    q: 'Bagaimana cara pembayarannya?',
    a: 'Lewat Pakasir: pilih paket yang diinginkan, bayar dengan QRIS, transfer bank, atau metode lain yang tersedia, dan paket Anda aktif otomatis begitu pembayaran dikonfirmasi.',
  },
  {
    q: 'Apa yang terjadi kalau aset/pengguna melebihi batas paket?',
    a: 'Data yang sudah ada tetap aman dan bisa terus dibuka/diubah — sistem hanya menahan penambahan aset atau pengguna BARU sampai Anda upgrade.',
  },
  {
    q: 'Apa bedanya Enterprise dan Enterprise Custom?',
    a: 'Enterprise adalah paket berjenjang biasa dengan batas 20.000 aset/50 pengguna. Enterprise Custom untuk kebutuhan di luar itu — kontrak, SLA, atau integrasi tersendiri — hubungi kami langsung.',
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-white">
      <NavBar />

      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10"
          style={{ background: 'linear-gradient(180deg, #f4faf6 0%, #ffffff 55%)' }}
          aria-hidden="true"
        />
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 text-center">
          <p className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-[12px] font-bold uppercase tracking-wider text-brand-700">
            Harga
          </p>
          <h1 className="mt-5 text-[32px] leading-[1.15] font-black tracking-tight text-ink-900 sm:text-[40px]">
            Paket yang tumbuh bersama aset Anda
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-ink-500 sm:text-base">
            Mulai gratis, upgrade kapan saja lewat menu Langganan begitu tim atau daftar aset Anda bertambah besar.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <PricingCards />
      </section>

      <section className="bg-ink-50 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="text-center mb-10">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-600 mb-3">Pertanyaan Umum</p>
            <h2 className="text-2xl font-black tracking-tight text-ink-900 sm:text-[28px]">Yang sering ditanyakan</h2>
          </div>
          <div className="space-y-4">
            {FAQ.map((item) => (
              <div key={item.q} className="rounded-2xl border border-ink-200/70 bg-white p-5">
                <p className="text-[14.5px] font-bold text-ink-900">{item.q}</p>
                <p className="mt-1.5 text-[13.5px] text-ink-500 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
