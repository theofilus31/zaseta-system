import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axiosClient from '../api/axiosClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import Card from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pagination from '../components/ui/Pagination.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { SkeletonRows } from '../components/ui/Skeleton.jsx';
import { SearchInput } from '../components/ui/Form.jsx';

/**
 * Menjalankan `task` untuk setiap item dengan batas jumlah permintaan yang
 * berjalan bersamaan — sama seperti pola di AssetList.jsx. Tanpa batas ini,
 * memilih banyak baris sekaligus bisa melepas puluhan permintaan serentak.
 */
async function runInBatches(items, task, size = 5) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    results.push(...await Promise.all(chunk.map(task)));
  }
  return results;
}

/**
 * Aset yang sudah di-soft-delete (deleted_at terisi) tetap menyisakan baris
 * di database — dan lewat foreign key `fk_asset_category`, kode barang yang
 * masih ditempeli aset di sini TIDAK BISA dihapus sampai asetnya dipulihkan
 * atau dihapus permanen dari halaman ini. Sebelum halaman ini ada, satu-
 * satunya cara menyelesaikannya adalah lewat database langsung.
 */
export default function TrashPage() {
  const { can } = useAuth();
  const { pushSuccess, pushError } = useNotification();

  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [selectingAll, setSelectingAll] = useState(false);

  const canRestore = can('trash', 'edit');
  const canPurge = can('trash', 'delete');
  const canSelect = canRestore || canPurge;

  function load() {
    setLoading(true);
    axiosClient.get('/assets/trash', { params: { search, page, limit: 20 } })
      .then((res) => {
        setItems(res.data.data);
        setPagination(res.data.pagination);
        // Baris yang sudah tidak tampil (halaman/pencarian berganti) tidak boleh
        // ikut kena aksi massal secara diam-diam.
        setSelected((prev) => {
          const ids = new Set(res.data.data.map((i) => i.id));
          return new Set(Array.from(prev).filter((id) => ids.has(id)));
        });
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [search, page]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(checked) {
    setSelected(checked ? new Set(items.map((i) => i.id)) : new Set());
  }

  /** Pilih SELURUH hasil pencarian, bukan cuma 20 baris yang sedang tampil. */
  async function handleSelectAllFiltered() {
    setSelectingAll(true);
    try {
      const res = await axiosClient.get('/assets/trash', {
        params: { search, page: 1, limit: pagination.total || 1000 },
      });
      setSelected(new Set(res.data.data.map((i) => i.id)));
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal memilih seluruh hasil.');
    } finally {
      setSelectingAll(false);
    }
  }

  async function handleRestore(item) {
    if (!confirm(`Pulihkan "${item.name}"? Aset akan mendapat kode aset baru (kode lamanya sudah tidak bisa dipakai lagi).`)) return;
    setBusyId(item.id);
    try {
      const res = await axiosClient.put(`/assets/trash/${item.id}/restore`);
      pushSuccess(`"${item.name}" dipulihkan sebagai ${res.data.assetCode}.`);
      load();
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal memulihkan aset.');
    } finally {
      setBusyId(null);
    }
  }

  async function handlePurge(item) {
    if (!confirm(
      `Hapus permanen "${item.name}"?\n\nTindakan ini TIDAK BISA DIBATALKAN — seluruh riwayat, lampiran, dan data ` +
      `terkait aset ini akan ikut terhapus untuk selamanya.`
    )) return;
    setBusyId(item.id);
    try {
      await axiosClient.delete(`/assets/trash/${item.id}`);
      pushSuccess(`"${item.name}" dihapus permanen.`);
      load();
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal menghapus aset secara permanen.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleBulkRestore() {
    const ids = Array.from(selected);
    if (!confirm(`Pulihkan ${ids.length} aset terpilih? Masing-masing akan mendapat kode aset baru.`)) return;
    setBulkBusy(true);
    try {
      const results = await runInBatches(ids, (id) =>
        axiosClient.put(`/assets/trash/${id}/restore`).then(() => ({ ok: true })).catch((err) => ({ ok: false, err }))
      );
      const failed = results.filter((r) => !r.ok);
      setSelected(new Set());
      load();
      if (failed.length === 0) {
        pushSuccess(`${ids.length} aset berhasil dipulihkan.`);
      } else {
        pushError(`${ids.length - failed.length} aset dipulihkan, ${failed.length} gagal (kemungkinan lokasi aslinya sudah tidak aktif).`);
      }
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkPurge() {
    const ids = Array.from(selected);
    if (!confirm(
      `Hapus permanen ${ids.length} aset terpilih?\n\nTindakan ini TIDAK BISA DIBATALKAN — seluruh riwayat, lampiran, dan data ` +
      `terkait aset-aset ini akan ikut terhapus untuk selamanya.`
    )) return;
    setBulkBusy(true);
    try {
      await runInBatches(ids, (id) => axiosClient.delete(`/assets/trash/${id}`));
      setSelected(new Set());
      load();
      pushSuccess(`${ids.length} aset berhasil dihapus permanen.`);
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal menghapus sebagian/semua aset terpilih.');
    } finally {
      setBulkBusy(false);
    }
  }

  const allOnPageSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const someOnPageSelected = items.some((i) => selected.has(i.id));

  return (
    <>
      <PageHeader
        eyebrow="Administrasi"
        title="Tempat Sampah"
        description="Aset yang sudah dihapus. Selama masih ada di sini, kode barang dan lokasinya tidak bisa dihapus — pulihkan atau hapus permanen terlebih dahulu."
      />

      <Card padded={false} className="overflow-hidden">
        {/* ===================== MODE PILIH BANYAK ===================== */}
        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-3 px-4 sm:px-5 py-3 border-b border-brand-200 bg-brand-50/90">
            <span className="flex items-center gap-2.5 text-sm font-semibold text-brand-800">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-white text-xs tabular-nums">
                {selected.size}
              </span>
              aset terpilih
            </span>

            <div className="flex flex-wrap items-center gap-2 ml-auto">
              {canRestore && (
                <Button variant="secondary" size="sm" onClick={handleBulkRestore} loading={bulkBusy} disabled={bulkBusy}>
                  <i className="fas fa-clock-rotate-left text-[11px]" aria-hidden="true" /> Pulihkan
                </Button>
              )}
              {canPurge && (
                <Button variant="destructive" size="sm" onClick={handleBulkPurge} loading={bulkBusy} disabled={bulkBusy}>
                  <i className="fas fa-trash-can text-[11px]" aria-hidden="true" /> Hapus Permanen
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={bulkBusy}>
                Batalkan
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 p-4 sm:p-5 border-b border-ink-200/70">
            <SearchInput
              placeholder="Cari nama atau kode aset…"
              value={search}
              onChange={(e) => { setPage(1); setSearch(e.target.value); }}
              containerClassName="flex-1 min-w-0 max-w-sm"
            />
            {canSelect && pagination.total > items.length && (
              <Button
                variant="ghost" size="xs"
                onClick={handleSelectAllFiltered}
                loading={selectingAll}
                disabled={selectingAll}
                className="!text-brand-600 hover:!bg-brand-50"
              >
                {selectingAll ? 'Memilih…' : `Pilih semua ${pagination.total} hasil`}
              </Button>
            )}
          </div>
        )}

        {loading ? (
          <div className="p-2"><SkeletonRows rows={5} cols={5} /></div>
        ) : items.length === 0 ? (
          <EmptyState
            icon="fa-trash-can"
            title="Tempat sampah kosong"
            description={search
              ? 'Tidak ada aset di tempat sampah yang cocok dengan pencarian ini.'
              : 'Belum ada aset yang dihapus — kalau ada, akan muncul di sini.'}
          />
        ) : (
          <div className="overflow-x-auto scrollbar-slim">
            <table className="table-base min-w-[820px]">
              <thead>
                <tr>
                  {canSelect && (
                    <th className="w-10">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        ref={(el) => { if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected; }}
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                        aria-label="Pilih semua aset di halaman ini"
                      />
                    </th>
                  )}
                  <th>Aset</th>
                  <th>Kode Barang</th>
                  <th>Lokasi</th>
                  <th>Dihapus</th>
                  <th className="!text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const location = [item.location_name, item.sub_location_name].filter(Boolean).join(' · ');
                  const busy = busyId === item.id;
                  const isSelected = selected.has(item.id);
                  return (
                    <tr key={item.id} className={isSelected ? 'is-selected' : ''}>
                      {canSelect && (
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(item.id)}
                            aria-label={`Pilih ${item.name}`}
                          />
                        </td>
                      )}
                      <td>
                        <p className="font-semibold text-ink-800">{item.name}</p>
                        <p className="text-[11px] text-ink-400 font-mono mt-0.5 truncate max-w-[220px]" title={item.asset_code}>
                          {item.asset_code}
                        </p>
                      </td>
                      <td className="text-ink-600">{item.category_name}</td>
                      <td className="text-ink-600">{location || <span className="text-ink-300">—</span>}</td>
                      <td className="text-ink-500 text-[13px] tabular-nums whitespace-nowrap">
                        {new Date(item.deleted_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-2">
                          {canRestore && (
                            <Button
                              variant="secondary" size="xs"
                              onClick={() => handleRestore(item)}
                              disabled={busy}
                              loading={busy}
                            >
                              <i className="fas fa-clock-rotate-left text-[11px]" aria-hidden="true" /> Pulihkan
                            </Button>
                          )}
                          {canPurge && (
                            <Button
                              variant="destructive" size="xs"
                              onClick={() => handlePurge(item)}
                              disabled={busy}
                            >
                              <i className="fas fa-trash-can text-[11px]" aria-hidden="true" /> Hapus Permanen
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pagination.totalPages > 1 && (
          <div className="px-4 sm:px-5 pb-4">
            <Pagination page={page} totalPages={pagination.totalPages} totalItems={pagination.total} onChange={setPage} />
          </div>
        )}
      </Card>

      <p className="text-xs text-ink-400 mt-4 leading-relaxed">
        Cari aset yang belum ada di sini? Aset dihapus dari{' '}
        <Link to="/assets" className="text-brand-600 hover:text-brand-700 font-medium">Daftar Aset</Link>{' '}
        lewat tombol hapus baris — masuk ke tempat sampah begitu dihapus.
      </p>
    </>
  );
}
