import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import axiosClient from '../api/axiosClient.js';
import { useNotification } from '../context/NotificationContext.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import PageHeader, { MasterDataLayout } from '../components/ui/PageHeader.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { Badge } from '../components/ui/StatusBadge.jsx';
import { TextField, SelectField, Checkbox, FormError } from '../components/ui/Form.jsx';

/* Label bahasa Indonesia untuk tipe bidang — sebelumnya nilai mentahnya
   ('textarea', 'boolean') ditampilkan apa adanya ke admin. */
const FIELD_TYPES = [
  { value: 'text', label: 'Teks Singkat' },
  { value: 'number', label: 'Angka' },
  { value: 'date', label: 'Tanggal' },
  { value: 'boolean', label: 'Ya / Tidak' },
  { value: 'select', label: 'Pilihan (Dropdown)' },
  { value: 'textarea', label: 'Teks Panjang' },
];

const TYPE_LABEL = Object.fromEntries(FIELD_TYPES.map((t) => [t.value, t.label]));

const EMPTY_FORM = {
  categoryId: '', fieldKey: '', fieldLabel: '', fieldType: 'text', fieldOptions: '', isRequired: false,
};

export default function CustomFieldManagement() {
  const { pushSuccess } = useNotification();
  const [categories, setCategories] = useState([]);
  const [fields, setFields] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axiosClient.get('/categories').then((res) => setCategories(res.data));
  }, []);

  function load() {
    axiosClient
      .get('/custom-fields', { params: { categoryId: categoryFilter || undefined } })
      .then((res) => setFields(res.data));
  }
  useEffect(() => { load(); }, [categoryFilter]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        ...form,
        categoryId: form.categoryId || null,
        fieldOptions: form.fieldType === 'select'
          ? form.fieldOptions.split(',').map((s) => s.trim()).filter(Boolean)
          : null,
      };
      await axiosClient.post('/custom-fields', payload);
      setForm(EMPTY_FORM);
      load();
      pushSuccess('Bidang kustom berhasil ditambahkan.');
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan bidang kustom.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(field) {
    if (!confirm(`Nonaktifkan bidang "${field.field_label}"? Bidang ini tidak akan muncul lagi di form aset.`)) return;
    try {
      await axiosClient.delete(`/custom-fields/${field.id}`);
      load();
      pushSuccess(`Bidang "${field.field_label}" dinonaktifkan.`);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menonaktifkan bidang kustom.');
    }
  }

  return (
    <Layout>
      <PageHeader
        eyebrow="Master Data"
        title="Bidang Kustom"
        description="Tambahkan kolom data sendiri tanpa mengubah struktur database — misalnya Tanggal Garansi atau Nomor Lisensi."
      />

      <MasterDataLayout
        form={
          <Card as="form" onSubmit={handleSubmit}>
            <CardHeader
              title="Tambah Bidang"
              icon={(p) => <i {...p} className="fas fa-list-ul text-xs" />}
            />

            <div className="space-y-4">
              <SelectField
                label="Berlaku Untuk"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                hint="Pilih kode barang tertentu agar bidang ini hanya muncul untuk aset di kelompok itu."
              >
                <option value="">Global — semua kode barang/aset</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </SelectField>

              <TextField
                label="Kunci Bidang" required
                value={form.fieldKey}
                onChange={(e) => setForm({ ...form, fieldKey: e.target.value })}
                placeholder="warranty_expiry"
                className="font-mono"
                hint="Nama teknis untuk penyimpanan data. Gunakan huruf kecil dan garis bawah."
              />

              <TextField
                label="Label" required
                value={form.fieldLabel}
                onChange={(e) => setForm({ ...form, fieldLabel: e.target.value })}
                placeholder="Tanggal Garansi"
                hint="Teks yang dilihat staf saat mengisi form aset."
              />

              <SelectField
                label="Tipe Bidang"
                value={form.fieldType}
                onChange={(e) => setForm({ ...form, fieldType: e.target.value })}
              >
                {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </SelectField>

              {form.fieldType === 'select' && (
                <TextField
                  label="Pilihan"
                  value={form.fieldOptions}
                  onChange={(e) => setForm({ ...form, fieldOptions: e.target.value })}
                  placeholder="Aktif, Kedaluwarsa, Tidak Ada"
                  hint="Pisahkan setiap pilihan dengan koma."
                />
              )}

              <Checkbox
                label="Wajib diisi"
                description="Form aset tidak bisa disimpan sebelum bidang ini terisi."
                checked={form.isRequired}
                onChange={(e) => setForm({ ...form, isRequired: e.target.checked })}
              />

              <FormError>{error}</FormError>

              <Button type="submit" block loading={saving}>
                {saving ? 'Menyimpan…' : 'Simpan Bidang'}
              </Button>
            </div>
          </Card>
        }
        table={
          <Card padded={false} className="overflow-hidden">
            <CardHeader
              title="Daftar Bidang Kustom"
              description={`${fields.length} bidang aktif`}
              bordered
              action={
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  aria-label="Saring menurut kode barang/aset"
                  className="field-select field-sunken !py-2 !text-[13px] max-w-[13rem]"
                >
                  <option value="">Semua bidang</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              }
            />

            {fields.length === 0 ? (
              <EmptyState
                icon="fa-list-ul"
                title="Belum ada bidang kustom"
                description="Bidang yang ditambahkan akan otomatis muncul di form aset sesuai cakupannya."
              />
            ) : (
              <div className="overflow-x-auto scrollbar-slim">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Label</th>
                      <th>Kunci</th>
                      <th>Tipe</th>
                      <th className="w-16 !text-right"><span className="sr-only">Aksi</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f) => (
                      <tr key={f.id}>
                        <td>
                          <span className="font-medium text-ink-800">{f.field_label}</span>
                          {Boolean(f.is_required) && (
                            <Badge tone="warning" size="sm" className="ml-2">Wajib</Badge>
                          )}
                        </td>
                        <td><span className="font-mono text-xs text-ink-500">{f.field_key}</span></td>
                        <td>
                          <Badge tone="info" size="sm">{TYPE_LABEL[f.field_type] || f.field_type}</Badge>
                        </td>
                        <td className="text-right">
                          <button
                            onClick={() => handleDelete(f)}
                            title={`Nonaktifkan ${f.field_label}`}
                            aria-label={`Nonaktifkan ${f.field_label}`}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-lg
                                       text-ink-300 hover:text-danger-600 hover:bg-danger-50 transition-colors"
                          >
                            <i className="fas fa-ban text-[13px]" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        }
      />
    </Layout>
  );
}
