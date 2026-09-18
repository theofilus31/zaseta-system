import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axiosClient from '../api/axiosClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useBranding, BrandLogo } from '../context/BrandingContext.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import { useLayoutWidth } from '../context/LayoutWidthContext.jsx';
import Card from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';

/**
 * ============================================================================
 *  CETAK BERITA ACARA SERAH TERIMA (BAST)
 * ============================================================================
 *  Dokumen formal untuk satu peristiwa serah terima — dicetak, ditandatangani
 *  basah oleh kedua pihak, lalu diarsipkan. Ini yang diminta finance/auditor
 *  saat memverifikasi siapa yang sedang bertanggung jawab atas sebuah aset.
 *
 *  `type=serah` mendokumentasikan penyerahan aset ke pemegang; `type=kembali`
 *  mendokumentasikan penerimaan kembali. Nomor dokumennya dibuat di server
 *  pada kunjungan PERTAMA ke halaman ini, lalu disimpan — membuka halaman
 *  yang sama lagi menunjukkan nomor yang persis sama, bukan nomor baru.
 * ============================================================================
 */

const CONDITION_LABEL = { baik: 'Baik', rusak_ringan: 'Rusak Ringan', rusak_berat: 'Rusak Berat' };

const tanggalPanjang = (v) =>
  v ? new Date(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

export default function BastPrintPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type') === 'kembali' ? 'kembali' : 'serah';

  const { user } = useAuth();
  const { pushError } = useNotification();
  const { companyName, appName, tagline } = useBranding();

  const [bast, setBast] = useState(null);
  const [error, setError] = useState('');

  /* Hanya dokumen yang jadi terisi (keadaan sukses) yang butuh panel
     sempit — keadaan galat/memuat tetap lebar bawaan. */
  useLayoutWidth(bast ? 'narrow' : 'default');

  useEffect(() => {
    setBast(null);
    setError('');
    axiosClient.get(`/assignments/${id}/bast`, { params: { type } })
      .then((res) => setBast(res.data))
      .catch((err) => {
        const msg = err.response?.data?.message || 'Gagal memuat berita acara.';
        setError(msg);
        pushError(msg);
      });
  }, [id, type, pushError]);

  if (error) {
    return (
      <>
        <PageHeader backTo={`/assets`} backLabel="Daftar Aset" title="Berita Acara Serah Terima" />
        <Card className="text-center py-10">
          <i className="fas fa-triangle-exclamation text-2xl text-danger-400 mb-3" aria-hidden="true" />
          <p className="text-sm text-ink-600">{error}</p>
        </Card>
      </>
    );
  }

  if (!bast) {
    return (
      <>
        <Skeleton className="h-7 w-64 mb-6" />
        <Card><Skeleton className="h-[600px] w-full" /></Card>
      </>
    );
  }

  const judul = type === 'serah' ? 'BERITA ACARA SERAH TERIMA ASET' : 'BERITA ACARA PENERIMAAN KEMBALI ASET';
  const tanggalDokumen = type === 'serah' ? bast.assignedAt : bast.returnedAt;
  const petugas = type === 'serah' ? (bast.assignedByName || user?.name) : (bast.returnedByName || user?.name);

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 1.6cm; }
          body * { visibility: hidden; }
          #bast-print-area, #bast-print-area * { visibility: visible; }
          #bast-print-area {
            position: absolute; top: 0; left: 0; width: 100%;
            margin: 0 !important; box-shadow: none !important; border: none !important;
          }
        }
      `}</style>

      <div className="print-hide">
        <PageHeader
          backTo={`/assets/${bast.assetId ?? ''}`}
          backLabel="Detail Aset"
          eyebrow={bast.docNo}
          title={judul}
          description={`${bast.assetName} · ${bast.assetCode}`}
          actions={
            <Button size="sm" onClick={() => window.print()}>
              <i className="fas fa-print text-xs" aria-hidden="true" /> Cetak
            </Button>
          }
        />
      </div>

      <Card id="bast-print-area" className="print:shadow-none print:border-none">
        {/* Kop surat */}
        <div className="flex items-start justify-between gap-4 border-b-2 border-ink-800 pb-4 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo variant="light" className="h-12 w-12 object-contain shrink-0" fallbackClassName="h-12 w-12 text-lg" />
            <div className="min-w-0">
              <p className="text-base font-bold text-ink-900 truncate">{companyName || appName}</p>
              {tagline && <p className="text-[11px] text-ink-500 truncate">{tagline}</p>}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[11px] text-ink-400 uppercase tracking-wide">Nomor Dokumen</p>
            <p className="font-mono text-sm font-semibold text-ink-800">{bast.docNo}</p>
          </div>
        </div>

        <h1 className="text-center text-lg font-bold text-ink-900 uppercase tracking-wide mb-1">{judul}</h1>
        <p className="text-center text-xs text-ink-400 mb-6">Nomor: {bast.docNo}</p>

        <p className="text-sm text-ink-700 leading-relaxed mb-5">
          Pada hari ini, <strong>{tanggalPanjang(tanggalDokumen)}</strong>, kami yang bertanda tangan di
          bawah ini telah melakukan {type === 'serah' ? 'serah terima' : 'penerimaan kembali'} atas aset
          inventaris milik <strong>{companyName || appName}</strong> dengan rincian sebagai berikut:
        </p>

        {/* Dua pihak */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl border border-ink-200 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-2">
              Pihak Pertama {type === 'serah' ? '(Menyerahkan)' : '(Menerima Kembali)'}
            </p>
            <p className="text-sm font-semibold text-ink-800">{petugas || '—'}</p>
            <p className="text-xs text-ink-500 mt-0.5">Petugas Pengelola Aset</p>
          </div>
          <div className="rounded-xl border border-ink-200 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-2">
              Pihak Kedua {type === 'serah' ? '(Menerima)' : '(Menyerahkan Kembali)'}
            </p>
            <p className="text-sm font-semibold text-ink-800">{bast.holderName}</p>
            <p className="text-xs text-ink-500 mt-0.5">{bast.department || '—'}</p>
          </div>
        </div>

        <p className="text-sm text-ink-700 mb-3">
          {type === 'serah'
            ? 'PIHAK PERTAMA telah menyerahkan, dan PIHAK KEDUA telah menerima, barang inventaris dengan rincian sebagai berikut:'
            : 'PIHAK KEDUA telah menyerahkan kembali, dan PIHAK PERTAMA telah menerima, barang inventaris dengan rincian sebagai berikut:'}
        </p>

        {/* Rincian aset */}
        <table className="w-full text-sm border border-ink-200 rounded-xl overflow-hidden mb-5">
          <tbody>
            <Row label="Kode Aset" value={bast.assetCode} mono />
            <Row label="Nama Aset" value={bast.assetName} />
            <Row label="Kode Barang/Aset" value={bast.categoryName} />
            <Row label="Brand / Model" value={[bast.brand, bast.model].filter(Boolean).join(' / ') || '—'} />
            <Row label="Nomor Seri" value={bast.serialNumber} mono />
            <Row label="Lokasi" value={bast.location} />
            <Row
              label={type === 'serah' ? 'Kondisi Saat Diserahkan' : 'Kondisi Saat Diterima Kembali'}
              value={CONDITION_LABEL[type === 'serah' ? bast.conditionStatus : bast.returnCondition] || '—'}
              last
            />
          </tbody>
        </table>

        {(type === 'serah' ? bast.assignNote : bast.returnNote) && (
          <p className="text-sm text-ink-600 mb-6 leading-relaxed">
            <span className="font-semibold text-ink-700">Catatan: </span>
            {type === 'serah' ? bast.assignNote : bast.returnNote}
          </p>
        )}

        <p className="text-sm text-ink-700 leading-relaxed mb-10">
          Demikian Berita Acara ini dibuat dengan sebenarnya untuk dapat dipergunakan sebagaimana mestinya.
        </p>

        {/* Tanda tangan */}
        <div className="grid grid-cols-2 gap-8 text-center text-sm">
          <div>
            <p className="text-ink-600 mb-16">
              {type === 'serah' ? 'Yang Menerima,' : 'Yang Menyerahkan Kembali,'}
            </p>
            <p className="font-semibold text-ink-800 border-t border-ink-300 pt-2 mx-4">{bast.holderName}</p>
          </div>
          <div>
            <p className="text-ink-600 mb-16">
              {type === 'serah' ? 'Yang Menyerahkan,' : 'Yang Menerima Kembali,'}
            </p>
            <p className="font-semibold text-ink-800 border-t border-ink-300 pt-2 mx-4">{petugas || '—'}</p>
          </div>
        </div>
      </Card>

      <p className="print-hide text-center text-xs text-ink-400 mt-4 leading-relaxed">
        Nomor dokumen dibuat sekali dan tersimpan — mencetak ulang halaman ini menunjukkan nomor yang sama.
      </p>
    </>
  );
}

function Row({ label, value, mono = false, last = false }) {
  return (
    <tr className={last ? '' : 'border-b border-ink-100'}>
      <td className="w-1/3 bg-ink-50 px-3.5 py-2.5 text-[13px] font-medium text-ink-500 align-top">{label}</td>
      <td className={`px-3.5 py-2.5 text-ink-800 ${mono ? 'font-mono text-[13px]' : 'text-sm'}`}>
        {value || <span className="text-ink-300">—</span>}
      </td>
    </tr>
  );
}
