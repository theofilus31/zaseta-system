import React, { useCallback, useEffect, useState } from 'react';
import axiosClient from '../../api/axiosClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotification } from '../../context/NotificationContext.jsx';
import Card, { CardHeader } from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import { Badge } from '../ui/StatusBadge.jsx';
import { TextField, SearchableSelect, DateField, TextareaField, FormError } from '../ui/Form.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { todayLocal as today } from '../../utils/dateLocal.js';

/**
 * ============================================================================
 *  PEMELIHARAAN ASET
 * ============================================================================
 *  Riwayat servis, kalibrasi, dan perbaikan — sebelumnya hanya ada di nota
 *  kertas yang gampang hilang. Setiap pemeliharaan dicatat sebagai PERISTIWA
 *  sendiri (beda dari pengingat yang cuma tanggal berulang), karena setiap
 *  kalinya punya vendor, biaya, dan hasil yang berbeda.
 * ============================================================================
 */

const TYPE_LABEL = {
  preventive: 'Preventif (Terjadwal)',
  corrective: 'Korektif (Perbaikan)',
  calibration: 'Kalibrasi',
  other: 'Lainnya',
};

const STATUS_CONFIG = {
  dijadwalkan: { label: 'Dijadwalkan', tone: 'info', icon: 'fa-calendar-day' },
  selesai: { label: 'Selesai', tone: 'brand', icon: 'fa-circle-check' },
  dibatalkan: { label: 'Dibatalkan', tone: 'neutral', icon: 'fa-circle-xmark' },
};

