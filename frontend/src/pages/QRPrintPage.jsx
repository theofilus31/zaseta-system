import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axiosClient from '../api/axiosClient.js';
import QrLabelDesign from '../components/assets/QrLabelDesign.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button, { SegmentedControl } from '../components/ui/Button.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';

const SIZE_OPTIONS = [2, 3, 4, 5].map((s) => ({ value: s, label: `${s}×${s} cm` }));

export default function QRPrintPage() {
  const { id } = useParams();
  const [qr, setQr] = useState(null);
  const [sizeCm, setSizeCm] = useState(3);

  useEffect(() => {
    axiosClient.get(`/assets/${id}/qr/print`).then((res) => setQr(res.data));
  }, [id]);

  if (!qr) {
    return (
      <>
        <Skeleton className="h-7 w-64 mb-6" />
        <Card><Skeleton className="h-64 w-full" /></Card>
      </>
    );
  }

  // Pratinjau diperbesar karena label seukuran aslinya sulit diperiksa di layar
  const previewScale = 2.2;

  return (
    <>
      {/* Saat mencetak, hanya area label yang ditampilkan — seluruh kerangka
          aplikasi disembunyikan agar tidak ikut tercetak. */}
      <style>{`
        @media print {
          @page { size: auto; margin: 0; }
          body * { visibility: hidden; }
          #qr-print-area, #qr-print-area * { visibility: visible; }
          #qr-print-area {
            position: absolute;
            top: 0;
            left: 0;
            margin: 0 !important;
            transform: none !important;
          }
        }
      `}</style>

      <div className="print-hide">
        <PageHeader
          backTo={`/assets/${id}`}
          backLabel="Detail Aset"
          eyebrow="Cetak Label"
          title={qr.name}
          description={<span className="font-mono text-ink-600">{qr.asset_code}</span>}
          actions={
            <>
              <Button to="/cetak-barcode-massal" variant="secondary" size="sm">
                <i className="fas fa-layer-group text-xs" aria-hidden="true" /> Cetak Massal
              </Button>
              <Button size="sm" onClick={() => window.print()}>
                <i className="fas fa-print text-xs" aria-hidden="true" /> Cetak
              </Button>
            </>
          }
        />
      </div>

      <Card padded={false} className="overflow-hidden">
        <div className="print-hide">
          <CardHeader
            title="Pratinjau Label"
            description={`Ditampilkan ${previewScale}× lebih besar. Ukuran cetak sebenarnya tetap ${sizeCm}×${sizeCm} cm.`}
            bordered
            action={
              <SegmentedControl options={SIZE_OPTIONS} value={sizeCm} onChange={setSizeCm} />
            }
          />
        </div>

        <div className="flex justify-center bg-ink-50 py-10 print:bg-white print:py-0">
          <div
            id="qr-print-area"
            style={{
              transform: `scale(${previewScale})`,
              transformOrigin: 'top center',
              marginBottom: `${sizeCm * previewScale * 0.62}cm`,
            }}
          >
            <QrLabelDesign asset={qr} sizeCm={sizeCm} />
          </div>
        </div>
      </Card>

      <p className="print-hide text-center text-xs text-ink-400 mt-4 leading-relaxed">
        Pastikan skala printer diatur ke <strong className="text-ink-600">100% (ukuran asli)</strong> —
        opsi “fit to page” akan membuat ukuran label meleset.
      </p>
    </>
  );
}
