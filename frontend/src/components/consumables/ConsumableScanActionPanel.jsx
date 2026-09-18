import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotification } from '../../context/NotificationContext.jsx';
import Button from '../ui/Button.jsx';
import { StockInModal, StockOutModal } from '../../pages/ConsumableDetail.jsx';

/**
 * ============================================================================
 *  PANEL AKSI HASIL PINDAIAN — BARANG HABIS PAKAI
 * ============================================================================
 *  Padanan ScanActionPanel.jsx (aset) untuk barang habis pakai. Muncul
 *  menggantikan tampilan publik ketika yang memindai barcode adalah petugas
 *  yang sudah masuk & berhak mengubah stok — supaya "stok kertas tinggal
 *  berapa, catat yang baru datang" bisa selesai di gudang, tanpa bolak-balik
 *  ke meja untuk membuka menu Barang Habis Pakai dan mencari barangnya lagi.
 *
 *  Memakai StockInModal/StockOutModal yang SAMA dengan ConsumableDetail.jsx
 *  (diekspor dari sana) — bukan salinan terpisah, supaya validasi & pesannya
 *  selalu konsisten dengan halaman biasa.
 * ============================================================================
 */
export default function ConsumableScanActionPanel({ item, onRefresh }) {
  const { can, user } = useAuth();
  const { pushSuccess } = useNotification();
  const [showIn, setShowIn] = useState(false);
  const [showOut, setShowOut] = useState(false);

  const canEdit = can('consumables', 'edit');

  function afterStockChange(message) {
    pushSuccess(message);
    setShowIn(false);
    setShowOut(false);
    onRefresh();
  }

  return (
    <div className="bg-white rounded-2xl border border-ink-200 shadow-raised overflow-hidden">
      <div className="relative bg-gradient-to-br from-info-600 to-info-700 px-5 py-4">
        <div className="flex items-center gap-2 text-white/80 text-[10px] font-semibold uppercase tracking-[0.12em]">
          <i className="fas fa-user-shield" aria-hidden="true" />
          Mode Petugas · {user?.name}
        </div>
        <h1 className="text-lg font-black text-white leading-tight mt-1.5 break-words">{item.name}</h1>
        <p className="text-[13px] font-mono text-white/80 mt-1">{item.code}</p>
      </div>

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-ink-50 px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Stok Saat Ini</p>
            <p className={`mt-1 text-xl font-bold tabular-nums ${item.lowStock ? 'text-danger-600' : 'text-ink-900'}`}>
              {item.currentStock} <span className="text-xs font-medium text-ink-400">{item.unit}</span>
            </p>
          </div>
          <div className="rounded-xl bg-ink-50 px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Kategori</p>
            <p className="mt-1.5 text-[13px] font-medium text-ink-800">{item.assetTypeName || '—'}</p>
          </div>
        </div>

        {item.lowStock && (
          <p className="flex gap-2.5 rounded-xl bg-danger-50 px-3.5 py-3 text-xs text-danger-700 leading-relaxed">
            <i className="fas fa-triangle-exclamation mt-0.5 shrink-0" aria-hidden="true" />
            {item.currentStock <= 0 ? 'Stok habis.' : `Stok di bawah ambang minimum (${item.minStock} ${item.unit}).`}
          </p>
        )}

        <dl className="space-y-2 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-400">Lokasi</dt>
            <dd className="font-medium text-ink-800 text-right">{item.locationName || '—'}</dd>
          </div>
        </dl>

        {canEdit && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <Button size="sm" onClick={() => setShowIn(true)}>
              <i className="fas fa-arrow-down text-xs" aria-hidden="true" /> Stok Masuk
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowOut(true)} disabled={item.currentStock <= 0}>
              <i className="fas fa-arrow-up text-xs" aria-hidden="true" /> Stok Keluar
            </Button>
          </div>
        )}

        <div className="pt-1 border-t border-ink-100">
          <Link
            to={`/consumables/${item.id}`}
            className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-ink-50 px-4 py-3
                       text-[13px] font-medium text-ink-700 hover:bg-ink-100 transition-colors"
          >
            Buka detail & kartu stok lengkap
            <i className="fas fa-arrow-right text-[11px] text-ink-400" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {showIn && <StockInModal item={item} onClose={() => setShowIn(false)} onDone={afterStockChange} />}
      {showOut && <StockOutModal item={item} onClose={() => setShowOut(false)} onDone={afterStockChange} />}
    </div>
  );
}
