import React, { useEffect, useState } from 'react';
import axiosClient from '../../api/axiosClient.js';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import { SelectField, FormError } from '../ui/Form.jsx';

/**
 * Memindahkan satu/beberapa aset terpilih ke Lokasi + Sub Lokasi baru.
 * Setelah dikonfirmasi, status aset berubah menjadi "dipindah" dan
 * location_id/sub_location_id diperbarui — id dan kode aset TIDAK berubah.
 *
 * Props:
 * - count: jumlah aset terpilih
 * - onConfirm: async ({ locationId, subLocationId }) => void
 * - onClose: () => void
 */
export default function MoveAssetModal({ count, onConfirm, onClose }) {
  const [locations, setLocations] = useState([]);
  const [subLocations, setSubLocations] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [subLocationId, setSubLocationId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    axiosClient.get('/locations').then((res) => setLocations(res.data));
  }, []);

  useEffect(() => {
    setSubLocationId('');
    if (!locationId) { setSubLocations([]); return; }
    axiosClient.get('/sub-locations', { params: { locationId } }).then((res) => setSubLocations(res.data));
  }, [locationId]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!locationId) { setError('Pilih lokasi tujuan terlebih dahulu.'); return; }

    setSubmitting(true);
    setError('');
    try {
      await onConfirm({ locationId, subLocationId: subLocationId || null });
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memindahkan aset.');
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={`Pindahkan ${count} Aset`}
      description="Pilih lokasi tujuan. Kode aset tetap sama seperti sebelumnya."
      icon="fa-location-dot"
      iconTone="accent"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>Batal</Button>
          <Button type="submit" form="move-asset-form" loading={submitting}>
            {submitting ? 'Memindahkan…' : 'Pindahkan Aset'}
          </Button>
        </>
      }
    >
      <form id="move-asset-form" onSubmit={handleSubmit} className="space-y-4">
        <p className="rounded-xl bg-accent-50 border border-accent-200 px-3.5 py-3 text-xs text-accent-800 leading-relaxed">
          Status aset yang dipilih akan otomatis berubah menjadi <strong>“Dipindahkan”</strong>.
          Untuk mengembalikannya ke Dipakai/Menganggur, lokasi aset harus diatur persis
          seperti lokasi asalnya.
        </p>

        <SelectField
          label="Lokasi Tujuan" required
          value={locationId}
          onChange={(e) => { setLocationId(e.target.value); setError(''); }}
        >
          <option value="">Pilih lokasi…</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}
        </SelectField>

        <SelectField
          label="Sub Lokasi Tujuan"
          value={subLocationId}
          onChange={(e) => setSubLocationId(e.target.value)}
          disabled={!locationId}
          hint="Boleh dikosongkan kalau lokasi tujuan tidak dibagi per ruang."
        >
          <option value="">{locationId ? 'Tanpa sub lokasi (opsional)' : 'Pilih lokasi dahulu'}</option>
          {subLocations.map((sl) => <option key={sl.id} value={sl.id}>{sl.code} · {sl.name}</option>)}
        </SelectField>

        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}
