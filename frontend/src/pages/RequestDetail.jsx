import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import axiosClient from '../api/axiosClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { Badge } from '../components/ui/StatusBadge.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { TextField, SelectField, TextareaField, FormError } from '../components/ui/Form.jsx';
import { todayLocal } from '../utils/dateLocal.js';

/**
 * ============================================================================
 *  PERMINTAAN ASET — DETAIL & TINJAUAN
 * ============================================================================
 *  Memenuhi permintaan di sini benar-benar memanggil jalur serah terima aset
 *  yang sama dengan halaman Detail Aset (lewat performCheckOut di backend) —
 *  bukan jalur pintas terpisah. Begitu dipenuhi, ceknya bisa dilihat di dua
 *  tempat: di sini, dan di riwayat serah terima asetnya sendiri.
 * ============================================================================
 */

const PRIORITY_TONE = { rendah: 'neutral', sedang: 'info', tinggi: 'warning' };
const STATUS_TONE = { diajukan: 'info', disetujui: 'brand', ditolak: 'danger', dipenuhi: 'neutral', dibatalkan: 'neutral' };
const STATUS_ICON = { diajukan: 'fa-hourglass-half', disetujui: 'fa-circle-check', ditolak: 'fa-circle-xmark', dipenuhi: 'fa-box-open', dibatalkan: 'fa-ban' };

