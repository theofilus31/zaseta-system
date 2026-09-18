import React, { useEffect, useState } from 'react';
import { format, isValid, parse } from 'date-fns';
import PlatformLayout from '../components/PlatformLayout.jsx';
import axiosClient from '../api/axiosClient.js';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pagination from '../components/ui/Pagination.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { Badge } from '../components/ui/StatusBadge.jsx';
import { SkeletonRows } from '../components/ui/Skeleton.jsx';
import { SearchInput, SearchableSelect } from '../components/ui/Form.jsx';
import { DateRangePicker } from '../components/ui/date-picker/DateRangePicker.jsx';

/**
 * ============================================================================
 *  LOG AUDIT PLATFORM — KHUSUS ADMIN PLATFORM (Fase 5 SaaS)
 * ============================================================================
 *  Versi LINTAS TENANT dari AuditLogPage.jsx (Riwayat Aktivitas per-tenant) —
 *  sumber datanya sama (tabel audit_logs), tapi tanpa filter tenant_id, lihat
 *  platformController.listAllAuditLogs. Sengaja versi yang lebih ringkas:
 *  tanpa filter Jenis Data/Pengguna dinamis (itu butuh endpoint /filters
 *  tersendiri per tenant, tidak relevan lintas ribuan tenant sekaligus) dan
 *  panel rincian sebelum/sesudah menampilkan nilai apa adanya, tanpa kamus
 *  terjemahan field seperti versi tenant — memadai untuk audit lintas tenant
 *  yang memang dibaca staf teknis, bukan pengguna awam satu tenant.
 * ============================================================================
 */

const ACTION_LABEL = {
  create: 'Menambahkan', update: 'Memperbarui', delete: 'Menghapus',
  login: 'Masuk', logout: 'Keluar', scan: 'Memindai', export: 'Mengekspor',
};

const ACTION_STYLE = {
  create: { tone: 'brand', icon: 'fa-plus' },
  update: { tone: 'info', icon: 'fa-pen' },
  delete: { tone: 'danger', icon: 'fa-trash-can' },
  scan: { tone: 'accent', icon: 'fa-qrcode' },
  login: { tone: 'neutral', icon: 'fa-right-to-bracket' },
  logout: { tone: 'neutral', icon: 'fa-right-from-bracket' },
  export: { tone: 'warning', icon: 'fa-file-export' },
};

const ACTION_OPTIONS = Object.entries(ACTION_LABEL).map(([key, label]) => ({ key, label }));

