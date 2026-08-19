import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import axiosClient from '../api/axiosClient.js';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import { useUnsavedChanges, useUnsavedChangesContext } from '../context/UnsavedChangesContext.jsx';
import {
  TextField, SelectField, TextareaField, FormField, Checkbox,
} from '../components/ui/Form.jsx';

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
  const { pushError, pushSuccess } = useNotification();

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

  /* Potret isian saat form pertama siap dipakai — kosong untuk Tambah Aset,
     atau data yang baru dimuat untuk Ubah Aset. Perbandingan terhadap potret
     inilah yang menentukan apakah ada perubahan yang belum disimpan; memakai
     "ada isian yang tidak kosong" saja akan salah untuk mode Ubah, karena di
     sana semua kolom memang sudah terisi sejak awal. */
  const [baseline, setBaseline] = useState(() => snapshot(EMPTY_FORM, {}));
  const savedRef = useRef(false);

  useEffect(() => {
    axiosClient.get('/categories').then((res) => setCategories(res.data));
    axiosClient.get('/asset-types').then((res) => setAssetTypes(res.data));
    axiosClient.get('/locations').then((res) => setLocations(res.data));
    axiosClient.get('/departments').then((res) => setDepartments(res.data));
  }, []);

  /* Bidang kustom: yang global langsung muncul, yang khusus kategori
     ditambahkan begitu kategori dipilih/berubah. */
  useEffect(() => {
    axiosClient
      .get('/custom-fields', { params: { categoryId: form.categoryId || undefined } })
      .then((res) => setCustomFieldDefs(res.data));
  }, [form.categoryId]);

  useEffect(() => {
    if (!form.locationId) { setSubLocations([]); return; }
    axiosClient.get('/sub-locations', { params: { locationId: form.locationId } })
      .then((res) => setSubLocations(res.data));
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

  /* Ganti lokasi induk → reset sub lokasi, karena pilihan lama sudah tidak relevan */
  function handleLocationChange(e) {
    setForm((f) => ({ ...f, locationId: e.target.value, subLocationId: '' }));
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
      pushError(err.response?.data?.message || 'Gagal menyimpan aset.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
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
            <SelectField
              label="Kode Barang/Aset" name="categoryId" value={form.categoryId}
              onChange={handleChange} required
            >
              <option value="">Pilih kode barang/aset</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.slug}</option>)}
            </SelectField>

            {!isEdit && (
              <TextField
                label="Nomor Urut" name="sequenceNo" type="number" min="1"
                value={form.sequenceNo} onChange={handleChange}
                placeholder="Otomatis"
                hint="Kosongkan agar sistem mengisi nomor kosong terkecil yang belum pernah dipakai."
              />
            )}

            <SelectField
              label="Lokasi" name="locationId" value={form.locationId}
              onChange={handleLocationChange} required
            >
              <option value="">Pilih lokasi</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}
            </SelectField>

            <SelectField
              label="Sub Lokasi" name="subLocationId" value={form.subLocationId}
              onChange={handleChange} disabled={!form.locationId}
            >
              <option value="">{form.locationId ? 'Tanpa sub lokasi (opsional)' : 'Pilih lokasi dahulu'}</option>
              {subLocations.map((sl) => <option key={sl.id} value={sl.id}>{sl.code} · {sl.name}</option>)}
            </SelectField>

            <SelectField
              label="Departemen" name="departmentId" value={form.departmentId}
              onChange={handleChange} className="sm:col-span-2"
              hint="Divisi penanggung jawab aset. Tetap melekat meski aset tidak sedang dipegang siapa pun."
            >
              <option value="">Belum ditentukan</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.code} · {d.name}</option>)}
            </SelectField>
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

            <SelectField label="Kategori Aset" name="assetTypeId" value={form.assetTypeId} onChange={handleChange} required>
              <option value="">Pilih kategori aset</option>
              {assetTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </SelectField>

            <SelectField label="Kondisi Fisik" name="condition" value={form.condition} onChange={handleChange} required>
              {CONDITION_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </SelectField>

            <TextField label="Brand" name="brand" value={form.brand} onChange={handleChange} placeholder="Mis. Dell" />
            <TextField label="Model" name="model" value={form.model} onChange={handleChange} placeholder="Mis. Latitude 5420" />
            <TextField label="Nomor Seri" name="serialNumber" value={form.serialNumber} onChange={handleChange} className="font-mono" />

            <div>
              <SelectField label="Status" name="status" value={form.status} onChange={handleChange}>
                {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </SelectField>

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
            <TextField label="Tanggal Pembelian" name="purchaseDate" type="date" value={form.purchaseDate} onChange={handleChange} />
            <TextField label="Harga Beli" name="purchasePrice" type="number" min="0" value={form.purchasePrice} onChange={handleChange} placeholder="0" />

            <TextField
              label="Garansi Berakhir" name="warrantyExpiry" type="date"
              value={form.warrantyExpiry} onChange={handleChange}
              hint="Aset yang garansinya mendekati habis akan muncul di Dasbor."
            />

            <SelectField
              label="Masa Manfaat" name="usefulLifeMonths"
              value={String(form.usefulLifeMonths)} onChange={handleChange}
              hint="Dasar perhitungan penyusutan garis lurus."
            >
              {USEFUL_LIFE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </SelectField>

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
                  <TextField
                    label={form.status === 'hilang' ? 'Tanggal Diketahui Hilang' : 'Tanggal Penghapusan'}
                    name="retiredDate" type="date"
                    value={form.retiredDate} onChange={handleChange}
                  />
                  <TextField
                    label="No. Berita Acara" name="retiredDocNo"
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
                <TextField label="Tanggal Terjual" name="soldDate" type="date" value={form.soldDate} onChange={handleChange} />
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
    </Layout>
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
      <SelectField {...common}>
        <option value="">Pilih…</option>
        {(field.field_options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </SelectField>
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

  const type = field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text';
  return <TextField {...common} type={type} />;
}
