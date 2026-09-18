import React, { useEffect, useState } from 'react';
import PlatformLayout from '../components/PlatformLayout.jsx';
import axiosClient from '../api/axiosClient.js';
import { useNotification } from '../context/NotificationContext.jsx';
import Card from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { Badge } from '../components/ui/StatusBadge.jsx';
import { TextareaField } from '../components/ui/Form.jsx';
import { SegmentedControl } from '../components/ui/Button.jsx';

/**
 * ============================================================================
 *  ANTREAN PERSETUJUAN UPGRADE — KHUSUS ADMIN PLATFORM (Fase 4 SaaS)
 * ============================================================================
 *  Bukan bagian dari sidebar/matriks izin per-tenant biasa — halaman ini
 *  LINTAS TENANT, dijaga `users.is_platform_admin` (lihat
 *  migration_billing_phase4.sql dan middleware/auth.js -> requirePlatformAdmin).
 *  Sengaja bukan Fase 5 (super-admin) penuh, cuma cukup untuk memverifikasi
 *  transfer manual & menyetujui/menolak permintaan upgrade paket.
 * ============================================================================
 */

const rupiah = (v) => `Rp ${Number(v).toLocaleString('id-ID')}`;

const STATUS_TONE = { pending: 'warning', approved: 'brand', rejected: 'danger' };
const STATUS_LABEL = { pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak' };

const TABS = [
  { value: 'pending', label: 'Menunggu' },
  { value: 'all', label: 'Semua' },
];

function RequestCard({ req, onDecide, busy }) {
  const [noteOpen, setNoteOpen] = useState(null); // 'approve' | 'reject' | null
  const [adminNote, setAdminNote] = useState('');

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-ink-900">{req.tenantName}</p>
          <p className="text-xs text-ink-400 mt-0.5">
            {req.requesterName} &lt;{req.requesterEmail}&gt; — {new Date(req.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>
        <Badge tone={STATUS_TONE[req.status]}>{STATUS_LABEL[req.status]}</Badge>
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm">
        <Badge tone="neutral">{req.previousPlan || '—'}</Badge>
        <i className="fas fa-arrow-right text-ink-300 text-xs" aria-hidden="true" />
        <Badge tone="brand">{req.requestedPlan}</Badge>
        <Badge tone="neutral">{req.billingCycle === 'yearly' ? 'Tahunan' : 'Bulanan'}</Badge>
      </div>

      {/* Harga yang DIKUNCI saat tenant mengajukan (lihat createUpgradeRequest)
          — bisa beda dari harga katalog SAAT INI kalau admin sempat mengubahnya
          lewat menu Katalog Paket selagi permintaan ini menunggu. Menyetujui
          SELALU memakai angka ini, bukan harga katalog terkini. */}
      {req.price !== null && req.price !== undefined && (
        <p className="mt-2 text-[13px] text-ink-600">
          Ditagih: <strong className="text-ink-900">{rupiah(req.price)}</strong>
          <span className="text-ink-400"> — dikunci saat pengajuan, tidak ikut berubah kalau harga paket diubah sesudahnya</span>
        </p>
      )}

      {req.note && (
        <p className="mt-3 text-[13px] text-ink-600 bg-ink-50 rounded-xl px-3.5 py-2.5 leading-relaxed">
          "{req.note}"
        </p>
      )}

      {req.status !== 'pending' && req.adminNote && (
        <p className="mt-2 text-[13px] text-ink-500 leading-relaxed">
          <span className="font-semibold">Catatan admin:</span> {req.adminNote}
        </p>
      )}

      {req.status === 'pending' && (
        <div className="mt-4">
          {noteOpen ? (
            <div className="space-y-3">
              <TextareaField
                label={noteOpen === 'approve' ? 'Catatan persetujuan (opsional)' : 'Alasan penolakan (opsional)'}
                rows={2}
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                autoFocus
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={noteOpen === 'approve' ? 'primary' : 'destructive'}
                  loading={busy}
                  onClick={() => onDecide(req.id, noteOpen === 'approve', adminNote)}
                >
                  Konfirmasi {noteOpen === 'approve' ? 'Persetujuan' : 'Penolakan'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setNoteOpen(null); setAdminNote(''); }} disabled={busy}>
                  Batal
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => setNoteOpen('approve')}>
                <i className="fas fa-check text-xs" aria-hidden="true" />
                Setujui
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setNoteOpen('reject')}>
                <i className="fas fa-xmark text-xs" aria-hidden="true" />
                Tolak
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function PlatformBillingRequests() {
  const { pushSuccess, pushError } = useNotification();

  const [tab, setTab] = useState('pending');
  const [requests, setRequests] = useState(null);
  const [busyId, setBusyId] = useState(null);

  function load(status) {
    setRequests(null);
    axiosClient.get('/billing/upgrade-requests', { params: { status } })
      .then((res) => setRequests(res.data.requests))
      .catch((err) => pushError(err.response?.data?.message || 'Gagal memuat permintaan upgrade.'));
  }

  useEffect(() => { load(tab); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDecide(id, approve, adminNote) {
    setBusyId(id);
    try {
      await axiosClient.post(`/billing/upgrade-requests/${id}/${approve ? 'approve' : 'reject'}`, { adminNote: adminNote?.trim() || undefined });
      pushSuccess(approve ? 'Upgrade disetujui — paket tenant sudah aktif.' : 'Permintaan ditolak.');
      load(tab);
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal memproses permintaan.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PlatformLayout title="Permintaan Upgrade" width="narrow">
      <PageHeader
        eyebrow="Admin Platform"
        title="Permintaan Upgrade"
        description="Verifikasi transfer manual, lalu setujui atau tolak pengajuan upgrade paket dari seluruh tenant."
      />

      <div className="mb-5">
        <SegmentedControl options={TABS} value={tab} onChange={setTab} />
      </div>

      {requests === null && (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      )}

      {requests && requests.length === 0 && (
        <Card>
          <EmptyState
            icon="fa-inbox"
            title={tab === 'pending' ? 'Tidak ada permintaan menunggu' : 'Belum ada permintaan upgrade'}
            description={tab === 'pending' ? 'Semua permintaan upgrade sudah diproses.' : 'Riwayat permintaan upgrade dari seluruh tenant akan muncul di sini.'}
          />
        </Card>
      )}

      {requests && requests.length > 0 && (
        <div className="space-y-3">
          {requests.map((req) => (
            <RequestCard key={req.id} req={req} onDecide={handleDecide} busy={busyId === req.id} />
          ))}
        </div>
      )}
    </PlatformLayout>
  );
}
