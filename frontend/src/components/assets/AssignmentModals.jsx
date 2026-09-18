import React, { useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import { TextField, SearchableSelect, DateField, TextareaField, FormError } from '../ui/Form.jsx';
import { todayLocal as today } from '../../utils/dateLocal.js';

/**
 * Serah terima aset ke seorang karyawan (check-out).
 *
 * Pemegang diketik bebas, tidak dipilih dari daftar pengguna aplikasi —
 * tabel `users` hanya berisi akun login (admin/staf IT/peninjau), sedangkan
 * penerima aset umumnya karyawan biasa yang tidak punya akun.
 */
export function CheckOutModal({ asset, onConfirm, onClose }) {
  const [form, setForm] = useState({
    holderName: '', holderContact: '', department: '',
    assignedAt: today(), assignNote: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function change(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.holderName.trim()) { setError('Nama pemegang wajib diisi.'); return; }

    setSubmitting(true);
    try {
      await onConfirm(form);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyerahkan aset.');
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="Serahkan Aset"
      description={`${asset.name} · ${asset.asset_code}`}
      icon="fa-hand-holding-hand"
      iconTone="info"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>Batal</Button>
          <Button type="submit" form="checkout-form" loading={submitting}>
            {submitting ? 'Menyimpan…' : 'Serahkan Aset'}
          </Button>
        </>
      }
    >
      <form id="checkout-form" onSubmit={handleSubmit} className="space-y-4">
        <p className="rounded-xl bg-info-50 border border-info-200 px-3.5 py-3 text-xs text-info-800 leading-relaxed">
          Status aset otomatis berubah menjadi <strong>“Dipakai”</strong> dan tercatat sebagai
          dipegang orang ini sampai diterima kembali.
        </p>

        <TextField
          label="Nama Pemegang" name="holderName" required autoFocus
          value={form.holderName} onChange={change}
          placeholder="Mis. Budi Santoso"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField
            label="Departemen" name="department"
            value={form.department} onChange={change}
            placeholder="Mis. Finance"
          />
          <TextField
            label="Kontak" name="holderContact"
            value={form.holderContact} onChange={change}
            placeholder="Surel atau nomor telepon"
          />
        </div>

        <DateField
          label="Tanggal Serah Terima" name="assignedAt" required
          value={form.assignedAt} onChange={change}
        />

        <TextareaField
          label="Catatan" name="assignNote" rows={2}
          value={form.assignNote} onChange={change}
          placeholder="Mis. keperluan, kelengkapan yang ikut diserahkan"
        />

        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}

/**
 * Penerimaan kembali aset (check-in).
 *
 * Momen ini sekaligus jadi kesempatan paling wajar untuk mengoreksi kondisi
 * fisik, karena barangnya memang sedang diperiksa saat dikembalikan.
 */
export function CheckInModal({ asset, assignment, onConfirm, onClose }) {
  const [form, setForm] = useState({
    returnedAt: today(),
    returnCondition: asset.condition_status || 'baik',
    newStatus: 'idle',
    returnNote: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function change(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onConfirm(form);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menerima kembali aset.');
      setSubmitting(false);
    }
  }

  const conditionChanged = form.returnCondition !== asset.condition_status;

  return (
    <Modal
      title="Terima Kembali Aset"
      description={`Dari ${assignment.holder_name}${assignment.department ? ` · ${assignment.department}` : ''}`}
      icon="fa-rotate-left"
      iconTone="brand"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>Batal</Button>
          <Button type="submit" form="checkin-form" loading={submitting}>
            {submitting ? 'Menyimpan…' : 'Terima Kembali'}
          </Button>
        </>
      }
    >
      <form id="checkin-form" onSubmit={handleSubmit} className="space-y-4">
        <DateField
          label="Tanggal Diterima" name="returnedAt" required
          value={form.returnedAt} onChange={change}
        />

        <SearchableSelect
          label="Kondisi Saat Diterima"
          value={form.returnCondition} onChange={(v) => setForm((f) => ({ ...f, returnCondition: v }))}
          hint={conditionChanged
            ? 'Kondisi aset akan diperbarui mengikuti pilihan ini.'
            : 'Periksa fisiknya — ubah kalau ternyata berbeda dari catatan.'}
          clearable={false}
          options={[
            { value: 'baik', label: 'Baik' },
            { value: 'rusak_ringan', label: 'Rusak Ringan' },
            { value: 'rusak_berat', label: 'Rusak Berat' },
          ]}
          getOptionLabel={(o) => o.label} getOptionValue={(o) => o.value}
          placeholder="Cari kondisi…"
        />

        <SearchableSelect
          label="Status Setelah Diterima"
          value={form.newStatus} onChange={(v) => setForm((f) => ({ ...f, newStatus: v }))}
          hint="Umumnya kembali menganggur, siap dialokasikan ke orang lain."
          clearable={false}
          options={[
            { value: 'idle', label: 'Menganggur' },
            { value: 'dipakai', label: 'Dipakai' },
          ]}
          getOptionLabel={(o) => o.label} getOptionValue={(o) => o.value}
          placeholder="Cari status…"
        />

        <TextareaField
          label="Catatan Pengembalian" name="returnNote" rows={2}
          value={form.returnNote} onChange={change}
          placeholder="Mis. kerusakan yang ditemukan, kelengkapan yang kurang"
        />

        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}
