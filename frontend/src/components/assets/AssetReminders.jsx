import React, { useCallback, useEffect, useState } from 'react';
import axiosClient from '../../api/axiosClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotification } from '../../context/NotificationContext.jsx';
import Card, { CardHeader } from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import { Badge } from '../ui/StatusBadge.jsx';
import { TextField, SelectField, TextareaField, FormError } from '../ui/Form.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { todayLocal as today } from '../../utils/dateLocal.js';

/**
 * ============================================================================
 *  PENGINGAT BERTANGGAL
 * ============================================================================
 *  Garansi sudah dilacak sistem, tapi perpanjangan lisensi, servis berkala,
 *  asuransi, atau kontrak sewa selama ini hidup di kepala orang atau
 *  kalender pribadi masing-masing staf. Kartu ini menempelkannya langsung ke
 *  asetnya, dan ikut muncul di lonceng Pemberitahuan begitu jatuh temponya
 *  mendekat.
 * ============================================================================
 */

const RECURRENCE_LABEL = { none: 'Sekali', monthly: 'Bulanan', quarterly: 'Triwulanan', yearly: 'Tahunan' };

const tanggal = (v) =>
  v ? new Date(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

function dueTone(dateStr) {
  const days = Math.ceil((new Date(dateStr) - new Date(new Date().toDateString())) / 86400000);
  if (days < 0) return 'danger';
  if (days <= 7) return 'warning';
  return 'neutral';
}

export default function AssetReminders({ assetId }) {
  const { can } = useAuth();
  const { pushError, pushSuccess } = useNotification();

  const [items, setItems] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [showInactive, setShowInactive] = useState(false);

  const canCreate = can('assets', 'create');
  const canEdit = can('assets', 'edit');
  const canDelete = can('assets', 'delete');

  const muat = useCallback(async () => {
    try {
      const res = await axiosClient.get(`/assets/${assetId}/reminders`);
      setItems(res.data);
    } catch {
      pushError('Gagal memuat daftar pengingat.');
    }
  }, [assetId, pushError]);

  useEffect(() => { muat(); }, [muat]);

  async function handleComplete(item) {
    setBusyId(item.id);
    try {
      const res = await axiosClient.post(`/assets/${assetId}/reminders/${item.id}/complete`);
      pushSuccess(res.data.message);
      muat();
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal memperbarui pengingat.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item) {
    if (!confirm(`Hapus pengingat "${item.title}"?`)) return;
    setBusyId(item.id);
    try {
      await axiosClient.delete(`/assets/${assetId}/reminders/${item.id}`);
      pushSuccess(`Pengingat "${item.title}" dihapus.`);
      muat();
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal menghapus pengingat.');
    } finally {
      setBusyId(null);
    }
  }

  const visible = items?.filter((i) => showInactive || i.isActive) || [];
  const inactiveCount = items?.filter((i) => !i.isActive).length || 0;

  return (
    <Card padded={false}>
      <CardHeader
        title="Pengingat Bertanggal"
        description="Perpanjangan lisensi, servis berkala, asuransi, atau tanggal penting lain."
        bordered
        action={canCreate && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <i className="fas fa-bell text-xs" aria-hidden="true" /> Tambah
          </Button>
        )}
      />

      <div className="p-5">
        {items === null ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon="fa-bell"
            title="Belum ada pengingat"
            description="Tambahkan tanggal penting supaya tidak terlewat — muncul otomatis di lonceng Pemberitahuan saat mendekat."
            action={canCreate && (
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <i className="fas fa-bell text-xs" aria-hidden="true" /> Tambah Pengingat
              </Button>
            )}
          />
        ) : (
          <ul className="space-y-2">
            {visible.map((item) => (
              <li
                key={item.id}
                className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
                  item.isActive ? 'border-ink-200/70 hover:bg-ink-50/60' : 'border-ink-100 bg-ink-50/40 opacity-60'
                }`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                  <i className="fas fa-bell text-sm" aria-hidden="true" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink-800 truncate">{item.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge tone={item.isActive ? dueTone(item.reminderDate) : 'neutral'} size="sm">
                      {tanggal(item.reminderDate)}
                    </Badge>
                    {item.recurrence !== 'none' && (
                      <span className="text-[11px] text-ink-400">
                        <i className="fas fa-rotate text-[9px] mr-1" aria-hidden="true" />
                        {RECURRENCE_LABEL[item.recurrence]}
                      </span>
                    )}
                    {!item.isActive && <span className="text-[11px] text-ink-400">Selesai</span>}
                  </div>
                  {item.notes && <p className="text-[11px] text-ink-500 mt-1 truncate">{item.notes}</p>}
                </div>

                {item.isActive && (canEdit || canDelete) && (
                  <div className="flex gap-1 shrink-0">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleComplete(item)}
                        disabled={busyId === item.id}
                        title={item.recurrence === 'none' ? 'Tandai selesai' : 'Tandai selesai & jadwalkan ulang'}
                        className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-50"
                      >
                        <i className={`fas ${busyId === item.id ? 'fa-spinner fa-spin' : 'fa-check'} text-xs`} aria-hidden="true" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        disabled={busyId === item.id}
                        title="Hapus pengingat"
                        className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-400 hover:text-danger-600 hover:bg-danger-50 transition-colors disabled:opacity-50"
                      >
                        <i className="fas fa-trash-can text-xs" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {inactiveCount > 0 && (
          <button
            type="button"
            onClick={() => setShowInactive((v) => !v)}
            className="mt-3 text-[11px] font-medium text-ink-400 hover:text-ink-600 transition-colors"
          >
            {showInactive ? 'Sembunyikan yang sudah selesai' : `Tampilkan ${inactiveCount} yang sudah selesai`}
          </button>
        )}
      </div>

      {showCreate && (
        <CreateReminderModal
          assetId={assetId}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); muat(); }}
        />
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function CreateReminderModal({ assetId, onClose, onCreated }) {
  const { pushSuccess } = useNotification();
  const [form, setForm] = useState({ title: '', reminderDate: today(), recurrence: 'none', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Judul pengingat wajib diisi.'); return; }

    setSaving(true);
    try {
      await axiosClient.post(`/assets/${assetId}/reminders`, form);
      pushSuccess('Pengingat berhasil ditambahkan.');
      onCreated();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menambahkan pengingat.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Tambah Pengingat"
      description="Tanggal penting yang ingin diingatkan sebelum terlewat."
      icon="fa-bell"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Batal</Button>
          <Button type="submit" form="create-reminder-form" loading={saving}>Simpan</Button>
        </>
      }
    >
      <form id="create-reminder-form" onSubmit={submit} className="space-y-4">
        <TextField
          label="Judul" name="title" required autoFocus
          value={form.title} onChange={change}
          placeholder="Mis. Perpanjangan Lisensi Antivirus"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField
            label="Tanggal Jatuh Tempo" name="reminderDate" type="date" required
            value={form.reminderDate} onChange={change}
          />
          <SelectField
            label="Pengulangan" name="recurrence"
            value={form.recurrence} onChange={change}
            hint="Ditandai selesai akan menjadwalkan ulang otomatis."
          >
            <option value="none">Sekali saja</option>
            <option value="monthly">Bulanan</option>
            <option value="quarterly">Triwulanan</option>
            <option value="yearly">Tahunan</option>
          </SelectField>
        </div>

        <TextareaField
          label="Catatan (opsional)" name="notes"
          value={form.notes} onChange={change}
          placeholder="Mis. hubungi vendor X, nomor kontrak"
        />

        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}
