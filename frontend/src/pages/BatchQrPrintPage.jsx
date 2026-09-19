import React, { useEffect, useState } from 'react';
import axiosClient from '../api/axiosClient.js';
import { useLayoutWidth } from '../context/LayoutWidthContext.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button, { SegmentedControl } from '../components/ui/Button.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pagination from '../components/ui/Pagination.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import { SkeletonRows } from '../components/ui/Skeleton.jsx';
import { FormError, Checkbox } from '../components/ui/Form.jsx';
import AssetFilterBar from '../components/assets/AssetFilterBar.jsx';
import QrLabelDesign from '../components/assets/QrLabelDesign.jsx';

const SIZE_OPTIONS = [2, 3, 4, 5].map((s) => ({ value: s, label: `${s} cm` }));
const ZOOM_OPTIONS = [0.6, 0.8, 1, 1.3].map((z) => ({ value: z, label: `${Math.round(z * 100)}%` }));

const DEFAULT_CUT_MARGIN_CM = 0.15; // jarak garis potong ke desain barcode
const DEFAULT_LABEL_GAP_CM = 0;     // jarak antar label
const DEFAULT_PAGE_MARGIN_CM = 1;   // margin ke tepi kertas
const DEFAULT_PAGE_WIDTH_CM = 21;   // lebar kustom bawaan — sama seperti A4
const DEFAULT_PAGE_HEIGHT_CM = 29.7; // tinggi kustom bawaan — sama seperti A4

/* Bukan hanya A4/F4 — banyak percetakan label pakai kertas stiker/roll dengan
   ukuran sendiri, jadi opsi "Kustom" membuka dua kotak lebar/tinggi bebas.
   Ukurannya dalam cm supaya bisa langsung dipakai di CSS @page tanpa
   konversi, dan konsisten dengan satuan yang sudah dipakai di seluruh
   halaman ini (ukuran label, jarak potong, dst). */
const PAPER_PRESETS = [
  { value: 'a4', label: 'A4', wCm: 21, hCm: 29.7 },
  { value: 'f4', label: 'F4 / Folio', wCm: 21.5, hCm: 33 },
  { value: 'letter', label: 'Letter', wCm: 21.59, hCm: 27.94 },
  { value: 'legal', label: 'Legal', wCm: 21.59, hCm: 35.56 },
  { value: 'custom', label: 'Kustom' },
];
const ORIENTATION_OPTIONS = [
  { value: 'portrait', label: 'Potret' },
  { value: 'landscape', label: 'Lanskap' },
];

/** Kotak angka kecil untuk pengaturan jarak cetak (dalam cm). */
function CmInput({ label, value, onChange, step = 0.05, max = 5 }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-ink-500 whitespace-nowrap">{label}</label>
      <div className="relative">
        <input
          type="number" min="0" max={max} step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-20 rounded-lg border border-ink-200 bg-white px-2 py-1.5 pr-7 text-xs text-center
                     outline-none transition-colors focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ink-400 pointer-events-none">
          cm
        </span>
      </div>
    </div>
  );
}

