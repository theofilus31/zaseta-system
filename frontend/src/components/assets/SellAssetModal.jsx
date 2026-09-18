import React, { useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import { TextField, DateField, FormError } from '../ui/Form.jsx';

/**
 * Mengubah status aset terpilih menjadi "Dijual" atau "Terjual".
 * Berbeda dengan perubahan status massal biasa, keduanya wajib mengisi harga
 * lebih dulu — itulah alasan aksinya lewat modal, bukan dropdown.
 *
 * Props:
 * - mode: 'dijual' | 'terjual'
 * - count: jumlah aset terpilih
 * - onConfirm: async ({ saleValueNet } | { soldPrice, soldDate }) => void
 * - onClose: () => void
 */
export default function SellAssetModal({ mode, count, onConfirm, onClose }) {
  const isDijual = mode === 'dijual';

  const [saleValueNet, setSaleValueNet] = useState('');
  const [soldPrice, setSoldPrice] = useState('');
  const [soldDate, setSoldDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  /* Pratinjau nominal dalam format rupiah — angka panjang tanpa pemisah ribuan
     mudah salah ketik (3500000 vs 35000000). */
  const preview = (value) =>
    value && !Number.isNaN(Number(value))
      ? `Rp ${Number(value).toLocaleString('id-ID')}`
      : null;

  async function handleSubmit(e) {
    e.preventDefault();

    if (isDijual && !saleValueNet) { setError('Harga Jual/Net wajib diisi.'); return; }
    if (!isDijual && !soldPrice) { setError('Harga Terjual wajib diisi.'); return; }

    setSubmitting(true);
    setError('');
    try {
      if (isDijual) {
        await onConfirm({ saleValueNet });
      } else {
        await onConfirm({ soldPrice, soldDate: soldDate || null });
      }
    } catch (err) {
      setError(err.response?.data?.message || `Gagal mengubah status aset ke ${isDijual ? 'Dijual' : 'Terjual'}.`);
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={`${isDijual ? 'Tandai Dijual' : 'Tandai Terjual'} — ${count} Aset`}
      description={
        isDijual
          ? 'Aset masih dimiliki perusahaan, tetapi sedang ditawarkan untuk dijual.'
          : 'Aset sudah berpindah tangan dan keluar dari inventaris aktif.'
      }
      icon={isDijual ? 'fa-tag' : 'fa-hand-holding-dollar'}
      iconTone={isDijual ? 'warning' : 'neutral'}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>Batal</Button>
          <Button type="submit" form="sell-asset-form" loading={submitting}>
            {submitting ? 'Menyimpan…' : (isDijual ? 'Tandai Dijual' : 'Tandai Terjual')}
          </Button>
        </>
      }
    >
      <form id="sell-asset-form" onSubmit={handleSubmit} className="space-y-4">
        {isDijual ? (
          <TextField
            label="Harga Jual / Net" required
            type="number" min="0"
            value={saleValueNet}
            onChange={(e) => { setSaleValueNet(e.target.value); setError(''); }}
            placeholder="3500000"
            hint={preview(saleValueNet) || 'Ketik angka saja, tanpa titik atau koma.'}
          />
        ) : (
          <>
            <TextField
              label="Harga Terjual" required
              type="number" min="0"
              value={soldPrice}
              onChange={(e) => { setSoldPrice(e.target.value); setError(''); }}
              placeholder="2500000"
              hint={preview(soldPrice) || 'Ketik angka saja, tanpa titik atau koma.'}
            />
            <DateField
              label="Tanggal Terjual"
              value={soldDate}
              onChange={(e) => setSoldDate(e.target.value)}
              hint="Opsional — boleh dilengkapi belakangan."
            />
          </>
        )}

        <p className="rounded-xl bg-ink-100 px-3.5 py-3 text-xs text-ink-600 leading-relaxed">
          Nilai ini akan diterapkan ke <strong className="text-ink-800">seluruh {count} aset</strong> yang
          sedang dipilih. Kalau harganya berbeda-beda, ubah aset satu per satu lewat halaman Ubah Aset.
        </p>

        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}
