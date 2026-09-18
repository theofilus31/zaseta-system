import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axiosClient from '../api/axiosClient.js';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button, { SegmentedControl } from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import { useUnsavedChanges, useUnsavedChangesContext } from '../context/UnsavedChangesContext.jsx';
import {
  TextField, SearchableSelect, DateField, TextareaField, FormField, Checkbox, FormError, CreateNewButton,
} from '../components/ui/Form.jsx';
import AssetTypeQuickAddModal from '../components/assetTypes/AssetTypeQuickAddModal.jsx';

const EMPTY_NEW_CATEGORY = { name: '', slug: '' };
const EMPTY_NEW_LOCATION = { code: '', name: '', description: '' };
const EMPTY_NEW_SUB_LOCATION = { code: '', name: '' };

const STATUS_OPTIONS = [
  { value: 'idle', label: 'Menganggur' },
  { value: 'dipakai', label: 'Dipakai' },
  { value: 'dijual', label: 'Dijual' },
  { value: 'terjual', label: 'Terjual' },
  { value: 'dipindah', label: 'Dipindahkan' },
  { value: 'hilang', label: 'Hilang' },
  { value: 'dihapuskan', label: 'Dihapuskan' },
];

/* Status yang menandakan aset sudah keluar dari inventaris — keduanya wajib
   disertai alasan, dan memunculkan blok berita acara di form. */
const RETIRED_STATUSES = ['hilang', 'dihapuskan'];

const CONDITION_OPTIONS = [
  { value: 'baik', label: 'Baik' },
  { value: 'rusak_ringan', label: 'Rusak Ringan' },
  { value: 'rusak_berat', label: 'Rusak Berat' },
];

const EMPTY_FORM = {
  categoryId: '', assetTypeId: '', name: '', brand: '', model: '', serialNumber: '', specDetail: '',
  condition: 'baik', status: 'idle', locationId: '', subLocationId: '', departmentId: '', sequenceNo: '',
  retiredDate: '', retiredReason: '', retiredDocNo: '',
  purchaseDate: '', purchasePrice: '', warrantyExpiry: '', usefulLifeMonths: '', salvageValue: '',
  saleValueNet: '', soldDate: '', soldPrice: '', vendor: '', notes: '',
};

/* Masa manfaat lazim untuk aset IT, disediakan sebagai pilihan supaya tidak
   perlu menghitung sendiri berapa bulan dari sekian tahun. */
const USEFUL_LIFE_OPTIONS = [
  { value: '', label: 'Tidak disusutkan' },
  { value: '24', label: '2 tahun (24 bulan)' },
  { value: '36', label: '3 tahun (36 bulan)' },
  { value: '48', label: '4 tahun (48 bulan)' },
  { value: '60', label: '5 tahun (60 bulan)' },
  { value: '96', label: '8 tahun (96 bulan)' },
];

/** Bentuk isian yang bisa dibandingkan apa adanya untuk mendeteksi perubahan. */
function snapshot(form, customFieldValues) {
  return JSON.stringify({ form, customFieldValues });
}

