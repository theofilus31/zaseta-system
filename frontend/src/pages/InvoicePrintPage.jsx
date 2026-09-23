import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axiosClient from '../api/axiosClient.js';
import { useNotification } from '../context/NotificationContext.jsx';
import { useLayoutWidth } from '../context/LayoutWidthContext.jsx';
import { PRODUCT_NAME, PRODUCT_TAGLINE, PRODUCT_ICON_URL } from '../constants/brand.js';
import Card from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { Badge } from '../components/ui/StatusBadge.jsx';
import { rupiah } from '../utils/currency.js';

/**
 * ============================================================================
 *  CETAK / UNDUH INVOICE — dipakai tenant dari Riwayat Tagihan (BillingPage.jsx)
 * ============================================================================
 *  "Unduh" di sini berarti print-to-PDF lewat dialog cetak browser (tombol
 *  "Simpan sebagai PDF" bawaan Chrome/Edge/dst.), pola yang SAMA PERSIS
 *  dengan BastPrintPage.jsx — bukan PDF yang dirender di server. Menghindari
 *  dependensi PDF baru (pdfkit/puppeteer) untuk kebutuhan yang sudah
 *  terpenuhi cara ini.
 *
 *  Logonya ZASETA (ProductBrandMark-style, dari constants/brand.js) —
 *  BUKAN BrandLogo milik tenant seperti di BastPrintPage.jsx. Invoice ini
 *  diterbitkan OLEH platform (Zaseta) KE tenant (pelanggan), arahnya
 *  terbalik dari BAST yang murni dokumen internal tenant.
 * ============================================================================
 */

