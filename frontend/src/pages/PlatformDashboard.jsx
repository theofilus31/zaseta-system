import React, { useEffect, useState } from 'react';
import PlatformLayout from '../components/PlatformLayout.jsx';
import axiosClient from '../api/axiosClient.js';
import { useNotification } from '../context/NotificationContext.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { SegmentedControl } from '../components/ui/Button.jsx';
import GrowthChart from '../components/ui/GrowthChart.jsx';

/**
 * ============================================================================
 *  DASHBOARD — KHUSUS ADMIN PLATFORM (Fase 5 SaaS)
 * ============================================================================
 *  Menggantikan PlatformOverview.jsx (skop lebih luas dari sekadar
 *  "ringkasan"). Sumber datanya tetap GET /api/platform/stats — lihat
 *  platformController.getStats untuk breakdown mana angka yang benar-benar
 *  realtime ("Aktif Sekarang" — proxy dari audit_logs 5 menit terakhir, TIDAK
 *  ikut terpengaruh filter rentang) vs yang kumulatif sepanjang `days`.
 *
 *  Polling 30 detik (bukan websocket — lihat catatan di getStats) supaya
 *  panel ini terasa hidup tanpa infra realtime baru. Gagal poll di LATAR
 *  (bukan pemuatan pertama) sengaja senyap — data terakhir yang berhasil
 *  tetap tampil, tidak perlu ganggu admin dengan toast tiap 30 detik kalau
 *  jaringan sempat putus sebentar.
 * ============================================================================
 */

const angka = (v) => Number(v).toLocaleString('id-ID');
const rupiah = (v) => `Rp ${Number(v).toLocaleString('id-ID')}`;

/* Ikon 4 StatCard di bawah — pola sama seperti Dashboard.jsx tenant
   (IconBox/IconWallet/dst.): svg inline dengan style stroke bersama, bukan
   ikon Font Awesome, supaya konsisten dengan kartu KPI tenant yang jadi
   acuan (lihat catatan desain sebelumnya: StatCard di sini sempat polos
   tanpa ikon, beda dari tenant). */
const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
const IconUsers = (p) => <svg {...p} viewBox="0 0 24 24" {...s}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
const IconBuilding = (p) => <svg {...p} viewBox="0 0 24 24" {...s}><rect x="4" y="2" width="16" height="20" rx="1" /><path d="M9 22v-4h6v4M9 6h.01M9 10h.01M9 14h.01M15 6h.01M15 10h.01M15 14h.01" /></svg>;
const IconPulse = (p) => <svg {...p} viewBox="0 0 24 24" {...s}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>;
const IconWallet = (p) => <svg {...p} viewBox="0 0 24 24" {...s}><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" /><circle cx="16" cy="13" r="1.5" /></svg>;

const PLAN_LABELS = {
  free: 'Free',
  starter: 'Starter',
  business: 'Business',
  enterprise: 'Enterprise',
  enterprise_custom: 'Enterprise Custom',
};

const RANGE_OPTIONS = [
  { value: 7, label: '7 Hari' },
  { value: 30, label: '30 Hari' },
  { value: 90, label: '90 Hari' },
];

const ACTION_META = {
  login: { text: 'masuk ke sistem', dot: 'bg-info-500' },
  logout: { text: 'keluar dari sistem', dot: 'bg-ink-400' },
  create: { text: 'menambahkan data', dot: 'bg-brand-500' },
  update: { text: 'memperbarui data', dot: 'bg-warning-500' },
  delete: { text: 'menghapus data', dot: 'bg-danger-500' },
  scan: { text: 'memindai kode QR', dot: 'bg-accent-500' },
  export: { text: 'mengekspor data', dot: 'bg-ink-400' },
};

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}

