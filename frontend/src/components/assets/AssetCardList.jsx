import React from 'react';
import { Link } from 'react-router-dom';
import StatusBadge, { ConditionBadge } from '../ui/StatusBadge.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Button from '../ui/Button.jsx';
import { SkeletonList } from '../ui/Skeleton.jsx';

/** Daftar aset versi kartu — dipakai di layar sempit, menggantikan tabel. */
export default function AssetCardList({ assets, loading, selected, onToggleSelect, onAddNew }) {
  if (loading) {
    return <div className="md:hidden"><SkeletonList count={6} /></div>;
  }

  if (assets.length === 0) {
    return (
      <div className="md:hidden">
        <EmptyState
          icon="fa-magnifying-glass"
          title="Tidak ada aset yang cocok"
          description="Coba ubah kata kunci pencarian atau bersihkan filter yang aktif."
          action={onAddNew ? <Button onClick={onAddNew} size="sm">Tambah Aset</Button> : undefined}
        />
      </div>
    );
  }

  return (
    <ul className="md:hidden divide-y divide-ink-100">
      {assets.map((a) => {
        const isSelected = selected.has(a.id);
        const location = [a.location_name, a.sub_location_name].filter(Boolean).join(' · ') || a.location;

        return (
          <li
            key={a.id}
            className={`flex items-start gap-3 p-4 transition-colors ${isSelected ? 'bg-brand-50/60' : ''}`}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(a.id)}
              aria-label={`Pilih ${a.name}`}
              className="mt-1 shrink-0"
            />

            <Link to={`/assets/${a.id}`} className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-800 truncate">{a.name}</p>
                  <p className="text-[11px] text-ink-400 font-mono mt-0.5 truncate">{a.asset_code}</p>
                </div>
                <StatusBadge status={a.status} size="sm" className="shrink-0" />
              </div>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2.5">
                <ConditionBadge condition={a.condition_status} size="sm" />
                {a.asset_type_name && (
                  <span className="text-[11px] text-ink-500">{a.asset_type_name}</span>
                )}
              </div>

              {location && (
                <p className="text-[11px] text-ink-400 mt-1.5 flex items-center gap-1.5 truncate">
                  <i className="fas fa-location-dot text-[9px] shrink-0" aria-hidden="true" />
                  {location}
                </p>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