const tanggalPanjang = (v) =>
  v ? new Date(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

const STATUS_LABEL = { pending: 'Menunggu', paid: 'Lunas', failed: 'Gagal', refunded: 'Dikembalikan', canceled: 'Dibatalkan' };
const STATUS_TONE = { pending: 'warning', paid: 'brand', failed: 'danger', refunded: 'neutral', canceled: 'neutral' };

/** Stempel "LUNAS" — cincin ganda + teks, murni CSS (bukan gambar/SVG
 *  terpisah) supaya tidak butuh aset baru. Hanya tampil untuk invoice yang
 *  sungguhan berstatus lunas -- jangan pernah dipasang di invoice pending/
 *  gagal, itu sama saja memalsukan bukti pembayaran. */
function PaidStamp() {
  return (
    <div
      className="pointer-events-none select-none absolute right-8 bottom-24 opacity-80"
      style={{ transform: 'rotate(-14deg)' }}
      aria-hidden="true"
    >
      <div className="flex h-32 w-32 items-center justify-center rounded-full border-[3px] border-brand-600 text-brand-600">
        <div className="flex h-[104px] w-[104px] flex-col items-center justify-center gap-0.5 rounded-full border border-brand-600 text-center">
          <span className="text-[9px] font-black tracking-[0.2em]">ZASETA</span>
          <span className="text-lg font-black leading-none tracking-wide">LUNAS</span>
          <span className="text-[6.5px] font-bold leading-tight tracking-wide px-2">
            PEMBAYARAN
            <br />
            DITERIMA
          </span>
        </div>
      </div>
    </div>
  );
}

export default function InvoicePrintPage() {
  const { id } = useParams();
  const { pushError } = useNotification();
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState('');

  useLayoutWidth(invoice ? 'narrow' : 'default');

  useEffect(() => {
    setInvoice(null);
    setError('');
    axiosClient.get(`/billing/invoices/${id}`)
      .then((res) => setInvoice(res.data.invoice))
      .catch((err) => {
        const msg = err.response?.data?.message || 'Gagal memuat invoice.';
        setError(msg);
        pushError(msg);
      });
  }, [id, pushError]);

  if (error) {
    return (
      <>
        <PageHeader backTo="/billing" backLabel="Langganan" title="Invoice" />
        <Card className="text-center py-10">
          <i className="fas fa-triangle-exclamation text-2xl text-danger-400 mb-3" aria-hidden="true" />
          <p className="text-sm text-ink-600">{error}</p>
        </Card>
      </>
    );
  }

  if (!invoice) {
    return (
      <>
        <Skeleton className="h-7 w-64 mb-6" />
        <Card><Skeleton className="h-[500px] w-full" /></Card>
      </>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 1.6cm; }
          body * { visibility: hidden; }
          #invoice-print-area, #invoice-print-area * { visibility: visible; }
          #invoice-print-area {
            position: absolute; top: 0; left: 0; width: 100%;
            margin: 0 !important; box-shadow: none !important; border: none !important;
          }
        }
      `}</style>

      <div className="print-hide">
        <PageHeader
          backTo="/billing"
          backLabel="Langganan"
          eyebrow={invoice.invoiceNumber}
          title="Invoice"
          description={`${invoice.planName} · ${invoice.billingCycle === 'yearly' ? 'Tahunan' : 'Bulanan'}`}
          actions={
            <Button size="sm" onClick={() => window.print()}>
              <i className="fas fa-download text-xs" aria-hidden="true" /> Unduh / Cetak
            </Button>
          }
        />
      </div>

      <Card id="invoice-print-area" className="relative overflow-hidden print:shadow-none print:border-none">
        {/* Kop surat -- identitas ZASETA (penerbit), bukan merek tenant */}
        <div className="flex items-start justify-between gap-4 border-b-2 border-ink-800 pb-5 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <img src={PRODUCT_ICON_URL} alt="" className="h-11 w-11 object-contain shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-base font-black tracking-tight text-ink-900 truncate">{PRODUCT_NAME}</p>
              <p className="text-[11px] text-ink-500 truncate">{PRODUCT_TAGLINE}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <h1 className="text-lg font-bold uppercase tracking-wide text-ink-900">Invoice</h1>
            <p className="font-mono text-sm font-semibold text-ink-800">{invoice.invoiceNumber}</p>
          </div>
        </div>

        {/* Pihak & tanggal */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-1.5">Ditagihkan Kepada</p>
            <p className="text-sm font-bold text-ink-900">{invoice.companyName}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-1.5">Tanggal Terbit</p>
            <p className="text-sm font-semibold text-ink-800">{tanggalPanjang(invoice.createdAt)}</p>
            {invoice.paidAt && (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-1 mt-2.5">Tanggal Lunas</p>
                <p className="text-sm font-semibold text-ink-800">{tanggalPanjang(invoice.paidAt)}</p>
              </>
            )}
          </div>
        </div>

        {/* Rincian tagihan */}
        <table className="w-full text-sm border border-ink-200 rounded-xl overflow-hidden mb-2">
          <thead>
            <tr className="bg-ink-50">
              <th className="text-left px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">Deskripsi</th>
              <th className="text-right px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-3.5 py-3 align-top">
                <p className="font-semibold text-ink-800">Langganan Paket {invoice.planName}</p>
                <p className="text-xs text-ink-500 mt-0.5">
                  Siklus {invoice.billingCycle === 'yearly' ? 'Tahunan' : 'Bulanan'}
                  {invoice.periodStart && invoice.periodEnd && (
                    <> &middot; {tanggalPanjang(invoice.periodStart)} &ndash; {tanggalPanjang(invoice.periodEnd)}</>
                  )}
                </p>
              </td>
              <td className="px-3.5 py-3 text-right font-semibold text-ink-800 tabular-nums align-top">{rupiah(invoice.amount)}</td>
            </tr>
          </tbody>
        </table>

        <div className="flex justify-end mb-8">
          <div className="w-full sm:w-64">
            <div className="flex items-center justify-between py-2 border-t border-ink-200">
              <p className="text-sm font-bold text-ink-900">Total</p>
              <p className="text-base font-black text-ink-900 tabular-nums">{rupiah(invoice.amount)}</p>
            </div>
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-ink-400">Status</p>
              <Badge tone={STATUS_TONE[invoice.status] || 'neutral'} size="sm">
                {STATUS_LABEL[invoice.status] || invoice.status}
              </Badge>
            </div>
            {invoice.paymentMethod && (
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-ink-400">Metode</p>
                <p className="text-xs font-medium text-ink-600 capitalize">{invoice.paymentMethod.replace('_', ' ')}</p>
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-ink-400 leading-relaxed">
          Terima kasih telah berlangganan {PRODUCT_NAME}. Invoice ini dibuat otomatis dan sah tanpa tanda tangan basah.
        </p>

        {invoice.status === 'paid' && <PaidStamp />}
      </Card>

      <p className="print-hide text-center text-xs text-ink-400 mt-4 leading-relaxed">
        Klik "Unduh / Cetak", lalu pilih "Simpan sebagai PDF" di kotak dialog cetak untuk menyimpan berkasnya.
      </p>
    </>
  );
}
