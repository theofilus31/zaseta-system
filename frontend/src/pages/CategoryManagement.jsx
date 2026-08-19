import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import ImportCsvModal from '../components/ImportCsvModal.jsx';
import axiosClient from '../api/axiosClient.js';
import { useNotification } from '../context/NotificationContext.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import PageHeader, { MasterDataLayout } from '../components/ui/PageHeader.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { Badge } from '../components/ui/StatusBadge.jsx';
import { TextField, FormError } from '../components/ui/Form.jsx';
import { todayLocal } from '../utils/dateLocal.js';

export default function CategoryManagement() {
  const { pushSuccess, pushError } = useNotification();
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ name: '', slug: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [exporting, setExporting] = useState(false);

  function load() {
    axiosClient.get('/categories').then((res) => setCategories(res.data));
  }
  useEffect(() => { load(); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await axiosClient.post('/categories', form);
      setForm({ name: '', slug: '' });
      load();
      pushSuccess('Kode barang/aset berhasil ditambahkan.');
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan kode barang/aset.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(category) {
    if (!confirm(`Hapus kode barang "${category.name}"?`)) return;
    try {
      await axiosClient.delete(`/categories/${category.id}`);
      load();
      pushSuccess(`Kode barang "${category.name}" dihapus.`);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus kode barang/aset.');
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await axiosClient.get('/categories/export', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `kode-barang-aset-${todayLocal()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      pushSuccess(`${categories.length} kode barang berhasil diekspor.`);
    } catch (err) {
      pushError('Gagal mengekspor kode barang/aset.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Layout>
      <PageHeader
        eyebrow="Master Data"
        title="Kode Barang/Aset"
        description="Kelompok barang yang jadi bagian ketiga dari kode aset — misalnya LAPTOP pada HO/LAPTOP/0001."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={handleExport} loading={exporting} disabled={exporting || !categories.length}>
              <i className="fas fa-file-export text-xs" aria-hidden="true" /> Export CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}>
              <i className="fas fa-file-import text-xs" aria-hidden="true" /> Impor CSV
            </Button>
          </>
        }
      />

      <MasterDataLayout
        form={
          <Card as="form" onSubmit={handleSubmit}>
            <CardHeader title="Tambah Kode Barang" icon={(p) => <i {...p} className="fas fa-tags text-xs" />} />

            <div className="space-y-4">
              <TextField
                label="Nama" required
                value={form.name}
                onChange={(e) => setForm({
                  ...form,
                  name: e.target.value,
                  /* Kode barang diisi otomatis dari nama, tapi tetap bisa
                     ditimpa manual di field bawah. Formatnya sengaja dibiarkan
                     huruf kecil-berstrip seperti sebelumnya — nilai ini masuk
                     apa adanya ke dalam kode aset, jadi mengubah polanya akan
                     membuat aset baru tidak seragam dengan data lama. */
                  slug: e.target.value.toLowerCase().replace(/\s+/g, '-'),
                })}
                placeholder="Mis. Laptop"
              />

              <TextField
                label="Kode Barang" required
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="Mis. laptop"
                className="font-mono"
                hint='Dipakai apa adanya di dalam kode aset. Sebaiknya singkat, tanpa spasi, dan tidak mengandung karakter "/".'
              />

              <FormError>{error}</FormError>

              <Button type="submit" block loading={saving}>
                {saving ? 'Menyimpan…' : 'Simpan Kode Barang'}
              </Button>
            </div>
          </Card>
        }
        table={
          <Card padded={false} className="overflow-hidden">
            <CardHeader
              title="Daftar Kode Barang"
              description={`${categories.length} kode terdaftar`}
              bordered
            />

            {categories.length === 0 ? (
              <EmptyState
                icon="fa-tags"
                title="Belum ada kode barang"
                description="Tambahkan kode barang pertama melalui formulir di samping."
              />
            ) : (
              <div className="overflow-x-auto scrollbar-slim">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Nama</th>
                      <th>Kode Barang</th>
                      <th className="w-16 !text-right"><span className="sr-only">Aksi</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((c) => (
                      <tr key={c.id}>
                        <td className="font-medium text-ink-800">{c.name}</td>
                        <td><Badge mono size="sm">{c.slug}</Badge></td>
                        <td className="text-right">
                          <button
                            onClick={() => handleDelete(c)}
                            title={`Hapus ${c.name}`}
                            aria-label={`Hapus ${c.name}`}
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

      {showImport && (
        <ImportCsvModal
          title="Impor Kode Barang/Aset"
          expectedColumns={['category_code', 'category_name']}
          sampleRows={[
            ['laptop', 'Laptop'],
            ['monitor', 'Monitor'],
            ['printer', 'Printer'],
          ]}
          templateFileName="template-import-kode-barang-aset.csv"
          onUpload={async (file) => {
            const formData = new FormData();
            formData.append('file', file);
            const res = await axiosClient.post('/categories/import', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
            return res.data;
          }}
          onImported={load}
          onClose={() => setShowImport(false)}
        />
      )}
    </Layout>
  );
}
