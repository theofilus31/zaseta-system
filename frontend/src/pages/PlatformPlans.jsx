import React, { useEffect, useState } from 'react';
import PlatformLayout from '../components/PlatformLayout.jsx';
import axiosClient from '../api/axiosClient.js';
import { useNotification } from '../context/NotificationContext.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Card from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import { Badge } from '../components/ui/StatusBadge.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { TextField, TextareaField, Checkbox, FormError } from '../components/ui/Form.jsx';

/**
 * ============================================================================
 *  KATALOG PAKET (CRUD) — KHUSUS ADMIN PLATFORM
 * ============================================================================
 *  Sumber data: GET/POST/PATCH/DELETE /api/platform/plans (platformController
 *  listPlansAdmin/createPlan/updatePlan/movePlan/deletePlan) — BUKAN
 *  GET /api/billing/plans yang dipakai halaman Harga publik (itu cuma
 *  menampilkan paket AKTIF, halaman ini menampilkan SEMUA termasuk yang
 *  sudah dipensiunkan supaya admin bisa mengaktifkannya lagi kalau perlu).
 *
 *  Paket 'free' dikunci sebagian di sini mengikuti guard backend: harga dan
 *  status aktifnya tidak bisa diubah, dan tidak bisa dihapus — lihat komentar
 *  panjang di platformController.updatePlan/deletePlan soal kenapa.
 *
 *  Urutan katalog (dipakai membedakan upgrade vs downgrade, lihat
 *  config/plans.js -> isUpgrade()) diatur lewat tombol naik/turun, BUKAN
 *  drag-and-drop bebas — cukup untuk katalog berisi beberapa paket saja.
 * ============================================================================
 */

const rupiah = (v) => (v || v === 0 ? `Rp ${Number(v).toLocaleString('id-ID')}` : '—');

const EMPTY_FORM = {
  id: '', name: '', tagline: '', price: '', priceYearly: '',
  maxAssets: '', maxUsers: '', locationLimit: '',
  features: '', highlight: false, custom: false, selfServe: true,
  customPricingHint: '', isActive: true,
};

function planToForm(plan) {
  return {
    id: plan.id,
    name: plan.name,
    tagline: plan.tagline || '',
    price: plan.price ?? '',
    priceYearly: plan.priceYearly ?? '',
    maxAssets: plan.maxAssets ?? '',
    maxUsers: plan.maxUsers ?? '',
    locationLimit: plan.locationLimit ?? '',
    features: (plan.features || []).join('\n'),
    highlight: Boolean(plan.highlight),
    custom: Boolean(plan.custom),
    selfServe: Boolean(plan.selfServe),
    customPricingHint: plan.customPricingHint || '',
    isActive: Boolean(plan.isActive),
  };
}

function formToPayload(form, { isCreate }) {
  const payload = {
    name: form.name.trim(),
    tagline: form.tagline.trim(),
    price: form.price === '' ? 0 : Number(form.price),
    priceYearly: form.priceYearly === '' ? null : Number(form.priceYearly),
    maxAssets: form.maxAssets === '' ? null : Number(form.maxAssets),
    maxUsers: form.maxUsers === '' ? null : Number(form.maxUsers),
    locationLimit: form.locationLimit === '' ? null : Number(form.locationLimit),
    features: form.features.split('\n').map((f) => f.trim()).filter(Boolean),
    highlight: form.highlight,
    custom: form.custom,
    selfServe: form.selfServe,
    customPricingHint: form.customPricingHint.trim() || null,
    isActive: form.isActive,
  };
  if (isCreate) payload.id = form.id.trim().toLowerCase();
  return payload;
}

