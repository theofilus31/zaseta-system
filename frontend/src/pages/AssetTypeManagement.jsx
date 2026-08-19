import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import axiosClient from '../api/axiosClient.js';
import { useNotification } from '../context/NotificationContext.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import PageHeader, { MasterDataLayout } from '../components/ui/PageHeader.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { TextField, TextareaField, FormError } from '../components/ui/Form.jsx';

const EMPTY_FORM = { name: '', description: '' };

export default function AssetTypeManagement() {
  const { pushSuccess } = useNotification();
  const [assetTypes, setAssetTypes] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    axiosClient.get('/asset-types').then((res) => setAssetTypes(res.data));
  }
  useEffect(() => { load(); }, []);

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (editingId) {
        await axiosClient.put(`/asset-types/${editingId}`, form);
        pushSuccess('Kategori aset berhasil diperbarui.');
      } else {
        await axiosClient.post('/asset-types', form);
        pushSuccess('Kategori aset berhasil ditambahkan.');
      }
      resetForm();
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan kategori aset.');
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(t) {
    setEditingId(t.id);
    setForm({ name: t.name, description: t.description || '' });
    setError('');
  }

  async function handleDelete(t) {
    if (!confirm(`Hapus kategori aset "${t.name}"?`)) return;
    try {
      await axiosClient.delete(`/asset-types/${t.id}`);
      if (editingId === t.id) resetForm();
      load();
      pushSuccess(`Kategori aset "${t.name}" dihapus.`);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus kategori aset.');
    }
  }

  return (
    <Layout>
      <PageHeader
        eyebrow="Master Data"
        title="Kategori Aset"
        description="Pengelompokan jenis aset secara umum — Elektronik, Furniture, Kendaraan, dan sebagainya."
      />

      <MasterDataLayout
        form={
          <Card as="form" onSubmit={handleSubmit} className={editingId ? 'ring-2 ring-brand-500/20' : ''}>
            <CardHeader
              title={editingId ? 'Ubah Kategori Aset' : 'Tambah Kategori Aset'}
              description={editingId ? 'Sedang mengubah data yang sudah ada.' : undefined}
              icon={(p) => <i {...p} className="fas fa-layer-group text-xs" />}
            />

            <div className="space-y-4">
              <TextField
                label="Nama" required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Mis. Elektronik"
              />

              <TextareaField
                label="Deskripsi"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="Keterangan singkat (opsional)"
              />

              <FormError>{error}</FormError>

              <div className="flex gap-2">
                <Button type="submit" loading={saving} className="flex-1">
                  {saving ? 'Menyimpan…' : editingId ? 'Simpan Perubahan' : 'Simpan'}
                </Button>
                {editingId && (
                  <Button type="button" variant="secondary" onClick={resetForm}>Batal</Button>
                )}
              </div>
            </div>
          </Card>
        }
        table={
          <Card padded={false} className="overflow-hidden">
            <CardHeader
              title="Daftar Kategori Aset"
              description={`${assetTypes.length} kategori terdaftar`}
              bordered
            />

            {assetTypes.length === 0 ? (
              <EmptyState
                icon="fa-layer-group"
                title="Belum ada kategori aset"
                description="Tambahkan kategori pertama melalui formulir di samping."
              />
            ) : (
              <div className="overflow-x-auto scrollbar-slim">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Nama</th>
                      <th>Deskripsi</th>
                      <th className="w-24 !text-right"><span className="sr-only">Aksi</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {assetTypes.map((t) => (
                      <tr key={t.id} className={editingId === t.id ? 'is-selected' : ''}>
                        <td className="font-medium text-ink-800">{t.name}</td>
                        <td className="text-ink-500">{t.description || <span className="text-ink-300">—</span>}</td>
                        <td className="text-right whitespace-nowrap">
                          <button
                            onClick={() => handleEdit(t)}
                            title={`Ubah ${t.name}`} aria-label={`Ubah ${t.name}`}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-lg
                                       text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                          >
                            <i className="fas fa-pen text-[12px]" aria-hidden="true" />
                          </button>
                          <button
                            onClick={() => handleDelete(t)}
                            title={`Hapus ${t.name}`} aria-label={`Hapus ${t.name}`}
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
        }
      />
    </Layout>
  );
}
