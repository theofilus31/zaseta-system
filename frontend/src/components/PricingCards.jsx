import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import NumberFlow from '@number-flow/react';
import { BadgeCheck } from 'lucide-react';
import axiosClient from '../api/axiosClient.js';
import Button from './ui/Button.jsx';
import { Skeleton } from './ui/Skeleton.jsx';
import { Badge } from './ui/StatusBadge.jsx';
import { SegmentedControl } from './ui/Button.jsx';

/**
 * Grid kartu paket harga — dipakai LandingPage.jsx (section "Harga" langsung
 * di beranda) MAUPUN PricingPage.jsx (halaman /harga lengkap dengan FAQ).
 * Satu tempat supaya kartunya tidak diam-diam melenceng antara kedua halaman
 * itu. Paketnya diambil dari GET /api/billing/plans — sumber kebenaran yang
 * sama dipakai halaman Langganan di dalam aplikasi (lihat BillingPage.jsx).
 *
 * Tampilan kartunya mengikuti pola referensi (badge "Paling Populer", latar
 * kartu gelap untuk paket premium, daftar fitur dengan ikon BadgeCheck) —
 * warnanya tetap token Zaseta sendiri (brand/ink), bukan token referensinya.
 *
 * Sakelar Bulanan/Tahunan pakai SegmentedControl yang sudah ada (dipakai juga
 * di BillingPage.jsx) bukan komponen baru — priceYearly memang benar
 * ada sekarang di config/plans.js (konvensi "2 bulan gratis"), jadi tidak lagi
 * cuma tampilan kosong seperti keputusan sebelumnya. Paket yang dipilih lewat
 * tombol "Berlangganan" membawa siklusnya lewat ?cycle= sampai ke Signup.jsx
 * → BillingPage.jsx supaya tidak perlu dipilih ulang.
 */

const CYCLE_OPTIONS = [
  { value: 'monthly', label: 'Bulanan' },
  {
    value: 'yearly',
    label: (
      <span className="inline-flex items-center gap-1.5">
        Tahunan
        <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[9px] font-bold text-brand-700">Hemat 17%</span>
      </span>
    ),
  },
];

const rupiah = (v) => `Rp ${Number(v).toLocaleString('id-ID')}`;

/* Dipakai HANYA di belakang kartu gelap (Enterprise Custom) — garis kisi
   samar dengan gradasi radial di tepinya, versi terang dari efek yang sama
   di referensi (aslinya untuk latar gelap generik, di sini garisnya dibuat
   dari putih transparan supaya kelihatan di atas ink-900, bukan hitam
   transparan yang aslinya nyaris tidak kelihatan di latar segelap itu). */
function HighlightedBackground() {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage:
          'linear-gradient(to right, rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.07) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
        WebkitMaskImage: 'radial-gradient(ellipse 80% 50% at 50% 0%, #000 70%, transparent 110%)',
        maskImage: 'radial-gradient(ellipse 80% 50% at 50% 0%, #000 70%, transparent 110%)',
      }}
      aria-hidden="true"
    />
  );
}

/* Pendar lembut di belakang kartu "Paling Populer" — warna hijau brand
   (bukan ungu seperti referensi aslinya), senada dengan cincin di sekeliling
   kartunya. */
function PopularBackground() {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ background: 'radial-gradient(ellipse 80% 80% at 50% -20%, rgba(47,156,79,0.12), rgba(255,255,255,0))' }}
      aria-hidden="true"
    />
  );
}

