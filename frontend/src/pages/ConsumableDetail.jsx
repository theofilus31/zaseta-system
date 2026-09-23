import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axiosClient from '../api/axiosClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { Badge } from '../components/ui/StatusBadge.jsx';
import { Skeleton, SkeletonRows } from '../components/ui/Skeleton.jsx';
import { TextField, TextareaField, FormError } from '../components/ui/Form.jsx';
import { ConsumableFormModal } from './ConsumableList.jsx';
import { rupiahOrNull as rupiah } from '../utils/currency.js';

/**
 * ============================================================================
 *  BARANG HABIS PAKAI — DETAIL & KARTU STOK
 * ============================================================================
 *  Kartu stok mencatat setiap penerimaan, pengeluaran, dan penyesuaian
 *  sebagai baris tersendiri yang tidak pernah dihapus — sama seperti riwayat
 *  serah terima aset. Angka stok saat ini selalu bisa ditelusuri balik ke
 *  transaksi mana yang menghasilkannya.
 * ============================================================================
 */

const TYPE_CONFIG = {
  masuk: { label: 'Stok Masuk', icon: 'fa-arrow-down', tone: 'brand', sign: '+' },
  keluar: { label: 'Stok Keluar', icon: 'fa-arrow-up', tone: 'warning', sign: '-' },
  penyesuaian: { label: 'Penyesuaian', icon: 'fa-sliders', tone: 'info', sign: '±' },
};