export default function PlatformDashboard() {
  const { pushError } = useNotification();
  const [stats, setStats] = useState(null);
  const [range, setRange] = useState(30);
  const [lastFetched, setLastFetched] = useState(null);

  function load(days, { silent = false } = {}) {
    axiosClient.get('/platform/stats', { params: { days } })
      .then((res) => {
        setStats(res.data);
        setLastFetched(new Date());
      })
      .catch((err) => {
        if (!silent) pushError(err.response?.data?.message || 'Gagal memuat data dashboard.');
      });
  }

  useEffect(() => { load(range); }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const interval = setInterval(() => load(range, { silent: true }), 30_000);
    return () => clearInterval(interval);
  }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

  const liveLabel = lastFetched
    ? `Diperbarui pukul ${lastFetched.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
    : undefined;

  return (
    <PlatformLayout title="Dashboard" liveLabel={liveLabel}>
      <PageHeader
        eyebrow="Admin Platform"
        title="Dashboard"
        description="Ringkasan lintas seluruh tenant — login pengguna, langganan, dan aktivitas realtime."
        actions={<SegmentedControl options={RANGE_OPTIONS} value={range} onChange={setRange} />}
      />

      {!stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
        </div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <StatCard
              label="Pengguna Sudah Login"
              value={angka(stats.usersLoggedIn)}
              icon={IconUsers}
              tone="info"
              hint={`dari ${angka(stats.totalUsers)} total pengguna · ${
                stats.totalUsers > 0 ? ((stats.usersLoggedIn / stats.totalUsers) * 100).toFixed(1).replace('.', ',') : 0
              }%`}
            />
            <StatCard
              label="Tenant Berlangganan"
              value={angka(stats.tenantsSubscribed)}
              icon={IconBuilding}
              tone="brand"
              hint={`dari ${angka(stats.tenants.total)} tenant terdaftar · ${
                stats.tenants.total > 0 ? Math.round((stats.tenantsSubscribed / stats.tenants.total) * 100) : 0
              }% konversi`}
            />
            <StatCard
              label="Aktif Sekarang"
              value={angka(stats.activeNow.users)}
              icon={IconPulse}
              tone="warning"
              hint={`5 menit terakhir · ${angka(stats.activeNow.tenants)} tenant`}
            />
            <StatCard
              label="Perkiraan MRR"
              value={rupiah(stats.estimatedMrr)}
              icon={IconWallet}
              tone="accent"
              hint="Dari paket berbayar aktif — perkiraan katalog"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            <GrowthChart
              title="Pertumbuhan Pengguna"
              subtitle={`Total pengguna yang pernah login, kumulatif ${range} hari terakhir`}
              data={stats.userGrowth}
              color="#2f6fa8"
              tintClass="bg-info-50 text-info-600"
              unitLabel="pengguna"
            />
            <GrowthChart
              title="Pertumbuhan Tenant Berlangganan"
              subtitle={`Dari riwayat pengajuan upgrade yang disetujui, ${range} hari terakhir`}
              data={stats.subscriberGrowth}
              color="#2f9c4f"
              tintClass="bg-brand-50 text-brand-600"
              unitLabel="tenant"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-4">
            <Card>
              <CardHeader
                title="Aktivitas Realtime"
                action={
                  <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-brand-600 bg-brand-50 rounded-full pl-2 pr-2.5 py-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-live-pulse" aria-hidden="true" />
                    Live
                  </span>
                }
              />
              {stats.recentActivity.length === 0 && (
                <p className="text-sm text-ink-400 text-center py-6">Belum ada aktivitas tercatat.</p>
              )}
              <div className="divide-y divide-ink-100">
                {stats.recentActivity.map((a) => {
                  const meta = ACTION_META[a.action] || { text: a.action, dot: 'bg-ink-400' };
                  return (
                    <div key={a.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className="h-8 w-8 shrink-0 rounded-full bg-ink-100 text-ink-600 text-[11px] font-bold flex items-center justify-center">
                        {(a.userName || '?')[0]?.toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] text-ink-700 truncate">
                          <span className="font-bold text-ink-900">{a.userName || 'Pengguna terhapus'}</span> {meta.text}
                        </p>
                        <p className="text-[11px] text-ink-400 truncate">{a.tenantName}</p>
                      </div>
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${meta.dot}`} aria-hidden="true" />
                      <span className="text-[11px] text-ink-400 whitespace-nowrap shrink-0">{timeAgo(a.createdAt)}</span>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <CardHeader title="Distribusi Paket" description="Jumlah tenant pada tiap paket langganan." />
              <div className="space-y-3.5">
                {Object.entries(PLAN_LABELS).map(([id, label]) => {
                  const count = stats.planCounts[id] || 0;
                  const pct = stats.tenants.total ? (count / stats.tenants.total) * 100 : 0;
                  return (
                    <div key={id}>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[13px] font-medium text-ink-700">{label}</p>
                        <p className="text-xs text-ink-400 tabular-nums">{angka(count)} tenant</p>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill bg-brand-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </>
      )}
    </PlatformLayout>
  );
}
