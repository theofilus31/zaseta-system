import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axiosClient from '../api/axiosClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import Card from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pagination from '../components/ui/Pagination.jsx';
import AssetFilterBar from '../components/assets/AssetFilterBar.jsx';
import AssetTable from '../components/assets/AssetTable.jsx';
import AssetCardList from '../components/assets/AssetCardList.jsx';
import ImportCsvModal from '../components/ImportCsvModal.jsx';
import MoveAssetModal from '../components/assets/MoveAssetModal.jsx';
import { todayLocal } from '../utils/dateLocal.js';
import SellAssetModal from '../components/assets/SellAssetModal.jsx';

/* Nama kolom CSV di dalam teks panduan — gaya sama dengan chip daftar kolom di
   atasnya (ImportCsvModal), supaya jelas mana yang nama kolom persis. */
const Kol = ({ children }) => (
  <code className="rounded border border-ink-200 bg-white px-1 py-0.5 font-mono text-[11px] text-ink-600">{children}</code>
);

/* Menu data acuan yang harus terisi SEBELUM impor aset -- baris CSV merujuk
   Lokasi/Kode Barang/Kategori Aset lewat namanya, jadi harus sudah ada.
   Tautan hanya bisa diklik kalau pengguna berhak membuka menunya (rute
   dijaga izin per modul di App.jsx); kalau tidak, cukup teks biasa. */
const PRASYARAT_MENU = [
  { module: 'categories', href: '/categories', label: 'Kode Barang/Aset' },
  { module: 'asset_types', href: '/asset-types', label: 'Kategori Aset' },
  { module: 'locations', href: '/locations', label: 'Lokasi' },
];