export default function AssetForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { pushError, pushSuccess, pushLimitError } = useNotification();

  const [categories, setCategories] = useState([]);
  const [assetTypes, setAssetTypes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [subLocations, setSubLocations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [originInfo, setOriginInfo] = useState(null); // hanya saat edit aset berstatus "dipindah"
  const [existingAssetCode, setExistingAssetCode] = useState('');
  const [customFieldValues, setCustomFieldValues] = useState({}); // { fieldId: value }
  const [saving, setSaving] = useState(false);

  /* Buat Kode Barang/Lokasi baru TANPA meninggalkan form ini — dulu tenant
     baru (belum punya kode barang/lokasi apa pun) wajib buka menu Data Acuan
     dulu sebelum bisa mengisi form aset sama sekali. Modal ini memanggil
     endpoint yang SAMA dipakai CategoryManagement.jsx/LocationManagement.jsx
     (POST /categories, POST /locations) — bukan alur baru, cuma jalan pintas
     dari dalam form ini. Begitu berhasil, hasilnya langsung dipilihkan ke
     field yang memicunya, supaya tidak perlu dicari & dipilih ulang manual. */
  const [newCategoryModal, setNewCategoryModal] = useState(false);
  const [newCategoryForm, setNewCategoryForm] = useState(EMPTY_NEW_CATEGORY);
  const [newCategoryError, setNewCategoryError] = useState('');
  const [savingNewCategory, setSavingNewCategory] = useState(false);

  /* Sama seperti kode barang di atas — "Kategori Aset" dulunya cuma bisa
     dipilih dari yang sudah ada, jadi tenant baru (belum sempat mengisi
     Data Acuan) wajib pindah halaman dulu sebelum bisa menambah aset sama
     sekali. Modalnya sendiri (AssetTypeQuickAddModal) dipakai bersama
     dengan ConsumableList.jsx sejak barang habis pakai ikut memakai
     kategori yang sama (lihat migration_consumable_asset_type.sql). */
  const [newAssetTypeModal, setNewAssetTypeModal] = useState(false);

  const [newLocationModal, setNewLocationModal] = useState(false);
  const [newLocationForm, setNewLocationForm] = useState(EMPTY_NEW_LOCATION);
  const [newLocationError, setNewLocationError] = useState('');
  const [savingNewLocation, setSavingNewLocation] = useState(false);
  /* Modal ini juga dipakai untuk kasus "lokasinya sudah ada, tinggal
     tambah sub lokasi baru di bawahnya" — tidak semua kunjungan ke modal
     ini benar-benar butuh lokasi induk BARU. `locationMode` menentukan
     apakah field Kode/Nama/Deskripsi (bikin lokasi baru) ditampilkan, atau
     diganti dropdown pemilih lokasi yang sudah tersimpan. */
  const [locationMode, setLocationMode] = useState('new'); // 'new' | 'existing'
  const [existingLocationId, setExistingLocationId] = useState('');
  // Sub lokasi opsional, BISA LEBIH DARI SATU (mis. Lantai 1, Lantai 2,
  // Gudang A) — dibuat lewat modal yang SAMA (bukan modal terpisah), karena
  // sub_locations.location_id wajib mengacu ke lokasi yang baru dibuat itu
  // sendiri. Baris kosong dilewati saat disimpan, tidak wajib diisi semua —
  // tetap bisa ditambah belakangan dari menu Data Acuan kalau tidak diisi di
  // sini sama sekali.
  const [newSubLocationForms, setNewSubLocationForms] = useState([EMPTY_NEW_SUB_LOCATION]);

  function updateSubLocationRow(index, field, value) {
    setNewSubLocationForms((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }
  function addSubLocationRow() {
    setNewSubLocationForms((rows) => [...rows, { ...EMPTY_NEW_SUB_LOCATION }]);
  }
  function removeSubLocationRow(index) {
    setNewSubLocationForms((rows) => rows.filter((_, i) => i !== index));
  }

  /* Potret isian saat form pertama siap dipakai — kosong untuk Tambah Aset,
     atau data yang baru dimuat untuk Ubah Aset. Perbandingan terhadap potret
     inilah yang menentukan apakah ada perubahan yang belum disimpan; memakai
     "ada isian yang tidak kosong" saja akan salah untuk mode Ubah, karena di
     sana semua kolom memang sudah terisi sejak awal. */
  const [baseline, setBaseline] = useState(() => snapshot(EMPTY_FORM, {}));
  const savedRef = useRef(false);

  function loadCategories() {
    return axiosClient.get('/categories').then((res) => { setCategories(res.data); return res.data; });
  }
  function loadAssetTypes() {
    return axiosClient.get('/asset-types').then((res) => { setAssetTypes(res.data); return res.data; });
  }
  function loadLocations() {
    return axiosClient.get('/locations').then((res) => { setLocations(res.data); return res.data; });
  }

  useEffect(() => {
    loadCategories();
    loadAssetTypes();
    loadLocations();
    axiosClient.get('/departments').then((res) => setDepartments(res.data));
  }, []);

  /* Bidang kustom: yang global langsung muncul, yang khusus kategori
     ditambahkan begitu kategori dipilih/berubah. */
  useEffect(() => {
    axiosClient
      .get('/custom-fields', { params: { categoryId: form.categoryId || undefined } })
      .then((res) => setCustomFieldDefs(res.data));
  }, [form.categoryId]);

  function loadSubLocations(locationId) {
    if (!locationId) { setSubLocations([]); return Promise.resolve([]); }
    return axiosClient.get('/sub-locations', { params: { locationId } })
      .then((res) => { setSubLocations(res.data); return res.data; });
  }

  useEffect(() => {
    loadSubLocations(form.locationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.locationId]);

  useEffect(() => {
    if (!isEdit) return;
    axiosClient.get(`/assets/${id}`).then((res) => {
      const a = res.data;
      setExistingAssetCode(a.asset_code);

      const loaded = {
        categoryId: a.category_id, assetTypeId: a.asset_type_id || '', name: a.name, brand: a.brand || '',
        model: a.model || '', serialNumber: a.serial_number || '', specDetail: a.spec_detail || '',
        condition: a.condition_status || 'baik', status: a.status,
        locationId: a.location_id || '', subLocationId: a.sub_location_id || '',
        departmentId: a.department_id || '', sequenceNo: a.sequence_no || '',
        retiredDate: a.retired_date || '',
        retiredReason: a.retired_reason || '',
        retiredDocNo: a.retired_doc_no || '',
        purchaseDate: a.purchase_date ? a.purchase_date.split('T')[0] : '',
        purchasePrice: a.purchase_price || '',
        warrantyExpiry: a.warranty_expiry ? a.warranty_expiry.split('T')[0] : '',
        usefulLifeMonths: a.useful_life_months || '',
        salvageValue: a.salvage_value || '',
        saleValueNet: a.sale_value_net || '',
        soldDate: a.sold_date ? a.sold_date.split('T')[0] : '',
        soldPrice: a.sold_price || '',
        vendor: a.vendor || '', notes: a.notes || '',
      };
      setForm(loaded);
      setOriginInfo(
        a.status === 'dipindah' && (a.origin_location_name || a.origin_sub_location_name)
          ? { locationName: a.origin_location_name, subLocationName: a.origin_sub_location_name }
          : null
      );
      const values = {};
      a.customFields.forEach((cf) => { if (cf.value_text !== null) values[cf.field_id] = cf.value_text; });
      setCustomFieldValues(values);

      // Data yang baru dimuat inilah titik nol untuk mode Ubah
      setBaseline(snapshot(loaded, values));
    });
  }, [id, isEdit]);

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  /* Adaptor untuk SearchableSelect — onChange-nya mengirim nilai langsung,
     bukan event, jadi tidak bisa dipakai langsung dengan handleChange. */
  const changeField = (name) => (value) => setForm((f) => ({ ...f, [name]: value }));

  /* Ganti lokasi induk → reset sub lokasi, karena pilihan lama sudah tidak relevan */
  function handleLocationChange(value) {
    setForm((f) => ({ ...f, locationId: value, subLocationId: '' }));
  }

  async function handleCreateCategory(e) {
    e.preventDefault();
    setNewCategoryError('');
    setSavingNewCategory(true);
    try {
      const res = await axiosClient.post('/categories', newCategoryForm);
      await loadCategories();
      setForm((f) => ({ ...f, categoryId: String(res.data.id) }));
      setNewCategoryModal(false);
      setNewCategoryForm(EMPTY_NEW_CATEGORY);
      pushSuccess(`Kode barang "${res.data.name}" ditambahkan dan langsung dipilih.`);
    } catch (err) {
      setNewCategoryError(err.response?.data?.message || 'Gagal menyimpan kode barang/aset.');
    } finally {
      setSavingNewCategory(false);
    }
  }

  /* Sub lokasi opsional, BISA LEBIH DARI SATU BARIS — baris kosong
     dilewati, satu per satu berurutan (bukan Promise.all) supaya kalau
     salah satu gagal (mis. kode dobel), sisanya tetap lanjut dicoba dan
     pesan galatnya bisa disebutkan per baris. Gagal di sini TIDAK
     membatalkan lokasi induk yang sudah berhasil dibuat/dipilih. Dipakai
     KEDUA mode modal ini (lokasi baru MAUPUN lokasi yang sudah ada). */
  async function createSubLocationRows(locationId) {
    const rowsToCreate = newSubLocationForms.filter((row) => row.code.trim() && row.name.trim());
    const createdSubLocations = [];
    const failedSubLocations = [];
    for (const row of rowsToCreate) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const subRes = await axiosClient.post('/sub-locations', { ...row, locationId });
        createdSubLocations.push({ id: String(subRes.data.id), name: subRes.data.name });
      } catch (subErr) {
        failedSubLocations.push({ code: row.code, message: subErr.response?.data?.message || 'Gagal ditambahkan.' });
      }
    }
    if (failedSubLocations.length > 0) {
      pushError(`Sub lokasi ${failedSubLocations.map((f) => `"${f.code}" (${f.message})`).join(', ')} tidak tersimpan.`);
    }
    return createdSubLocations;
  }

  function resetLocationModal() {
    setNewLocationModal(false);
    setNewLocationForm(EMPTY_NEW_LOCATION);
    setNewSubLocationForms([EMPTY_NEW_SUB_LOCATION]);
    setLocationMode('new');
    setExistingLocationId('');
  }

  async function handleCreateLocation(e) {
    e.preventDefault();
    setNewLocationError('');

    if (locationMode === 'existing') {
      if (!existingLocationId) { setNewLocationError('Pilih lokasi yang sudah ada terlebih dahulu.'); return; }
      const rowsFilled = newSubLocationForms.some((row) => row.code.trim() && row.name.trim());
      if (!rowsFilled) { setNewLocationError('Isi minimal satu sub lokasi untuk ditambahkan.'); return; }

      setSavingNewLocation(true);
      try {
        const createdSubLocations = await createSubLocationRows(existingLocationId);
        // WAJIB dituntaskan sebelum setForm — sama seperti alasannya di
        // jalur "lokasi baru" di bawah (lihat komentarnya di sana).
        await loadSubLocations(existingLocationId);
        const firstSubLocation = createdSubLocations[0];
        const chosenLocation = locations.find((l) => String(l.id) === String(existingLocationId));
        setForm((f) => ({ ...f, locationId: String(existingLocationId), subLocationId: firstSubLocation?.id || f.subLocationId }));
        resetLocationModal();
        if (createdSubLocations.length > 0) {
          pushSuccess(`${createdSubLocations.length} sub lokasi ditambahkan ke "${chosenLocation?.name}". "${firstSubLocation.name}" langsung dipilih.`);
        }
      } catch (err) {
        setNewLocationError(err.response?.data?.message || 'Gagal menyimpan sub lokasi.');
      } finally {
        setSavingNewLocation(false);
      }
      return;
    }

    setSavingNewLocation(true);
    try {
      const res = await axiosClient.post('/locations', newLocationForm);
      await loadLocations();

      const createdSubLocations = await createSubLocationRows(res.data.id);

      // WAJIB dituntaskan sebelum setForm — kalau tidak, kotak Sub Lokasi
      // sempat menyinkronkan teksnya duluan terhadap daftar `subLocations`
      // yang MASIH KOSONG (belum sempat dimuat ulang), jadi kotaknya
      // kelihatan kosong walau `form.subLocationId` sebenarnya sudah benar
      // terisi (nilai preview kode aset tetap benar, cuma tampilan kotaknya
      // yang keliru) — bug nyata yang sempat kejadian sebelum baris ini ada.
      await loadSubLocations(res.data.id);

      // Cuma sub lokasi PERTAMA yang langsung dipilihkan ke form aset (satu
      // aset cuma bisa berada di satu sub lokasi) — sisanya tetap tersimpan
      // di sistem, tinggal dipilih manual kalau perlu dipakai aset lain.
      const firstSubLocation = createdSubLocations[0];
      setForm((f) => ({ ...f, locationId: String(res.data.id), subLocationId: firstSubLocation?.id || '' }));
      resetLocationModal();
      pushSuccess(
        createdSubLocations.length > 0
          ? `Lokasi "${res.data.name}" dan ${createdSubLocations.length} sub lokasi ditambahkan. "${firstSubLocation.name}" langsung dipilih.`
          : `Lokasi "${res.data.name}" ditambahkan dan langsung dipilih.`
      );
    } catch (err) {
      // Batas paket (PLAN_LIMIT_REACHED — lihat middleware/planLimits.js
      // checkLocationLimit) dapat CTA "Upgrade Plan" lewat toast, bukan cuma
      // pesan galat polos di dalam modal.
      if (err.response?.data?.code === 'PLAN_LIMIT_REACHED') {
        pushLimitError(err);
        setNewLocationError(err.response.data.message);
      } else {
        setNewLocationError(err.response?.data?.message || 'Gagal menyimpan lokasi.');
      }
    } finally {
      setSavingNewLocation(false);
    }
  }

  function handleCustomFieldChange(fieldId, value) {
    setCustomFieldValues((prev) => ({ ...prev, [fieldId]: value }));
  }

  /* Pratinjau kode aset — dihitung ulang setiap lokasi/sub lokasi/kategori/
     nomor urut berubah. HANYA untuk ditampilkan; kode final tetap disusun &
     divalidasi di backend saat submit. */
  const selectedCategory = categories.find((c) => String(c.id) === String(form.categoryId));
  const selectedLocation = locations.find((l) => String(l.id) === String(form.locationId));
  const selectedSubLocation = subLocations.find((sl) => String(sl.id) === String(form.subLocationId));
  const previewSequence = form.sequenceNo ? String(form.sequenceNo).padStart(4, '0') : 'auto';
  const codeParts = [selectedLocation?.code, selectedSubLocation?.code, selectedCategory?.slug, previewSequence]
    .filter(Boolean);

  /* Kolom finansial khusus hanya relevan untuk status tertentu */
  const isRetired = RETIRED_STATUSES.includes(form.status);
  const showDijualField = form.status === 'dijual';
  const showTerjualFields = form.status === 'terjual';
  const needsSaleValueNet = showDijualField && !String(form.saleValueNet || '').trim();
  const needsSoldPrice = showTerjualFields && !String(form.soldPrice || '').trim();

  /* Ada perubahan yang belum disimpan? Bandingkan isian sekarang dengan potret
     awalnya. Saat sedang/selesai menyimpan, penjaga dimatikan supaya navigasi
     ke halaman detail setelah sukses tidak ikut dicegat. */
  const isDirty = !saving && !savedRef.current && snapshot(form, customFieldValues) !== baseline;
  useUnsavedChanges(isDirty);

  const { requestNavigation } = useUnsavedChangesContext();

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, customFields: customFieldValues };
      if (isEdit) {
        await axiosClient.put(`/assets/${id}`, payload);
        savedRef.current = true;
        pushSuccess('Perubahan aset berhasil disimpan.');
        navigate(`/assets/${id}`);
      } else {
        const res = await axiosClient.post('/assets', payload);
        savedRef.current = true;
        pushSuccess('Aset baru berhasil ditambahkan.');
        navigate(`/assets/${res.data.id}`);
      }
    } catch (err) {
      pushLimitError(err, 'Gagal menyimpan aset.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        backTo={isEdit ? `/assets/${id}` : '/assets'}
        backLabel={isEdit ? 'Detail Aset' : 'Daftar Aset'}
        eyebrow={isEdit ? 'Ubah Data' : 'Data Baru'}
        title={isEdit ? 'Ubah Aset' : 'Tambah Aset'}
        description={
          isEdit
            ? 'Perubahan status akan tercatat otomatis di riwayat aset.'
            : 'Kode aset dan Kode QR dibuat otomatis oleh sistem setelah disimpan.'
        }
      />

      <form onSubmit={handleSubmit} className="space-y-5 pb-28 lg:pb-6">

        {/* ==================== KODE ASET ==================== */}
        <Card>
          <CardHeader
            title="Penempatan & Kode Aset"
            description="Kode aset disusun otomatis dari Lokasi, Sub Lokasi, Kode Barang, dan nomor urut."
          />

          {isEdit ? (
            <div className="mb-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-2">Kode Aset</p>
              <p className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 px-4 py-2.5 font-mono text-sm text-ink-700">
                <i className="fas fa-lock text-[10px] text-ink-400" aria-hidden="true" />
                {existingAssetCode}
              </p>
              <p className="hint">Kode aset tidak berubah meskipun lokasi atau kode barang diperbarui.</p>
            </div>
          ) : (
            /* Pratinjau kode dibangun sebagai potongan-potongan supaya pengguna
               melihat bagian mana yang masih kosong, bukan hanya string gabungan. */
            <div className="mb-5 rounded-2xl border border-dashed border-ink-300 bg-ink-50 px-4 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-2">
                Pratinjau Kode Aset
              </p>
              {codeParts.length > 1 ? (
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-sm">
                  {codeParts.map((part, i) => (
                    <React.Fragment key={`${part}-${i}`}>
                      {i > 0 && <span className="text-ink-300">/</span>}
                      <span
                        className={`rounded-md px-2 py-1 ${
                          part === 'auto'
                            ? 'bg-warning-100 text-warning-700 text-xs'
                            : 'bg-white text-ink-700 border border-ink-200'
                        }`}
                      >
                        {part}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-400">Pilih Lokasi dan Kode Barang/Aset terlebih dahulu.</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SearchableSelect
              label="Kode Barang/Aset" value={form.categoryId} onChange={changeField('categoryId')} required
              options={categories} getOptionLabel={(c) => `${c.name} · ${c.slug}`}
              placeholder="Cari kode barang/aset…" emptyLabel="Pilih kode barang/aset"
              labelAction={<CreateNewButton onClick={() => setNewCategoryModal(true)} />}
            />

            {!isEdit && (
              <TextField
                label="Nomor Urut" name="sequenceNo" type="number" min="1"
                value={form.sequenceNo} onChange={handleChange}
                placeholder="Otomatis"
                hint="Kosongkan agar sistem mengisi nomor kosong terkecil yang belum pernah dipakai."
              />
            )}

            <SearchableSelect
              label="Lokasi" value={form.locationId} onChange={handleLocationChange} required
              options={locations} getOptionLabel={(l) => `${l.code} · ${l.name}`}
              placeholder="Cari lokasi…" emptyLabel="Pilih lokasi"
              labelAction={<CreateNewButton onClick={() => setNewLocationModal(true)} />}
            />

            <SearchableSelect
              label="Sub Lokasi" value={form.subLocationId} onChange={changeField('subLocationId')}
              disabled={!form.locationId}
              options={subLocations} getOptionLabel={(sl) => `${sl.code} · ${sl.name}`}
              placeholder="Cari sub lokasi…"
              emptyLabel={form.locationId ? 'Tanpa sub lokasi (opsional)' : 'Pilih lokasi dahulu'}
            />

            <SearchableSelect
              label="Departemen" value={form.departmentId} onChange={changeField('departmentId')}
              className="sm:col-span-2"
              hint="Divisi penanggung jawab aset. Tetap melekat meski aset tidak sedang dipegang siapa pun."
              options={departments} getOptionLabel={(d) => `${d.code} · ${d.name}`}
              placeholder="Cari departemen…" emptyLabel="Belum ditentukan"
            />
          </div>
        </Card>

        {/* ==================== INFORMASI DASAR ==================== */}
        <Card>
          <CardHeader title="Informasi Dasar" description="Identitas fisik dan kondisi aset." />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField
              label="Nama Aset" name="name" value={form.name} onChange={handleChange}
              required className="sm:col-span-2" placeholder="Mis. Laptop Marketing 1"
            />

            <SearchableSelect
              label="Kategori Aset" value={form.assetTypeId} onChange={changeField('assetTypeId')} required
              options={assetTypes} placeholder="Cari kategori aset…" emptyLabel="Pilih kategori aset"
              labelAction={<CreateNewButton onClick={() => setNewAssetTypeModal(true)} />}
            />

            <SearchableSelect
              label="Kondisi Fisik" value={form.condition} onChange={changeField('condition')} required
              clearable={false} searchable={false}
              options={CONDITION_OPTIONS} getOptionLabel={(c) => c.label} getOptionValue={(c) => c.value}
              placeholder="Pilih kondisi…"
            />

            <TextField label="Brand" name="brand" value={form.brand} onChange={handleChange} placeholder="Mis. Dell" />
            <TextField label="Model" name="model" value={form.model} onChange={handleChange} placeholder="Mis. Latitude 5420" />
            <TextField label="Nomor Seri" name="serialNumber" value={form.serialNumber} onChange={handleChange} className="font-mono" />

            <div>
              <SearchableSelect
                label="Status" value={form.status} onChange={changeField('status')} clearable={false} searchable={false}
                options={STATUS_OPTIONS} getOptionLabel={(s) => s.label} getOptionValue={(s) => s.value}
                placeholder="Pilih status…"
              />

              {originInfo && (
                <p className="mt-2 flex gap-2 rounded-lg bg-accent-50 px-3 py-2 text-xs text-accent-700 leading-relaxed">
                  <i className="fas fa-route mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    Lokasi asal: <strong>{[originInfo.locationName, originInfo.subLocationName].filter(Boolean).join(' · ') || '—'}</strong>.
                    Status hanya bisa diubah ke Dipakai/Menganggur jika Lokasi &amp; Sub Lokasi di atas
                    dikembalikan persis ke lokasi asal ini.
                  </span>
                </p>
              )}

              {(needsSaleValueNet || needsSoldPrice) && (
                <p className="mt-2 flex gap-2 rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-700 leading-relaxed">
                  <i className="fas fa-triangle-exclamation mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    Status {needsSaleValueNet ? 'Dijual' : 'Terjual'} dipilih — jangan lupa isi{' '}
                    <strong>{needsSaleValueNet ? 'Harga Jual/Net' : 'Harga Terjual'}</strong> di bagian
                    Informasi Keuangan di bawah.
                  </span>
                </p>
              )}
            </div>

            <TextareaField
              label="Detail Spesifikasi" name="specDetail" value={form.specDetail} onChange={handleChange}
              rows={4} className="sm:col-span-2"
              placeholder={'Contoh:\n1. Processor Intel Core i5\n2. RAM 8GB\n3. SSD 256GB'}
              hint="Tulis bebas atau gunakan daftar bernomor (1. 2. 3. …) — daftar bernomor otomatis ditampilkan menurun di halaman detail dan halaman pindai publik."
            />
          </div>
        </Card>

        {/* ==================== KEUANGAN ==================== */}
        <Card>
          <CardHeader title="Informasi Keuangan" description="Detail pembelian, dan penjualan bila sudah tidak terpakai." />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField label="Vendor" name="vendor" value={form.vendor} onChange={handleChange} className="sm:col-span-2" />
            <DateField label="Tanggal Pembelian" name="purchaseDate" value={form.purchaseDate} onChange={handleChange} />
            <TextField label="Harga Beli" name="purchasePrice" type="number" min="0" value={form.purchasePrice} onChange={handleChange} placeholder="0" />

            <DateField
              label="Garansi Berakhir" name="warrantyExpiry"
              value={form.warrantyExpiry} onChange={handleChange}
              hint="Aset yang garansinya mendekati habis akan muncul di Dasbor."
            />

            <SearchableSelect
              label="Masa Manfaat" value={String(form.usefulLifeMonths)} onChange={changeField('usefulLifeMonths')}
              clearable={false} searchable={false} hint="Dasar perhitungan penyusutan garis lurus."
              options={USEFUL_LIFE_OPTIONS} getOptionLabel={(o) => o.label} getOptionValue={(o) => o.value}
              placeholder="Pilih masa manfaat…"
            />

            {form.usefulLifeMonths && (
              <TextField
                label="Nilai Residu" name="salvageValue" type="number" min="0"
                value={form.salvageValue} onChange={handleChange} placeholder="0"
                className="sm:col-span-2"
                hint="Perkiraan nilai aset di akhir masa manfaat. Kosongkan kalau dianggap habis (Rp 0)."
              />
            )}

            {showDijualField && (
              <TextField
                label="Harga Jual/Net" name="saleValueNet" type="number" min="0"
                value={form.saleValueNet} onChange={handleChange} required className="sm:col-span-2"
                hint="Harga yang ditawarkan selama aset berstatus Dijual."
              />
            )}

            {isRetired && (
              <div className="sm:col-span-2 rounded-xl border border-danger-200 bg-danger-50 p-4 space-y-4">
                <p className="flex items-start gap-2.5 text-xs text-danger-800 leading-relaxed">
                  <i className="fas fa-file-signature mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    Aset yang dinyatakan <strong>{form.status === 'hilang' ? 'Hilang' : 'Dihapuskan'}</strong> keluar
                    dari inventaris aktif dan tidak lagi dihitung sebagai kekayaan perusahaan. Alasannya wajib
                    dicatat supaya tetap ada yang bisa dimintai keterangan.
                  </span>
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <DateField
                    label={form.status === 'hilang' ? 'Tanggal Diketahui Hilang' : 'Tanggal Penghapusan'}
                    name="retiredDate"
                    value={form.retiredDate} onChange={handleChange}
                  />
                  <TextField
                    label="Nomor Berita Acara" name="retiredDocNo"
                    value={form.retiredDocNo} onChange={handleChange}
                    placeholder="BA/GA/2026/014"
                    hint={form.status === 'hilang' ? 'Nomor laporan kehilangan, bila ada.' : 'Nomor berita acara penghapusan.'}
                  />
                </div>

                <TextareaField
                  label="Alasan" name="retiredReason" required rows={2}
                  value={form.retiredReason} onChange={handleChange}
                  placeholder={form.status === 'hilang'
                    ? 'Mis. tidak ditemukan saat stok opname Agustus 2026'
                    : 'Mis. rusak berat, biaya perbaikan melebihi nilai buku'}
                />
              </div>
            )}

            {showTerjualFields && (
              <>
                <DateField label="Tanggal Terjual" name="soldDate" value={form.soldDate} onChange={handleChange} />
                <TextField
                  label="Harga Terjual" name="soldPrice" type="number" min="0"
                  value={form.soldPrice} onChange={handleChange} required
                  hint="Harga transaksi aktual saat aset benar-benar terjual."
                />
              </>
            )}
          </div>
        </Card>

        {/* ==================== BIDANG KUSTOM ==================== */}
        {customFieldDefs.length > 0 && (
          <Card>
            <CardHeader
              title="Bidang Kustom"
              description="Bidang tambahan yang berlaku untuk kode barang/aset yang dipilih."
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {customFieldDefs.map((cf) => (
                <CustomFieldInput
                  key={cf.id}
                  field={cf}
                  value={customFieldValues[cf.id] || ''}
                  onChange={(v) => handleCustomFieldChange(cf.id, v)}
                />
              ))}
            </div>
          </Card>
        )}

        {/* ==================== CATATAN ==================== */}
        <Card>
          <CardHeader title="Catatan" description="Keterangan bebas — riwayat perbaikan, pemilik sebelumnya, dan sejenisnya." />
          <TextareaField name="notes" value={form.notes} onChange={handleChange} rows={3} />
        </Card>

        {/* ==================== AKSI SIMPAN ====================
            Menempel di bawah supaya tetap terjangkau di form yang panjang. */}
        <div
          className="fixed lg:sticky bottom-16 lg:bottom-0 inset-x-0 lg:inset-x-auto z-20
                     border-t border-ink-200 bg-white/95 backdrop-blur-md px-4 py-3
                     lg:rounded-2xl lg:border lg:border-ink-200/70 lg:shadow-card lg:px-5
                     flex items-center gap-3"
        >
          <p className="hidden lg:block text-xs text-ink-400 flex-1">
            {isEdit ? 'Perubahan langsung berlaku setelah disimpan.' : 'Kode aset & Kode QR dibuat otomatis setelah disimpan.'}
          </p>
          <Button
            type="button" variant="secondary" className="hidden lg:inline-flex"
            onClick={() => requestNavigation(() => navigate(-1))}
          >
            Batal
          </Button>
          <Button type="submit" loading={saving} className="flex-1 lg:flex-none">
            {saving ? 'Menyimpan…' : (
              <>
                <i className="fas fa-floppy-disk text-xs" aria-hidden="true" />
                {isEdit ? 'Simpan Perubahan' : 'Simpan Aset'}
              </>
            )}
          </Button>
        </div>
      </form>

      {newCategoryModal && (
        <Modal
          title="Buat Kode Barang Baru"
          description="Langsung dipilih ke field Kode Barang/Aset begitu tersimpan."
          icon="fa-tags"
          onClose={() => { setNewCategoryModal(false); setNewCategoryError(''); }}
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={() => setNewCategoryModal(false)} disabled={savingNewCategory}>Batal</Button>
              <Button size="sm" onClick={handleCreateCategory} loading={savingNewCategory}>
                {savingNewCategory ? 'Menyimpan…' : 'Simpan Kode Barang'}
              </Button>
            </>
          }
        >
          <form onSubmit={handleCreateCategory} className="space-y-4">
            <TextField
              label="Nama" required autoFocus
              value={newCategoryForm.name}
              onChange={(e) => setNewCategoryForm({
                ...newCategoryForm,
                name: e.target.value,
                slug: e.target.value.toLowerCase().replace(/\s+/g, '-'),
              })}
              placeholder="Mis. Laptop"
            />
            <TextField
              label="Kode Barang" required
              value={newCategoryForm.slug}
              onChange={(e) => setNewCategoryForm({ ...newCategoryForm, slug: e.target.value })}
              placeholder="Mis. laptop"
              className="font-mono"
              hint='Dipakai apa adanya di dalam kode aset. Sebaiknya singkat, tanpa spasi, dan tidak mengandung karakter "/".'
            />
            <FormError>{newCategoryError}</FormError>
          </form>
        </Modal>
      )}

      {newAssetTypeModal && (
        <AssetTypeQuickAddModal
          onClose={() => setNewAssetTypeModal(false)}
          onCreated={async (created) => {
            await loadAssetTypes();
            setForm((f) => ({ ...f, assetTypeId: String(created.id) }));
            setNewAssetTypeModal(false);
            pushSuccess(`Kategori aset "${created.name}" ditambahkan dan langsung dipilih.`);
          }}
        />
      )}

      {newLocationModal && (
        <Modal
          title={locationMode === 'existing' ? 'Tambah Sub Lokasi' : 'Buat Lokasi Baru'}
          description="Langsung dipilih ke field Lokasi begitu tersimpan."
          icon="fa-building"
          onClose={resetLocationModal}
          footer={
            <>
              <Button variant="secondary" size="sm" disabled={savingNewLocation} onClick={resetLocationModal}>
                Batal
              </Button>
              <Button size="sm" onClick={handleCreateLocation} loading={savingNewLocation}>
                {savingNewLocation ? 'Menyimpan…' : locationMode === 'existing' ? 'Simpan Sub Lokasi' : 'Simpan Lokasi'}
              </Button>
            </>
          }
        >
          <form onSubmit={handleCreateLocation} className="space-y-4">
            {/* Lokasi baru vs lokasi yang sudah tersimpan — dua kebutuhan
                berbeda yang dulu cuma bisa dipenuhi lewat "buat lokasi baru"
                walau lokasinya sudah ada, tenant tinggal mau menambah sub
                lokasi di bawahnya saja. */}
            <SegmentedControl
              options={[{ value: 'new', label: 'Lokasi Baru' }, { value: 'existing', label: 'Lokasi Sudah Ada' }]}
              value={locationMode}
              onChange={(v) => { setLocationMode(v); setNewLocationError(''); }}
              size="sm"
            />

            {locationMode === 'existing' ? (
              <SearchableSelect
                label="Pilih Lokasi" required autoFocus
                value={existingLocationId}
                onChange={setExistingLocationId}
                options={locations}
                getOptionLabel={(l) => `${l.code} · ${l.name}`}
                placeholder="Cari lokasi…" emptyLabel="Pilih lokasi"
              />
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <TextField
                    label="Kode" required autoFocus
                    value={newLocationForm.code}
                    onChange={(e) => setNewLocationForm({ ...newLocationForm, code: e.target.value.toUpperCase() })}
                    placeholder="HO"
                    className="col-span-1 font-mono"
                  />
                  <TextField
                    label="Nama Lokasi" required
                    value={newLocationForm.name}
                    onChange={(e) => setNewLocationForm({ ...newLocationForm, name: e.target.value })}
                    placeholder="Head Office"
                    className="col-span-2"
                  />
                </div>
                <TextareaField
                  label="Deskripsi"
                  value={newLocationForm.description}
                  onChange={(e) => setNewLocationForm({ ...newLocationForm, description: e.target.value })}
                  rows={2}
                  placeholder="Keterangan singkat (opsional)"
                />
              </>
            )}

            <div className="flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-ink-200" />
              <span className="text-xs font-medium text-ink-400">
                {locationMode === 'existing' ? 'SUB LOKASI BARU' : 'SUB LOKASI (OPSIONAL)'}
              </span>
              <span className="h-px flex-1 bg-ink-200" />
            </div>
            <p className="text-xs text-ink-400 -mt-2">
              {locationMode === 'existing'
                ? 'Sub lokasi baru yang ditambahkan di bawah lokasi yang dipilih di atas. Boleh lebih dari satu.'
                : `Isi kalau lokasi ini langsung butuh sub lokasi — mis. ruangan/lantai di dalam ${newLocationForm.name || 'lokasi'} ini. Boleh lebih dari satu, atau dikosongkan dan ditambah belakangan.`}
            </p>

            <div className="space-y-3">
              {newSubLocationForms.map((row, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <TextField
                    label={index === 0 ? 'Kode' : undefined}
                    value={row.code}
                    onChange={(e) => updateSubLocationRow(index, 'code', e.target.value.toUpperCase())}
                    placeholder="LT1"
                    className="w-24 shrink-0 font-mono"
                  />
                  <TextField
                    label={index === 0 ? 'Nama Sub Lokasi' : undefined}
                    value={row.name}
                    onChange={(e) => updateSubLocationRow(index, 'name', e.target.value)}
                    placeholder="Lantai 1"
                    className="flex-1"
                  />
                  {newSubLocationForms.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSubLocationRow(index)}
                      aria-label="Hapus baris sub lokasi ini"
                      className={`shrink-0 h-9 w-9 flex items-center justify-center rounded-lg text-ink-400 hover:bg-danger-50 hover:text-danger-600 ${index === 0 ? 'mt-6' : ''}`}
                    >
                      <i className="fas fa-trash-can text-xs" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addSubLocationRow}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-600 hover:text-brand-700"
            >
              <i className="fas fa-plus text-[10px]" aria-hidden="true" />
              Tambah Sub Lokasi
            </button>

            <FormError>{newLocationError}</FormError>
          </form>
        </Modal>
      )}
    </>
  );
}

/** Merender satu bidang kustom sesuai tipe yang didefinisikan admin. */
function CustomFieldInput({ field, value, onChange }) {
  const common = {
    label: field.field_label,
    required: Boolean(field.is_required),
    value,
    onChange: (e) => onChange(e.target.value),
  };

  if (field.field_type === 'select') {
    return (
      <SearchableSelect
        label={field.field_label} required={Boolean(field.is_required)}
        value={value} onChange={onChange}
        options={field.field_options || []}
        getOptionLabel={(o) => o} getOptionValue={(o) => o}
        placeholder="Cari…" emptyLabel="Pilih…"
      />
    );
  }

  if (field.field_type === 'boolean') {
    return (
      <FormField className="flex items-end pb-1">
        <Checkbox
          label={field.field_label}
          checked={value === 'true'}
          onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
        />
      </FormField>
    );
  }

  if (field.field_type === 'textarea') {
    return <TextareaField {...common} rows={2} className="sm:col-span-2" />;
  }

  if (field.field_type === 'date') {
    return <DateField {...common} />;
  }

  const type = field.field_type === 'number' ? 'number' : 'text';
  return <TextField {...common} type={type} />;
}
