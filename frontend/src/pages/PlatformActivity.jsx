import React, { useEffect, useState } from 'react';
import PlatformLayout from '../components/PlatformLayout.jsx';
import axiosClient from '../api/axiosClient.js';
import { useNotification } from '../context/NotificationContext.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Card from '../components/ui/Card.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { SearchableSelect } from '../components/ui/Form.jsx';

/**
 * ============================================================================
 *  AKTIVITAS REALTIME — KHUSUS ADMIN PLATFORM (Fase 5 SaaS)
 * ============================================================================
 *  Versi PENUH + BISA DIFILTER dari kartu "Aktivitas Realtime" di Dashboard
 *  (yang cuma menampilkan 8 baris terakhir tanpa filter). Sumber data: GET
 *  /api/platform/activity (platformController.getActivity) — endpoint RINGAN
 *  yang sengaja TIDAK menyertakan oldValues/newValues seperti Log Audit
 *  Platform, supaya aman dipoll tiap beberapa detik. Untuk detail before/after
 *  satu perubahan, buka Log Audit Platform, bukan halaman ini.
 * ============================================================================
 */

const ACTION_META = {
  login: { text: 'masuk ke sistem', dot: 'bg-info-500' },
  logout: { text: 'keluar dari sistem', dot: 'bg-ink-400' },
  create: { text: 'menambahkan data', dot: 'bg-brand-500' },
  update: { text: 'memperbarui data', dot: 'bg-warning-500' },
  delete: { text: 'menghapus data', dot: 'bg-danger-500' },
  scan: { text: 'memindai kode QR', dot: 'bg-accent-500' },
  export: { text: 'mengekspor data', dot: 'bg-ink-400' },
};

const ACTION_OPTIONS = Object.keys(ACTION_META).map((key) => ({ key, label: ACTION_META[key].text }));

const POLL_MS = 15_000;

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}

export default function PlatformActivity() {
  const { pushError } = useNotification();
  const [logs, setLogs] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [action, setAction] = useState(null);
  const [tenantId, setTenantId] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);

  useEffect(() => {
    axiosClient.get('/platform/tenants')
      .then((res) => setTenants(res.data.tenants.map((t) => ({ key: String(t.id), label: t.companyName }))))
      .catch(() => {}); // dropdown tenant opsional -- kegagalan di sini tidak boleh menghalangi feed utamanya
  }, []);

  function load({ silent = false } = {}) {
    axiosClient.get('/platform/activity', { params: { action: action || undefined, tenantId: tenantId || undefined } })
      .then((res) => {
        setLogs(res.data.logs);
        setLastFetched(new Date());
      })
      .catch((err) => {
        if (!silent) pushError(err.response?.data?.message || 'Gagal memuat aktivitas.');
      });
  }

  useEffect(() => { load(); }, [action, tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const interval = setInterval(() => load({ silent: true }), POLL_MS);
    return () => clearInterval(interval);
  }, [action, tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const liveLabel = lastFetched
    ? `Diperbarui pukul ${lastFetched.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
    : undefined;

  return (
    <PlatformLayout title="Aktivitas Realtime" liveLabel={liveLabel}>
      <PageHeader
        eyebrow="Admin Platform"
        title="Aktivitas Realtime"
        description="Feed aktivitas lintas seluruh tenant, diperbarui otomatis tiap 15 detik."
        actions={
          <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-brand-600 bg-brand-50 rounded-full pl-2 pr-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-live-pulse" aria-hidden="true" />
            Live
          </span>
        }
      />

      <div className="mb-4 flex flex-col sm:flex-row gap-2.5">
        <SearchableSelect
          value={action} onChange={setAction}
          options={ACTION_OPTIONS}
          getOptionLabel={(o) => o.label} getOptionValue={(o) => o.key}
          placeholder="Semua Aksi" emptyLabel="Semua Aksi"
          aria-label="Filter aksi"
          sunken className="sm:w-56" inputClassName="!py-2.5 !text-[13px]"
        />
        <SearchableSelect
          value={tenantId} onChange={setTenantId}
          options={tenants}
          getOptionLabel={(o) => o.label} getOptionValue={(o) => o.key}
          placeholder="Semua Tenant" emptyLabel="Semua Tenant"
          aria-label="Filter tenant"
          sunken className="sm:w-64" inputClassName="!py-2.5 !text-[13px]"
        />
      </div>

      {!logs && (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      )}

      {logs && logs.length === 0 && (
        <Card>
          <EmptyState icon="fa-tower-broadcast" title="Belum ada aktivitas" description="Aktivitas yang cocok dengan filter ini akan muncul di sini." />
        </Card>
      )}

      {logs && logs.length > 0 && (
        <Card>
          <div className="divide-y divide-ink-100">
            {logs.map((a) => {
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
          <p className="mt-3 text-center text-[11.5px] text-ink-300">Menampilkan maksimal 100 aktivitas terbaru sesuai filter.</p>
        </Card>
      )}
    </PlatformLayout>
  );
}