const tanggal = (v) =>
  v ? new Date(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

export default function ConsumableDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { pushError, pushSuccess } = useNotification();

  const [item, setItem] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [showEdit, setShowEdit] = useState(false);
  const [showIn, setShowIn] = useState(false);
  const [showOut, setShowOut] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [qr, setQr] = useState(null);
  const [regenerating, setRegenerating] = useState(false);

  const canEdit = can('consumables', 'edit');
  const canDelete = can('consumables', 'delete');

  const muatItem = useCallback(async () => {
    try {
      const res = await axiosClient.get(`/consumables/${id}`);
      setItem(res.data);
    } catch {
      pushError('Gagal memuat data barang.');
    }
  }, [id, pushError]);

  const muatTransaksi = useCallback(async () => {
    try {
      const res = await axiosClient.get(`/consumables/${id}/transactions`, { params: { page } });
      setTransactions(res.data.data);
      setPagination(res.data.pagination);
    } catch {
      pushError('Gagal memuat kartu stok.');
    }
  }, [id, page, pushError]);

  /* Kode QR/barcode dibuat on-demand di backend (lihat consumableQrController.js)
     -- barang yang sudah ada SEBELUM fitur ini belum tentu punya baris QR,
     jadi dipanggil di sini (bukan sekadar dibaca dari GET /consumables/:id)
     supaya pratinjau selalu ada begitu halaman ini dibuka, sama seperti kalau
     tombol "Cetak Barcode" diklik. */
  const muatQr = useCallback(async () => {
    try {
      const res = await axiosClient.get(`/consumables/${id}/qr/print`);
      setQr(res.data);
    } catch {
      /* Kegagalan di sini tidak boleh mengganggu tampilan detail utamanya. */
    }
  }, [id]);

  useEffect(() => { muatItem(); }, [muatItem]);
  useEffect(() => { muatTransaksi(); }, [muatTransaksi]);
  useEffect(() => { muatQr(); }, [muatQr]);

  async function handleRegenerateQr() {
    if (!confirm('Kode QR lama tidak akan berlaku lagi setelah ini. Lanjutkan?')) return;
    setRegenerating(true);
    try {
      await axiosClient.post(`/consumables/${id}/qr/regenerate`);
      await muatQr();
      pushSuccess('Kode QR berhasil dibuat ulang. Label lama perlu dicetak ulang.');
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal membuat ulang Kode QR.');
    } finally {
      setRegenerating(false);
    }
  }

  function afterStockChange(message) {
    pushSuccess(message);
    setShowIn(false);
    setShowOut(false);
    setShowAdjust(false);
    setPage(1);
    muatItem();
    muatTransaksi();
  }

  async function handleDelete() {
    if (!confirm(`Nonaktifkan "${item.name}"? Barang tidak akan muncul lagi di daftar aktif.`)) return;
    setDeleting(true);
    try {
      await axiosClient.delete(`/consumables/${id}`);
      navigate('/consumables');
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal menonaktifkan barang.');
      setDeleting(false);
    }
  }

  if (!item) {
    return (
      <>
        <Skeleton className="h-7 w-64 mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-2"><SkeletonRows rows={5} cols={4} /></Card>
          <Card><Skeleton className="h-40 w-full" /></Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        backTo="/consumables"
        backLabel="Barang Habis Pakai"
        eyebrow={item.code}
        title={item.name}
        description={item.assetTypeName ? <Badge tone="neutral" size="sm">{item.assetTypeName}</Badge> : undefined}
        actions={
          <>
            <Button to={`/consumables/${id}/qr`} variant="secondary" size="sm">
              <i className="fas fa-qrcode text-xs" aria-hidden="true" /> Cetak Barcode
            </Button>
            {canEdit && (
              <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)}>
                <i className="fas fa-pen text-xs" aria-hidden="true" /> Ubah
              </Button>
            )}
            {canDelete && (
              <Button variant="destructive" size="sm" onClick={handleDelete} loading={deleting}>
                <i className="fas fa-ban text-xs" aria-hidden="true" /> Nonaktifkan
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">
          <Card padded={false} className="overflow-hidden">
            <CardHeader title="Kartu Stok" description="Setiap penerimaan, pengeluaran, dan penyesuaian tercatat di sini." bordered />

            {transactions === null ? (
              <div className="p-5"><SkeletonRows rows={5} cols={4} /></div>
            ) : transactions.length === 0 ? (
              <EmptyState
                icon="fa-clipboard-list"
                title="Belum ada transaksi"
                description="Catat stok masuk pertama untuk mulai mengisi kartu stok barang ini."
              />
            ) : (
              <div className="overflow-x-auto scrollbar-slim">
                <table className="table-base min-w-[640px]">
                  <thead>
                    <tr>
                      <th>Tanggal</th>
                      <th>Jenis</th>
                      <th className="!text-right">Jumlah</th>
                      <th className="!text-right">Sisa</th>
                      <th>Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => {
                      const cfg = TYPE_CONFIG[t.type];
                      return (
                        <tr key={t.id}>
                          <td className="text-[13px] text-ink-600 whitespace-nowrap">{tanggal(t.createdAt)}</td>
                          <td><Badge tone={cfg.tone} size="sm"><i className={`fas ${cfg.icon} text-[9px] mr-1`} aria-hidden="true" />{cfg.label}</Badge></td>
                          <td className="text-right font-medium tabular-nums">{cfg.sign}{t.quantity} {item.unit}</td>
                          <td className="text-right tabular-nums text-ink-600">{t.balanceAfter}</td>
                          <td className="text-[13px] text-ink-500 max-w-[18rem]">
                            {t.type === 'masuk' && (t.vendor || t.unitPrice) && (
                              <p>{t.vendor}{t.vendor && t.unitPrice ? ' · ' : ''}{rupiah(t.unitPrice)}</p>
                            )}
                            {t.type === 'keluar' && (
                              <p>{t.requestedBy}{t.department ? ` · ${t.department}` : ''}</p>
                            )}
                            {t.notes && <p className="truncate">{t.notes}</p>}
                            <p className="text-[11px] text-ink-400 mt-0.5">{t.createdBy}</p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {pagination.totalPages > 1 && (
              <div className="p-4 border-t border-ink-100">
                <div className="flex justify-center gap-2 text-[13px]">
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`h-7 w-7 rounded-lg ${p === pagination.page ? 'bg-brand-500 text-white' : 'text-ink-500 hover:bg-ink-100'}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto scrollbar-slim lg:-mx-1 lg:px-1 lg:pb-1">
          <Card className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-2">Stok Saat Ini</p>
            <p className={`text-4xl font-bold tabular-nums ${item.lowStock ? 'text-danger-600' : 'text-ink-900'}`}>
              {item.currentStock}
            </p>
            <p className="text-sm text-ink-400 mt-1">{item.unit}</p>
            {item.lowStock && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-danger-50 px-3 py-1 text-xs font-medium text-danger-700">
                <i className="fas fa-triangle-exclamation text-[10px]" aria-hidden="true" />
                {item.currentStock <= 0 ? 'Stok habis' : `Di bawah ambang (${item.minStock})`}
              </p>
            )}
            {!item.lowStock && item.minStock > 0 && (
              <p className="text-[11px] text-ink-400 mt-2">Ambang minimum {item.minStock} {item.unit}</p>
            )}

            {canEdit && (
              <div className="grid grid-cols-1 gap-2 mt-5">
                <Button size="sm" onClick={() => setShowIn(true)}>
                  <i className="fas fa-arrow-down text-xs" aria-hidden="true" /> Stok Masuk
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setShowOut(true)} disabled={item.currentStock <= 0}>
                  <i className="fas fa-arrow-up text-xs" aria-hidden="true" /> Stok Keluar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAdjust(true)}>
                  <i className="fas fa-sliders text-xs" aria-hidden="true" /> Penyesuaian
                </Button>
              </div>
            )}
          </Card>

          {/* Kode QR tepat di bawah kartu stok (bukan paling bawah kolom) --
              sama seperti Detail Aset: kolom samping ini lebih tinggi dari layar,
              jadi kartu di ujung bawah baru kelihatan setelah scroll jauh,
              padahal Cetak Label & Buat Ulang sering dipakai. */}
          {qr && (
            <Card className="text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-3">Kode QR Barang</p>

              {qr.image_path ? (
                <div className="inline-block rounded-2xl border border-ink-200 bg-white p-2.5 shadow-sm">
                  <img src={qr.image_path} alt={`Kode QR untuk ${item.name}`} className="h-32 w-32" />
                </div>
              ) : (
                <p className="text-xs text-danger-600 py-8">Gambar Kode QR tidak valid.</p>
              )}

              <p className="text-xs text-ink-400 mt-3">
                Sudah dipindai <span className="font-semibold text-ink-600 tabular-nums">{qr.scan_count}</span> kali
              </p>

              <div className={`grid gap-2 mt-3.5 ${canEdit ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <Button to={`/consumables/${id}/qr`} variant="secondary" size="sm" block>
                  <i className="fas fa-print text-xs" aria-hidden="true" /> Cetak Label
                </Button>
                {canEdit && (
                  <Button variant="secondary" size="sm" block onClick={handleRegenerateQr} loading={regenerating}>
                    <i className="fas fa-rotate text-xs" aria-hidden="true" /> {regenerating ? 'Membuat…' : 'Buat Ulang'}
                  </Button>
                )}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Detail Barang" />
            <dl className="space-y-2.5 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-400">Lokasi</dt>
                <dd className="text-ink-700 font-medium text-right">{item.locationName || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-400">Kategori</dt>
                <dd className="text-ink-700 font-medium">{item.assetTypeName || '—'}</dd>
              </div>
              {item.notes && (
                <div className="pt-2 border-t border-ink-100">
                  <dt className="text-ink-400 mb-1">Catatan</dt>
                  <dd className="text-ink-600 leading-relaxed">{item.notes}</dd>
                </div>
              )}
            </dl>
          </Card>
        </div>
      </div>

      {showEdit && (
        <ConsumableFormModal
          item={item}
          onClose={() => setShowEdit(false)}
          onSaved={(res) => { setShowEdit(false); pushSuccess(res.message); muatItem(); }}
        />
      )}
      {showIn && <StockInModal item={item} onClose={() => setShowIn(false)} onDone={afterStockChange} />}
      {showOut && <StockOutModal item={item} onClose={() => setShowOut(false)} onDone={afterStockChange} />}
      {showAdjust && <AdjustModal item={item} onClose={() => setShowAdjust(false)} onDone={afterStockChange} />}
    </>
  );
}

/* -------------------------------------------------------------------------- */

/* Diekspor -- dipakai ulang oleh ConsumableScanActionPanel.jsx (aksi cepat
   setelah pindai barcode barang), bukan cuma dari halaman ini. */
export function StockInModal({ item, onClose, onDone }) {
  const [form, setForm] = useState({ quantity: '', vendor: '', unitPrice: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await axiosClient.post(`/consumables/${item.id}/stock-in`, {
        ...form, quantity: Number(form.quantity), unitPrice: form.unitPrice ? Number(form.unitPrice) : null,
      });
      onDone(res.data.message);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mencatat stok masuk.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Stok Masuk" description={`${item.name} · Saat ini ${item.currentStock} ${item.unit}`}
      icon="fa-arrow-down" iconTone="brand" onClose={onClose}
      footer={<>
        <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Batal</Button>
        <Button type="submit" form="stock-in-form" loading={saving}>Simpan</Button>
      </>}
    >
      <form id="stock-in-form" onSubmit={submit} className="space-y-4">
        <TextField label={`Jumlah Masuk (${item.unit})`} name="quantity" type="number" min="1" required autoFocus value={form.quantity} onChange={change} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField label="Vendor (opsional)" name="vendor" value={form.vendor} onChange={change} placeholder="Mis. Toko ATK Jaya" />
          <TextField label="Harga Satuan (opsional)" name="unitPrice" type="number" min="0" value={form.unitPrice} onChange={change} />
        </div>
        <TextareaField label="Catatan (opsional)" name="notes" value={form.notes} onChange={change} />
        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}

export function StockOutModal({ item, onClose, onDone }) {
  const [form, setForm] = useState({ quantity: '', requestedBy: '', department: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!form.requestedBy.trim()) { setError('Nama peminta wajib diisi.'); return; }
    setSaving(true);
    try {
      const res = await axiosClient.post(`/consumables/${item.id}/stock-out`, { ...form, quantity: Number(form.quantity) });
      onDone(res.data.message);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mencatat stok keluar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Stok Keluar" description={`${item.name} · Tersedia ${item.currentStock} ${item.unit}`}
      icon="fa-arrow-up" iconTone="warning" onClose={onClose}
      footer={<>
        <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Batal</Button>
        <Button type="submit" form="stock-out-form" loading={saving}>Simpan</Button>
      </>}
    >
      <form id="stock-out-form" onSubmit={submit} className="space-y-4">
        <TextField
          label={`Jumlah Keluar (${item.unit})`} name="quantity" type="number" min="1" max={item.currentStock} required autoFocus
          value={form.quantity} onChange={change}
          hint={`Maksimal ${item.currentStock} ${item.unit} (stok tersedia).`}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField label="Nama Peminta" name="requestedBy" required value={form.requestedBy} onChange={change} placeholder="Mis. Budi Santoso" />
          <TextField label="Departemen (opsional)" name="department" value={form.department} onChange={change} placeholder="Mis. Marketing" />
        </div>
        <TextareaField label="Keperluan (opsional)" name="notes" value={form.notes} onChange={change} placeholder="Mis. untuk keperluan rapat" />
        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}

function AdjustModal({ item, onClose, onDone }) {
  const [form, setForm] = useState({ newStock: item.currentStock, notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const selisih = Number(form.newStock) - item.currentStock;

  async function submit(e) {
    e.preventDefault();
    if (!form.notes.trim()) { setError('Alasan penyesuaian wajib diisi.'); return; }
    setSaving(true);
    try {
      const res = await axiosClient.post(`/consumables/${item.id}/adjust`, { ...form, newStock: Number(form.newStock) });
      onDone(res.data.message);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyesuaikan stok.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Penyesuaian Stok" description={`${item.name} · Catatan sistem: ${item.currentStock} ${item.unit}`}
      icon="fa-sliders" iconTone="info" onClose={onClose}
      footer={<>
        <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Batal</Button>
        <Button type="submit" form="adjust-form" loading={saving}>Simpan Penyesuaian</Button>
      </>}
    >
      <form id="adjust-form" onSubmit={submit} className="space-y-4">
        <p className="flex gap-2.5 rounded-xl bg-info-50 px-3.5 py-3 text-xs text-info-700 leading-relaxed">
          <i className="fas fa-circle-info mt-0.5 shrink-0" aria-hidden="true" />
          Gunakan ini setelah hitung fisik ternyata berbeda dari catatan — bukan untuk transaksi rutin.
        </p>
        <TextField label={`Stok Fisik Sebenarnya (${item.unit})`} name="newStock" type="number" min="0" required autoFocus value={form.newStock} onChange={change} />
        {selisih !== 0 && (
          <p className={`text-xs font-medium ${selisih > 0 ? 'text-brand-600' : 'text-danger-600'}`}>
            Selisih {selisih > 0 ? '+' : ''}{selisih} {item.unit} dari catatan sistem.
          </p>
        )}
        <TextareaField label="Alasan Penyesuaian" name="notes" required value={form.notes} onChange={change} placeholder="Mis. hasil stok opname fisik 18 Agustus 2026" />
        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}