function ChangeDetail({ oldValues, newValues }) {
  if (!oldValues && !newValues) {
    return <p className="text-xs text-ink-400">Tidak ada rincian perubahan yang tercatat.</p>;
  }

  const keys = [...new Set([...Object.keys(oldValues || {}), ...Object.keys(newValues || {})])];
  const isCreate = !oldValues;
  const changed = keys.filter((k) => (
    isCreate
      ? newValues[k] !== null && newValues[k] !== undefined && newValues[k] !== ''
      : JSON.stringify(oldValues?.[k]) !== JSON.stringify(newValues?.[k])
  ));

  if (changed.length === 0) {
    return <p className="text-xs text-ink-400">Tidak ada nilai yang berubah.</p>;
  }

  const fmt = (v) => {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'Ya' : 'Tidak';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  return (
    <div className="overflow-x-auto scrollbar-slim">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-ink-400">
            <th className="pb-1.5 pr-4 font-medium">Kolom</th>
            {!isCreate && <th className="pb-1.5 pr-4 font-medium">Sebelum</th>}
            <th className="pb-1.5 font-medium">{isCreate ? 'Nilai' : 'Sesudah'}</th>
          </tr>
        </thead>
        <tbody>
          {changed.map((k) => (
            <tr key={k} className="align-top">
              <td className="py-1 pr-4 text-ink-500 whitespace-nowrap">{k}</td>
              {!isCreate && (
                <td className="py-1 pr-4 text-ink-400 line-through break-all max-w-[16rem]">{fmt(oldValues?.[k])}</td>
              )}
              <td className="py-1 text-ink-800 font-medium break-all max-w-[16rem]">{fmt(newValues?.[k])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogRow({ log }) {
  const [open, setOpen] = useState(false);
  const style = ACTION_STYLE[log.action] || { tone: 'neutral', icon: 'fa-circle-dot' };
  const hasDetail = Boolean(log.oldValues || log.newValues);

  return (
    <>
      <tr className={open ? 'is-selected' : ''}>
        <td className="whitespace-nowrap text-[13px] text-ink-500 tabular-nums">
          {new Date(log.createdAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </td>
        <td className="text-[13px] text-ink-700 max-w-[180px] truncate">{log.tenantName}</td>
        <td>
          {log.userName ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-info-500 to-brand-500 text-white text-[10px] font-semibold" aria-hidden="true">
                {log.userName[0]?.toUpperCase()}
              </span>
              <span className="text-[13px] font-medium text-ink-800 truncate">{log.userName}</span>
            </div>
          ) : (
            <span className="text-[13px] text-ink-400">Anonim / publik</span>
          )}
        </td>
        <td>
          <Badge tone={style.tone} size="sm">
            <i className={`fas ${style.icon} text-[9px] mr-1.5`} aria-hidden="true" />
            {ACTION_LABEL[log.action] || log.action}
          </Badge>
        </td>
        <td className="text-[13px] text-ink-600">
          {log.entityType}{log.entityId ? <span className="font-mono text-ink-400"> #{log.entityId}</span> : null}
        </td>
        <td className="text-right">
          {hasDetail && (
            <button
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
              title={open ? 'Sembunyikan rincian' : 'Lihat rincian perubahan'}
            >
              <i className={`fas fa-chevron-down text-[11px] transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
          )}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="bg-ink-50/70 !py-4">
            <ChangeDetail oldValues={log.oldValues} newValues={log.newValues} />
          </td>
        </tr>
      )}
    </>
  );
}

export default function PlatformAuditLog() {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setLoading(true);
    axiosClient.get('/platform/audit-log', { params: { search, action, dateFrom, dateTo, page, limit: 25 } })
      .then((res) => { setLogs(res.data.logs); setPagination(res.data.pagination); })
      .finally(() => setLoading(false));
  }, [search, action, dateFrom, dateTo, page]);

  function update(setter) {
    return (value) => { setter(value); setPage(1); };
  }

  const isoToDate = (s) => { const d = parse(s, 'yyyy-MM-dd', new Date()); return s && isValid(d) ? d : undefined; };
  const dateRange = { from: isoToDate(dateFrom), to: isoToDate(dateTo) };
  function handleDateRangeChange(range) {
    setDateFrom(range?.from ? format(range.from, 'yyyy-MM-dd') : '');
    setDateTo(range?.to ? format(range.to, 'yyyy-MM-dd') : '');
    setPage(1);
  }

  const activeCount = [action, dateFrom, dateTo].filter(Boolean).length;
  function clearAll() {
    setAction(''); setDateFrom(''); setDateTo(''); setSearch(''); setPage(1);
  }

  return (
    <PlatformLayout title="Log Audit Platform" width="full">
      <PageHeader
        eyebrow="Admin Platform"
        title="Log Audit Platform"
        description="Jejak seluruh perubahan data di SEMUA tenant — siapa melakukan apa, di perusahaan mana, kapan."
      />

      <div className="mb-4 rounded-2xl border border-ink-200/70 bg-white shadow-card">
        <div className="flex flex-col sm:flex-row gap-2.5 p-3">
          <SearchInput
            value={search}
            onChange={(e) => update(setSearch)(e.target.value)}
            placeholder="Cari nama pelaku atau nama perusahaan…"
            aria-label="Cari riwayat"
            containerClassName="flex-1 min-w-0"
          />
          <SearchableSelect
            value={action} onChange={update(setAction)}
            options={ACTION_OPTIONS}
            getOptionLabel={(o) => o.label} getOptionValue={(o) => o.key}
            placeholder="Semua Aksi" emptyLabel="Semua Aksi"
            aria-label="Filter aksi"
            sunken className="sm:w-44" inputClassName="!py-2.5 !text-[13px]"
          />
          <Button
            variant={expanded || activeCount > 0 ? 'subtle' : 'secondary'}
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="shrink-0 justify-center"
          >
            <i className="fas fa-sliders text-xs" aria-hidden="true" />
            Filter
            {activeCount > 0 && (
              <span className="ml-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white tabular-nums">
                {activeCount}
              </span>
            )}
          </Button>
        </div>

        {expanded && (
          <div className="border-t border-ink-200/70 bg-ink-50/60 px-3 py-3.5 animate-slide-down">
            <div className="max-w-xs">
              <label className="label">Rentang Tanggal</label>
              <DateRangePicker value={dateRange} onChange={handleDateRangeChange} className="h-[38px] text-[13px]" />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-200/70 bg-white px-4 py-2.5">
          <p className="text-xs text-ink-500">
            <span className="font-semibold text-ink-700 tabular-nums">{pagination.total}</span> catatan
            {activeCount > 0 && <span className="text-ink-400"> (terfilter)</span>}
          </p>
          {(activeCount > 0 || search) && (
            <Button variant="ghost" size="xs" onClick={clearAll} className="ml-auto">
              <i className="fas fa-xmark text-[10px]" aria-hidden="true" /> Bersihkan
            </Button>
          )}
        </div>
      </div>

      <Card padded={false} className="overflow-hidden">
        <CardHeader title="Catatan Aktivitas" description="Klik tanda panah di kanan untuk melihat rincian perubahan." bordered />
        <div className="overflow-x-auto scrollbar-slim">
          {loading ? (
            <SkeletonRows rows={10} cols={6} />
          ) : logs.length === 0 ? (
            <EmptyState icon="fa-clock-rotate-left" title="Tidak ada catatan yang cocok" description="Coba longgarkan filter atau perlebar rentang tanggalnya." />
          ) : (
            <table className="table-base min-w-[900px]">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Tenant</th>
                  <th>Pelaku</th>
                  <th>Aksi</th>
                  <th>Data</th>
                  <th className="w-12 !text-right"><span className="sr-only">Rincian</span></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => <LogRow key={log.id} log={log} />)}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <Pagination page={page} totalPages={pagination.totalPages} totalItems={pagination.total} onChange={setPage} />
    </PlatformLayout>
  );
}
