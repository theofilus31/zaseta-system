import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosClient from '../../api/axiosClient.js';
import EmptyState from '../ui/EmptyState.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';

/**
 * ============================================================================
 *  PUSAT "PERLU DITINDAKLANJUTI"
 * ============================================================================
 *  Menggabungkan garansi yang akan berakhir, pengingat bertanggal, dan jadwal
 *  pemeliharaan jadi satu daftar — supaya "apa yang harus saya urus hari
 *  ini?" bisa dijawab tanpa membuka setiap aset satu per satu.
 *
 *  Sengaja pakai ikon berbeda dari lonceng "Riwayat notifikasi" di sebelahnya
 *  (itu catatan galat teknis; ini daftar tindakan bisnis) supaya keduanya
 *  tidak tertukar meski posisinya berdekatan.
 *
 *  Dihitung ulang setiap dibuka — tidak ada status "sudah dibaca" yang
 *  disimpan. Begitu tanggalnya lewat jendela yang dipantau server, baris itu
 *  hilang sendiri dari daftar.
 * ============================================================================
 */

const CATEGORY_CONFIG = {
  warranty: { icon: 'fa-shield-halved', label: 'Garansi' },
  reminder: { icon: 'fa-bell', label: 'Pengingat' },
  maintenance: { icon: 'fa-screwdriver-wrench', label: 'Pemeliharaan' },
  consumable: { icon: 'fa-boxes-stacked', label: 'Barang Habis Pakai' },
  request: { icon: 'fa-hand-point-right', label: 'Permintaan Aset' },
};

const SEVERITY_STYLE = {
  danger: 'bg-danger-50 text-danger-500',
  warning: 'bg-warning-50 text-warning-600',
  info: 'bg-info-50 text-info-500',
};

export default function AttentionCenter() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);

  const muat = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosClient.get('/notifications');
      setData(res.data);
    } catch {
      /* Tidak menampilkan galat di sini — kalau gagal, lonceng cukup tetap
         kosong. Ini bukan aksi yang diminta pengguna secara eksplisit. */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { muat(); }, [muat]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) muat();
  }

  const items = data?.items || [];
  const overdue = data?.counts?.overdue || 0;
  const total = data?.counts?.total || 0;

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={toggle}
        aria-label="Perlu ditindaklanjuti"
        aria-expanded={open}
        title="Perlu ditindaklanjuti"
        className={`relative h-9 w-9 flex items-center justify-center rounded-lg transition-colors ${
          open ? 'bg-ink-100 text-ink-700' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-700'
        }`}
      >
        <i className="fas fa-list-check text-[15px]" aria-hidden="true" />
        {total > 0 && (
          <span
            className={`absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold text-white
                       flex items-center justify-center ring-2 ring-white tabular-nums
                       ${overdue > 0 ? 'bg-danger-500' : 'bg-warning-500'}`}
          >
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-[24rem] max-w-[90vw] bg-white rounded-2xl
                     border border-ink-200/70 shadow-overlay z-50 overflow-hidden animate-slide-down"
        >
          <div className="px-4 py-3 border-b border-ink-200/70">
            <p className="text-[13px] font-semibold text-ink-800">Perlu Ditindaklanjuti</p>
            <p className="text-[11px] text-ink-400 mt-0.5">
              {total > 0
                ? `${total} hal${overdue > 0 ? `, ${overdue} sudah lewat` : ''}`
                : 'Tidak ada yang perlu ditindaklanjuti'}
            </p>
          </div>

          <div className="max-h-96 overflow-y-auto scrollbar-slim">
            {loading && !data ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon="fa-circle-check"
                title="Semua aman"
                description="Tidak ada garansi, pengingat, atau jadwal pemeliharaan yang mendekati tenggat."
                className="py-10"
              />
            ) : (
              items.map((item) => {
                const cat = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.reminder;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { setOpen(false); navigate(item.link); }}
                    className="w-full flex items-start gap-3 px-4 py-3 border-b border-ink-100 last:border-0
                               hover:bg-ink-50/70 transition-colors text-left"
                  >
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${SEVERITY_STYLE[item.severity]}`}>
                      <i className={`fas ${cat.icon} text-[11px]`} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-ink-800 truncate">{item.title}</p>
                      <p className="text-[12px] text-ink-500 truncate mt-0.5">
                        {item.assetName} <span className="font-mono text-[11px] text-ink-400">{item.assetCode}</span>
                      </p>
                      <p className={`text-[11px] mt-1 font-medium ${
                        item.severity === 'danger' ? 'text-danger-600' : item.severity === 'warning' ? 'text-warning-700' : 'text-info-600'
                      }`}>
                        {item.detail}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
