import React, { useEffect, useState } from 'react';
import axiosClient from '../api/axiosClient.js';
import { useBranding, BrandLogo } from '../context/BrandingContext.jsx';
import Button from '../components/ui/Button.jsx';
import { TextField, SearchableSelect, DateField, TextareaField, FormError } from '../components/ui/Form.jsx';

/**
 * Halaman PUBLIK — dibuka lewat tautan khusus yang dibagikan ke karyawan
 * tanpa akun aplikasi, supaya mereka bisa mengajukan permintaan aset sendiri
 * tanpa perlu dibuatkan manual oleh GA. Tidak butuh masuk, dan berdiri
 * sendiri seperti halaman Pindai QR (PublicScanPage) — kop logo perusahaan,
 * ringkas, enak dibaca di layar ponsel.
 */

function Shell({ children }) {
  const { companyName } = useBranding();

  return (
    <div className="min-h-dvh bg-ink-100 dot-grid flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="flex justify-center mb-8">
          <BrandLogo
            variant="light"
            className="h-20 w-auto object-contain"
            fallbackClassName="h-20 w-20 text-3xl"
          />
        </div>

        {children}

        <p className="text-center text-[11px] text-ink-400 mt-6 leading-relaxed">
          {companyName ? `Sistem inventaris aset ${companyName}.` : 'Sistem inventaris aset perusahaan.'}
          <br />
          Permintaan akan ditinjau oleh bagian GA sebelum dipenuhi.
        </p>
      </div>
    </div>
  );
}

const EMPTY_FORM = {
  requesterName: '', department: '', categoryId: '', itemName: '', reason: '', priority: 'sedang', neededBy: '',
  website: '', // honeypot — kosong selamanya untuk manusia, jangan diberi label/terlihat
};

export default function PublicRequestPage() {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    axiosClient.get('/public/categories').then((res) => setCategories(res.data)).catch(() => {});
  }, []);

  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const changeCategoryId = (id) => setForm((f) => ({ ...f, categoryId: id }));

  async function submit(e) {
    e.preventDefault();
    if (!form.requesterName.trim()) { setError('Nama Anda wajib diisi.'); return; }
    if (!form.itemName.trim()) { setError('Nama barang yang diminta wajib diisi.'); return; }

    setError('');
    setSaving(true);
    try {
      const res = await axiosClient.post('/public/requests', {
        ...form, categoryId: form.categoryId || null, neededBy: form.neededBy || null,
      });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengajukan permintaan. Coba lagi sesaat lagi.');
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    return (
      <Shell>
        <div className="bg-white rounded-2xl border border-ink-200 shadow-raised px-6 py-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <i className="fas fa-check text-xl" aria-hidden="true" />
          </div>
          <p className="text-base font-semibold text-ink-800">Permintaan terkirim</p>
          {result.requestNo && (
            <p className="text-sm font-mono text-ink-600 mt-1.5">{result.requestNo}</p>
          )}
          <p className="text-sm text-ink-500 mt-3 leading-relaxed">{result.message}</p>
          <Button
            type="button" variant="secondary" size="sm" className="mt-6"
            onClick={() => { setForm(EMPTY_FORM); setResult(null); }}
          >
            Ajukan Permintaan Lain
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="bg-white rounded-2xl border border-ink-200 shadow-raised overflow-hidden">
        <div className="relative bg-gradient-to-br from-brand-800 to-brand-950 px-6 py-6 overflow-hidden">
          <div className="absolute -top-10 -right-8 h-32 w-32 rounded-full bg-white/10" aria-hidden="true" />
          <p className="relative text-[10px] font-semibold uppercase tracking-[0.12em] text-white/70">
            Formulir Publik
          </p>
          <h1 className="relative text-xl font-black text-white leading-tight mt-1.5">
            Ajukan Permintaan Aset
          </h1>
          <p className="relative text-[13px] text-white/80 mt-2 leading-relaxed">
            Isi formulir ini untuk meminta aset (mis. laptop, kursi, printer). Nomor permintaan dibuat otomatis begitu diajukan.
          </p>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField
              label="Nama Anda" name="requesterName" required autoFocus
              value={form.requesterName} onChange={change}
              placeholder="Mis. Budi Santoso"
            />
            <TextField
              label="Departemen (opsional)" name="department"
              value={form.department} onChange={change}
              placeholder="Mis. Marketing"
            />
          </div>

          <TextField
            label="Barang yang Diminta" name="itemName" required
            value={form.itemName} onChange={change}
            placeholder="Mis. Laptop untuk staf baru"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SearchableSelect
              id="categoryId"
              label="Kode Barang/Aset (opsional)"
              placeholder="Ketik untuk mencari kode barang…"
              value={form.categoryId}
              onChange={changeCategoryId}
              options={categories}
            />
            <SearchableSelect
              label="Prioritas" value={form.priority} onChange={(v) => setForm((f) => ({ ...f, priority: v }))}
              clearable={false} searchable={false}
              options={[
                { value: 'rendah', label: 'Rendah' },
                { value: 'sedang', label: 'Sedang' },
                { value: 'tinggi', label: 'Tinggi' },
              ]}
              getOptionLabel={(o) => o.label} getOptionValue={(o) => o.value}
              placeholder="Pilih prioritas…"
            />
          </div>

          <DateField
            label="Dibutuhkan Sebelum Tanggal (opsional)" name="neededBy"
            value={form.neededBy} onChange={change}
          />

          <TextareaField
            label="Alasan/Keperluan (opsional)" name="reason" value={form.reason} onChange={change}
            placeholder="Mis. laptop lama sudah rusak berat, mulai bekerja 1 September"
          />

          {/* Honeypot anti-bot — dilipat ke 0px lewat CSS (bukan hidden
              attribute, yang diabaikan sebagian bot pengisi form otomatis),
              dan aria-hidden supaya pembaca layar melewatinya sepenuhnya. */}
          <div className="h-0 w-0 overflow-hidden" aria-hidden="true">
            <input
              type="text" name="website" tabIndex={-1} autoComplete="off"
              value={form.website} onChange={change}
            />
          </div>

          <FormError>{error}</FormError>

          <Button type="submit" block loading={saving}>Ajukan Permintaan</Button>
        </form>
      </div>
    </Shell>
  );
}
