import React from 'react';
import { Link } from 'react-router-dom';
import StatusBadge, { ConditionBadge } from '../ui/StatusBadge.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import { SkeletonRows } from '../ui/Skeleton.jsx';
import Button from '../ui/Button.jsx';

/** Tabel daftar aset — hanya tampil dari breakpoint md ke atas.
    Di layar sempit digantikan AssetCardList. */
export default function AssetTable({
  assets, loading, selected,
  onToggleSelect, onToggleSelectAll,
  onAddNew, canDelete, onDelete,
}) {
  if (loading) {
    return <div className="hidden md:block"><SkeletonRows rows={8} cols={6} /></div>;
  }

  if (assets.length === 0) {
    return (
      <div className="hidden md:block">
        <EmptyState
          icon="fa-magnifying-glass"
          title="Tidak ada aset yang cocok"
          description="Coba ubah kata kunci pencarian atau bersihkan filter yang sedang aktif."
          action={onAddNew ? <Button onClick={onAddNew} size="sm">Tambah Aset</Button> : undefined}
        />
      </div>
    );
  }

  const allSelected = assets.length > 0 && assets.every((a) => selected.has(a.id));
  const someSelected = assets.some((a) => selected.has(a.id));

  return (
    <div className="hidden md:block overflow-x-auto scrollbar-slim">
      <table className="table-base min-w-[860px]">
        <thead>
          <tr>
            <th className="w-10">
              <input
                type="checkbox"
                checked={allSelected}
                /* Indeterminate saat hanya sebagian baris terpilih — memberi
                   tahu bahwa "pilih semua" belum penuh. */
                ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                onChange={(e) => onToggleSelectAll(e.target.checked)}
                aria-label="Pilih semua aset di halaman ini"
              />
            </th>
            <th>Aset</th>
            <th>Pemegang</th>
            <th className="hidden xl:table-cell">Kode Barang</th>
            <th className="hidden lg:table-cell">Lokasi</th>
            <th>Kondisi</th>
            <th>Status</th>
            {canDelete && <th className="w-12 !text-right"><span className="sr-only">Aksi</span></th>}
          </tr>
        </thead>

        <tbody>
          {assets.map((a) => {
            const isSelected = selected.has(a.id);
            const location = [a.location_name, a.sub_location_name].filter(Boolean).join(' · ') || a.location;

            return (
              <tr key={a.id} className={isSelected ? 'is-selected' : ''}>
                <td onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(a.id)}
                    aria-label={`Pilih ${a.name}`}
                  />
                </td>

                <td>
                  <Link to={`/assets/${a.id}`} className="group block min-w-0">
                    <p className="font-semibold text-ink-800 group-hover:text-brand-600 transition-colors truncate">
                      {a.name}
                    </p>
                    <p className="text-[11px] text-ink-400 font-mono mt-0.5 truncate">{a.asset_code}</p>
                  </Link>
                </td>

                {/* Pemegang menggantikan kolom "Kategori Aset" di posisi ini:
                    saat menelusuri daftar, "siapa yang pegang" jauh lebih sering
                    dicari daripada klasifikasi asetnya. */}
                <td>
                  {a.holder_name ? (
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-ink-700 truncate">{a.holder_name}</p>
                      {a.holder_department && (
                        <p className="text-[11px] text-ink-400 truncate">{a.holder_department}</p>
                      )}
                    </div>
                  ) : (
                    <span className="text-ink-300">—</span>
                  )}
                </td>

                <td className="hidden xl:table-cell text-ink-600">{a.category_name || <span className="text-ink-300">—</span>}</td>

                <td className="hidden lg:table-cell text-ink-600">
                  {location || <span className="text-ink-300">—</span>}
                </td>

                <td><ConditionBadge condition={a.condition_status} size="sm" /></td>
                <td><StatusBadge status={a.status} size="sm" /></td>

                {canDelete && (
                  <td className="text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onDelete(a)}
                      title={`Hapus ${a.name}`}
                      aria-label={`Hapus ${a.name}`}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-lg
                                 text-ink-300 hover:text-danger-600 hover:bg-danger-50 transition-colors"
                    >
                      <i className="fas fa-trash-can text-[13px]" aria-hidden="true" />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