function PlanCard({ plan, cycle }) {
  const isFree = !plan.custom && plan.price === 0;
  // Paket khusus (Enterprise Custom) dapat kartu gelap terbalik — padanan
  // "highlighted" di referensi; "Business" (plan.highlight) dapat cincin +
  // lencana "Paling Populer" — padanan "popular" di referensi.
  const isDark = plan.custom;
  const isPopular = plan.highlight;
  const isYearly = cycle === 'yearly' && !isFree && !plan.custom;
  const displayPrice = isYearly ? plan.priceYearly : plan.price;

  return (
    <div
      className={[
        'relative flex flex-col gap-6 overflow-hidden rounded-2xl border p-6',
        isDark
          ? 'border-ink-900 bg-ink-900 text-white'
          : isPopular
            ? 'border-2 border-brand-500 bg-white shadow-card-hover ring-4 ring-brand-100 sm:-translate-y-2'
            : isFree
              ? 'border-2 border-brand-200 bg-brand-50/40 shadow-card'
              : 'border-ink-200/70 bg-white shadow-card',
      ].join(' ')}
    >
      {isDark && <HighlightedBackground />}
      {isPopular && <PopularBackground />}

      <div className="relative flex items-center gap-2.5">
        <p className={`text-[15px] font-bold ${isDark ? 'text-white' : 'text-ink-900'}`}>{plan.name}</p>
        {isPopular && (
          <Badge tone="brand" size="sm">
            <i className="fas fa-fire text-[9px]" aria-hidden="true" />
            Paling Populer
          </Badge>
        )}
        {isFree && (
          <Badge tone="brand" size="sm">
            <i className="fas fa-rocket text-[9px]" aria-hidden="true" />
            Coba Gratis
          </Badge>
        )}
      </div>

      <div className="relative min-h-[52px]">
        {plan.custom || plan.price === 0 ? (
          <p className={`whitespace-nowrap text-[26px] font-black tracking-tight ${isDark ? 'text-white' : 'text-ink-900'}`}>
            {plan.custom ? 'Custom' : 'Gratis'}
          </p>
        ) : (
          /* NumberFlow (dipakai persis seperti referensi) — angkanya
             "menggulung" digit demi digit tiap kali `displayPrice` berubah
             (ganti Bulanan/Tahunan), bukan cuma fade seperti versi sebelumnya.
             "Rp" dipisah di luar NumberFlow supaya formatnya tetap identik
             dengan rupiah() yang dipakai di tempat lain (BillingPage, dst). */
          <p className={`inline-flex items-baseline gap-1 whitespace-nowrap text-[26px] font-black tracking-tight ${isDark ? 'text-white' : 'text-ink-900'}`}>
            <span>Rp</span>
            <NumberFlow value={displayPrice} locales="id-ID" format={{ maximumFractionDigits: 0 }} />
          </p>
        )}
        {!plan.custom && plan.price > 0 && (
          // h-8 leading-4 dicadangkan pas untuk 2 baris SELALU (bukan cuma
          // min-height) — subteks Tahunan ("per tahun · setara Rp.../bulan")
          // selalu 2 baris, Bulanan ("per bulan") cuma 1 baris; tanpa tinggi
          // tetap ini, kartunya jadi lebih pendek pas Bulanan dan melonjak
          // begitu pindah ke Tahunan (seluruh baris grid ikut menyesuaikan
          // tinggi kartu tertinggi, jadi semua kartu lain ikut "melompat").
          <div className="mt-0.5 h-8 overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={isYearly ? 'yearly' : 'monthly'}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className={`text-xs leading-4 ${isDark ? 'text-white/50' : 'text-ink-400'}`}
              >
                {isYearly ? `per tahun · setara ${rupiah(Math.round(plan.priceYearly / 12))}/bulan` : 'per bulan'}
              </motion.p>
            </AnimatePresence>
          </div>
        )}
        {plan.custom && <p className="mt-0.5 text-xs text-white/50">hubungi kami untuk penawaran</p>}
      </div>

      <div className="relative flex-1 space-y-3">
        <p className={`text-[13px] leading-relaxed ${isDark ? 'text-white/70' : 'text-ink-500'}`}>{plan.tagline}</p>
        {/* Diambil dari config/plans.js (plan.features) — bukan hardcode di
            sini, supaya menambah/mengubah fitur satu paket cukup di satu
            tempat. Ditampilkan cuma 5 teratas (bukan semuanya) supaya kartu
            tetap ringkas — daftar lengkapnya tetap ada di data untuk
            keperluan lain (mis. tabel perbandingan penuh nanti). */}
        <ul className="space-y-2">
          {plan.features.slice(0, 5).map((feature) => (
            <li key={feature} className={`flex items-start gap-2 text-[13.5px] font-medium ${isDark ? 'text-white/90' : 'text-ink-700'}`}>
              <BadgeCheck className={`mt-0.5 h-4 w-4 shrink-0 ${isDark ? 'text-white' : 'text-brand-500'}`} aria-hidden="true" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative">
        {plan.price === 0 ? (
          <Button to="/signup" variant={plan.highlight ? 'primary' : 'secondary'} block>
            Daftar Gratis
            <i className="fas fa-arrow-right text-xs" aria-hidden="true" />
          </Button>
        ) : (
          // Paket berbayar: daftar dulu (wajib punya akun), lalu langsung
          // diarahkan ke halaman Langganan dengan modal pengajuan
          // pembayaran paket ini sudah terbuka — lihat Signup.jsx &
          // BillingPage.jsx (parameter ?plan= / ?upgrade=).
          <Button to={`/signup?plan=${plan.id}&cycle=${cycle}`} variant={plan.highlight ? 'primary' : 'secondary'} block>
            Berlangganan
            <i className="fas fa-arrow-right text-xs" aria-hidden="true" />
          </Button>
        )}
        {/* Enterprise TETAP paket mandiri seperti yang lain (harga di atas
            berlaku) — ini cuma jalur kontak sekunder untuk kebutuhan DI ATAS
            itu (kontrak/SLA khusus), bukan pengganti tombol Berlangganan.
            customPricingHint kosong untuk paket lain. */}
        {plan.customPricingHint && (
          <p className={`mt-2.5 text-center text-[11px] leading-relaxed ${isDark ? 'text-white/50' : 'text-ink-400'}`}>
            {plan.customPricingHint}{' '}
            <a href="mailto:helpdesk@rukunmitrasejati.id?subject=Tanya%20Paket%20Enterprise" className="font-semibold text-brand-600 hover:underline">
              Hubungi kami
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

export default function PricingCards({ className = '' }) {
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState('');
  const [cycle, setCycle] = useState('monthly');

  useEffect(() => {
    axiosClient.get('/billing/plans')
      .then((res) => setPlans(res.data.plans))
      .catch(() => setError('Gagal memuat daftar paket. Coba muat ulang halaman.'));
  }, []);

  return (
    <div className={className}>
      {error && (
        <p className="text-center text-sm text-danger-600 mb-6">{error}</p>
      )}
      {!plans && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-80 w-full rounded-2xl" />)}
        </div>
      )}
      {plans && (
        <>
          <div className="flex justify-center mb-6">
            <SegmentedControl options={CYCLE_OPTIONS} value={cycle} onChange={setCycle} size="sm" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 pt-2">
            {plans.map((plan) => <PlanCard key={plan.id} plan={plan} cycle={cycle} />)}
          </div>
        </>
      )}
      <p className="mt-8 text-center text-xs text-ink-400">
        Semua harga sudah termasuk PPN. Paket berbayar aktif otomatis begitu pembayaran Anda dikonfirmasi.
      </p>
    </div>
  );
}
