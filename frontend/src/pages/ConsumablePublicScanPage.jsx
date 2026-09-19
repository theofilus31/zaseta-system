import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Boxes } from 'lucide-react';
import axiosClient from '../api/axiosClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ScanShell, Row } from './PublicScanPage.jsx';
import AssetTrackerCard from '../components/ui/AssetTrackerCard.jsx';
import ConsumableScanActionPanel from '../components/consumables/ConsumableScanActionPanel.jsx';

/**
 * Halaman PUBLIK untuk barcode barang habis pakai — padanan PublicScanPage.jsx
 * (aset), rute terpisah (/scan-consumable/:code) supaya alur pindai aset yang
 * sudah lama berjalan tidak ikut berisiko (lihat catatan di
 * migration_consumable_qr.sql). Pola dua-jalurnya SAMA: petugas yang sudah
 * masuk & berhak mendapat panel aksi (Stok Masuk/Keluar), selain itu cuma
 * tampilan ringkas read-only.
 *
 * Tampilan publiknya SENGAJA memakai AssetTrackerCard & Row yang SAMA PERSIS
 * dipakai PublicScanPage.jsx (aset) -- bukan desain terpisah -- supaya kedua
 * halaman pindai publik punya satu tema, bukan dua yang kebetulan mirip.
 * Satu-satunya bagian yang beda: lencana atas menampilkan STOK (bukan status
 * siklus hidup aset) karena itu yang paling ingin diketahui begitu memindai
 * barang habis pakai.
 */

const STOCK_TONE = {
  ok: { badge: 'bg-brand-50 text-brand-700 ring-brand-500/20', dot: 'bg-brand-500' },
  low: { badge: 'bg-warning-50 text-warning-700 ring-warning-500/25', dot: 'bg-warning-500' },
  empty: { badge: 'bg-danger-50 text-danger-700 ring-danger-500/25', dot: 'bg-danger-600' },
};

/** Lencana stok — dibuat mengikuti kelas StatusBadge.jsx persis (pil + titik +
    ring) supaya terasa satu keluarga dengan lencana status aset, meski
    isinya beda (angka stok, bukan status siklus hidup). */
function StockBadge({ item }) {
  const key = item.currentStock <= 0 ? 'empty' : item.lowStock ? 'low' : 'ok';
  const tone = STOCK_TONE[key];
  return (
    <span className={`inline-flex items-center rounded-full font-medium whitespace-nowrap ring-1 ring-inset text-[11px] px-2 py-0.5 gap-1.5 ${tone.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${tone.dot}`} aria-hidden="true" />
      {item.currentStock} {item.unit} tersisa
    </span>
  );
}

export default function ConsumablePublicScanPage() {
  const { code } = useParams();
  const { user, can } = useAuth();

  const [item, setItem] = useState(null);      // tampilan publik
  const [staffItem, setStaffItem] = useState(null); // tampilan petugas
  const [error, setError] = useState('');
  const [showDetail, setShowDetail] = useState(false);

  const muat = useCallback(async () => {
    setError('');

    if (user && can('consumables', 'view')) {
      try {
        const res = await axiosClient.get(`/consumables/by-code/${code}`);
        setStaffItem(res.data);
        return;
      } catch {
        /* Token kedaluwarsa atau izin dicabut di tengah jalan — turun ke tampilan publik. */
      }
    }

    try {
      const res = await axiosClient.get(`/public/scan-consumable/${code}`);
      setItem(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Kode QR tidak valid atau sudah tidak berlaku.');
    }
  }, [code, user, can]);

  useEffect(() => { muat(); }, [muat]);

  /* ---------- Mode petugas ---------- */
  if (staffItem) {
    return (
      <ScanShell>
        <ConsumableScanActionPanel item={staffItem} onRefresh={muat} />
      </ScanShell>
    );
  }

  /* ---------- Galat ---------- */
  if (error) {
    return (
      <ScanShell branding={user ? undefined : null}>
        <div className="bg-white rounded-2xl border border-ink-200 shadow-raised px-6 py-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-50 text-danger-500">
            <i className="fas fa-triangle-exclamation text-xl" aria-hidden="true" />
          </div>
          <p className="text-base font-semibold text-ink-800">Barang tidak ditemukan</p>
          <p className="text-sm text-ink-500 mt-2 leading-relaxed">{error}</p>
        </div>
      </ScanShell>
    );
  }

  /* ---------- Memuat ---------- */
  if (!item) {
    return (
      <ScanShell branding={user ? undefined : null}>
        <div className="bg-white rounded-2xl border border-ink-200 shadow-raised px-6 py-12 text-center">
          <div className="mx-auto mb-4 h-8 w-8 rounded-full border-[3px] border-ink-200 border-t-brand-500 animate-spin" aria-hidden="true" />
          <p className="text-sm text-ink-400">Memuat data barang…</p>
        </div>
      </ScanShell>
    );
  }

  /* ---------- Berhasil (publik, read-only) ---------- */
  return (
    <ScanShell branding={item.branding}>
      <div className="space-y-4">
        <AssetTrackerCard
          topBadge={<StockBadge item={item} />}
          assetName={item.name}
          assetCode={item.code}
          codeLabel="Kode Barang"
          location={item.locationName}
          qrValue={typeof window !== 'undefined' ? window.location.href : item.code}
          icon={<Boxes className="h-7 w-7" aria-hidden="true" />}
          expanded={showDetail}
          onToggleDetail={() => setShowDetail((v) => !v)}
        />

        {showDetail && (
          <div className="bg-white rounded-2xl border border-ink-200 shadow-raised overflow-hidden animate-slide-down">
            <div className="px-6 py-5">
              <dl>
                <Row label="Kategori" value={item.assetTypeName} />
                <Row label="Lokasi" value={item.locationName} />
                <Row label="Ambang Stok Minimum" value={`${item.minStock} ${item.unit}`} />
              </dl>
            </div>
          </div>
        )}
      </div>
    </ScanShell>
  );
}
