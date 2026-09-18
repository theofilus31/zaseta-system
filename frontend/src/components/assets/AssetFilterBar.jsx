import React, { useEffect, useState } from 'react';
import { STATUS_CONFIG, CONDITION_CONFIG } from '../ui/StatusBadge.jsx';
import Button from '../ui/Button.jsx';
import { SearchInput, SearchableSelect } from '../ui/Form.jsx';
import axiosClient from '../../api/axiosClient.js';

/**
 * Status "dipindah" sengaja TIDAK muncul di dropdown "Ubah status ke…" —
 * perubahan ke status itu wajib lewat tombol "Pindah Lokasi" karena butuh
 * lokasi/sub lokasi tujuan. "dijual" & "terjual" juga tidak muncul di sini
 * karena keduanya wajib mengisi harga lewat modalnya masing-masing.
 */
const BULK_STATUS_OPTIONS = Object.entries(STATUS_CONFIG)
  .filter(([k]) => !['dipindah', 'dijual', 'terjual'].includes(k));

export default function AssetFilterBar({
  search, onSearchChange,
  categoryId, onCategoryChange, categories,
  assetTypeId, onAssetTypeChange, assetTypes,
  locationId, onLocationChange,
  subLocationId, onSubLocationChange,
  status, onStatusChange,
  condition, onConditionChange,
  departmentId, onDepartmentChange,
  selectedCount = 0, onBulkStatusChange, onClearSelection,
  canDelete = false, onBulkDelete,
  onMoveAssets, onSellAssets, onMarkSoldAssets,
  onSelectAllFiltered, selectingAll = false,
  totalItems, onExport, exporting = false,
}) {
  const [locations, setLocations] = useState([]);
  const [subLocations, setSubLocations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');

  useEffect(() => {
    axiosClient.get('/locations').then((res) => setLocations(res.data));
    axiosClient.get('/departments').then((res) => setDepartments(res.data));
  }, []);

  useEffect(() => {
    if (!locationId) { setSubLocations([]); return; }
    axiosClient.get('/sub-locations', { params: { locationId } }).then((res) => setSubLocations(res.data));
  }, [locationId]);

  function handleLocationChange(value) {
    onLocationChange(value);
    onSubLocationChange(''); // sub lokasi lama tidak lagi relevan
  }

  const activeFilterCount = [categoryId, assetTypeId, locationId, subLocationId, status, condition, departmentId].filter(Boolean).length;

  function clearAllFilters() {
    onCategoryChange('');
    onAssetTypeChange('');
    onLocationChange('');
    onSubLocationChange('');
    onStatusChange('');
    onConditionChange('');
    onDepartmentChange('');
  }

  /* ===================== MODE PILIH BANYAK =====================
     Menggantikan seluruh baris filter selama ada aset terpilih, supaya tidak
     ada dua kelompok kontrol yang bersaing minta perhatian. */
  if (selectedCount > 0) {
    return (
      <div className="sticky top-16 z-20 mb-4 rounded-2xl border border-brand-200 bg-brand-50/90 backdrop-blur-sm shadow-card">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <span className="flex items-center gap-2.5 text-sm font-semibold text-brand-800">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-white text-xs tabular-nums">
              {selectedCount}
            </span>
            aset terpilih
          </span>

          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <SearchableSelect
              value={bulkStatus}
              onChange={(v) => { if (v) { onBulkStatusChange(v); setBulkStatus(''); } }}
              options={BULK_STATUS_OPTIONS.map(([k, v]) => ({ key: k, label: v.label }))}
              getOptionLabel={(o) => o.label} getOptionValue={(o) => o.key}
              clearable={false}
              placeholder="Ubah status ke…"
              aria-label="Ubah status aset terpilih"
              className="w-44"
              inputClassName="!py-2 !text-[13px]"
            />

            <Button variant="secondary" size="sm" onClick={onSellAssets}>
              <i className="fas fa-tag text-[11px]" aria-hidden="true" /> Dijual
            </Button>
            <Button variant="secondary" size="sm" onClick={onMarkSoldAssets}>
              <i className="fas fa-hand-holding-dollar text-[11px]" aria-hidden="true" /> Terjual
            </Button>
            <Button variant="secondary" size="sm" onClick={onMoveAssets}>
              <i className="fas fa-location-dot text-[11px]" aria-hidden="true" /> Pindah Lokasi
            </Button>
            {canDelete && (
              <Button variant="destructive" size="sm" onClick={onBulkDelete}>
                <i className="fas fa-trash-can text-[11px]" aria-hidden="true" /> Hapus
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClearSelection}>Batalkan</Button>
          </div>
        </div>
      </div>
    );
  }

  /* ===================== MODE FILTER ===================== */
  return (
    /* TANPA overflow-hidden: dropdown SearchableSelect di baris filter
       berposisi absolute dan meluas ke bawah batas kartu ini — overflow-hidden
       akan memotongnya. Sudut kartu tetap terlihat membulat karena setiap
       anak langsungnya berwarna putih/senada, tidak ada yang perlu dipotong. */
    <div className="mb-4 rounded-2xl border border-ink-200/70 bg-white shadow-card">
      {/* Baris utama: pencarian + status + tombol filter lanjutan */}
      <div className="flex flex-col sm:flex-row gap-2.5 p-3">
        <SearchInput
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Cari nama, brand, model, atau kode aset…"
          aria-label="Cari aset"
          containerClassName="flex-1 min-w-0"
        />

        <SearchableSelect
          value={status} onChange={onStatusChange}
          options={Object.entries(STATUS_CONFIG).map(([k, v]) => ({ key: k, label: v.label }))}
          getOptionLabel={(o) => o.label} getOptionValue={(o) => o.key}
          placeholder="Semua Status" emptyLabel="Semua Status"
          aria-label="Filter status"
          sunken className="sm:w-44" inputClassName="!py-2.5 !text-[13px]"
        />

        <Button
          variant={expanded || activeFilterCount > 0 ? 'subtle' : 'secondary'}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="shrink-0 justify-center"
        >
          <i className="fas fa-sliders text-xs" aria-hidden="true" />
          Filter
          {activeFilterCount > 0 && (
            <span className="ml-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white tabular-nums">
              {activeFilterCount}
            </span>
          )}
          <i className={`fas fa-chevron-down text-[10px] transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        </Button>
      </div>

      {/* Filter lanjutan — disembunyikan secara default supaya baris atas tetap
          lapang; lima dropdown sekaligus terasa berat untuk pemakaian harian. */}
      {expanded && (
        <div className="border-t border-ink-200/70 bg-ink-50/60 px-3 py-3.5 animate-slide-down">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            <SearchableSelect
              label="Kondisi Fisik" value={condition} onChange={onConditionChange} searchable={false}
              options={Object.entries(CONDITION_CONFIG).map(([k, v]) => ({ key: k, label: v.label }))}
              getOptionLabel={(o) => o.label} getOptionValue={(o) => o.key}
              placeholder="Semua Kondisi" emptyLabel="Semua Kondisi"
              sunken inputClassName="!py-2.5 !text-[13px]"
            />

            <SearchableSelect
              label="Departemen" value={departmentId} onChange={onDepartmentChange}
              options={[{ id: 'none', name: '— Tanpa Departemen —' }, ...departments.map((d) => ({ id: d.id, name: `${d.code} · ${d.name}` }))]}
              placeholder="Semua Departemen" emptyLabel="Semua Departemen"
              sunken inputClassName="!py-2.5 !text-[13px]"
            />

            <SearchableSelect
              label="Kategori Aset" value={assetTypeId} onChange={onAssetTypeChange}
              options={assetTypes}
              placeholder="Semua Kategori Aset" emptyLabel="Semua Kategori Aset"
              sunken inputClassName="!py-2.5 !text-[13px]"
            />

            <SearchableSelect
              label="Kode Barang/Aset" value={categoryId} onChange={onCategoryChange}
              options={categories}
              placeholder="Semua Kode Barang" emptyLabel="Semua Kode Barang"
              sunken inputClassName="!py-2.5 !text-[13px]"
            />

            <SearchableSelect
              label="Lokasi" value={locationId} onChange={handleLocationChange}
              options={locations.map((l) => ({ id: l.id, name: `${l.code} · ${l.name}` }))}
              placeholder="Semua Lokasi" emptyLabel="Semua Lokasi"
              sunken inputClassName="!py-2.5 !text-[13px]"
            />

            <SearchableSelect
              label="Sub Lokasi" value={subLocationId} onChange={onSubLocationChange}
              disabled={!locationId}
              options={subLocations.map((sl) => ({ id: sl.id, name: `${sl.code} · ${sl.name}` }))}
              placeholder={locationId ? 'Semua Sub Lokasi' : 'Pilih lokasi dahulu'}
              emptyLabel={locationId ? 'Semua Sub Lokasi' : 'Pilih lokasi dahulu'}
              sunken inputClassName="!py-2.5 !text-[13px]"
            />
          </div>

          {activeFilterCount > 0 && (
            <div className="flex items-center justify-between gap-3 mt-3.5 pt-3 border-t border-ink-200/70">
              <p className="text-xs text-ink-500">
                {typeof totalItems === 'number'
                  ? <><span className="font-semibold text-ink-700 tabular-nums">{totalItems}</span> aset cocok dengan filter ini</>
                  : `${activeFilterCount} filter aktif`}
              </p>
              <Button variant="ghost" size="xs" onClick={clearAllFilters}>
                <i className="fas fa-xmark text-[10px]" aria-hidden="true" /> Bersihkan filter
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Baris hasil — tempat aksi yang berlaku atas SELURUH hasil filter,
          bukan hanya baris yang kebetulan tampil di halaman ini. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-200/70 bg-white px-4 py-2.5">
        <p className="text-xs text-ink-500">
          Menampilkan <span className="font-semibold text-ink-700 tabular-nums">{totalItems ?? 0}</span> aset
          {activeFilterCount > 0 && <span className="text-ink-400"> (terfilter)</span>}
        </p>

        <div className="flex flex-wrap items-center gap-3 ml-auto">
          {onSelectAllFiltered && totalItems > 0 && (
            <Button
              variant="ghost" size="xs"
              onClick={onSelectAllFiltered}
              loading={selectingAll}
              disabled={selectingAll}
              className="!text-brand-600 hover:!bg-brand-50"
            >
              {selectingAll ? 'Memilih…' : `Pilih semua ${totalItems} hasil`}
            </Button>
          )}

          {onExport && (
            <Button variant="ghost" size="xs" onClick={onExport} loading={exporting} disabled={exporting || !totalItems}>
              {exporting ? 'Menyiapkan…' : <><i className="fas fa-file-arrow-down text-[10px]" aria-hidden="true" /> Ekspor CSV</>}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
