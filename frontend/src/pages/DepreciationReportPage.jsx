import React, { useCallback, useEffect, useState } from 'react';
import axiosClient from '../api/axiosClient.js';
import { useNotification } from '../context/NotificationContext.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import { Skeleton, SkeletonRows } from '../components/ui/Skeleton.jsx';
import { SearchableSelect, DateField } from '../components/ui/Form.jsx';
import { todayLocal as today } from '../utils/dateLocal.js';
import { rupiahRingkas, rupiahPenuh } from '../utils/currency.js';

/**
 * ============================================================================
 *  LAPORAN PENYUSUTAN PER PERIODE / DEPARTEMEN
 * ============================================================================
 *  Dasbor menjawab "berapa nilai buku aset HARI INI"; halaman ini menjawab
 *  "berapa nilai buku aset per TANGGAL TERTENTU, dipecah per departemen" —
 *  yang biasanya ditanyakan finance/auditor untuk laporan berkala, bukan
 *  angka hari ini.
 * ============================================================================
 */


export default function DepreciationReportPage() {
  const { pushError } = useNotification();

  const [asOfDate, setAsOfDate] = useState(today());
  const [departmentId, setDepartmentId] = useState('');
  const [departments, setDepartments] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    axiosClient.get('/departments').then((res) => setDepartments(res.data)).catch(() => {});
  }, []);

  const muat = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosClient.get('/reports/depreciation', { params: { asOfDate, departmentId: departmentId || undefined } });
      setReport(res.data);
    } catch {
      pushError('Gagal memuat laporan penyusutan.');
    } finally {
      setLoading(false);
    }
  }, [asOfDate, departmentId, pushError]);

  useEffect(() => { muat(); }, [muat]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await axiosClient.get('/reports/depreciation/export', {
        params: { asOfDate, departmentId: departmentId || undefined },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `penyusutan-${asOfDate}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      pushError('Gagal mengekspor laporan.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Laporan Penyusutan"
        description="Nilai buku aset per tanggal tertentu, dipecah per departemen."
        actions={
          <Button variant="secondary" onClick={handleExport} loading={exporting}>
            <i className="fas fa-file-csv text-xs" aria-hidden="true" /> Ekspor Rincian CSV
          </Button>
        }
      />

      <Card className="mb-5">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1 sm:max-w-[220px]">
            <DateField label="Per Tanggal" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          </div>
          <div className="flex-1 sm:max-w-[280px]">
            <SearchableSelect
              label="Departemen" value={departmentId} onChange={setDepartmentId}
              options={departments} getOptionLabel={(d) => `${d.code} — ${d.name}`}
              placeholder="Cari departemen…" emptyLabel="Semua departemen"
            />
          </div>
          <p className="text-xs text-ink-400 pb-2.5 sm:pb-0">
            Aset yang dibeli setelah tanggal ini, atau sudah dilepas sebelum tanggal ini, tidak ikut dihitung.
          </p>
        </div>
      </Card>

      {loading ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-5">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
          <Card><SkeletonRows rows={5} cols={4} /></Card>
        </>
      ) : !report ? null : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-5">
            <StatCard label="Jumlah Aset" value={report.summary.assetCount} tone="neutral" />
            <StatCard
              label="Nilai Perolehan" tone="info"
              value={<span title={rupiahPenuh(report.summary.acquisitionValue)}>{rupiahRingkas(report.summary.acquisitionValue)}</span>}
            />
            <StatCard
              label="Akumulasi Penyusutan" tone="warning"
              value={<span title={rupiahPenuh(report.summary.accumulatedDepreciation)}>{rupiahRingkas(report.summary.accumulatedDepreciation)}</span>}
            />
            <StatCard
              label="Nilai Buku" tone="brand"
              value={<span title={rupiahPenuh(report.summary.bookValue)}>{rupiahRingkas(report.summary.bookValue)}</span>}
              hint={`Per ${new Date(report.asOfDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`}
            />
          </div>

          <Card padded={false} className="overflow-hidden">
            <CardHeader title="Rincian per Departemen" bordered />

            {report.byDepartment.length === 0 ? (
              <EmptyState
                icon="fa-chart-line"
                title="Tidak ada aset pada tanggal ini"
                description="Coba ubah tanggal atau saringan departemen."
              />
            ) : (
              <div className="overflow-x-auto scrollbar-slim">
                <table className="table-base min-w-[640px]">
                  <thead>
                    <tr>
                      <th>Departemen</th>
                      <th>Jumlah Aset</th>
                      <th>Nilai Perolehan</th>
                      <th>Akumulasi Penyusutan</th>
                      <th>Nilai Buku</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byDepartment.map((g) => (
                      <tr key={g.departmentId ?? 'none'}>
                        <td>
                          <p className="font-medium text-ink-800">{g.departmentName}</p>
                          {g.departmentCode && <p className="text-[11px] text-ink-400 font-mono">{g.departmentCode}</p>}
                        </td>
                        <td className="tabular-nums">{g.assetCount}</td>
                        <td className="tabular-nums text-ink-600">{rupiahPenuh(g.acquisitionValue)}</td>
                        <td className="tabular-nums text-warning-700">{rupiahPenuh(g.accumulatedDepreciation)}</td>
                        <td className="tabular-nums font-semibold text-ink-900">{rupiahPenuh(g.bookValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {/* .table-base cuma menata thead & tbody — tfoot butuh
                        padding/warnanya sendiri di sini, kalau tidak selnya
                        tampil mepet tanpa jarak sama sekali dibanding baris
                        lain. Latar & garis tebal sekaligus menegaskan ini
                        baris jumlah, bukan baris data biasa. */}
                    <tr className="bg-ink-50 border-t-2 border-ink-200 font-semibold">
                      <td className="px-4 py-3.5 text-ink-800">Total</td>
                      <td className="px-4 py-3.5 tabular-nums text-ink-800">{report.summary.assetCount}</td>
                      <td className="px-4 py-3.5 tabular-nums text-ink-700">{rupiahPenuh(report.summary.acquisitionValue)}</td>
                      <td className="px-4 py-3.5 tabular-nums text-warning-700">{rupiahPenuh(report.summary.accumulatedDepreciation)}</td>
                      <td className="px-4 py-3.5 tabular-nums text-ink-900">{rupiahPenuh(report.summary.bookValue)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