const tanggalPanjang = (v) =>
  v ? new Date(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

export default function RequestDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const { pushError, pushSuccess } = useNotification();

  const [item, setItem] = useState(null);
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showFulfill, setShowFulfill] = useState(false);
  const [busy, setBusy] = useState(false);

  const canEdit = can('requests', 'edit');
  const canDelete = can('requests', 'delete');

  const muat = useCallback(async () => {
    try {
      const res = await axiosClient.get(`/requests/${id}`);
      setItem(res.data);
    } catch {
      pushError('Gagal memuat permintaan.');
    }
  }, [id, pushError]);

  useEffect(() => { muat(); }, [muat]);

  async function handleCancel() {
    if (!confirm(`Batalkan permintaan "${item.itemName}"?`)) return;
    setBusy(true);
    try {
      const res = await axiosClient.put(`/requests/${id}/cancel`);
      pushSuccess(res.data.message);
      muat();
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal membatalkan permintaan.');
    } finally {
      setBusy(false);
    }
  }

  if (!item) {
    return (
      <Layout width="narrow">
        <Skeleton className="h-7 w-64 mb-6" />
        <Card><Skeleton className="h-64 w-full" /></Card>
      </Layout>
    );
  }

  return (
    <Layout width="narrow">
      <PageHeader
        backTo="/requests"
        backLabel="Permintaan Aset"
        eyebrow={item.requestNo}
        title={item.itemName}
        description={<Badge tone={STATUS_TONE[item.status]} size="sm"><i className={`fas ${STATUS_ICON[item.status]} text-[9px] mr-1`} aria-hidden="true" />{item.statusLabel}</Badge>}
        actions={
          <>
            {canEdit && item.status === 'diajukan' && (
              <>
                <Button variant="destructive" size="sm" onClick={() => setShowReject(true)}>Tolak</Button>
                <Button size="sm" onClick={() => setShowApprove(true)}>Setujui</Button>
              </>
            )}
            {canEdit && item.status === 'disetujui' && (
              <Button size="sm" onClick={() => setShowFulfill(true)}>
                <i className="fas fa-box-open text-xs" aria-hidden="true" /> Penuhi Permintaan
              </Button>
            )}
            {canEdit && ['diajukan', 'disetujui'].includes(item.status) && (
              <Button variant="secondary" size="sm" onClick={handleCancel} loading={busy}>Batalkan</Button>
            )}
          </>
        }
      />

      <Card className="mb-5">
        <CardHeader title="Detail Permintaan" />
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <Info label="Peminta" value={item.requesterName} />
          <Info label="Departemen" value={item.department} />
          <Info label="Kode Barang/Aset" value={item.categoryName} />
          <Info label="Prioritas" value={<Badge tone={PRIORITY_TONE[item.priority]} size="sm">{item.priorityLabel}</Badge>} />
          <Info label="Dibutuhkan Sebelum" value={tanggalPanjang(item.neededBy)} />
          <Info label="Diajukan Oleh" value={item.createdBy} />
          {item.reason && (
            <div className="sm:col-span-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Alasan/Keperluan</dt>
              <dd className="text-ink-700 mt-1 leading-relaxed">{item.reason}</dd>
            </div>
          )}
        </dl>
      </Card>

      {item.status !== 'diajukan' && (
        <Card className="mb-5">
          <CardHeader title="Tinjauan" />
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <Info label="Ditinjau Oleh" value={item.reviewedBy} />
            <Info label="Tanggal Tinjau" value={tanggalPanjang(item.reviewedAt)} />
            {item.reviewNote && (
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Catatan</dt>
                <dd className="text-ink-700 mt-1 leading-relaxed">{item.reviewNote}</dd>
              </div>
            )}
          </dl>
        </Card>
      )}

      {item.status === 'dipenuhi' && (
        <Card className="mb-5 border-brand-200 bg-brand-50/40">
          <CardHeader title="Dipenuhi Dengan" icon={(p) => <i {...p} className="fas fa-box-open text-xs" />} />
          <div className="flex items-center justify-between gap-3">
            <div>
              <Link to={`/assets/${item.fulfilledAssetId}`} className="font-medium text-ink-800 hover:text-brand-600">
                {item.fulfilledAssetName}
              </Link>
              <p className="font-mono text-[12px] text-ink-500 mt-0.5">{item.fulfilledAssetCode}</p>
            </div>
            <Button size="sm" variant="secondary" to={`/assets/${item.fulfilledAssetId}`}>Lihat Aset</Button>
          </div>
          <p className="text-[12px] text-ink-500 mt-3">
            Diserahkan oleh {item.fulfilledBy} · {tanggalPanjang(item.fulfilledAt)}
          </p>
        </Card>
      )}

      {canDelete && item.status === 'diajukan' && (
        <p className="print-hide text-center text-xs text-ink-400 mt-4">
          <button
            type="button"
            onClick={async () => {
              if (!confirm(`Hapus permintaan "${item.itemName}"?`)) return;
              try {
                await axiosClient.delete(`/requests/${id}`);
                pushSuccess('Permintaan dihapus.');
                window.location.href = '/requests';
              } catch (err) {
                pushError(err.response?.data?.message || 'Gagal menghapus permintaan.');
              }
            }}
            className="text-danger-500 hover:text-danger-700 underline"
          >
            Hapus permintaan ini
          </button>
        </p>
      )}

      {showApprove && (
        <ReviewModal
          mode="approve" item={item}
          onClose={() => setShowApprove(false)}
          onDone={(msg) => { setShowApprove(false); pushSuccess(msg); muat(); }}
        />
      )}
      {showReject && (
        <ReviewModal
          mode="reject" item={item}
          onClose={() => setShowReject(false)}
          onDone={(msg) => { setShowReject(false); pushSuccess(msg); muat(); }}
        />
      )}
      {showFulfill && (
        <FulfillModal
          item={item}
          onClose={() => setShowFulfill(false)}
          onDone={(msg) => { setShowFulfill(false); pushSuccess(msg); muat(); }}
        />
      )}
    </Layout>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="text-ink-800 font-medium mt-1">{value || <span className="text-ink-300 font-normal">—</span>}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ReviewModal({ mode, item, onClose, onDone }) {
  const [reviewNote, setReviewNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isReject = mode === 'reject';

  async function submit(e) {
    e.preventDefault();
    if (isReject && !reviewNote.trim()) { setError('Alasan penolakan wajib diisi.'); return; }

    setSaving(true);
    try {
      const res = await axiosClient.put(`/requests/${item.id}/${isReject ? 'reject' : 'approve'}`, { reviewNote });
      onDone(res.data.message);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={isReject ? 'Tolak Permintaan' : 'Setujui Permintaan'}
      description={`${item.itemName} · ${item.requesterName}`}
      icon={isReject ? 'fa-circle-xmark' : 'fa-circle-check'}
      iconTone={isReject ? 'danger' : 'brand'}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Batal</Button>
          <Button type="submit" form="review-form" variant={isReject ? 'destructive' : 'primary'} loading={saving}>
            {isReject ? 'Tolak' : 'Setujui'}
          </Button>
        </>
      }
    >
      <form id="review-form" onSubmit={submit} className="space-y-4">
        <TextareaField
          label={isReject ? 'Alasan Penolakan' : 'Catatan (opsional)'}
          required={isReject}
          value={reviewNote} onChange={(e) => setReviewNote(e.target.value)}
          placeholder={isReject ? 'Mis. stok kategori ini sedang tidak tersedia' : 'Mis. akan dipenuhi minggu depan'}
        />
        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}

function FulfillModal({ item, onClose, onDone }) {
  const { pushError } = useNotification();
  const [assets, setAssets] = useState(null);
  const [assetId, setAssetId] = useState('');
  const [assignedAt, setAssignedAt] = useState(todayLocal());
  const [assignNote, setAssignNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    axiosClient.get('/assets', { params: { status: 'idle', categoryId: item.categoryId || undefined, limit: 100 } })
      .then((res) => setAssets(res.data.data))
      .catch(() => pushError('Gagal memuat daftar aset yang tersedia.'));
  }, [item.categoryId, pushError]);

  async function submit(e) {
    e.preventDefault();
    if (!assetId) { setError('Pilih aset yang akan diserahkan.'); return; }

    setSaving(true);
    try {
      const res = await axiosClient.put(`/requests/${item.id}/fulfill`, { assetId, assignedAt, assignNote });
      onDone(res.data.message);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memenuhi permintaan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Penuhi Permintaan"
      description={`${item.itemName} · untuk ${item.requesterName}`}
      icon="fa-box-open" iconTone="brand"
      onClose={onClose}
      width="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Batal</Button>
          <Button type="submit" form="fulfill-form" loading={saving}>Serahkan Aset</Button>
        </>
      }
    >
      <form id="fulfill-form" onSubmit={submit} className="space-y-4">
        <p className="flex gap-2.5 rounded-xl bg-info-50 px-3.5 py-3 text-xs text-info-700 leading-relaxed">
          <i className="fas fa-circle-info mt-0.5 shrink-0" aria-hidden="true" />
          Aset yang dipilih akan diserahkan langsung ke <strong>{item.requesterName}</strong>, tercatat sama seperti
          serah terima biasa di halaman Detail Aset.
        </p>

        {assets === null ? (
          <p className="text-sm text-ink-400 text-center py-4">Memuat daftar aset…</p>
        ) : assets.length === 0 ? (
          <EmptyState
            icon="fa-box"
            title="Tidak ada aset menganggur yang cocok"
            description={item.categoryName
              ? `Tidak ada aset berkode "${item.categoryName}" yang berstatus menganggur saat ini.`
              : 'Tidak ada aset berstatus menganggur saat ini.'}
          />
        ) : (
          <SelectField label="Pilih Aset" required value={assetId} onChange={(e) => setAssetId(e.target.value)}>
            <option value="">— Pilih aset —</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>{a.asset_code} · {a.name}{a.brand ? ` (${a.brand})` : ''}</option>
            ))}
          </SelectField>
        )}

        <TextField label="Tanggal Serah Terima" type="date" required value={assignedAt} onChange={(e) => setAssignedAt(e.target.value)} />
        <TextareaField label="Catatan (opsional)" value={assignNote} onChange={(e) => setAssignNote(e.target.value)} />

        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}