export default function BatchQrPrintPage() {
  // ------- Filter & seleksi aset -------
  const [assets, setAssets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [assetTypes, setAssetTypes] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [assetTypeId, setAssetTypeId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [subLocationId, setSubLocationId] = useState('');
  const [status, setStatus] = useState('');
  const [condition, setCondition] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(new Set());

  // ------- Mode pratinjau/cetak -------
  const [mode, setMode] = useState('select'); // 'select' | 'preview'
  /* Pratinjau butuh lebar penuh untuk menampilkan lembar label berjajar. */
  useLayoutWidth(mode === 'preview' ? 'full' : 'default');
  const [sizeCm, setSizeCm] = useState(3);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [cutMarginCm, setCutMarginCm] = useState(DEFAULT_CUT_MARGIN_CM);
  const [labelGapCm, setLabelGapCm] = useState(DEFAULT_LABEL_GAP_CM);
  const [pageMarginCm, setPageMarginCm] = useState(DEFAULT_PAGE_MARGIN_CM);
  const [paperPreset, setPaperPreset] = useState('a4');
  const [orientation, setOrientation] = useState('portrait');
  const [customPageWidthCm, setCustomPageWidthCm] = useState(DEFAULT_PAGE_WIDTH_CM);
  const [customPageHeightCm, setCustomPageHeightCm] = useState(DEFAULT_PAGE_HEIGHT_CM);
  const [showCutLines, setShowCutLines] = useState(true);
  const [printAssets, setPrintAssets] = useState([]);
  const [preparingPrint, setPreparingPrint] = useState(false);
  const [printError, setPrintError] = useState('');

  useEffect(() => {
    axiosClient.get('/categories').then((res) => setCategories(res.data));
    axiosClient.get('/asset-types').then((res) => setAssetTypes(res.data));
  }, []);

  const queryParams = { search, categoryId, assetTypeId, locationId, subLocationId, status, condition, departmentId, page, limit: 10 };

  useEffect(() => {
    setLoading(true);
    axiosClient
      .get('/assets', { params: queryParams })
      .then((res) => {
        setAssets(res.data.data);
        setPagination(res.data.pagination);
      })
      .finally(() => setLoading(false));
  }, [search, categoryId, assetTypeId, locationId, subLocationId, status, condition, departmentId, page]);

  /* Mengganti filter mengembalikan ke halaman 1 DAN mengosongkan pilihan —
     kalau tidak, aset yang sudah tidak tampil bisa ikut tercetak tanpa terlihat. */
  function updateFilter(setter) {
    return (value) => { setter(value); setPage(1); setSelected(new Set()); };
  }

  function toggleSelect(asset) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(asset.id)) next.delete(asset.id); else next.add(asset.id);
      return next;
    });
  }

  function toggleSelectPage(checked) {
    setSelected((prev) => {
      const next = new Set(prev);
      assets.forEach((a) => (checked ? next.add(a.id) : next.delete(a.id)));
      return next;
    });
  }

  /* Pilih SEMUA aset yang cocok dengan filter saat ini — bukan hanya yang
     kebetulan tampil di halaman yang sedang dibuka. */
  async function selectAllFiltered() {
    setSelecting(true);
    try {
      const res = await axiosClient.get('/assets', {
        params: { ...queryParams, page: 1, limit: pagination.total || 1000 },
      });
      setSelected((prev) => {
        const next = new Set(prev);
        res.data.data.forEach((a) => next.add(a.id));
        return next;
      });
    } finally {
      setSelecting(false);
    }
  }

  const pageIds = assets.map((a) => a.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageSelected = pageIds.some((id) => selected.has(id));

  async function handleGoToPreview() {
    setPrintError('');
    setPreparingPrint(true);
    try {
      const res = await axiosClient.post('/assets/qr/batch', { ids: Array.from(selected) });
      setPrintAssets(res.data.data);
      setMode('preview');
      window.scrollTo({ top: 0 });
    } catch (err) {
      setPrintError(err.response?.data?.message || 'Gagal menyiapkan barcode untuk dicetak.');
    } finally {
      setPreparingPrint(false);
    }
  }

  function clampCm(value, fallback, max = 5) {
    const n = parseFloat(value);
    if (Number.isNaN(n) || n < 0) return fallback;
    return Math.min(n, max); // batas atas wajar, mencegah salah ketik jadi ratusan cm
  }

  const dashedBoxCm = sizeCm + cutMarginCm * 2;

  /* Ukuran kertas aktual — dari preset, atau dari dua kotak lebar/tinggi
     kalau "Kustom" dipilih. Lanskap cukup menukar lebar<->tinggi, bukan
     preset terpisah, supaya F4/Letter/Legal/Kustom semuanya otomatis ikut
     bisa dilanskapkan tanpa didaftar dua kali. */
  const activePaper = PAPER_PRESETS.find((p) => p.value === paperPreset) || PAPER_PRESETS[0];
  let pageWidthCm = paperPreset === 'custom' ? customPageWidthCm : activePaper.wCm;
  let pageHeightCm = paperPreset === 'custom' ? customPageHeightCm : activePaper.hCm;
  if (orientation === 'landscape') { [pageWidthCm, pageHeightCm] = [pageHeightCm, pageWidthCm]; }
  // Lebar yang benar-benar bisa dipakai label setelah margin tepi kiri+kanan dikurangi
  const usableWidthCm = Math.max(pageWidthCm - pageMarginCm * 2, dashedBoxCm);

  /* ============================================================
     MODE PRATINJAU CETAK
     ============================================================ */
  if (mode === 'preview') {
    return (
      <>
        <style>{`
          @media print {
            @page { size: ${pageWidthCm}cm ${pageHeightCm}cm; margin: ${pageMarginCm}cm; }
            body * { visibility: hidden; }
            #batch-print-area, #batch-print-area * { visibility: visible; }
            #batch-print-area {
              position: absolute;
              top: 0; left: 0; right: 0;
              margin: 0 !important;
              transform: none !important;
              width: auto !important;
            }
            .qr-label-cell { break-inside: avoid; page-break-inside: avoid; }
            #batch-preview-zoom { transform: none !important; width: auto !important; }
          }
        `}</style>

        <div className="print-hide">
          <PageHeader
            eyebrow="Cetak Massal"
            title="Pratinjau Cetak Label"
            description={`${printAssets.length} label ${sizeCm}×${sizeCm} cm, kertas ${activePaper.value === 'custom' ? `${pageWidthCm}×${pageHeightCm} cm` : activePaper.label} (${orientation === 'landscape' ? 'lanskap' : 'potret'}).`}
            actions={
              <>
                <Button variant="secondary" size="sm" onClick={() => setMode('select')}>
                  <i className="fas fa-arrow-left text-xs" aria-hidden="true" /> Ubah Pilihan
                </Button>
                <Button size="sm" onClick={() => window.print()}>
                  <i className="fas fa-print text-xs" aria-hidden="true" /> Cetak Sekarang
                </Button>
              </>
            }
          />

          {/* Pengaturan cetak */}
          <Card className="mb-5">
            <CardHeader
              title="Pengaturan Cetak"
              description="Sesuaikan dengan kertas stiker yang dipakai. Garis putus-putus hanya panduan gunting dan tidak ikut tercetak sebagai isi label."
              icon={(p) => <i {...p} className="fas fa-sliders text-xs" />}
            />

            <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
              <div className="flex items-center gap-2.5">
                <span className="text-xs text-ink-500 whitespace-nowrap">Ukuran label</span>
                <SegmentedControl options={SIZE_OPTIONS} value={sizeCm} onChange={setSizeCm} />
              </div>

              <div className="flex items-center gap-2.5">
                <span className="text-xs text-ink-500 whitespace-nowrap">Zoom tampilan</span>
                <SegmentedControl options={ZOOM_OPTIONS} value={previewZoom} onChange={setPreviewZoom} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-4 mt-5 pt-5 border-t border-ink-200/70">
              <div className="flex items-center gap-2.5">
                <span className="text-xs text-ink-500 whitespace-nowrap">Ukuran kertas</span>
                <SegmentedControl
                  options={PAPER_PRESETS.map(({ value, label }) => ({ value, label }))}
                  value={paperPreset} onChange={setPaperPreset}
                />
              </div>

              <div className="flex items-center gap-2.5">
                <span className="text-xs text-ink-500 whitespace-nowrap">Orientasi</span>
                <SegmentedControl options={ORIENTATION_OPTIONS} value={orientation} onChange={setOrientation} />
              </div>

              {paperPreset === 'custom' && (
                <>
                  <CmInput
                    label="Lebar kertas" step={0.5} max={100}
                    value={customPageWidthCm}
                    onChange={(v) => setCustomPageWidthCm(clampCm(v, DEFAULT_PAGE_WIDTH_CM, 100))}
                  />
                  <CmInput
                    label="Tinggi kertas" step={0.5} max={100}
                    value={customPageHeightCm}
                    onChange={(v) => setCustomPageHeightCm(clampCm(v, DEFAULT_PAGE_HEIGHT_CM, 100))}
                  />
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-4 mt-5 pt-5 border-t border-ink-200/70">
              <CmInput
                label="Margin tepi kertas" step={0.1}
                value={pageMarginCm}
                onChange={(v) => setPageMarginCm(clampCm(v, DEFAULT_PAGE_MARGIN_CM))}
              />
              <CmInput
                label="Jarak garis potong ke desain"
                value={cutMarginCm}
                onChange={(v) => setCutMarginCm(clampCm(v, DEFAULT_CUT_MARGIN_CM))}
              />
              <CmInput
                label="Jarak antar label"
                value={labelGapCm}
                onChange={(v) => setLabelGapCm(clampCm(v, DEFAULT_LABEL_GAP_CM))}
              />
            </div>

            <div className="mt-5 pt-5 border-t border-ink-200/70">
              <Checkbox
                label="Tampilkan garis potong-potong"
                description="Matikan kalau tidak ingin garis panduan gunting ikut tercetak — jarak dan ukuran antar label tetap persis sama, hanya garisnya yang disembunyikan."
                checked={showCutLines}
                onChange={(e) => setShowCutLines(e.target.checked)}
              />
            </div>

            <p className="hint">
              Atur skala printer ke <strong className="text-ink-600">100% (ukuran asli)</strong> —
              opsi “fit to page” akan membuat ukuran label meleset dari yang dipilih.
            </p>
          </Card>
        </div>

        {/* Area cetak */}
        <div className="overflow-auto scrollbar-slim rounded-2xl border border-ink-200/70 bg-ink-100 p-4
                        print:border-0 print:bg-transparent print:p-0 print:overflow-visible print:rounded-none">
          <div
            id="batch-preview-zoom"
            style={{
              transform: `scale(${previewZoom})`,
              transformOrigin: 'top left',
              width: previewZoom !== 1 ? `${100 / previewZoom}%` : '100%',
            }}
          >
            <div
              id="batch-print-area"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(auto-fill, ${dashedBoxCm}cm)`,
                gap: `${labelGapCm}cm`,
                justifyContent: 'start',
                /* Dibatasi ke lebar kertas yang benar-benar bisa dipakai
                   (setelah margin) supaya jumlah label per baris di layar
                   sama persis dengan yang akan tercetak — bukan sekadar
                   mengikuti lebar jendela peramban. Saat mencetak, aturan
                   `#batch-print-area { width: auto !important; }` di bawah
                   mengambil alih dan mengikuti ukuran halaman fisik. */
                width: `${usableWidthCm}cm`,
              }}
            >
              {printAssets.map((asset) => (
                <div
                  key={asset.id}
                  className="qr-label-cell"
                  style={{
                    width: `${dashedBoxCm}cm`,
                    height: `${dashedBoxCm}cm`,
                    boxSizing: 'border-box',
                    border: `1px dashed ${showCutLines ? '#9ca3af' : 'transparent'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: `${cutMarginCm}cm`,
                    background: '#fff',
                  }}
                >
                  <QrLabelDesign asset={asset} sizeCm={sizeCm} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  /* ============================================================
     MODE PILIH ASET
     ============================================================ */
  return (
    <>
      <PageHeader
        backTo="/assets"
        backLabel="Daftar Aset"
        eyebrow="Cetak Massal"
        title="Cetak Kode Batang Massal"
        description="Pilih aset yang labelnya perlu dicetak, lalu susun semuanya dalam satu halaman siap gunting."
      />

      <FormError className="mb-4">{printError}</FormError>

      {/* Filter yang sama persis dengan Daftar Aset — komponennya dipakai ulang,
          bukan disalin, supaya keduanya tidak menyimpang saat salah satu diubah.

          selectedCount sengaja 0: AssetFilterBar akan berganti jadi bilah aksi
          massal (pindah lokasi/jual/hapus) begitu nilainya > 0, padahal di
          halaman ini aksi atas aset terpilih hanya "cetak" — dan itu sudah
          punya bilah mengambang sendiri di bawah. */}
      <AssetFilterBar
        search={search} onSearchChange={updateFilter(setSearch)}
        categoryId={categoryId} onCategoryChange={updateFilter(setCategoryId)} categories={categories}
        assetTypeId={assetTypeId} onAssetTypeChange={updateFilter(setAssetTypeId)} assetTypes={assetTypes}
        locationId={locationId} onLocationChange={updateFilter(setLocationId)}
        subLocationId={subLocationId} onSubLocationChange={updateFilter(setSubLocationId)}
        status={status} onStatusChange={updateFilter(setStatus)}
        condition={condition} onConditionChange={updateFilter(setCondition)}
        departmentId={departmentId} onDepartmentChange={updateFilter(setDepartmentId)}
        totalItems={pagination.total}
        selectedCount={0}
        onSelectAllFiltered={selectAllFiltered}
        selectingAll={selecting}
      />

      {selected.size > 0 && (
        <div className="flex justify-end mb-3">
          <Button variant="ghost" size="xs" onClick={() => setSelected(new Set())}>
            Kosongkan pilihan ({selected.size})
          </Button>
        </div>
      )}

      <Card padded={false} className="overflow-hidden">
        <div className="overflow-x-auto scrollbar-slim">
          {loading ? (
            <SkeletonRows rows={8} cols={5} />
          ) : assets.length === 0 ? (
            <EmptyState
              icon="fa-magnifying-glass"
              title="Tidak ada aset yang cocok"
              description="Ubah kata kunci atau filter untuk menemukan aset yang ingin dicetak labelnya."
            />
          ) : (
            <table className="table-base min-w-[760px]">
              <thead>
                <tr>
                  <th className="w-10">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      ref={(el) => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
                      onChange={(e) => toggleSelectPage(e.target.checked)}
                      aria-label="Pilih semua aset di halaman ini"
                    />
                  </th>
                  <th>Kode Aset</th>
                  <th>Nama</th>
                  <th>Kode Barang</th>
                  <th>Lokasi</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => {
                  const isSelected = selected.has(asset.id);
                  return (
                    <tr
                      key={asset.id}
                      onClick={() => toggleSelect(asset)}
                      className={`cursor-pointer ${isSelected ? 'is-selected' : ''}`}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(asset)}
                          aria-label={`Pilih ${asset.name}`}
                        />
                      </td>
                      <td><span className="font-mono text-ink-700">{asset.asset_code}</span></td>
                      <td className="font-medium text-ink-800">{asset.name}</td>
                      <td className="text-ink-500">{asset.category_name || <span className="text-ink-300">—</span>}</td>
                      <td className="text-ink-500">{asset.location_name || <span className="text-ink-300">—</span>}</td>
                      <td><StatusBadge status={asset.status} size="sm" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <Pagination
        page={page}
        totalPages={pagination.totalPages}
        totalItems={pagination.total}
        onChange={setPage}
      />

      {/* Ruang kosong supaya baris terakhir tabel tidak tertutup bar mengambang */}
      {selected.size > 0 && <div className="h-24" aria-hidden="true" />}

      {/* Bar aksi mengambang */}
      {selected.size > 0 && (
        <div className="fixed bottom-16 lg:bottom-0 inset-x-0 lg:left-64 z-40
                        border-t border-ink-200 bg-white/95 backdrop-blur-md shadow-[0_-4px_16px_rgba(15,23,42,0.06)]
                        px-4 sm:px-6 py-3">
          <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2.5 text-sm font-semibold text-ink-800">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-white text-xs tabular-nums">
                {selected.size}
              </span>
              aset siap dicetak
            </span>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-400 hidden sm:inline">Ukuran</span>
                <SegmentedControl options={SIZE_OPTIONS} value={sizeCm} onChange={setSizeCm} size="xs" />
              </div>
              <Button onClick={handleGoToPreview} loading={preparingPrint} size="sm">
                {preparingPrint ? 'Menyiapkan…' : (
                  <><i className="fas fa-print text-xs" aria-hidden="true" /> Lihat &amp; Cetak</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