function PrasyaratImpor({ can }) {
  return (
    <div className="mb-3 rounded-lg border border-info-200 bg-info-50 px-3 py-2.5 text-info-800">
      <p className="font-semibold">
        <i className="fas fa-circle-info mr-1.5 text-[11px]" aria-hidden="true" />
        Catatan: isi data acuan dulu sebelum impor
      </p>
      <p className="mt-1 text-info-700">
        Kode Barang/Aset, Kategori Aset (kalau kolom <Kol>asset_type</Kol> diisi), dan Lokasi wajib sudah
        terdaftar sebelum berkas diunggah. Lengkapi dulu lewat menu berikut — dibuka di tab baru, jadi
        berkas yang sudah Anda pilih di sini tidak hilang:
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-medium">
        {PRASYARAT_MENU.map((m) => (
          <li key={m.href}>
            {can(m.module, 'view') ? (
              <a
                href={m.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-brand-700 underline underline-offset-2 hover:text-brand-800"
              >
                {m.label}
                <i className="fas fa-arrow-up-right-from-square text-[9px]" aria-hidden="true" />
              </a>
            ) : (
              <span>{m.label}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Panduan impor aset — dulu satu paragraf panjang; dipecah per topik jadi daftar
   bernomor supaya bisa dibaca sekilas. Isinya SAMA, hanya disusun ulang. */
function AssetImportHelp() {
  const { can } = useAuth();
  return (
    <>
      <PrasyaratImpor can={can} />
      <ol className="list-decimal space-y-2 pl-4 marker:font-semibold marker:text-ink-600">
        <li>
          <span className="font-semibold text-ink-700">Kode aset tidak diisi manual.</span>{' '}
          Server menyusunnya otomatis dari <Kol>location</Kol> + <Kol>sub_location</Kol> + <Kol>category</Kol> + <Kol>id</Kol>.
        </li>
        <li>
          <span className="font-semibold text-ink-700">Kolom wajib:</span>{' '}
          <Kol>location</Kol> dan <Kol>category</Kol>. Keduanya harus sudah terdaftar dan aktif di sistem
          (menu Lokasi dan Kode Barang/Aset).
        </li>
        <li>
          <span className="font-semibold text-ink-700">Kolom opsional:</span>{' '}
          <Kol>sub_location</Kol>, dan <Kol>id</Kol> (nomor urut aset — kosongkan agar diisi otomatis oleh server).
        </li>
        <li>
          <span className="font-semibold text-ink-700">Boleh dikosongkan, dilengkapi belakangan lewat Ubah Aset:</span>{' '}
          <Kol>name</Kol>, <Kol>asset_type</Kol>, <Kol>condition</Kol>, <Kol>spec_detail</Kol>, <Kol>brand</Kol>,{' '}
          <Kol>model</Kol>, <Kol>status</Kol>. Kalau kosong: name dibuatkan otomatis, condition default Baik,
          status default idle.
        </li>
        <li>
          <span className="font-semibold text-ink-700">Pilihan isian:</span>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li><Kol>asset_type</Kol> (kalau diisi) wajib sudah ada di menu Kategori Aset.</li>
            <li>
              <Kol>spec_detail</Kol>: boleh beberapa baris — di Excel tekan Alt+Enter untuk baris baru dalam satu sel
              (contoh: 1. Intel i5, 2. RAM 8GB, 3. SSD 256GB).
            </li>
            <li><Kol>condition</Kol>: Baik / Rusak Ringan / Rusak Berat.</li>
            <li><Kol>status</Kol>: dijual, terjual, dipindah, dipakai, atau idle.</li>
          </ul>
        </li>
        <li>
          <span className="font-semibold text-ink-700">Khusus status dijual / terjual:</span>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li><Kol>sale_value_net</Kol> wajib kalau status = dijual (angka, tanpa titik/koma).</li>
            <li><Kol>sold_price</Kol> wajib kalau status = terjual (angka).</li>
            <li><Kol>sold_date</Kol> opsional (format YYYY-MM-DD).</li>
            <li>Ketiga kolom ini boleh kosong untuk status dipakai / idle / dipindah.</li>
          </ul>
        </li>
      </ol>
    </>
  );
}

/**
 * Menjalankan `task` untuk setiap item dengan batas jumlah permintaan yang
 * berjalan bersamaan.
 *
 * Sebelumnya aksi massal memakai Promise.all atas seluruh id sekaligus. Selama
 * seleksi terbatas pada 10 baris per halaman itu tidak terasa, tapi begitu
 * "Pilih semua hasil" tersedia, satu klik bisa melepas ratusan permintaan PUT
 * serentak — cukup untuk menguras connection pool MySQL dan membuat sebagian
 * gagal di tengah jalan.
 */
async function runInBatches(items, task, size = 5) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    results.push(...await Promise.all(chunk.map(task)));
  }
  return results;
}

export default function AssetList() {
  const { can } = useAuth();
  const { pushError, pushSuccess } = useNotification();
  const [searchParams] = useSearchParams();

  const [assets, setAssets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [assetTypes, setAssetTypes] = useState([]);

  /* Seluruh filter bisa diisi lewat query string. Tautan "Perlu Perhatian" &
     sebaran di Dasbor mengandalkan ini — tanpa dibaca di sini, klik dari
     dasbor akan mendarat di daftar yang tidak terfilter. */
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [categoryId, setCategoryId] = useState(searchParams.get('categoryId') || '');
  const [assetTypeId, setAssetTypeId] = useState(searchParams.get('assetTypeId') || '');
  const [locationId, setLocationId] = useState(searchParams.get('locationId') || '');
  const [subLocationId, setSubLocationId] = useState(searchParams.get('subLocationId') || '');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [condition, setCondition] = useState(searchParams.get('condition') || '');
  const [departmentId, setDepartmentId] = useState(searchParams.get('departmentId') || '');

  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [selectingAll, setSelectingAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showSellModal, setShowSellModal] = useState(null); // null | 'dijual' | 'terjual'

  useEffect(() => {
    axiosClient.get('/categories').then((res) => setCategories(res.data));
    axiosClient.get('/asset-types').then((res) => setAssetTypes(res.data));
  }, []);

  /* Selaraskan filter setiap kali query string berubah.
     Nilai awal useState hanya terbaca sekali saat komponen dipasang. Kalau
     pengguna berpindah antar dua daftar yang berbeda filternya tanpa komponen
     ini dilepas — misalnya menekan tombol Back peramban dari
     /assets?status=hilang ke /assets?departmentId=none — URL-nya berganti tapi
     isinya tetap memakai filter lama. */
  useEffect(() => {
    setSearch(searchParams.get('search') || '');
    setCategoryId(searchParams.get('categoryId') || '');
    setAssetTypeId(searchParams.get('assetTypeId') || '');
    setLocationId(searchParams.get('locationId') || '');
    setSubLocationId(searchParams.get('subLocationId') || '');
    setStatus(searchParams.get('status') || '');
    setCondition(searchParams.get('condition') || '');
    setDepartmentId(searchParams.get('departmentId') || '');
    setPage(1);
    setSelected(new Set());
    // toString() dipakai sebagai dependensi karena objek searchParams sendiri
    // bisa berganti identitas tanpa isinya berubah.
  }, [searchParams.toString()]);

  // Satu sumber untuk parameter filter, dipakai bersama oleh daftar,
  // "pilih semua hasil", dan ekspor — supaya ketiganya tidak pernah berbeda.
  const filterParams = { search, categoryId, assetTypeId, locationId, subLocationId, status, condition, departmentId };

  function reloadAssets() {
    setLoading(true);
    return axiosClient
      .get('/assets', { params: { ...filterParams, page, limit: 10 } })
      .then((res) => {
        setAssets(res.data.data);
        setPagination(res.data.pagination);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reloadAssets();
  }, [search, categoryId, assetTypeId, locationId, subLocationId, status, condition, departmentId, page]);

  /* Setiap perubahan filter mengembalikan ke halaman 1 dan mengosongkan
     pilihan — kalau tidak, aset yang sudah tidak tampil bisa ikut terkena
     aksi massal tanpa terlihat. */
  function updateFilter(setter) {
    return (value) => { setter(value); setPage(1); setSelected(new Set()); };
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(checked) {
    setSelected(checked ? new Set(assets.map((a) => a.id)) : new Set());
  }

  /**
   * Pilih SELURUH aset yang cocok dengan filter, bukan hanya 10 baris yang
   * sedang tampil. Tanpa ini aksi massal praktis tidak berguna: memindahkan
   * 300 aset berarti mengulang proses yang sama 30 kali.
   */
  async function handleSelectAllFiltered() {
    setSelectingAll(true);
    try {
      const res = await axiosClient.get('/assets', {
        params: { ...filterParams, page: 1, limit: pagination.total || 1000 },
      });
      setSelected(new Set(res.data.data.map((a) => a.id)));
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal memilih seluruh hasil filter.');
    } finally {
      setSelectingAll(false);
    }
  }

  /**
   * Unduh hasil filter sebagai CSV. Dilewatkan axiosClient (bukan tautan biasa)
   * supaya header Authorization ikut terkirim — endpointnya butuh JWT.
   */
  async function handleExport() {
    setExporting(true);
    try {
      const res = await axiosClient.get('/assets/export', {
        params: filterParams,
        responseType: 'blob',
      });

      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
      const stamp = todayLocal();
      const link = document.createElement('a');
      link.href = url;
      link.download = `daftar-aset-${stamp}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      pushSuccess(`${pagination.total} aset berhasil diekspor.`);
    } catch (err) {
      pushError('Gagal mengekspor daftar aset.');
    } finally {
      setExporting(false);
    }
  }

  async function handleBulkStatusChange(newStatus) {
    const ids = Array.from(selected);
    if (!confirm(`Ubah status ${ids.length} aset terpilih?`)) return;
    try {
      await runInBatches(ids, (id) => axiosClient.put(`/assets/${id}`, { status: newStatus }));
      setSelected(new Set());
      await reloadAssets();
      pushSuccess(`Status ${ids.length} aset berhasil diubah.`);
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal mengubah status sebagian/semua aset.');
    }
  }

  /* Pindahkan aset terpilih ke lokasi/sub lokasi baru. Status otomatis jadi
     "dipindah", sedangkan id & kode aset TIDAK berubah. */
  async function handleMoveAssets({ locationId: destLocationId, subLocationId: destSubLocationId }) {
    const ids = Array.from(selected);
    await runInBatches(ids, (id) => axiosClient.put(`/assets/${id}`, {
      status: 'dipindah', locationId: destLocationId, subLocationId: destSubLocationId,
    }));
    setSelected(new Set());
    setShowMoveModal(false);
    await reloadAssets();
    pushSuccess(`${ids.length} aset berhasil dipindahkan.`);
  }

  /* Tandai aset terpilih sebagai "Dijual" (butuh saleValueNet) atau "Terjual"
     (butuh soldPrice, soldDate opsional), sesuai mode modal yang aktif. */
  async function handleSellAssets(payload) {
    const ids = Array.from(selected);
    const mode = showSellModal;
    const body = mode === 'dijual'
      ? { status: 'dijual', saleValueNet: payload.saleValueNet }
      : { status: 'terjual', soldPrice: payload.soldPrice, soldDate: payload.soldDate };
    await runInBatches(ids, (id) => axiosClient.put(`/assets/${id}`, body));
    setSelected(new Set());
    setShowSellModal(null);
    await reloadAssets();
    pushSuccess(`${ids.length} aset ditandai ${mode === 'dijual' ? 'Dijual' : 'Terjual'}.`);
  }

  async function handleBulkDelete() {
    const ids = Array.from(selected);
    if (!confirm(`Hapus ${ids.length} aset terpilih? Tindakan ini tidak bisa dibatalkan.`)) return;
    try {
      await runInBatches(ids, (id) => axiosClient.delete(`/assets/${id}`));
      setSelected(new Set());
      await reloadAssets();
      pushSuccess(`${ids.length} aset berhasil dihapus.`);
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal menghapus sebagian/semua aset.');
    }
  }

  async function handleDeleteOne(asset) {
    if (!confirm(`Hapus aset "${asset.name}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    try {
      await axiosClient.delete(`/assets/${asset.id}`);
      await reloadAssets();
      pushSuccess(`Aset "${asset.name}" berhasil dihapus.`);
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal menghapus aset.');
    }
  }

  /* Tiap tombol mengikuti izinnya masing-masing: ada pengguna yang boleh
     menambah tapi tidak menghapus, atau sebaliknya. */
  const canCreate = can('assets', 'create');
  const canEditAssets = can('assets', 'edit');
  const canDeleteAssets = can('assets', 'delete');
  const canManage = canCreate || canEditAssets || canDeleteAssets;

  return (
    <>
      <PageHeader
        title="Daftar Aset"
        /* Jumlahnya tidak ditulis di sini: pagination.total mengikuti filter yang
           aktif, jadi kalimat "N aset terdaftar di sistem" jadi salah begitu ada
           filter dipasang. Angka yang akurat beserta konteksnya ditampilkan di
           baris hasil pada AssetFilterBar. */
        description="Seluruh aset IT perusahaan — cari, saring, lalu kelola secara massal."
        actions={
          <>
            <Button to="/cetak-barcode-massal" variant="secondary" size="sm">
              <i className="fas fa-print text-xs" aria-hidden="true" />
              <span className="hidden sm:inline">Cetak Label</span>
            </Button>
            {canManage && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}>
                  <i className="fas fa-file-import text-xs" aria-hidden="true" />
                  <span className="hidden sm:inline">Impor CSV</span>
                </Button>
                <Button to="/assets/new" size="sm">
                  <i className="fas fa-plus text-xs" aria-hidden="true" /> Tambah Aset
                </Button>
              </>
            )}
          </>
        }
      />

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
        onExport={handleExport} exporting={exporting}
        onSelectAllFiltered={canManage ? handleSelectAllFiltered : undefined}
        selectingAll={selectingAll}
        selectedCount={canManage ? selected.size : 0}
        onBulkStatusChange={handleBulkStatusChange}
        onClearSelection={() => setSelected(new Set())}
        canDelete={canDeleteAssets}
        onBulkDelete={handleBulkDelete}
        onMoveAssets={() => setShowMoveModal(true)}
        onSellAssets={() => setShowSellModal('dijual')}
        onMarkSoldAssets={() => setShowSellModal('terjual')}
      />

      <Card padded={false} className="overflow-hidden">
        <AssetTable
          assets={assets} loading={loading} selected={selected}
          onToggleSelect={toggleSelect} onToggleSelectAll={toggleSelectAll}
          canDelete={canDeleteAssets} onDelete={handleDeleteOne}
        />
        <AssetCardList
          assets={assets} loading={loading} selected={selected} onToggleSelect={toggleSelect}
        />
      </Card>

      <Pagination
        page={page}
        totalPages={pagination.totalPages}
        totalItems={pagination.total}
        onChange={setPage}
      />

      {showMoveModal && (
        <MoveAssetModal
          count={selected.size}
          onConfirm={handleMoveAssets}
          onClose={() => setShowMoveModal(false)}
        />
      )}

      {showSellModal && (
        <SellAssetModal
          mode={showSellModal}
          count={selected.size}
          onConfirm={handleSellAssets}
          onClose={() => setShowSellModal(null)}
        />
      )}

      {showImport && (
        <ImportCsvModal
          title="Impor Aset dari CSV"
          expectedColumns={['id', 'location', 'sub_location', 'category', 'name', 'asset_type', 'condition', 'spec_detail', 'brand', 'model', 'status', 'sale_value_net', 'sold_date', 'sold_price']}
          helpText={<AssetImportHelp />}
          sampleRows={[
            ['1', 'HO', '', 'LAPTOP', 'Laptop Marketing 1', 'Elektronik', 'Baik', '1. Intel i5\n2. RAM 8GB\n3. SSD 256GB', 'Dell', 'Latitude 5420', 'dipakai', '', '', ''],
            ['2', 'HO', 'GA', 'MEJA', 'Meja Kerja Staff', 'Furniture', 'Rusak Ringan', '', 'Informa', '-', 'idle', '', '', ''],
            ['', 'HO', '', 'LAPTOP', 'Laptop Marketing Lama', 'Elektronik', 'Rusak Ringan', '', 'Dell', 'Latitude 5410', 'dijual', '3500000', '', ''],
            ['', 'HO', '', 'LAPTOP', '', '', '', '', '', '', '', '', '', ''],
          ]}
          templateFileName="template-import-aset.csv"
          onUpload={async (file) => {
            const formData = new FormData();
            formData.append('file', file);
            const res = await axiosClient.post('/assets/import', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
            return res.data;
          }}
          onImported={reloadAssets}
          onClose={() => setShowImport(false)}
        />
      )}
    </>
  );
}
