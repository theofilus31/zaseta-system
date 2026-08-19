import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axiosClient from '../../api/axiosClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotification } from '../../context/NotificationContext.jsx';
import Button from '../ui/Button.jsx';
import StatusBadge, { ConditionBadge } from '../ui/StatusBadge.jsx';
import { ResultBadge } from '../opname/OpnameBits.jsx';
import { CheckOutModal, CheckInModal } from './AssignmentModals.jsx';
import MoveAssetModal from './MoveAssetModal.jsx';

/**
 * ============================================================================
 *  PANEL AKSI HASIL PINDAIAN
 * ============================================================================
 *  Muncul menggantikan tampilan publik ketika yang memindai adalah petugas yang
 *  sudah masuk dan berhak mengubah aset.
 *
 *  Alasannya praktis: selama ini memindai label hanya membuka halaman baca —
 *  petugas yang menemukan AC rusak saat keliling harus mencatat di kertas,
 *  kembali ke meja, mencari asetnya lagi, baru memperbaruinya. Panel ini
 *  memindahkan pekerjaan itu ke tempat kejadian.
 *
 *  Seluruh aksi memakai endpoint yang sudah ada, bukan jalur khusus — jadi
 *  aturan yang berlaku di halaman biasa (riwayat status, penjaga izin,
 *  larangan menyerahkan aset yang sudah keluar) otomatis ikut berlaku di sini.
 * ============================================================================
 */

const CONDITION_OPTIONS = [
  { value: 'baik', label: 'Baik' },
  { value: 'rusak_ringan', label: 'Rusak Ringan' },
  { value: 'rusak_berat', label: 'Rusak Berat' },
];