function PlanForm({ form, setForm, isCreate, isFree, error }) {
  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }
  function setChecked(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.checked }));
  }

  return (
    <div className="space-y-4">
      {isCreate && (
        <TextField
          label="ID Paket" required autoFocus
          value={form.id}
          onChange={(e) => setForm((f) => ({ ...f, id: e.target.value.toLowerCase() }))}
          hint="Huruf kecil/angka/garis bawah, tidak bisa diubah setelah dibuat. Mis. starter_plus."
          className="font-mono"
        />
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TextField label="Nama Paket" required value={form.name} onChange={set('name')} autoFocus={!isCreate} />
        <TextField label="Tagline" value={form.tagline} onChange={set('tagline')} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Harga Bulanan (Rp)" type="number" min={0} value={form.price} onChange={set('price')}
          disabled={isFree} hint={isFree ? 'Paket Free selalu Rp 0.' : undefined}
        />
        <TextField
          label="Harga Tahunan (Rp)" type="number" min={0} value={form.priceYearly} onChange={set('priceYearly')}
          disabled={isFree} hint="Kosongkan = tidak ditawarkan tahunan."
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <TextField label="Batas Aset" type="number" min={0} value={form.maxAssets} onChange={set('maxAssets')} hint="Kosong = tanpa batas" />
        <TextField label="Batas Pengguna" type="number" min={0} value={form.maxUsers} onChange={set('maxUsers')} hint="Kosong = tanpa batas" />
        <TextField label="Batas Lokasi" type="number" min={0} value={form.locationLimit} onChange={set('locationLimit')} hint="Kosong = tanpa batas" />
      </div>

      <TextareaField
        label="Daftar Fitur" rows={6} value={form.features} onChange={set('features')}
        hint="Satu fitur per baris — tampil apa adanya di halaman Harga & kartu paket."
      />

      <TextField
        label="Catatan Harga Khusus (opsional)" value={form.customPricingHint} onChange={set('customPricingHint')}
        hint="Microcopy CTA sekunder, mis. ajakan hubungi sales untuk kontrak khusus."
      />

      <div className="grid grid-cols-2 gap-3">
        <Checkbox label="Tandai Populer" description="Badge di halaman Harga" checked={form.highlight} onChange={setChecked('highlight')} />
        <Checkbox label="Harga Khusus" description="Custom pricing" checked={form.custom} onChange={setChecked('custom')} />
        <Checkbox label="Bisa Upgrade Mandiri" description="Self-serve" checked={form.selfServe} onChange={setChecked('selfServe')} />
        <Checkbox
          label="Aktif" description="Tampil di katalog publik" checked={form.isActive} onChange={setChecked('isActive')}
          disabled={isFree}
        />
      </div>
      {isFree && <p className="hint">Paket Free tidak bisa dinonaktifkan — dipakai signup mandiri & penurunan otomatis saat kedaluwarsa.</p>}

      <FormError>{error}</FormError>
    </div>
  );
}

export default function PlatformPlans() {
  const { pushSuccess, pushError } = useNotification();
  const [plans, setPlans] = useState(null);
  const [modalMode, setModalMode] = useState(null); // null | 'create' | 'edit'
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [busyId, setBusyId] = useState(null);

  function load() {
    axiosClient.get('/platform/plans')
      .then((res) => setPlans(res.data.plans))
      .catch((err) => pushError(err.response?.data?.message || 'Gagal memuat katalog paket.'));
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError('');
    setModalMode('create');
  }

  function openEdit(plan) {
    setForm(planToForm(plan));
    setFormError('');
    setModalMode('edit');
  }

  function closeModal() {
    setModalMode(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');

    if (modalMode === 'create' && !/^[a-z][a-z0-9_]{1,49}$/.test(form.id.trim())) {
      setFormError('ID paket harus huruf kecil/angka/garis bawah, diawali huruf, 2-50 karakter.');
      return;
    }
    if (!form.name.trim()) {
      setFormError('Nama paket wajib diisi.');
      return;
    }

    setSaving(true);
    try {
      const payload = formToPayload(form, { isCreate: modalMode === 'create' });
      if (modalMode === 'create') {
        await axiosClient.post('/platform/plans', payload);
        pushSuccess(`Paket "${payload.name}" berhasil ditambahkan.`);
      } else {
        await axiosClient.patch(`/platform/plans/${form.id}`, payload);
        pushSuccess(`Paket "${payload.name}" berhasil diperbarui.`);
      }
      closeModal();
      load();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Gagal menyimpan paket.');
    } finally {
      setSaving(false);
    }
  }

  async function handleMove(planId, direction) {
    setBusyId(planId);
    try {
      const res = await axiosClient.patch(`/platform/plans/${planId}/move`, { direction });
      setPlans(res.data.plans);
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal mengubah urutan paket.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(plan) {
    if (!confirm(`Hapus paket "${plan.name}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    setBusyId(plan.id);
    try {
      await axiosClient.delete(`/platform/plans/${plan.id}`);
      pushSuccess(`Paket "${plan.name}" dihapus.`);
      load();
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal menghapus paket.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PlatformLayout title="Katalog Paket">
      <PageHeader
        eyebrow="Admin Platform"
        title="Katalog Paket"
        description="Kelola harga, limit, dan fitur paket langganan yang ditawarkan ke seluruh tenant."
        actions={<Button onClick={openCreate}><i className="fas fa-plus text-xs" aria-hidden="true" />Tambah Paket</Button>}
      />

      {!plans && (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      )}

      {plans && (
        <div className="space-y-3">
          {plans.map((plan, idx) => {
            const isFree = plan.id === 'free';
            return (
              <Card key={plan.id} className={!plan.isActive ? 'opacity-60' : ''}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[15px] font-bold text-ink-900">{plan.name}</p>
                      <span className="text-[11px] font-mono text-ink-300">{plan.id}</span>
                      {plan.highlight && <Badge tone="brand" size="sm">Populer</Badge>}
                      {plan.custom && <Badge tone="accent" size="sm">Harga Khusus</Badge>}
                      {!plan.isActive && <Badge tone="neutral" size="sm">Nonaktif</Badge>}
                    </div>
                    <p className="text-xs text-ink-400 mt-0.5">{plan.tagline}</p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm" variant="secondary" title="Naikkan urutan"
                      disabled={idx === 0 || busyId === plan.id}
                      onClick={() => handleMove(plan.id, 'up')}
                    >
                      <i className="fas fa-arrow-up text-xs" aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm" variant="secondary" title="Turunkan urutan"
                      disabled={idx === plans.length - 1 || busyId === plan.id}
                      onClick={() => handleMove(plan.id, 'down')}
                    >
                      <i className="fas fa-arrow-down text-xs" aria-hidden="true" />
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => openEdit(plan)}>
                      <i className="fas fa-pen text-xs" aria-hidden="true" />
                      Ubah
                    </Button>
                    {!isFree && (
                      <Button size="sm" variant="destructive" loading={busyId === plan.id} onClick={() => handleDelete(plan)}>
                        <i className="fas fa-trash-can text-xs" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-ink-600">
                  <span className="font-semibold text-ink-900">{plan.price === null ? 'Custom' : rupiah(plan.price)}<span className="font-normal text-ink-400">/bulan</span></span>
                  <span>{plan.maxAssets === null ? 'Aset tanpa batas' : `${plan.maxAssets.toLocaleString('id-ID')} aset`}</span>
                  <span>{plan.maxUsers === null ? 'Pengguna tanpa batas' : `${plan.maxUsers.toLocaleString('id-ID')} pengguna`}</span>
                  <span>{plan.locationLimit === null ? 'Lokasi tanpa batas' : `${plan.locationLimit.toLocaleString('id-ID')} lokasi`}</span>
                  <span className="text-ink-400">{plan.features.length} fitur</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {modalMode && (
        <Modal
          title={modalMode === 'create' ? 'Tambah Paket Baru' : `Ubah Paket "${form.name}"`}
          width="xl"
          onClose={saving ? undefined : closeModal}
          footer={
            <div className="flex gap-2">
              <Button type="submit" form="plan-form" loading={saving}>Simpan</Button>
              <Button type="button" variant="secondary" onClick={closeModal} disabled={saving}>Batal</Button>
            </div>
          }
        >
          <form id="plan-form" onSubmit={handleSubmit}>
            <PlanForm form={form} setForm={setForm} isCreate={modalMode === 'create'} isFree={form.id === 'free'} error={formError} />
          </form>
        </Modal>
      )}
    </PlatformLayout>
  );
}
