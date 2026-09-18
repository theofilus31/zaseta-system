import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axiosClient from '../api/axiosClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ScanShell } from './PublicScanPage.jsx';
import ConsumableScanActionPanel from '../components/consumables/ConsumableScanActionPanel.jsx';

/**
 * Halaman PUBLIK untuk barcode barang habis pakai — padanan PublicScanPage.jsx
 * (aset), rute terpisah (/scan-consumable/:code) supaya alur pindai aset yang
 * sudah lama berjalan tidak ikut berisiko (lihat catatan di
 * migration_consumable_qr.sql). Pola dua-jalurnya SAMA: petugas yang sudah
 * masuk & berhak mendapat panel aksi (Stok Masuk/Keluar), selain itu cuma
 * tampilan ringkas read-only.
 */
export default function ConsumablePublicScanPage() {
  const { code } = useParams();
  const { user, can } = useAuth();

  const [item, setItem] = useState(null);      // tampilan publik
  const [staffItem, setStaffItem] = useState(null); // tampilan petugas
  const [error, setError] = useState('');

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
      <ScanShell>
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
      <ScanShell>
        <div className="bg-white rounded-2xl border border-ink-200 shadow-raised px-6 py-12 text-center">
          <div className="mx-auto mb-4 h-8 w-8 rounded-full border-[3px] border-ink-200 border-t-brand-500 animate-spin" aria-hidden="true" />
          <p className="text-sm text-ink-400">Memuat data barang…</p>
        </div>
      </ScanShell>
    );
  }

  /* ---------- Berhasil (publik, read-only) ---------- */
  return (
    <ScanShell>
      <div className="bg-white rounded-2xl border border-ink-200 shadow-raised overflow-hidden">
        <div className="px-6 py-6 text-center border-b border-ink-100">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <i className="fas fa-boxes-stacked text-lg" aria-hidden="true" />
          </div>
          <p className="text-base font-bold text-ink-900">{item.name}</p>
          <p className="text-[13px] font-mono text-ink-400 mt-1">{item.code}</p>
        </div>

        <div className="px-6 py-5 border-b border-ink-100 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Stok Saat Ini</p>
          <p className={`mt-1 text-3xl font-bold tabular-nums ${item.lowStock ? 'text-danger-600' : 'text-ink-900'}`}>
            {item.currentStock} <span className="text-sm font-medium text-ink-400">{item.unit}</span>
          </p>
          {item.lowStock && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-danger-50 px-3 py-1 text-xs font-medium text-danger-700">
              <i className="fas fa-triangle-exclamation text-[10px]" aria-hidden="true" />
              {item.currentStock <= 0 ? 'Stok habis' : `Di bawah ambang (${item.minStock})`}
            </p>
          )}
        </div>

        <dl className="px-6 py-5 space-y-2.5 text-[13px]">
          {item.assetTypeName && (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-400">Kategori</dt>
              <dd className="font-medium text-ink-800">{item.assetTypeName}</dd>
            </div>
          )}
          {item.locationName && (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-400">Lokasi</dt>
              <dd className="font-medium text-ink-800 text-right">{item.locationName}</dd>
            </div>
          )}
        </dl>
      </div>
    </ScanShell>
  );
}
