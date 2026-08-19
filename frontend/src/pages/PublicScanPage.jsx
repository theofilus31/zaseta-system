import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axiosClient from '../api/axiosClient.js';
import { parseSpecDetail } from '../utils/specDetail.js';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import { useBranding, BrandLogo } from '../context/BrandingContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import ScanActionPanel from '../components/assets/ScanActionPanel.jsx';

/**
 * Halaman PUBLIK — dibuka siapa saja yang memindai Kode QR pada label aset,
 * tanpa perlu masuk. Karena ini satu-satunya bagian sistem yang dilihat orang
 * luar, tampilannya dibuat berdiri sendiri: berkop logo perusahaan, ringkas, dan
 * enak dibaca di layar ponsel.
 */

/** Kerangka bersama untuk semua keadaan (memuat, galat, berhasil). */
function ScanShell({ children }) {
  const { companyName } = useBranding();

  return (
    <div className="min-h-dvh bg-ink-100 dot-grid flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <BrandLogo
            variant="light"
            className="h-11 w-auto object-contain"
            fallbackClassName="h-11 w-11 text-lg"
          />
        </div>

        {children}

        <p className="text-center text-[11px] text-ink-400 mt-6 leading-relaxed">
          {companyName ? `Aset milik ${companyName}.` : 'Aset milik perusahaan.'}
          <br />
          Halaman ini dibuat otomatis dari sistem inventaris aset.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-ink-100 last:border-0">
      <dt className="text-[13px] text-ink-400 shrink-0">{label}</dt>
      <dd className="text-[13px] font-medium text-ink-800 text-right min-w-0 break-words">
        {value || <span className="text-ink-300 font-normal">—</span>}
      </dd>
    </div>
  );
}

/** Detail spesifikasi: daftar bernomor tampil menurun, teks biasa tampil normal. */
function SpecDetailRow({ value }) {
  if (!value || !value.trim()) return <Row label="Detail Spesifikasi" value={null} />;

  const parsed = parseSpecDetail(value);

  if (parsed.isList) {
    return (
      <div className="py-2.5 border-b border-ink-100 last:border-0">
        <dt className="text-[13px] text-ink-400 mb-2">Detail Spesifikasi</dt>
        <dd>
          <ul className="space-y-1.5">
            {parsed.items.map((item, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] text-ink-700">
                <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md bg-ink-100 text-[10px] font-bold text-ink-500 tabular-nums">
                  {i + 1}
                </span>
                <span className="min-w-0">{item}</span>
              </li>
            ))}
          </ul>
        </dd>
      </div>
    );
  }

  return (
    <div className="py-2.5 border-b border-ink-100 last:border-0">
      <dt className="text-[13px] text-ink-400 mb-1">Detail Spesifikasi</dt>
      <dd className="text-[13px] font-medium text-ink-800 whitespace-pre-line">{value}</dd>
    </div>
  );
}

export default function PublicScanPage() {
  const { code } = useParams();
  const { user, can } = useAuth();

  const [asset, setAsset] = useState(null);          // tampilan publik
  const [staffAsset, setStaffAsset] = useState(null); // tampilan petugas
  const [error, setError] = useState('');

  /* Dua jalur pengambilan data untuk satu halaman:
     - petugas yang sudah masuk & berhak melihat aset -> /assets/by-code (data
       lengkap, bisa ditindaklanjuti)
     - siapa pun selain itu -> /public/scan (ringkas, read-only)

     Jalur petugas dicoba lebih dulu dan TIDAK menaikkan scan_count, supaya
     angka pemindaian tetap mencerminkan pemindaian oleh pihak luar. */
  const muat = useCallback(async () => {
    setError('');

    if (user && can('assets', 'view')) {
      try {
        const res = await axiosClient.get(`/assets/by-code/${code}`);
        setStaffAsset(res.data);
        return;
      } catch {
        /* Token kedaluwarsa atau izin dicabut di tengah jalan — jangan buntu,
           turun saja ke tampilan publik. */
      }
    }

    try {
      const res = await axiosClient.get(`/public/scan/${code}`);
      setAsset(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Kode QR tidak valid atau sudah tidak berlaku.');
    }
  }, [code, user, can]);

  useEffect(() => { muat(); }, [muat]);

  /* ---------- Mode petugas ---------- */
  if (staffAsset) {
    return (
      <ScanShell>
        <ScanActionPanel asset={staffAsset} onRefresh={muat} />
      </ScanShell>
    );
  }

  /* ---------- Galat ---------- */
  if (error) {
    return (
      <ScanShell>
        <div className="bg-white rounded-2xl border border-ink-200 shadow-raised px-6 py-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-50 text-danger-500">
            <i className="fas fa-triangle-exclamation text-xl" aria-hidden="true" />
          </div>
          <p className="text-base font-semibold text-ink-800">Aset tidak ditemukan</p>
          <p className="text-sm text-ink-500 mt-2 leading-relaxed">{error}</p>
          <p className="text-xs text-ink-400 mt-5 leading-relaxed">
            Kalau label ini menempel pada aset perusahaan, hubungi bagian IT untuk pemeriksaan.
          </p>
        </div>
      </ScanShell>
    );
  }

  /* ---------- Memuat ---------- */
  if (!asset) {
    return (
      <ScanShell>
        <div className="bg-white rounded-2xl border border-ink-200 shadow-raised px-6 py-12 text-center">
          <div className="mx-auto mb-4 h-8 w-8 rounded-full border-[3px] border-ink-200 border-t-brand-500 animate-spin" aria-hidden="true" />
          <p className="text-sm text-ink-400">Memuat data aset…</p>
        </div>
      </ScanShell>
    );
  }

  /* ---------- Berhasil ---------- */
  const location = [asset.location_name, asset.sub_location_name].filter(Boolean).join(' · ') || asset.location;

  return (
    <ScanShell>
      <div className="bg-white rounded-2xl border border-ink-200 shadow-raised overflow-hidden">

        {/* Kop berwarna brand — penanda bahwa ini dokumen resmi perusahaan */}
        <div className="relative bg-gradient-to-br from-brand-600 to-brand-700 px-6 py-6 overflow-hidden">
          <div
            className="absolute -top-10 -right-8 h-32 w-32 rounded-full bg-white/10"
            aria-hidden="true"
          />
          <p className="relative text-[10px] font-semibold uppercase tracking-[0.12em] text-white/70">
            Detail Aset
          </p>
          <h1 className="relative text-xl font-bold text-white leading-tight mt-1.5 break-words">
            {asset.name}
          </h1>
          <p className="relative text-[13px] font-mono text-white/80 mt-2">{asset.asset_code}</p>
        </div>

        <div className="px-6 py-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Status</span>
            <StatusBadge status={asset.status} />
          </div>

          <dl>
            <Row label="Kode Barang/Aset" value={asset.category_name} />
            <Row label="Brand / Model" value={[asset.brand, asset.model].filter(Boolean).join(' / ')} />
            <Row label="Lokasi" value={location} />
            <Row label="Vendor" value={asset.vendor} />
            <Row
              label="Tanggal Beli"
              value={asset.purchase_date
                ? new Date(asset.purchase_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
                : null}
            />
            <SpecDetailRow value={asset.spec_detail} />
          </dl>

          {asset.customFields?.length > 0 && (
            <div className="mt-5 pt-4 border-t border-ink-200">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-2">
                Informasi Tambahan
              </p>
              <dl>
                {asset.customFields.map((cf, i) => (
                  <Row key={i} label={cf.field_label} value={cf.value_text} />
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>
    </ScanShell>
  );
}
