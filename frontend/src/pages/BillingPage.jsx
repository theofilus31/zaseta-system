import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import NumberFlow from '@number-flow/react';
import axiosClient from '../api/axiosClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import { useLayoutWidth } from '../context/LayoutWidthContext.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { Badge } from '../components/ui/StatusBadge.jsx';
import { FormError } from '../components/ui/Form.jsx';
import { SegmentedControl } from '../components/ui/Button.jsx';
import { rupiah } from '../utils/currency.js';

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

const angka = (v) => Number(v).toLocaleString('id-ID');

const INVOICE_STATUS_TONE = { pending: 'warning', paid: 'brand', failed: 'danger', refunded: 'neutral', canceled: 'neutral' };
const INVOICE_STATUS_LABEL = { pending: 'Menunggu', paid: 'Lunas', failed: 'Gagal', refunded: 'Dikembalikan', canceled: 'Dibatalkan' };

/** Batang pemakaian sederhana — merah begitu mendekati/lewat limit paket. */
function UsageBar({ label, used, limit }) {
  const unlimited = limit === null || limit === undefined;
  const pct = unlimited ? 0 : Math.min(100, (used / Math.max(limit, 1)) * 100);
  const danger = !unlimited && used >= limit;
  const warn = !unlimited && !danger && pct >= 80;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <p className="text-[13px] font-semibold text-ink-700">{label}</p>
        <p className="text-xs text-ink-400 tabular-nums">
          {angka(used)} {unlimited ? '' : `/ ${angka(limit)}`}
        </p>
      </div>
      {!unlimited && (
        <div className="progress-track">
          <div
            className={`progress-fill ${danger ? 'bg-danger-500' : warn ? 'bg-warning-500' : 'bg-brand-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {unlimited && <p className="text-xs text-ink-400">Tanpa batas</p>}
    </div>
  );
}

function PlanCard({ plan, cycle, isCurrent, onPick, disabled }) {
  const isYearly = cycle === 'yearly' && plan.price > 0 && !plan.custom;
  const displayPrice = isYearly ? plan.priceYearly : plan.price;
  return (
    <div
      className={[
        'relative flex flex-col rounded-2xl border p-5',
        plan.highlight ? 'border-brand-400 shadow-card-hover' : 'border-ink-200/70 shadow-card',
        isCurrent ? 'ring-2 ring-brand-500/40' : '',
      ].join(' ')}
    >
      {plan.highlight && (
        <span className="absolute -top-3 left-5 rounded-full bg-brand-600 px-3 py-1 text-[11px] font-bold text-white shadow-sm">
          <i className="fas fa-star text-[9px] mr-1" aria-hidden="true" />Populer
        </span>
      )}
      <p className="text-[15px] font-bold text-ink-900">{plan.name}</p>
      {plan.custom || plan.price === 0 ? (
        <p className="mt-2 text-2xl font-black text-ink-900">{plan.custom ? 'Custom' : 'Gratis'}</p>
      ) : (
        /* NumberFlow — sama persis pola PricingCards.jsx (landing/halaman
           Harga publik): angkanya "menggulung" digit demi digit tiap kali
           `displayPrice` berubah (ganti Bulanan/Tahunan), bukan cuma
           berganti angka mentah. Halaman ini sebelumnya punya PlanCard
           SENDIRI (bukan berbagi komponen dengan PricingCards.jsx), jadi
           animasi itu tidak ikut ke sini sampai ditambahkan manual. */
        <p className="mt-2 inline-flex items-baseline gap-1 text-2xl font-black text-ink-900">
          <span>Rp</span>
          <NumberFlow value={displayPrice} locales="id-ID" format={{ maximumFractionDigits: 0 }} />
          <span className="text-xs font-medium text-ink-400">{isYearly ? '/tahun' : '/bulan'}</span>
        </p>
      )}
      <p className="mt-2 text-xs text-ink-500 leading-relaxed">{plan.tagline}</p>

      {/* Diambil dari config/plans.js (plan.features) — satu sumber yang
          sama dipakai PricingCards.jsx, bukan hardcode ulang di sini. */}
      <ul className="mt-4 space-y-1.5 text-[13px] text-ink-600 flex-1">
        {plan.features.slice(0, 6).map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <i className="fas fa-check mt-1 text-brand-500 text-[11px]" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5">
        {isCurrent ? (
          <Badge tone="brand" size="md" className="w-full justify-center py-2">Paket Aktif</Badge>
        ) : plan.custom ? (
          <Button href="mailto:helpdesk@rukunmitrasejati.id?subject=Tanya%20Paket%20Enterprise%20Custom" variant="secondary" size="sm" block>
            Hubungi Kami
          </Button>
        ) : (
          <Button size="sm" block disabled={disabled} onClick={() => onPick(plan)}>
            Pilih Paket Ini
          </Button>
        )}
      </div>
    </div>
  );
}

export default function BillingPage() {
  const { hasRole } = useAuth();
  const { pushSuccess, pushError } = useNotification();
  const isAdmin = hasRole('admin');
  const [searchParams, setSearchParams] = useSearchParams();

  const [data, setData] = useState(null);
  const [plans, setPlans] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState(null); // paket yang sedang dipilih lewat modal
  const [submitting, setSubmitting] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [cancelingCheckout, setCancelingCheckout] = useState(false);
  const [resumingCheckout, setResumingCheckout] = useState(false);
  const [error, setError] = useState('');
  // Siklus tagihan yang sedang dipilih di panel perbandingan & modal
  // pengajuan — bawaan dari ?cycle= kalau datang dari section Harga
  // (lihat PricingCards.jsx → Signup.jsx), 'monthly' kalau tidak ada.
  const [cycle, setCycle] = useState(() => (searchParams.get('cycle') === 'yearly' ? 'yearly' : 'monthly'));

  /* Sengaja bukan 'narrow' tetap — keadaan memuat dipersempit (mirip
     halaman lain), tapi begitu data siap panel butuh lebar penuh untuk
     menampilkan kartu perbandingan paket berjajar. */
  useLayoutWidth(loading ? 'narrow' : 'default');

  /* `withSkeleton=false` dipakai muat ulang di latar belakang (lihat listener
     fokus di bawah) supaya tidak mengedipkan seluruh halaman jadi skeleton
     tiap kali jendela disorot lagi (mis. sekadar pindah tab lalu kembali). */
  function load(withSkeleton = true) {
    if (withSkeleton) setLoading(true);
    return Promise.all([axiosClient.get('/billing/me'), axiosClient.get('/billing/plans'), axiosClient.get('/billing/invoices')])
      .then(([me, all, inv]) => {
        setData(me.data);
        setPlans(all.data.plans);
        setInvoices(inv.data.invoices);
      })
      .catch((err) => pushError(err.response?.data?.message || 'Gagal memuat data langganan.'))
      .finally(() => { if (withSkeleton) setLoading(false); });
  }

  // `load()` mengembalikan Promise (lihat definisinya di atas) -- dibungkus
  // arrow function di sini SUPAYA useEffect tidak menerima Promise itu
  // sebagai nilai baliknya sendiri. React memperlakukan APA PUN yang
  // dikembalikan efek sebagai fungsi cleanup; sebuah Promise yang dianggap
  // begitu meledak "destroy is not a function" begitu efeknya dibersihkan
  // (mis. StrictMode yang sengaja mount-cleanup-mount ulang tiap efek di
  // mode dev untuk mendeteksi bug seperti ini).
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Pembayaran Pakasir selesai di TAB/HALAMAN LAIN (redirect penuh ke
     app.pakasir.com, bukan popup, lewat `window.location.href` di
     handleCheckout/handleResumeCheckout) — begitu tenant kembali ke tab ini:
     1. Muat ulang data langganan, supaya status "menunggu pembayaran" atau
        paket yang sudah aktif langsung terganti begitu webhook Pakasir
        sempat memprosesnya di sisi server SELAGI tenant masih di halaman
        pembayaran. Tanpa ini tenant harus me-refresh manual.
     2. Reset tombol "Lanjut ke Pembayaran"/"Lanjutkan Pembayaran" yang
        macet di keadaan loading -- begitu `window.location.href` dieksekusi
        halaman ini SEHARUSNYA berpindah, tapi tombol "kembali" peramban bisa
        memulihkan halaman ini apa adanya dari bfcache (bukan memuat ulang
        dari nol), jadi state `submitting`/`resumingCheckout` yang di-set
        SESAAT sebelum redirect tadi ikut terpulihkan dalam keadaan macet
        kalau tidak direset di sini. */
  useEffect(() => {
    function onFocus() {
      if (document.visibilityState === 'hidden') return;
      setSubmitting((wasSubmitting) => {
        if (wasSubmitting) { setPicked(null); setError(''); }
        return false;
      });
      setResumingCheckout(false);
      load(false);
    }
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Datang dari section Harga → Daftar (?upgrade=business): buka langsung
  // modal pengajuan pembayaran paket itu, tanpa pengguna harus memilih lagi.
  // Parameter dibuang setelah dipakai supaya tidak terbuka ulang saat modal
  // ditutup atau halaman dimuat ulang.
  useEffect(() => {
    const upgradeTo = searchParams.get('upgrade');
    if (!upgradeTo || !data || plans.length === 0) return;
    setSearchParams((params) => { params.delete('upgrade'); params.delete('cycle'); return params; }, { replace: true });
    if (!isAdmin || data.pendingRequest || upgradeTo === data.plan.id) return;
    const plan = plans.find((p) => p.id === upgradeTo && !p.custom && p.price > 0);
    if (plan) setPicked(plan);
  }, [searchParams, data, plans, isAdmin, setSearchParams]);

  /* Ucapan selamat sekali tampil begitu permintaan upgrade DISETUJUI —
     dideteksi dari subscription aktif berbayar yang belum pernah "dirayakan"
     di browser ini (localStorage per subscription.id, bukan jendela waktu
     seperti "24 jam terakhir" — lebih tahan kalau tenant baru buka
     halaman ini beberapa hari setelah disetujui). Persetujuannya sendiri
     terjadi di sesi ADMIN PLATFORM yang beda, jadi tidak ada cara mendorong
     notifikasi real-time ke tenant (tidak ada websocket di arsitektur ini) —
     ini muncul begitu tenant membuka/memuat ulang halaman Langganan setelah
     disetujui, dilengkapi surel yang sudah ada (sendUpgradeRequestResolved). */
  const [celebration, setCelebration] = useState(null);
  useEffect(() => {
    if (!data?.subscription || data.subscription.status !== 'active' || !data.plan || data.plan.price === 0) return;
    const key = `zenta_billing_celebrated_${data.subscription.id}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch {
      // localStorage bisa gagal (mode privat, kuota, dll.) -- kalau begitu
      // biarkan ucapan selamatnya tampil lagi lain kali daripada melempar
      // error yang mematahkan seluruh halaman Langganan.
    }
    setCelebration(data.plan.name);
    pushSuccess(`Selamat! Paket ${data.plan.name} Anda sudah aktif.`);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Paket berbayar: buat checkout Pakasir lalu ARAHKAN LANGSUNG ke halaman
   *  pembayarannya (redirect penuh, bukan tab baru — supaya tombol "kembali"
   *  bawaan Pakasir wajar dipakai). Paket gratis: diterapkan seketika, tidak
   *  ada redirect sama sekali. */
  async function handleCheckout(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await axiosClient.post('/billing/checkout', { requestedPlan: picked.id, billingCycle: cycle });
      if (res.data.checkoutUrl) {
        window.location.href = res.data.checkoutUrl;
        return; // biarkan submitting=true -- halaman akan berpindah
      }
      pushSuccess(`Paket ${picked.name} diterapkan.`);
      setPicked(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memproses permintaan.');
      setSubmitting(false);
    }
  }

  /** Tenant sempat meninggalkan halaman pembayaran Pakasir tanpa membayar —
   *  minta ulang checkoutUrl untuk permintaan pending yang SAMA (idempotent
   *  di sisi Pakasir, lihat billingController.requestPlanChange) lalu
   *  arahkan lagi ke sana. */
  async function handleResumeCheckout() {
    setResumingCheckout(true);
    try {
      const res = await axiosClient.post('/billing/checkout', {
        requestedPlan: data.pendingRequest.requestedPlan,
        billingCycle: data.pendingRequest.billingCycle,
      });
      if (res.data.checkoutUrl) window.location.href = res.data.checkoutUrl;
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal melanjutkan pembayaran.');
      setResumingCheckout(false);
    }
  }

  async function handleCancelCheckout() {
    if (!confirm('Batalkan checkout yang sedang menunggu pembayaran ini?')) return;
    setCancelingCheckout(true);
    try {
      await axiosClient.post('/billing/checkout/cancel');
      pushSuccess('Checkout dibatalkan.');
      load();
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal membatalkan checkout.');
    } finally {
      setCancelingCheckout(false);
    }
  }

  async function handleCancelSubscription() {
    if (!confirm(`Batalkan langganan paket ${data.plan.name}? Anda tetap bisa memakainya sampai masa aktif berakhir${data.planExpiresAt ? ` (${new Date(data.planExpiresAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })})` : ''}, setelahnya otomatis turun ke paket Free. Data Anda tidak akan hilang.`)) return;
    setCanceling(true);
    try {
      await axiosClient.post('/billing/cancel');
      pushSuccess('Langganan dibatalkan — tetap aktif sampai masa berlaku saat ini berakhir.');
      load();
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal membatalkan langganan.');
    } finally {
      setCanceling(false);
    }
  }

  if (loading) {
    return (
      <>
        <Skeleton className="h-7 w-48 mb-6" />
        <Card><Skeleton className="h-32 w-full" /></Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Administrasi"
        title="Langganan"
        description="Paket, pemakaian, dan pengajuan upgrade untuk ruang kerja Anda."
      />

      {celebration && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3.5">
          <i className="fas fa-champagne-glasses mt-0.5 text-brand-500 shrink-0" aria-hidden="true" />
          <p className="flex-1 text-sm text-brand-800 leading-relaxed">
            <strong>Selamat!</strong> Permintaan upgrade Anda sudah disetujui — paket <strong>{celebration}</strong> aktif sekarang.
          </p>
          <button
            onClick={() => setCelebration(null)}
            aria-label="Tutup"
            className="shrink-0 h-6 w-6 -m-1 flex items-center justify-center rounded-lg text-brand-400 hover:text-brand-700 hover:bg-brand-100 transition-colors"
          >
            <i className="fas fa-xmark text-xs" aria-hidden="true" />
          </button>
        </div>
      )}

      {!isAdmin && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-ink-200 bg-ink-50 px-4 py-3.5">
          <i className="fas fa-eye mt-0.5 text-ink-400 shrink-0" aria-hidden="true" />
          <p className="text-sm text-ink-600 leading-relaxed">
            Akun Anda hanya berwenang melihat halaman ini. Hanya administrator yang bisa mengajukan upgrade paket.
          </p>
        </div>
      )}

      {/* ---------- Paket & pemakaian saat ini ---------- */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div className="flex items-start gap-3 min-w-0">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <i className="fas fa-credit-card text-xs" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-ink-800 leading-tight">{`Paket ${data.plan.name}`}</h2>
              <p className="text-xs text-ink-400 mt-1 leading-relaxed">
                {data.plan.custom
                  ? 'Paket khusus — hubungi kami untuk detail kontrak.'
                  : data.plan.price === 0
                    ? 'Gratis, tanpa batas waktu.'
                    : `${data.billingCycle === 'yearly' ? rupiah(data.plan.priceYearly) : rupiah(data.plan.price)} ${data.billingCycle === 'yearly' ? '/tahun' : '/bulan'}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-right">
            <Badge tone={data.subscription?.status === 'canceled' ? 'warning' : 'brand'} size="sm">
              {data.subscription?.status === 'canceled' ? 'Berakhir' : 'Aktif'}
            </Badge>
            {data.planExpiresAt && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-ink-400">
                  {data.subscription?.status === 'canceled' ? 'Berakhir' : 'Perpanjangan'}
                </p>
                <p className="text-xs font-semibold text-ink-700">
                  {new Date(data.planExpiresAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
            )}
          </div>
        </div>

        {data.pendingRequest && (
          <div className="mb-5 flex flex-wrap items-start gap-3 rounded-2xl border border-warning-200 bg-warning-50 px-4 py-3.5">
            <i className="fas fa-clock mt-0.5 text-warning-500 shrink-0" aria-hidden="true" />
            <p className="flex-1 min-w-[16rem] text-sm text-warning-800 leading-relaxed">
              Checkout ke paket <strong>{plans.find((p) => p.id === data.pendingRequest.requestedPlan)?.name || data.pendingRequest.requestedPlan}</strong>
              {' '}({data.pendingRequest.billingCycle === 'yearly' ? 'tahunan' : 'bulanan'}) sedang menunggu pembayaran Anda.
              {' '}Harga sudah dikunci di <strong>{rupiah(data.pendingRequest.price)}</strong> — tidak berubah walau harga paket ini diubah sebelum Anda membayar.
            </p>
            {isAdmin && (
              <div className="flex shrink-0 gap-2">
                <Button size="xs" onClick={handleResumeCheckout} loading={resumingCheckout}>Lanjutkan Pembayaran</Button>
                <Button size="xs" variant="ghost" onClick={handleCancelCheckout} loading={cancelingCheckout}>Batalkan</Button>
              </div>
            )}
          </div>
        )}

        {data.subscription?.status === 'canceled' && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-warning-200 bg-warning-50 px-4 py-3.5">
            <i className="fas fa-triangle-exclamation mt-0.5 text-warning-500 shrink-0" aria-hidden="true" />
            <p className="text-sm text-warning-800 leading-relaxed">
              Langganan ini sudah dibatalkan dan tidak akan diperpanjang. Anda tetap bisa memakai paket {data.plan.name} sampai tanggal di atas, setelahnya otomatis turun ke paket Free.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
          <UsageBar label="Aset" used={data.usage.assets} limit={data.plan.maxAssets} />
          <UsageBar label="Pengguna" used={data.usage.users} limit={data.plan.maxUsers} />
          <UsageBar label="Lokasi" used={data.usage.locations} limit={data.plan.locationLimit} />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4">
          <Button size="sm" variant="secondary" onClick={() => document.getElementById('semua-paket')?.scrollIntoView({ behavior: 'smooth' })}>
            <i className="fas fa-arrows-rotate text-xs" aria-hidden="true" />
            Ubah Paket
          </Button>
          <Button size="sm" variant="secondary" onClick={() => document.getElementById('riwayat-tagihan')?.scrollIntoView({ behavior: 'smooth' })}>
            <i className="fas fa-receipt text-xs" aria-hidden="true" />
            Riwayat Tagihan
          </Button>
          {isAdmin && data.plan.price > 0 && data.subscription?.status === 'active' && (
            <Button size="sm" variant="ghost" className="ml-auto text-danger-600 hover:bg-danger-50" onClick={handleCancelSubscription} loading={canceling}>
              <i className="fas fa-ban text-xs" aria-hidden="true" />
              Batalkan Langganan
            </Button>
          )}
        </div>
      </Card>

      {/* ---------- Bandingkan & pilih paket ---------- */}
      <Card id="semua-paket" padded={false} className="mb-6 overflow-hidden scroll-mt-6">
        <CardHeader
          bordered
          title="Semua Paket"
          description="Ganti paket kapan saja — paket berbayar aktif otomatis begitu pembayaran lewat Pakasir dikonfirmasi."
        />
        <div className="px-5 sm:px-6 pt-5 flex justify-center sm:justify-start">
          <SegmentedControl options={CYCLE_OPTIONS} value={cycle} onChange={setCycle} size="sm" />
        </div>
        <div className="p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              cycle={cycle}
              isCurrent={plan.id === data.plan.id}
              disabled={!isAdmin || Boolean(data.pendingRequest)}
              onPick={setPicked}
            />
          ))}
        </div>
      </Card>

      {/* ---------- Riwayat Tagihan ---------- */}
      <Card id="riwayat-tagihan" padded={false} className="overflow-hidden scroll-mt-6">
        <CardHeader
          bordered
          title="Riwayat Tagihan"
          description="Semua invoice untuk ruang kerja Anda, terbaru lebih dulu."
        />
        {invoices.length === 0 ? (
          <p className="px-5 sm:px-6 py-8 text-center text-sm text-ink-400">Belum ada riwayat tagihan.</p>
        ) : (
          <div className="divide-y divide-ink-100">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 py-3.5">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-ink-800">
                    {inv.planName} · {inv.billingCycle === 'yearly' ? 'Tahunan' : 'Bulanan'}
                  </p>
                  <p className="text-xs text-ink-400 mt-0.5">
                    {inv.invoiceNumber} — {new Date(inv.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-[13.5px] font-bold text-ink-900 tabular-nums">{rupiah(inv.amount)}</p>
                  <Badge tone={INVOICE_STATUS_TONE[inv.status] || 'neutral'} size="sm">
                    {INVOICE_STATUS_LABEL[inv.status] || inv.status}
                  </Badge>
                  <Button to={`/billing/invoices/${inv.id}`} size="sm" variant="secondary" title="Lihat & unduh invoice">
                    <i className="fas fa-download text-xs" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {picked && (
        <Modal
          title={`Pindah ke Paket ${picked.name}`}
          description={
            picked.price === 0 ? (
              'Paket gratis — diterapkan langsung, tanpa pembayaran.'
            ) : (
              <span className="inline-flex items-baseline gap-1">
                <span>Rp</span>
                <NumberFlow value={cycle === 'yearly' ? picked.priceYearly : picked.price} locales="id-ID" format={{ maximumFractionDigits: 0 }} />
                <span>{cycle === 'yearly' ? '/tahun' : '/bulan'}</span>
              </span>
            )
          }
          icon="fa-credit-card"
          onClose={() => { setPicked(null); setError(''); }}
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={() => setPicked(null)} disabled={submitting}>Batal</Button>
              <Button size="sm" onClick={handleCheckout} loading={submitting}>
                {submitting
                  ? (picked.price > 0 ? 'Mengarahkan…' : 'Menerapkan…')
                  : (picked.price > 0 ? 'Lanjut ke Pembayaran' : 'Terapkan Sekarang')}
              </Button>
            </>
          }
        >
          <form onSubmit={handleCheckout} className="space-y-4">
            {picked.price > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-500 mb-1.5">Siklus Tagihan</p>
                <SegmentedControl options={CYCLE_OPTIONS} value={cycle} onChange={setCycle} size="sm" />
              </div>
            )}
            {picked.price > 0 && (
              <div className="flex items-start gap-2.5 rounded-xl border border-dashed border-ink-300 bg-ink-50 px-4 py-3.5">
                <i className="fas fa-shield-halved mt-0.5 text-ink-400 shrink-0" aria-hidden="true" />
                <p className="text-[13px] text-ink-700 leading-relaxed">
                  Anda akan diarahkan ke halaman pembayaran Pakasir (QRIS, transfer bank, dan metode lainnya). Paket aktif otomatis begitu pembayaran dikonfirmasi.
                </p>
              </div>
            )}
            <FormError>{error}</FormError>
          </form>
        </Modal>
      )}
    </>
  );
}
