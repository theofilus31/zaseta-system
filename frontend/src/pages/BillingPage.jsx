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
import { TextareaField, FormError } from '../components/ui/Form.jsx';
import { SegmentedControl } from '../components/ui/Button.jsx';

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
  const [picked, setPicked] = useState(null); // paket yang sedang diajukan lewat modal
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState('');
  // Siklus tagihan yang sedang dipilih di panel perbandingan & modal
  // pengajuan — bawaan dari ?cycle= kalau datang dari section Harga
  // (lihat PricingCards.jsx → Signup.jsx), 'monthly' kalau tidak ada.
  const [cycle, setCycle] = useState(() => (searchParams.get('cycle') === 'yearly' ? 'yearly' : 'monthly'));

  /* Sengaja bukan 'narrow' tetap — keadaan memuat dipersempit (mirip
     halaman lain), tapi begitu data siap panel butuh lebar penuh untuk
     menampilkan kartu perbandingan paket berjajar. */
  useLayoutWidth(loading ? 'narrow' : 'default');

  function load() {
    setLoading(true);
    Promise.all([axiosClient.get('/billing/me'), axiosClient.get('/billing/plans'), axiosClient.get('/billing/invoices')])
      .then(([me, all, inv]) => {
        setData(me.data);
        setPlans(all.data.plans);
        setInvoices(inv.data.invoices);
      })
      .catch((err) => pushError(err.response?.data?.message || 'Gagal memuat data langganan.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function handleSubmitRequest(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await axiosClient.post('/billing/upgrade-requests', { requestedPlan: picked.id, billingCycle: cycle, note: note.trim() || undefined });
      pushSuccess('Permintaan upgrade terkirim. Admin kami akan memverifikasi transfer Anda.');
      setPicked(null);
      setNote('');
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengajukan upgrade.');
    } finally {
      setSubmitting(false);
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
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-warning-200 bg-warning-50 px-4 py-3.5">
            <i className="fas fa-clock mt-0.5 text-warning-500 shrink-0" aria-hidden="true" />
            <p className="text-sm text-warning-800 leading-relaxed">
              Permintaan upgrade ke paket <strong>{plans.find((p) => p.id === data.pendingRequest.requestedPlan)?.name || data.pendingRequest.requestedPlan}</strong>
              {' '}({data.pendingRequest.billingCycle === 'yearly' ? 'tahunan' : 'bulanan'}) sedang menunggu verifikasi admin kami.
              {' '}Harga yang akan ditagihkan sudah dikunci di <strong>{rupiah(data.pendingRequest.price)}</strong> —
              tidak berubah walau harga paket ini diubah sebelum disetujui.
            </p>
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
          description="Ajukan upgrade kapan saja — aktif setelah transfer diverifikasi admin kami."
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
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {picked && (
        <Modal
          title={`Ajukan Upgrade ke ${picked.name}`}
          description={
            picked.price === 0 ? (
              'Paket gratis — tidak perlu transfer.'
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
              <Button size="sm" onClick={handleSubmitRequest} loading={submitting}>
                {submitting ? 'Mengirim…' : 'Ajukan Upgrade'}
              </Button>
            </>
          }
        >
          <form onSubmit={handleSubmitRequest} className="space-y-4">
            {picked.price > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-500 mb-1.5">Siklus Tagihan</p>
                <SegmentedControl options={CYCLE_OPTIONS} value={cycle} onChange={setCycle} size="sm" />
              </div>
            )}
            {picked.price > 0 && data.transferInfo && (
              <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50 px-4 py-3.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-500 mb-1.5">Cara Pembayaran</p>
                <p className="text-[13px] text-ink-700 leading-relaxed">{data.transferInfo}</p>
              </div>
            )}
            <TextareaField
              label="Catatan (opsional)"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Mis. nomor referensi transfer, atau pertanyaan lain."
            />
            <FormError>{error}</FormError>
          </form>
        </Modal>
      )}
    </>
  );
}
