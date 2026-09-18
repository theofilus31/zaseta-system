import React, { useState } from 'react';
import axiosClient from '../../api/axiosClient.js';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';
import { TextField, TextareaField, FormError } from '../ui/Form.jsx';

/**
 * Modal "Buat Kategori Aset Baru" — dipakai lebih dari satu form (AssetForm.jsx
 * untuk aset, ConsumableList.jsx untuk barang habis pakai) karena keduanya
 * SEKARANG memakai satu daftar kategori yang sama (asset_types), bukan
 * masing-masing sistem kategori sendiri. Dijadikan komponen bersama di sini
 * supaya modalnya tidak perlu ditulis ulang di tiap form yang memakainya.
 *
 * `onCreated(assetType)` dipanggil dengan hasil dari server begitu tersimpan
 * -- pemanggil sendiri yang menentukan apa yang dilakukan sesudahnya
 * (refresh daftar, langsung pilih ke field, dst.), modal ini tidak
 * berasumsi apa-apa soal itu.
 */
export default function AssetTypeQuickAddModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', description: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await axiosClient.post('/asset-types', form);
      onCreated(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan kategori aset.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Buat Kategori Aset Baru"
      description="Langsung dipilih ke field Kategori begitu tersimpan."
      icon="fa-layer-group"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Batal</Button>
          <Button size="sm" onClick={handleSubmit} loading={saving}>
            {saving ? 'Menyimpan…' : 'Simpan Kategori Aset'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <TextField
          label="Nama" required autoFocus
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Mis. Laptop"
        />
        <TextareaField
          label="Deskripsi" rows={2}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Opsional — keterangan singkat kategori ini."
        />
        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}
