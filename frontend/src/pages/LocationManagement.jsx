import React, { useEffect, useState } from 'react';
import ImportCsvModal from '../components/ImportCsvModal.jsx';
import axiosClient from '../api/axiosClient.js';
import { useNotification } from '../context/NotificationContext.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { Badge } from '../components/ui/StatusBadge.jsx';
import { TextField, TextareaField, FormError } from '../components/ui/Form.jsx';
import { todayLocal } from '../utils/dateLocal.js';

const EMPTY_LOC_FORM = { code: '', name: '', description: '' };
const EMPTY_SUB_FORM = { code: '', name: '', description: '' };

/* Kode lokasi hanya bisa diganti dengan hapus + buat ulang, karena kode itu
   sudah tertanam di kode aset yang terlanjur dicetak pada label fisik. */
const CODE_LOCKED_HINT = 'Kode tidak bisa diubah karena sudah dipakai di kode aset. Untuk mengganti kode, hapus lalu buat baru.';

export default function LocationManagement() {
  const { pushSuccess, pushError, pushLimitError } = useNotification();

  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [subLocations, setSubLocations] = useState([]);
  const [exporting, setExporting] = useState(false);

  const [locForm, setLocForm] = useState(EMPTY_LOC_FORM);
  const [locError, setLocError] = useState('');
  const [editingLocationId, setEditingLocationId] = useState(null);
  const [savingLoc, setSavingLoc] = useState(false);

  const [subForm, setSubForm] = useState(EMPTY_SUB_FORM);
  const [subError, setSubError] = useState('');
  const [editingSubLocationId, setEditingSubLocationId] = useState(null);
  const [savingSub, setSavingSub] = useState(false);

  const [showImport, setShowImport] = useState(false);

  function loadLocations() {
    axiosClient.get('/locations').then((res) => setLocations(res.data));
  }
  useEffect(() => { loadLocations(); }, []);

  function loadSubLocations(locationId) {
    if (!locationId) { setSubLocations([]); return; }
    axiosClient.get('/sub-locations', { params: { locationId } }).then((res) => setSubLocations(res.data));
  }
  useEffect(() => { loadSubLocations(selectedLocationId); }, [selectedLocationId]);

  /* ===================== LOKASI ===================== */
  function startEditLocation(loc) {
    setEditingLocationId(loc.id);
    setLocForm({ code: loc.code, name: loc.name, description: loc.description || '' });
    setLocError('');
  }

  function cancelEditLocation() {
    setEditingLocationId(null);
    setLocForm(EMPTY_LOC_FORM);
    setLocError('');
  }

  async function handleSubmitLocation(e) {
    e.preventDefault();
    setLocError('');
    setSavingLoc(true);
    try {
      if (editingLocationId) {
        // Kode sengaja tidak dikirim — backend juga mengabaikannya.
        await axiosClient.put(`/locations/${editingLocationId}`, {
          name: locForm.name, description: locForm.description,
        });
        pushSuccess('Lokasi berhasil diperbarui.');
      } else {
        await axiosClient.post('/locations', locForm);
        pushSuccess('Lokasi berhasil ditambahkan.');
      }
      cancelEditLocation();
      loadLocations();
    } catch (err) {
      setLocError(err.response?.data?.message || 'Gagal menyimpan lokasi.');
      if (err.response?.data?.code === 'PLAN_LIMIT_REACHED') pushLimitError(err);
    } finally {
      setSavingLoc(false);
    }
  }

  async function handleDeleteLocation(loc) {
    const ok = confirm(
      `Nonaktifkan lokasi "${loc.name}"? Sub lokasi di dalamnya juga tidak akan muncul lagi di dropdown.\n\n` +
      'Ini satu-satunya cara mengganti Kode Lokasi — hapus lalu buat lokasi baru dengan kode yang diinginkan.'
    );
    if (!ok) return;

    await axiosClient.delete(`/locations/${loc.id}`);
    if (String(loc.id) === String(selectedLocationId)) setSelectedLocationId('');
    if (String(loc.id) === String(editingLocationId)) cancelEditLocation();
    loadLocations();
    pushSuccess(`Lokasi "${loc.name}" dinonaktifkan.`);
  }

  /* ===================== SUB LOKASI ===================== */
  function startEditSubLocation(sl) {
    setEditingSubLocationId(sl.id);
    setSubForm({ code: sl.code, name: sl.name, description: sl.description || '' });
    setSubError('');
  }

  function cancelEditSubLocation() {
    setEditingSubLocationId(null);
    setSubForm(EMPTY_SUB_FORM);
    setSubError('');
  }

  async function handleSubmitSubLocation(e) {
    e.preventDefault();
    setSubError('');
    if (!selectedLocationId) { setSubError('Pilih lokasi induk terlebih dahulu.'); return; }

    setSavingSub(true);
    try {
      if (editingSubLocationId) {
        await axiosClient.put(`/sub-locations/${editingSubLocationId}`, {
          name: subForm.name, description: subForm.description,
        });
        pushSuccess('Sub lokasi berhasil diperbarui.');
      } else {
        await axiosClient.post('/sub-locations', { ...subForm, locationId: selectedLocationId });
        pushSuccess('Sub lokasi berhasil ditambahkan.');
      }
      cancelEditSubLocation();
      loadSubLocations(selectedLocationId);
    } catch (err) {
      setSubError(err.response?.data?.message || 'Gagal menyimpan sub lokasi.');
    } finally {
      setSavingSub(false);
    }
  }

  async function handleDeleteSubLocation(sl) {
    const ok = confirm(
      `Nonaktifkan sub lokasi "${sl.name}"?\n\n` +
      'Ini satu-satunya cara mengganti Kode Sub Lokasi — hapus lalu buat yang baru.'
    );
    if (!ok) return;

    await axiosClient.delete(`/sub-locations/${sl.id}`);
    if (String(sl.id) === String(editingSubLocationId)) cancelEditSubLocation();
    loadSubLocations(selectedLocationId);
    pushSuccess(`Sub lokasi "${sl.name}" dinonaktifkan.`);
  }

  /* Ganti lokasi induk → keluar dari mode edit sub lokasi supaya tidak salah target */
  function handleSelectLocation(id) {
    setSelectedLocationId(id);
    cancelEditSubLocation();
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await axiosClient.get('/locations/export', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `lokasi-${todayLocal()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      pushSuccess('Lokasi & sub lokasi berhasil diekspor.');
    } catch (err) {
      pushError('Gagal mengekspor lokasi.');
    } finally {
      setExporting(false);
    }
  }

  const selectedLocation = locations.find((l) => String(l.id) === String(selectedLocationId));

  return (
    <>
      <PageHeader
        eyebrow="Data Acuan"
        title="Lokasi & Sub Lokasi"
        description="Dua bagian pertama dari kode aset. Pilih sebuah lokasi di kolom kiri untuk mengelola sub lokasinya."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={handleExport} loading={exporting} disabled={exporting || !locations.length}>
              <i className="fas fa-file-export text-xs" aria-hidden="true" /> Export CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}>
              <i className="fas fa-file-import text-xs" aria-hidden="true" /> Impor CSV
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

        {/* ==================== KOLOM LOKASI ==================== */}
        <div className="space-y-5">
          <Card as="form" onSubmit={handleSubmitLocation} className={editingLocationId ? 'ring-2 ring-brand-500/20' : ''}>
            <CardHeader
              title={editingLocationId ? 'Ubah Lokasi' : 'Tambah Lokasi'}
              icon={(p) => <i {...p} className="fas fa-building text-xs" />}
            />

            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <TextField
                  label="Kode" required
                  value={locForm.code}
                  onChange={(e) => setLocForm({ ...locForm, code: e.target.value.toUpperCase() })}
                  disabled={Boolean(editingLocationId)}
                  title={editingLocationId ? CODE_LOCKED_HINT : ''}
                  placeholder="HO"
                  className="col-span-1 font-mono"
                />
                <TextField
                  label="Nama Lokasi" required
                  value={locForm.name}
                  onChange={(e) => setLocForm({ ...locForm, name: e.target.value })}
                  placeholder="Head Office"
                  className="col-span-2"
                />
              </div>

              {editingLocationId && <p className="hint -mt-2">{CODE_LOCKED_HINT}</p>}

              <TextareaField
                label="Deskripsi"
                value={locForm.description}
                onChange={(e) => setLocForm({ ...locForm, description: e.target.value })}
                rows={2}
                placeholder="Keterangan singkat (opsional)"
              />

              <FormError>{locError}</FormError>

              <div className="flex gap-2">
                <Button type="submit" loading={savingLoc} className="flex-1">
                  {savingLoc ? 'Menyimpan…' : editingLocationId ? 'Simpan Perubahan' : 'Simpan Lokasi'}
                </Button>
                {editingLocationId && (
                  <Button type="button" variant="secondary" onClick={cancelEditLocation}>Batal</Button>
                )}
              </div>
            </div>
          </Card>

          <Card padded={false} className="overflow-hidden">
            <CardHeader title="Daftar Lokasi" description={`${locations.length} lokasi aktif`} bordered />

            {locations.length === 0 ? (
              <EmptyState
                icon="fa-building"
                title="Belum ada lokasi"
                description="Tambahkan lokasi pertama melalui formulir di atas."
              />
            ) : (
              <div className="overflow-x-auto scrollbar-slim">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Kode</th>
                      <th>Nama Lokasi</th>
                      <th className="w-24 !text-right"><span className="sr-only">Aksi</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {locations.map((l) => {
                      const isSelected = String(selectedLocationId) === String(l.id);
                      return (
                        <tr
                          key={l.id}
                          onClick={() => handleSelectLocation(String(l.id))}
                          className={`cursor-pointer ${isSelected ? 'is-selected' : ''}`}
                        >
                          <td><Badge mono size="sm" tone={isSelected ? 'brand' : 'neutral'}>{l.code}</Badge></td>
                          <td className="font-medium text-ink-800">
                            {l.name}
                            {isSelected && (
                              <span className="ml-2 text-[11px] font-normal text-brand-600">· sedang dipilih</span>
                            )}
                          </td>
                          <td className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => startEditLocation(l)}
                              title={`Ubah ${l.name}`} aria-label={`Ubah ${l.name}`}
                              className="h-8 w-8 inline-flex items-center justify-center rounded-lg
                                         text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                            >
                              <i className="fas fa-pen text-[12px]" aria-hidden="true" />
                            </button>
                            <button
                              onClick={() => handleDeleteLocation(l)}
                              title={`Nonaktifkan ${l.name}`} aria-label={`Nonaktifkan ${l.name}`}
                              className="h-8 w-8 inline-flex items-center justify-center rounded-lg
                                         text-ink-300 hover:text-danger-600 hover:bg-danger-50 transition-colors"
                            >
                              <i className="fas fa-trash-can text-[13px]" aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* ==================== KOLOM SUB LOKASI ==================== */}
        <div className="space-y-5">
          <Card className={editingSubLocationId ? 'ring-2 ring-brand-500/20' : ''}>
            <CardHeader
              title={editingSubLocationId ? 'Ubah Sub Lokasi' : 'Tambah Sub Lokasi'}
              description={
                selectedLocation
                  ? `Di bawah lokasi ${selectedLocation.code} · ${selectedLocation.name}`
                  : 'Pilih lokasi induk terlebih dahulu.'
              }
              icon={(p) => <i {...p} className="fas fa-door-open text-xs" />}
            />

            {!selectedLocationId ? (
              <EmptyState
                icon="fa-hand-pointer"
                title="Belum ada lokasi dipilih"
                description="Klik salah satu baris pada Daftar Lokasi di kolom kiri untuk mengelola sub lokasinya."
                className="py-10"
              />
            ) : (
              <form onSubmit={handleSubmitSubLocation} className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <TextField
                    label="Kode" required
                    value={subForm.code}
                    onChange={(e) => setSubForm({ ...subForm, code: e.target.value.toUpperCase() })}
                    disabled={Boolean(editingSubLocationId)}
                    title={editingSubLocationId ? CODE_LOCKED_HINT : ''}
                    placeholder="LT2"
                    className="col-span-1 font-mono"
                  />
                  <TextField
                    label="Nama Sub Lokasi" required
                    value={subForm.name}
                    onChange={(e) => setSubForm({ ...subForm, name: e.target.value })}
                    placeholder="Lantai 2"
                    className="col-span-2"
                  />
                </div>

                {editingSubLocationId && <p className="hint -mt-2">{CODE_LOCKED_HINT}</p>}

                <TextareaField
                  label="Deskripsi"
                  value={subForm.description}
                  onChange={(e) => setSubForm({ ...subForm, description: e.target.value })}
                  rows={2}
                  placeholder="Keterangan singkat (opsional)"
                />

                <FormError>{subError}</FormError>

                <div className="flex gap-2">
                  <Button type="submit" loading={savingSub} className="flex-1">
                    {savingSub ? 'Menyimpan…' : editingSubLocationId ? 'Simpan Perubahan' : 'Simpan Sub Lokasi'}
                  </Button>
                  {editingSubLocationId && (
                    <Button type="button" variant="secondary" onClick={cancelEditSubLocation}>Batal</Button>
                  )}
                </div>
              </form>
            )}
          </Card>

          {selectedLocationId && (
            <Card padded={false} className="overflow-hidden">
              <CardHeader
                title="Daftar Sub Lokasi"
                description={`${subLocations.length} sub lokasi di ${selectedLocation?.code || ''}`}
                bordered
              />

              {subLocations.length === 0 ? (
                <EmptyState
                  icon="fa-door-open"
                  title="Belum ada sub lokasi di sini"
                  description="Lokasi ini belum punya pembagian ruang. Tambahkan lewat formulir di atas bila diperlukan."
                />
              ) : (
                <div className="overflow-x-auto scrollbar-slim">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Kode</th>
                        <th>Nama Sub Lokasi</th>
                        <th className="w-24 !text-right"><span className="sr-only">Aksi</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {subLocations.map((sl) => (
                        <tr key={sl.id} className={editingSubLocationId === sl.id ? 'is-selected' : ''}>
                          <td><Badge mono size="sm">{sl.code}</Badge></td>
                          <td className="font-medium text-ink-800">{sl.name}</td>
                          <td className="text-right whitespace-nowrap">
                            <button
                              onClick={() => startEditSubLocation(sl)}
                              title={`Ubah ${sl.name}`} aria-label={`Ubah ${sl.name}`}
                              className="h-8 w-8 inline-flex items-center justify-center rounded-lg
                                         text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                            >
                              <i className="fas fa-pen text-[12px]" aria-hidden="true" />
                            </button>
                            <button
                              onClick={() => handleDeleteSubLocation(sl)}
                              title={`Nonaktifkan ${sl.name}`} aria-label={`Nonaktifkan ${sl.name}`}
                              className="h-8 w-8 inline-flex items-center justify-center rounded-lg
                                         text-ink-300 hover:text-danger-600 hover:bg-danger-50 transition-colors"
                            >
                              <i className="fas fa-trash-can text-[13px]" aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      {showImport && (
        <ImportCsvModal
          title="Impor Lokasi & Sub Lokasi"
          expectedColumns={['location_code', 'location_name', 'sub_location_code', 'sub_location_name']}
          sampleRows={[
            ['HO', 'Head Office', 'LT1', 'Lantai 1'],
            ['HO', 'Head Office', 'LT2', 'Lantai 2'],
            ['WH', 'Warehouse', '', ''],
          ]}
          templateFileName="template-import-lokasi.csv"
          helpText="Dua kolom terakhir boleh dikosongkan kalau baris itu hanya untuk membuat Lokasi tanpa Sub Lokasi."
          onUpload={async (file) => {
            const formData = new FormData();
            formData.append('file', file);
            const res = await axiosClient.post('/locations/import', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
            return res.data;
          }}
          onImported={() => { loadLocations(); loadSubLocations(selectedLocationId); }}
          onClose={() => setShowImport(false)}
        />
      )}
    </>
  );
}