export default function ScanActionPanel({ asset, onRefresh }) {
  const { can, user } = useAuth();
  const { pushSuccess, pushError } = useNotification();

  const [savingCondition, setSavingCondition] = useState(false);
  const [showCheckOut, setShowCheckOut] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [opnames, setOpnames] = useState([]);
  const [opnameBusy, setOpnameBusy] = useState(null);

  const canEdit = can('assets', 'edit');
  const isRetired = ['terjual', 'dijual', 'hilang', 'dihapuskan'].includes(asset.status);
  const location = [asset.location_name, asset.sub_location_name].filter(Boolean).join(' · ');

  async function handleConditionChange(value) {
    if (value === asset.condition_status) return;
    setSavingCondition(true);
    try {
      await axiosClient.put(`/assets/${asset.id}`, { condition: value });
      await onRefresh();
      pushSuccess('Kondisi aset diperbarui.');
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal memperbarui kondisi.');
    } finally {
      setSavingCondition(false);
    }
  }

  async function handleCheckOut(form) {
    await axiosClient.post('/assignments', { assetId: asset.id, ...form });
    setShowCheckOut(false);
    await onRefresh();
    pushSuccess(`Aset diserahkan kepada ${form.holderName}.`);
  }

  async function handleCheckIn(form) {
    await axiosClient.put(`/assignments/${asset.currentAssignment.id}/return`, form);
    setShowCheckIn(false);
    await onRefresh();
    pushSuccess(`Aset diterima kembali dari ${asset.currentAssignment.holder_name}.`);
  }

  /* -------- Stok opname yang sedang berjalan -------- */
  /* Kalau aset ini kebetulan masuk daftar periksa sesi yang sedang berjalan,
     pemindaian tadi sebenarnya SUDAH merupakan pekerjaan opname. Menyuruh
     petugas membuka menu Stok Opname lalu mencari asetnya lagi hanya untuk
     mencentang satu baris adalah jalan memutar yang menjamin opname tidak
     pernah selesai — jadi tombolnya dibawa ke sini. */
  const muatOpname = useCallback(async () => {
    if (!can('opname', 'edit')) { setOpnames([]); return; }
    try {
      const res = await axiosClient.get('/opnames/active', { params: { assetId: asset.id } });
      setOpnames(res.data);
    } catch {
      setOpnames([]); // menu opname tidak wajib ada; kegagalan di sini tidak boleh mengganggu aksi lain
    }
  }, [asset.id, can]);

  useEffect(() => { muatOpname(); }, [muatOpname]);

  async function handleTandaiOpname(sesi) {
    setOpnameBusy(sesi.id);
    try {
      const res = await axiosClient.put(`/opnames/${sesi.id}/items/${sesi.item_id}`, {
        result: 'ditemukan',
      });
      await muatOpname();
      pushSuccess(
        res.data.result === 'salah_lokasi'
          ? 'Ditandai ditemukan — tapi lokasinya berbeda dari catatan.'
          : 'Ditandai ditemukan pada sesi opname.'
      );
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal menandai aset pada sesi opname.');
    } finally {
      setOpnameBusy(null);
    }
  }

  async function handleMove({ locationId, subLocationId }) {
    await axiosClient.put(`/assets/${asset.id}`, { status: 'dipindah', locationId, subLocationId });
    setShowMove(false);
    await onRefresh();
    pushSuccess('Lokasi aset diperbarui.');
  }

  return (
    <div className="bg-white rounded-2xl border border-ink-200 shadow-raised overflow-hidden">

      {/* Kop: penanda bahwa ini mode petugas, bukan tampilan publik */}
      <div className="relative bg-gradient-to-br from-info-600 to-info-700 px-5 py-4">
        <div className="flex items-center gap-2 text-white/80 text-[10px] font-semibold uppercase tracking-[0.12em]">
          <i className="fas fa-user-shield" aria-hidden="true" />
          Mode Petugas · {user?.name}
        </div>
        <h1 className="text-lg font-bold text-white leading-tight mt-1.5 break-words">{asset.name}</h1>
        <p className="text-[13px] font-mono text-white/80 mt-1">{asset.asset_code}</p>
      </div>

      <div className="p-5 space-y-5">

        {/* Keadaan sekarang, sekilas */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-ink-50 px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Status</p>
            <div className="mt-1.5"><StatusBadge status={asset.status} size="sm" /></div>
          </div>
          <div className="rounded-xl bg-ink-50 px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Kondisi</p>
            <div className="mt-1.5"><ConditionBadge condition={asset.condition_status} size="sm" /></div>
          </div>
        </div>

        <dl className="space-y-2 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-400">Lokasi</dt>
            <dd className="font-medium text-ink-800 text-right">{location || '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-400">Departemen</dt>
            <dd className="font-medium text-ink-800 text-right">
              {asset.department_name ? `${asset.department_code} · ${asset.department_name}` : '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-400">Pemegang</dt>
            <dd className="font-medium text-ink-800 text-right">
              {asset.currentAssignment?.holder_name || '—'}
            </dd>
          </div>
        </dl>

        {isRetired && (
          <p className="flex gap-2.5 rounded-xl bg-ink-100 px-3.5 py-3 text-xs text-ink-600 leading-relaxed">
            <i className="fas fa-circle-info mt-0.5 shrink-0" aria-hidden="true" />
            Aset ini sudah keluar dari inventaris aktif, jadi tidak bisa diubah dari sini.
            Buka detail lengkapnya bila perlu mengoreksi statusnya.
          </p>
        )}

        {/* ---------- Sesi opname yang memuat aset ini ---------- */}
        {opnames.length > 0 && (
          <div className="rounded-xl border border-info-200 bg-info-50/60 p-3.5 space-y-3">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-info-700">
              <i className="fas fa-clipboard-check" aria-hidden="true" />
              Sedang Ada Stok Opname
            </p>

            {opnames.map((sesi) => (
              <div key={sesi.id} className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink-800 truncate">{sesi.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-[10px] text-ink-400">{sesi.code}</span>
                    <ResultBadge result={sesi.result} />
                  </div>
                </div>

                {sesi.result === 'belum' ? (
                  <Button
                    size="sm"
                    onClick={() => handleTandaiOpname(sesi)}
                    loading={opnameBusy === sesi.id}
                  >
                    <i className="fas fa-check text-xs" aria-hidden="true" /> Tandai Ditemukan
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" to={`/opname/${sesi.id}`}>Buka Sesi</Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ---------- Aksi cepat ---------- */}
        {canEdit && !isRetired && (
          <div className="space-y-4 pt-1">
            <div>
              <label className="label">Ubah Kondisi Fisik</label>
              <select
                value={asset.condition_status || 'baik'}
                onChange={(e) => handleConditionChange(e.target.value)}
                disabled={savingCondition}
                className="field-select"
              >
                {CONDITION_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <p className="hint">Tersimpan begitu pilihan diganti — tidak perlu tombol simpan.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowMove(true)}>
                <i className="fas fa-location-dot text-xs" aria-hidden="true" /> Pindah Lokasi
              </Button>

              {asset.currentAssignment ? (
                <Button size="sm" onClick={() => setShowCheckIn(true)}>
                  <i className="fas fa-rotate-left text-xs" aria-hidden="true" /> Terima Kembali
                </Button>
              ) : (
                <Button size="sm" onClick={() => setShowCheckOut(true)}>
                  <i className="fas fa-hand-holding-hand text-xs" aria-hidden="true" /> Serahkan
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="pt-1 border-t border-ink-100">
          <Link
            to={`/assets/${asset.id}`}
            className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-ink-50 px-4 py-3
                       text-[13px] font-medium text-ink-700 hover:bg-ink-100 transition-colors"
          >
            Buka detail lengkap aset
            <i className="fas fa-arrow-right text-[11px] text-ink-400" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {showCheckOut && (
        <CheckOutModal asset={asset} onConfirm={handleCheckOut} onClose={() => setShowCheckOut(false)} />
      )}
      {showCheckIn && asset.currentAssignment && (
        <CheckInModal
          asset={asset}
          assignment={asset.currentAssignment}
          onConfirm={handleCheckIn}
          onClose={() => setShowCheckIn(false)}
        />
      )}
      {showMove && (
        <MoveAssetModal count={1} onConfirm={handleMove} onClose={() => setShowMove(false)} />
      )}
    </div>
  );
}
