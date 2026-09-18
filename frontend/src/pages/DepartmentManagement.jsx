import React, { useEffect, useState } from 'react';
import ImportCsvModal from '../components/ImportCsvModal.jsx';
import axiosClient from '../api/axiosClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import PageHeader, { MasterDataLayout } from '../components/ui/PageHeader.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { Badge } from '../components/ui/StatusBadge.jsx';
import { TextField, TextareaField, FormError } from '../components/ui/Form.jsx';
import { todayLocal } from '../utils/dateLocal.js';

const EMPTY_FORM = { code: '', name: '', description: '' };

/* Kode departemen tidak bisa diubah setelah dibuat — sama seperti kode lokasi,
   nilainya sudah terlanjur dipakai di laporan dan rekap yang tercetak. */
const CODE_LOCKED_HINT = 'Kode tidak bisa diubah setelah dibuat. Untuk mengganti kode, nonaktifkan lalu buat baru.';

export default function DepartmentManagement() {
  const { can } = useAuth();
  const { pushSuccess, pushError } = useNotification();

  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [exporting, setExporting] = useState(false);

  const canCreate = can('departments', 'create');
  const canEdit = can('departments', 'edit');
  const canDelete = can('departments', 'delete');

  function load() {
    axiosClient.get('/departments').then((res) => setDepartments(res.data));
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
        await axiosClient.put(`/departments/${editingId}`, { name: form.name, description: form.description });
        pushSuccess('Departemen berhasil diperbarui.');
      } else {
        const res = await axiosClient.post('/departments', form);
        pushSuccess(res.data.reactivated
          ? `Departemen "${res.data.code}" diaktifkan kembali.`
          : 'Departemen berhasil ditambahkan.');
      }
      resetForm();
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan departemen.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(d) {
    setEditingId(d.id);
    setForm({ code: d.code, name: d.name, description: d.description || '' });
    setError('');
  }

  async function handleDelete(d) {
    if (!confirm(`Nonaktifkan departemen "${d.name}"?`)) return;
    try {
      await axiosClient.delete(`/departments/${d.id}`);
      if (editingId === d.id) resetForm();
      load();
      pushSuccess(`Departemen "${d.name}" dinonaktifkan.`);
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal menonaktifkan departemen.');
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await axiosClient.get('/departments/export', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `departemen-${todayLocal()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      pushSuccess(`${departments.length} departemen berhasil diekspor.`);
    } catch (err) {
      pushError('Gagal mengekspor departemen.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Data Acuan"
        title="Departemen"
        description="Divisi pemilik aset. Berbeda dari pemegang perorangan — departemen tetap melekat pada aset meski tidak sedang dipegang siapa pun."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={handleExport} loading={exporting} disabled={exporting || !departments.length}>
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
          (canCreate || canEdit) ? (
            <Card as="form" onSubmit={handleSubmit} className={editingId ? 'ring-2 ring-brand-500/20' : ''}>
              <CardHeader
                title={editingId ? 'Ubah Departemen' : 'Tambah Departemen'}
                icon={(p) => <i {...p} className="fas fa-building-user text-xs" />}
              />

              <div className="space-y-4">
                <TextField
                  label="Kode" required
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  disabled={Boolean(editingId)}
                  title={editingId ? CODE_LOCKED_HINT : ''}
                  placeholder="GA"
                  className="font-mono"
                  hint={editingId ? CODE_LOCKED_HINT : 'Huruf besar, angka, garis bawah, atau minus. 2–30 karakter.'}
                />

                <TextField
                  label="Nama Departemen" required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="General Affairs"
                />

                <TextareaField
                  label="Deskripsi"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  placeholder="Keterangan singkat (opsional)"
                />

                <FormError>{error}</FormError>

                <div className="flex gap-2">
                  <Button type="submit" loading={saving} className="flex-1">
                    {saving ? 'Menyimpan…' : editingId ? 'Simpan Perubahan' : 'Simpan Departemen'}
                  </Button>
                  {editingId && (
                    <Button type="button" variant="secondary" onClick={resetForm}>Batal</Button>
                  )}
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-ink-500 leading-relaxed">
                Akun Anda hanya berwenang melihat daftar departemen.
              </p>
            </Card>
          )
        }
        table={
          <Card padded={false} className="overflow-hidden">
            <CardHeader
              title="Daftar Departemen"
              description={`${departments.length} departemen aktif`}
              bordered
            />

            {departments.length === 0 ? (
              <EmptyState
                icon="fa-building-user"
                title="Belum ada departemen"
                description="Tambahkan divisi pemilik aset melalui formulir di samping."
              />
            ) : (
              <div className="overflow-x-auto scrollbar-slim">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Kode</th>
                      <th>Nama Departemen</th>
                      <th className="!text-right">Aset</th>
                      {(canEdit || canDelete) && (
                        <th className="w-24 !text-right"><span className="sr-only">Aksi</span></th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {departments.map((d) => (
                      <tr key={d.id} className={editingId === d.id ? 'is-selected' : ''}>
                        <td><Badge mono size="sm">{d.code}</Badge></td>
                        <td>
                          <p className="font-medium text-ink-800">{d.name}</p>
                          {d.description && <p className="text-[11px] text-ink-400 mt-0.5">{d.description}</p>}
                        </td>
                        <td className="text-right text-[13px] text-ink-600 tabular-nums">
                          {d.asset_count > 0 ? `${d.asset_count} aset` : <span className="text-ink-300">—</span>}
                        </td>
                        {(canEdit || canDelete) && (
                          <td className="text-right whitespace-nowrap">
                            {canEdit && (
                              <button
                                onClick={() => startEdit(d)}
                                title={`Ubah ${d.name}`} aria-label={`Ubah ${d.name}`}
                                className="h-8 w-8 inline-flex items-center justify-center rounded-lg
                                           text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                              >
                                <i className="fas fa-pen text-[12px]" aria-hidden="true" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => handleDelete(d)}
                                title={`Nonaktifkan ${d.name}`} aria-label={`Nonaktifkan ${d.name}`}
                                className="h-8 w-8 inline-flex items-center justify-center rounded-lg
                                           text-ink-300 hover:text-danger-600 hover:bg-danger-50 transition-colors"
                              >
                                <i className="fas fa-trash-can text-[13px]" aria-hidden="true" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="px-5 sm:px-6 py-3 text-xs text-ink-400 border-t border-ink-200/70 leading-relaxed">
              Departemen yang masih tercatat pada aset tidak bisa dinonaktifkan — pindahkan asetnya
              terlebih dahulu agar tidak ada aset yang kehilangan penanggung jawab.
            </p>
          </Card>
        }
      />

      {showImport && (
        <ImportCsvModal
          title="Impor Departemen"
          expectedColumns={['department_code', 'department_name']}
          sampleRows={[
            ['GA', 'General Affairs'],
            ['IT', 'Information Technology'],
            ['FIN', 'Finance'],
          ]}
          templateFileName="template-import-departemen.csv"
          onUpload={async (file) => {
            const formData = new FormData();
            formData.append('file', file);
            const res = await axiosClient.post('/departments/import', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
            return res.data;
          }}
          onImported={load}
          onClose={() => setShowImport(false)}
        />
      )}
    </>
  );
}
