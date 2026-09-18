import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axiosClient from '../api/axiosClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import Card from '../components/ui/Card.jsx';
import Button, { SegmentedControl } from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Pagination from '../components/ui/Pagination.jsx';
import { Badge } from '../components/ui/StatusBadge.jsx';
import { SkeletonRows } from '../components/ui/Skeleton.jsx';
import { SearchInput, TextField, SearchableSelect, DateField, TextareaField, FormError } from '../components/ui/Form.jsx';

/**
 * ============================================================================
 *  PERMINTAAN ASET — DAFTAR
 * ============================================================================
 *  Sebelumnya, satu-satunya cara aset berpindah tangan adalah GA yang
 *  memutuskan sendiri "serahkan ini ke orang itu". Halaman ini membuka jalur
 *  sebaliknya: karyawan mengajukan kebutuhan, GA meninjau, baru dipenuhi —
 *  dan begitu dipenuhi, permintaannya menjadi serah terima aset sungguhan,
 *  bukan catatan terpisah yang berbeda aturan.
 * ============================================================================
 */

const PRIORITY_TONE = { rendah: 'neutral', sedang: 'info', tinggi: 'warning' };
const STATUS_TONE = { diajukan: 'info', disetujui: 'brand', ditolak: 'danger', dipenuhi: 'neutral', dibatalkan: 'neutral' };
const STATUS_LABEL = { diajukan: 'Diajukan', disetujui: 'Disetujui', ditolak: 'Ditolak', dipenuhi: 'Dipenuhi', dibatalkan: 'Dibatalkan' };
const PRIORITY_LABEL = { rendah: 'Rendah', sedang: 'Sedang', tinggi: 'Tinggi' };