const rupiah = (v) => (v === null || v === undefined ? null : `Rp ${Number(v).toLocaleString('id-ID')}`);
const tanggal = (v) =>
  v ? new Date(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

function dueTone(dateStr) {
  const days = Math.ceil((new Date(dateStr) - new Date(new Date().toDateString())) / 86400000);
  if (days < 0) return 'danger';
  if (days <= 7) return 'warning';
  return 'info';
}

export default function AssetMaintenance({ assetId }) {
  const { can } = useAuth();
  const { pushError, pushSuccess } = useNotification();

  const [items, setItems] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [completing, setCompleting] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const canCreate = can('assets', 'create');
  const canEdit = can('assets', 'edit');
  const canDelete = can('assets', 'delete');

  const muat = useCallback(async () => {
    try {
      const res = await axiosClient.get(`/assets/${assetId}/maintenances`);
      setItems(res.data);
    } catch {
      pushError('Gagal memuat riwayat pemeliharaan.');
    }
  }, [assetId, pushError]);

  useEffect(() => { muat(); }, [muat]);

  async function handleCancel(item) {
    if (!confirm(`Batalkan jadwal "${item.title}"?`)) return;
    setBusyId(item.id);
    try {
      await axiosClient.put(`/assets/${assetId}/maintenances/${item.id}/cancel`);
      pushSuccess('Jadwal pemeliharaan dibatalkan.');
      muat();
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal membatalkan jadwal.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item) {
    if (!confirm(`Hapus catatan "${item.title}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    setBusyId(item.id);
    try {
      await axiosClient.delete(`/assets/${assetId}/maintenances/${item.id}`);
      pushSuccess(`Catatan "${item.title}" dihapus.`);
      muat();
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal menghapus catatan.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card padded={false}>
      <CardHeader
        title="Pemeliharaan"
        description="Jadwal dan riwayat servis, kalibrasi, atau perbaikan."
        bordered
        action={canCreate && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <i className="fas fa-screwdriver-wrench text-xs" aria-hidden="true" /> Jadwalkan
          </Button>
        )}
      />

      <div className="p-5">
        {items === null ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon="fa-screwdriver-wrench"
            title="Belum ada jadwal pemeliharaan"
            description="Jadwalkan servis rutin atau catat perbaikan supaya riwayatnya tidak hilang."
            action={canCreate && (
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <i className="fas fa-screwdriver-wrench text-xs" aria-hidden="true" /> Jadwalkan Pemeliharaan
              </Button>
            )}
          />
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const st = STATUS_CONFIG[item.status];
              return (
                <li key={item.id} className="rounded-xl border border-ink-200/70 px-3.5 py-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                      <i className="fas fa-screwdriver-wrench text-sm" aria-hidden="true" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[13px] font-medium text-ink-800">{item.title}</p>
                        <Badge tone={st.tone} size="sm">
                          <i className={`fas ${st.icon} text-[9px] mr-1`} aria-hidden="true" />
                          {st.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px] text-ink-500">
                        <span>{TYPE_LABEL[item.maintenanceType]}</span>
                        <span className="text-ink-300">·</span>
                        {item.status === 'dijadwalkan' ? (
                          <Badge tone={dueTone(item.scheduledDate)} size="sm">Jadwal {tanggal(item.scheduledDate)}</Badge>
                        ) : (
                          <span>Jadwal {tanggal(item.scheduledDate)}</span>
                        )}
                        {item.completedDate && <span>· Selesai {tanggal(item.completedDate)}</span>}
                      </div>
                      {(item.vendor || item.cost) && (
                        <p className="text-[11px] text-ink-500 mt-1">
                          {item.vendor}{item.vendor && item.cost ? ' · ' : ''}{rupiah(item.cost)}
                        </p>
                      )}
                      {item.description && <p className="text-[12px] text-ink-600 mt-1.5">{item.description}</p>}
                      {item.resultNote && (
                        <p className="text-[12px] text-ink-600 mt-1.5 bg-ink-50 rounded-lg px-2.5 py-1.5">
                          <span className="font-medium text-ink-700">Hasil: </span>{item.resultNote}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-1 shrink-0">
                      {item.status === 'dijadwalkan' && canEdit && (
                        <>
                          <Button size="xs" onClick={() => setCompleting(item)} disabled={busyId === item.id}>
                            Selesaikan
                          </Button>
                          <button
                            type="button"
                            onClick={() => handleCancel(item)}
                            disabled={busyId === item.id}
                            title="Batalkan jadwal"
                            className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-400 hover:text-danger-600 hover:bg-danger-50 transition-colors disabled:opacity-50"
                          >
                            <i className="fas fa-xmark text-xs" aria-hidden="true" />
                          </button>
                        </>
                      )}
                      {item.status !== 'dijadwalkan' && canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          disabled={busyId === item.id}
                          title="Hapus catatan"
                          className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-400 hover:text-danger-600 hover:bg-danger-50 transition-colors disabled:opacity-50"
                        >
                          <i className="fas fa-trash-can text-xs" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showCreate && (
        <CreateMaintenanceModal
          assetId={assetId}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); muat(); }}
        />
      )}

      {completing && (
        <CompleteMaintenanceModal
          assetId={assetId}
          item={completing}
          onClose={() => setCompleting(null)}
          onCompleted={() => { setCompleting(null); muat(); }}
        />
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function CreateMaintenanceModal({ assetId, onClose, onCreated }) {
  const { pushSuccess } = useNotification();
  const [form, setForm] = useState({
    maintenanceType: 'preventive', title: '', description: '', scheduledDate: today(), vendor: '', cost: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Judul pemeliharaan wajib diisi.'); return; }

    setSaving(true);
    try {
      await axiosClient.post(`/assets/${assetId}/maintenances`, {
        ...form,
        cost: form.cost ? Number(form.cost) : null,
      });
      pushSuccess('Jadwal pemeliharaan ditambahkan.');
      onCreated();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menjadwalkan pemeliharaan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Jadwalkan Pemeliharaan"
      description="Servis rutin, kalibrasi, atau perbaikan yang direncanakan."
      icon="fa-screwdriver-wrench"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Batal</Button>
          <Button type="submit" form="create-maintenance-form" loading={saving}>Simpan</Button>
        </>
      }
    >
      <form id="create-maintenance-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SearchableSelect
            label="Jenis" value={form.maintenanceType} onChange={(v) => setForm((f) => ({ ...f, maintenanceType: v }))}
            clearable={false} searchable={false}
            options={[
              { value: 'preventive', label: 'Preventif (Terjadwal)' },
              { value: 'corrective', label: 'Korektif (Perbaikan)' },
              { value: 'calibration', label: 'Kalibrasi' },
              { value: 'other', label: 'Lainnya' },
            ]}
            getOptionLabel={(o) => o.label} getOptionValue={(o) => o.value}
            placeholder="Pilih jenis…"
          />
          <DateField
            label="Tanggal Jadwal" name="scheduledDate" required
            value={form.scheduledDate} onChange={change}
          />
        </div>

        <TextField
          label="Judul" name="title" required autoFocus
          value={form.title} onChange={change}
          placeholder="Mis. Servis AC 3 Bulanan"
        />

        <TextareaField
          label="Deskripsi (opsional)" name="description"
          value={form.description} onChange={change}
          placeholder="Rincian pekerjaan yang direncanakan"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField
            label="Vendor (opsional)" name="vendor"
            value={form.vendor} onChange={change}
            placeholder="Mis. PT Servis Jaya"
          />
          <TextField
            label="Estimasi Biaya (opsional)" name="cost" type="number" min="0"
            value={form.cost} onChange={change}
            placeholder="0"
          />
        </div>

        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}

function CompleteMaintenanceModal({ assetId, item, onClose, onCompleted }) {
  const { pushSuccess, pushError } = useNotification();
  const [form, setForm] = useState({
    completedDate: today(), vendor: item.vendor || '', cost: item.cost || '', resultNote: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await axiosClient.put(`/assets/${assetId}/maintenances/${item.id}/complete`, {
        ...form,
        cost: form.cost ? Number(form.cost) : null,
      });
      pushSuccess('Pemeliharaan ditandai selesai.');
      onCompleted();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan.');
      pushError(err.response?.data?.message || 'Gagal menyimpan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Selesaikan Pemeliharaan"
      description={item.title}
      icon="fa-circle-check"
      iconTone="brand"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Batal</Button>
          <Button type="submit" form="complete-maintenance-form" loading={saving}>Tandai Selesai</Button>
        </>
      }
    >
      <form id="complete-maintenance-form" onSubmit={submit} className="space-y-4">
        <DateField
          label="Tanggal Selesai" name="completedDate" required
          value={form.completedDate} onChange={change}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField label="Vendor" name="vendor" value={form.vendor} onChange={change} />
          <TextField label="Biaya Aktual" name="cost" type="number" min="0" value={form.cost} onChange={change} />
        </div>

        <TextareaField
          label="Catatan Hasil" name="resultNote"
          value={form.resultNote} onChange={change}
          placeholder="Mis. sudah dibersihkan, komponen X diganti"
        />

        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}
