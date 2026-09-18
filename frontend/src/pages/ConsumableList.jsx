import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axiosClient from '../api/axiosClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import Card from '../components/ui/Card.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Button, { SegmentedControl } from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Pagination from '../components/ui/Pagination.jsx';
import { Badge } from '../components/ui/StatusBadge.jsx';
import { SkeletonRows } from '../components/ui/Skeleton.jsx';
import { SearchInput, TextField, SearchableSelect, TextareaField, FormError } from '../components/ui/Form.jsx';

/**
 * ============================================================================
 *  BARANG HABIS PAKAI — DAFTAR
 * ============================================================================
 *  Kertas, toner, alat kebersihan — dibeli untuk dipakai habis, bukan
 *  dipinjam-kembalikan. Halaman ini menjawab pertanyaan yang paling sering
 *  ditanyakan ke gudang: "stok X tinggal berapa?" — dan menandai jelas yang
 *  sudah di bawah ambang batas.
 * ============================================================================
 */

const CATEGORY_LABEL = { atk: 'ATK', kebersihan: 'Kebersihan', it_supplies: 'Perlengkapan IT', lainnya: 'Lainnya' };
const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }));

export default function ConsumableList() {
  const { can } = useAuth();
  const { pushError, pushSuccess } = useNotification();

  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const canCreate = can('consumables', 'create');

  const muat = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosClient.get('/consumables', {
        params: { search: search || undefined, category: category || undefined, lowStockOnly: lowStockOnly || undefined, page },
      });
      setItems(res.data.data);
      setPagination(res.data.pagination);
    } catch {
      pushError('Gagal memuat daftar barang habis pakai.');
    } finally {
      setLoading(false);
    }
  }, [search, category, lowStockOnly, page, pushError]);

  useEffect(() => {
    const t = setTimeout(muat, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [muat, search]);

  async function handleCreated(res) {
    setShowCreate(false);
    pushSuccess(res.message);
    setPage(1);
    muat();
  }

  return (
    <>
      <PageHeader
        title="Barang Habis Pakai"
        description="Stok ATK, kebersihan, dan perlengkapan yang dipakai habis — bukan dipinjam-kembalikan."
        actions={canCreate && (
          <Button onClick={() => setShowCreate(true)}>
            <i className="fas fa-plus text-xs" aria-hidden="true" /> Barang Baru
          </Button>
        )}
      />

      <Card className="mb-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchInput
            placeholder="Cari nama atau kode barang…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            containerClassName="flex-1"
          />
          <SegmentedControl
            value={category}
            onChange={(v) => { setCategory(v); setPage(1); }}
            options={[
              { value: '', label: 'Semua' },
              { value: 'atk', label: 'ATK' },
              { value: 'kebersihan', label: 'Kebersihan' },
              { value: 'it_supplies', label: 'IT' },
              { value: 'lainnya', label: 'Lainnya' },
            ]}
          />
          <Button
            variant={lowStockOnly ? 'primary' : 'secondary'}
            size="md"
            onClick={() => { setLowStockOnly((v) => !v); setPage(1); }}
          >
            <i className="fas fa-triangle-exclamation text-xs" aria-hidden="true" /> Stok Menipis
          </Button>
        </div>
      </Card>

      <Card padded={false} className="overflow-hidden">
        {loading ? (
          <div className="p-5"><SkeletonRows rows={6} cols={5} /></div>
        ) : items.length === 0 ? (
          <EmptyState
            icon="fa-boxes-stacked"
            title={search || category || lowStockOnly ? 'Tidak ada barang yang cocok' : 'Belum ada barang habis pakai'}
            description="Tambahkan barang seperti kertas, toner, atau alat kebersihan untuk mulai mencatat stoknya."
            action={canCreate && !search && !category && !lowStockOnly && (
              <Button onClick={() => setShowCreate(true)}>
                <i className="fas fa-plus text-xs" aria-hidden="true" /> Tambah Barang Pertama
              </Button>
            )}
          />
        ) : (
          <div className="overflow-x-auto scrollbar-slim">
            <table className="table-base min-w-[640px]">
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Nama Barang</th>
                  <th>Kategori</th>
                  <th>Lokasi</th>
                  <th className="!text-right">Stok</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className={item.lowStock ? 'is-selected' : ''}>
                    <td>
                      <Link to={`/consumables/${item.id}`} className="font-mono text-[12px] text-ink-600 hover:text-brand-600">
                        {item.code}
                      </Link>
                    </td>
                    <td>
                      <Link to={`/consumables/${item.id}`} className="font-medium text-ink-800 hover:text-brand-600">
                        {item.name}
                      </Link>
                      {item.notes && <p className="text-[11px] text-ink-400 mt-0.5 truncate max-w-[16rem]">{item.notes}</p>}
                    </td>
                    <td><Badge tone="neutral" size="sm">{CATEGORY_LABEL[item.category]}</Badge></td>
                    <td className="text-[13px] text-ink-500">{item.locationName || '—'}</td>
                    <td className="text-right">
                      <span className={`font-semibold tabular-nums ${item.lowStock ? 'text-danger-600' : 'text-ink-800'}`}>
                        {item.currentStock}
                      </span>
                      <span className="text-ink-400 text-[12px]"> {item.unit}</span>
                      {item.lowStock && (
                        <div className="text-[10px] text-danger-500 mt-0.5">
                          {item.currentStock <= 0 ? 'Habis' : `Ambang ${item.minStock}`}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {pagination.totalPages > 1 && (
        <Pagination
          className="mt-5"
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalItems={pagination.total}
          onChange={setPage}
        />
      )}

      {showCreate && (
        <ConsumableFormModal onClose={() => setShowCreate(false)} onSaved={handleCreated} />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

export function ConsumableFormModal({ item, onClose, onSaved }) {
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState({
    name: item?.name || '',
    category: item?.category || 'atk',
    unit: item?.unit || 'pcs',
    minStock: item?.minStock ?? 0,
    locationId: item?.locationId || '',
    notes: item?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    axiosClient.get('/locations').then((res) => setLocations(res.data.data || res.data)).catch(() => {});
  }, []);

  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Nama barang wajib diisi.'); return; }

    setSaving(true);
    try {
      const payload = { ...form, locationId: form.locationId || null };
      const res = item
        ? await axiosClient.put(`/consumables/${item.id}`, payload)
        : await axiosClient.post('/consumables', payload);
      onSaved(item ? { message: 'Barang berhasil diperbarui.' } : res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan barang.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={item ? 'Ubah Barang' : 'Tambah Barang Habis Pakai'}
      description={item ? item.code : 'Kode dibuat otomatis begitu disimpan.'}
      icon="fa-boxes-stacked"
      onClose={onClose}
      width="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Batal</Button>
          <Button type="submit" form="consumable-form" loading={saving}>Simpan</Button>
        </>
      }
    >
      <form id="consumable-form" onSubmit={submit} className="space-y-4">
        <TextField
          label="Nama Barang" name="name" required autoFocus
          value={form.name} onChange={change}
          placeholder="Mis. Kertas HVS A4 80gsm"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SearchableSelect
            label="Kategori" value={form.category} onChange={(v) => setForm((f) => ({ ...f, category: v }))}
            clearable={false}
            options={CATEGORY_OPTIONS} getOptionLabel={(c) => c.label} getOptionValue={(c) => c.value}
            placeholder="Cari kategori…"
          />
          <TextField
            label="Satuan" name="unit" required
            value={form.unit} onChange={change}
            placeholder="pcs, box, rim, liter"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField
            label="Ambang Stok Minimum" name="minStock" type="number" min="0"
            value={form.minStock} onChange={change}
            hint="Muncul di lonceng Pemberitahuan begitu stok turun ke angka ini atau lebih rendah."
          />
          <SearchableSelect
            label="Lokasi Penyimpanan (opsional)" value={form.locationId}
            onChange={(v) => setForm((f) => ({ ...f, locationId: v }))}
            options={locations} getOptionLabel={(l) => `${l.code} — ${l.name}`}
            placeholder="Cari lokasi…"
          />
        </div>

        <TextareaField
          label="Catatan (opsional)" name="notes" value={form.notes} onChange={change}
          placeholder="Mis. merek yang biasa dibeli, spesifikasi"
        />

        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}
