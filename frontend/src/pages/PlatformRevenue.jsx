import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PlatformLayout from '../components/PlatformLayout.jsx';
import axiosClient from '../api/axiosClient.js';
import { useNotification } from '../context/NotificationContext.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { SegmentedControl } from '../components/ui/Button.jsx';
import { Badge } from '../components/ui/StatusBadge.jsx';
import LineChartCard from '../components/ui/sc-line-chart.tsx';
import { ICON_STROKE, IconWallet, IconBuilding } from '../components/ui/icons.jsx';

/**
 * ============================================================================
 *  LANGGANAN & PENDAPATAN — KHUSUS ADMIN PLATFORM (Fase 5 SaaS)
 * ============================================================================
 *  Sumber data: GET /api/platform/revenue (platformController.getRevenue).
 *  Dua jenis angka yang SENGAJA dibedakan, jangan disamakan:
 *    - `estimatedMrr`/`planBreakdown`/`arpu` — PROYEKSI dari katalog (harga x
 *      jumlah tenant aktif SEKARANG di paket itu). Bisa berubah besok kalau
 *      ada yang upgrade/downgrade/berhenti.
 *    - `revenueAllTime`/`revenueGrowth` — REALISASI, dari tabel `invoices`
 *      yang sungguhan tercatat saat admin menyetujui upgrade.
 *  Riwayat konversi LENGKAP (dengan aksi setuju/tolak) ada di halaman
 *  Permintaan Upgrade — di sini cuma pratinjau 6 terbaru + tautan ke sana,
 *  supaya tidak ada dua tempat yang mengelola hal yang sama.
 * ============================================================================
 */

const angka = (v) => Number(v).toLocaleString('id-ID');
const rupiah = (v) => `Rp ${Math.round(Number(v)).toLocaleString('id-ID')}`;

/** Format ringkas untuk sumbu-Y & Tertinggi/Terendah di LineChartCard -- lihat catatan di sc-line-chart.tsx. */
function rupiahRingkas(v) {
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, '')} M`;
  if (abs >= 1_000_000) return `${sign}Rp ${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')} jt`;
  if (abs >= 1_000) return `${sign}Rp ${Math.round(abs / 1_000)} rb`;
  return `${sign}Rp ${abs}`;
}

const IconCoins = (p) => <svg {...p} viewBox="0 0 24 24" {...ICON_STROKE}><circle cx="9" cy="9" r="6" /><path d="M14.5 9.5a6 6 0 1 0-6 6" /><circle cx="15" cy="15" r="6" /></svg>;
const IconTrend = (p) => <svg {...p} viewBox="0 0 24 24" {...ICON_STROKE}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>;

const RANGE_OPTIONS = [
  { value: 7, label: '7 Hari' },
  { value: 30, label: '30 Hari' },
  { value: 90, label: '90 Hari' },
];

const STATUS_TONE = { approved: 'brand', rejected: 'danger' };
const STATUS_LABEL = { approved: 'Disetujui', rejected: 'Ditolak' };

export default function PlatformRevenue() {
  const { pushError } = useNotification();
  const [data, setData] = useState(null);
  const [range, setRange] = useState(30);

  useEffect(() => {
    axiosClient.get('/platform/revenue', { params: { days: range } })
      .then((res) => setData(res.data))
      .catch((err) => pushError(err.response?.data?.message || 'Gagal memuat data pendapatan.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const maxMrr = data ? Math.max(...data.planBreakdown.map((p) => p.mrr), 1) : 1;

  return (
    <PlatformLayout title="Langganan & Pendapatan">
      <PageHeader
        eyebrow="Admin Platform"
        title="Langganan & Pendapatan"
        description="Perkiraan MRR dari katalog paket, pendapatan riil dari invoice, dan distribusi tenant berbayar."
        actions={<SegmentedControl options={RANGE_OPTIONS} value={range} onChange={setRange} />}
      />

      {!data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <StatCard
              label="Perkiraan MRR"
              value={rupiah(data.estimatedMrr)}
              icon={IconWallet}
              tone="accent"
              hint="Dari paket berbayar aktif — proyeksi katalog"
            />
            <StatCard
              label="Pendapatan Terkumpul"
              value={rupiah(data.revenueAllTime)}
              icon={IconCoins}
              tone="brand"
              hint="Sepanjang waktu, dari invoice berstatus lunas"
            />
            <StatCard
              label="Tenant Berbayar"
              value={angka(data.payingTenants)}
              icon={IconBuilding}
              tone="info"
              hint="Paket selain Free"
            />
            <StatCard
              label="ARPU"
              value={rupiah(data.arpu)}
              icon={IconTrend}
              tone="warning"
              hint="Rata-rata pendapatan per tenant berbayar"
            />
          </div>

          {/* Chart + Distribusi Paket berdampingan (rasio 1.7fr/1fr, sama
              persis pola PlatformDashboard.jsx) supaya lebarnya wajar dan
              ruang di sampingnya terisi konten sungguhan, bukan kosong.

              Dipakai LineChartCard (recharts/shadcn, lihat sc-line-chart.tsx)
              -- komponen generik yang sama dipakai juga oleh
              PlatformDashboard.jsx untuk pertumbuhan pengguna/tenant. */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-4 mb-5">
            <LineChartCard
              data={data.revenueGrowth}
              headerLabel="Pendapatan Terkumpul"
              headerValue={data.revenueAllTime}
              rangeLabel={`${range} hari terakhir`}
              color="#2f9c4f"
              formatFull={rupiah}
              formatAxis={rupiahRingkas}
            />

            <Card>
              <CardHeader title="Distribusi Paket" description="Jumlah tenant dan perkiraan MRR per paket berbayar." />
              {data.planBreakdown.length === 0 && (
                <p className="text-sm text-ink-400 text-center py-6">Belum ada tenant berlangganan paket berbayar.</p>
              )}
              <div className="space-y-3.5">
                {data.planBreakdown.map((p) => (
                  <div key={p.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[13px] font-medium text-ink-700">{p.name}</p>
                      <p className="text-xs text-ink-400 tabular-nums">{angka(p.tenantCount)} tenant · {rupiah(p.mrr)}</p>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill bg-brand-500" style={{ width: `${(p.mrr / maxMrr) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Konversi Terbaru" description="Enam pengajuan upgrade terakhir yang sudah diputuskan." />
            {data.recentConversions.length === 0 && (
              <p className="text-sm text-ink-400 text-center py-6">Belum ada permintaan upgrade yang diputuskan.</p>
            )}
            <div className="divide-y divide-ink-100">
              {data.recentConversions.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-ink-800 truncate">{c.tenantName}</p>
                    <p className="text-[11.5px] text-ink-400 truncate">
                      {c.previousPlan || '—'} <i className="fas fa-arrow-right mx-1 text-[9px]" aria-hidden="true" /> {c.requestedPlan}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[c.status]} size="sm" className="shrink-0">{STATUS_LABEL[c.status]}</Badge>
                </div>
              ))}
            </div>
            <Link
              to="/platform/billing-requests"
              className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-600 hover:text-brand-700"
            >
              Lihat semua riwayat permintaan
              <i className="fas fa-arrow-right text-[10px]" aria-hidden="true" />
            </Link>
          </Card>
        </>
      )}
    </PlatformLayout>
  );
}