const tanggal = (v) =>
  v ? new Date(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export default function RequestList() {
  const { can } = useAuth();
  const { pushError, pushSuccess } = useNotification();

  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const canCreate = can('requests', 'create');

  async function salinTautanPublik() {
    const url = `${window.location.origin}/ajukan-permintaan`;
    try {
      await navigator.clipboard.writeText(url);
      pushSuccess('Tautan publik disalin. Bagikan ke karyawan yang ingin mengajukan permintaan aset.');
    } catch {
      pushError('Gagal menyalin tautan. Salin manual: ' + url);
    }
  }

  const muat = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosClient.get('/requests', { params: { search: search || undefined, status: status || undefined, page } });
      setItems(res.data.data);
      setPagination(res.data.pagination);
    } catch {
      pushError('Gagal memuat daftar permintaan.');
    } finally {
      setLoading(false);
    }
  }, [search, status, page, pushError]);

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
        title="Permintaan Aset"
        description="Pengajuan kebutuhan aset dari karyawan — ditinjau sebelum dipenuhi."
        actions={(
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={salinTautanPublik}>
              <i className="fas fa-link text-xs" aria-hidden="true" /> Salin Tautan Publik
            </Button>
            {canCreate && (
              <Button onClick={() => setShowCreate(true)}>
                <i className="fas fa-plus text-xs" aria-hidden="true" /> Ajukan Permintaan
              </Button>
            )}
          </div>
        )}
      />

      <Card className="mb-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchInput
            placeholder="Cari nomor, nama barang, atau peminta…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            containerClassName="flex-1"
          />
          <SegmentedControl
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            options={[
              { value: '', label: 'Semua' },
              { value: 'diajukan', label: 'Diajukan' },
              { value: 'disetujui', label: 'Disetujui' },
              { value: 'dipenuhi', label: 'Dipenuhi' },
              { value: 'ditolak', label: 'Ditolak' },
            ]}
          />
        </div>
      </Card>

      <Card padded={false} className="overflow-hidden">
        {loading ? (
          <div className="p-5"><SkeletonRows rows={6} cols={5} /></div>
        ) : items.length === 0 ? (
          <EmptyState
            icon="fa-hand-point-right"
            title={search || status ? 'Tidak ada permintaan yang cocok' : 'Belum ada permintaan aset'}
            description="Ajukan permintaan untuk kebutuhan aset yang belum ada, atau yang perlu diserahkan ke karyawan."
            action={canCreate && !search && !status && (
              <Button onClick={() => setShowCreate(true)}>
                <i className="fas fa-plus text-xs" aria-hidden="true" /> Ajukan Permintaan Pertama
              </Button>
            )}
          />
        ) : (
          <div className="overflow-x-auto scrollbar-slim">
            <table className="table-base min-w-[720px]">
              <thead>
                <tr>
                  <th>Nomor Permintaan</th>
                  <th>Barang Diminta</th>
                  <th>Peminta</th>
                  <th>Prioritas</th>
                  <th>Status</th>
                  <th>Diajukan</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link to={`/requests/${item.id}`} className="font-mono text-[12px] text-ink-600 hover:text-brand-600">
                        {item.requestNo}
                      </Link>
                    </td>
                    <td>
                      <Link to={`/requests/${item.id}`} className="font-medium text-ink-800 hover:text-brand-600">
                        {item.itemName}
                      </Link>
                      {item.categoryName && <p className="text-[11px] text-ink-400 mt-0.5">{item.categoryName}</p>}
                    </td>
                    <td>
                      <p className="text-[13px] text-ink-700">{item.requesterName}</p>
                      {item.department && <p className="text-[11px] text-ink-400">{item.department}</p>}
                    </td>
                    <td><Badge tone={PRIORITY_TONE[item.priority]} size="sm">{PRIORITY_LABEL[item.priority]}</Badge></td>
                    <td><Badge tone={STATUS_TONE[item.status]} size="sm">{STATUS_LABEL[item.status]}</Badge></td>
                    <td className="text-[13px] text-ink-500 whitespace-nowrap">{tanggal(item.createdAt)}</td>
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
        <CreateRequestModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function CreateRequestModal({ onClose, onCreated }) {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    requesterName: '', department: '', categoryId: '', itemName: '', reason: '', priority: 'sedang', neededBy: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    axiosClient.get('/categories').then((res) => setCategories(res.data)).catch(() => {});
  }, []);

  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const changeCategoryId = (id) => setForm((f) => ({ ...f, categoryId: id }));

  async function submit(e) {
    e.preventDefault();
    if (!form.requesterName.trim()) { setError('Nama peminta wajib diisi.'); return; }
    if (!form.itemName.trim()) { setError('Nama barang yang diminta wajib diisi.'); return; }

    setSaving(true);
    try {
      const res = await axiosClient.post('/requests', { ...form, categoryId: form.categoryId || null, neededBy: form.neededBy || null });
      onCreated(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengajukan permintaan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Ajukan Permintaan Aset"
      description="Nomor permintaan dibuat otomatis begitu diajukan."
      icon="fa-hand-point-right"
      onClose={onClose}
      width="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Batal</Button>
          <Button type="submit" form="create-request-form" loading={saving}>Ajukan</Button>
        </>
      }
    >
      <form id="create-request-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField
            label="Nama Peminta" name="requesterName" required autoFocus
            value={form.requesterName} onChange={change}
            placeholder="Mis. Budi Santoso"
          />
          <TextField
            label="Departemen (opsional)" name="department"
            value={form.department} onChange={change}
            placeholder="Mis. Marketing"
          />
        </div>

        <TextField
          label="Barang yang Diminta" name="itemName" required
          value={form.itemName} onChange={change}
          placeholder="Mis. Laptop untuk staf baru"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SearchableSelect
            id="categoryId"
            label="Kode Barang/Aset (opsional)"
            hint="Membantu GA mencari calon aset yang tepat saat memenuhi."
            placeholder="Ketik untuk mencari kode barang…"
            value={form.categoryId}
            onChange={changeCategoryId}
            options={categories}
          />
          <SearchableSelect
            label="Prioritas" value={form.priority} onChange={(v) => setForm((f) => ({ ...f, priority: v }))}
            clearable={false} searchable={false}
            options={[
              { value: 'rendah', label: 'Rendah' },
              { value: 'sedang', label: 'Sedang' },
              { value: 'tinggi', label: 'Tinggi' },
            ]}
            getOptionLabel={(o) => o.label} getOptionValue={(o) => o.value}
            placeholder="Pilih prioritas…"
          />
        </div>

        <DateField
          label="Dibutuhkan Sebelum Tanggal (opsional)" name="neededBy"
          value={form.neededBy} onChange={change}
        />

        <TextareaField
          label="Alasan/Keperluan (opsional)" name="reason" value={form.reason} onChange={change}
          placeholder="Mis. laptop lama sudah rusak berat, karyawan baru mulai bekerja 1 September"
        />

        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}
