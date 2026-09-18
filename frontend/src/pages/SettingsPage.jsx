import React, { useEffect, useState } from 'react';
import axiosClient from '../api/axiosClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useBranding } from '../context/BrandingContext.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import { useLayoutWidth } from '../context/LayoutWidthContext.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { TextField, TextareaField, FormError } from '../components/ui/Form.jsx';

/**
 * Tiga varian logo, masing-masing punya tempat pakai yang berbeda. Dijelaskan
 * apa adanya di layar supaya admin tidak perlu menebak mana yang dipakai di mana.
 */
const LOGO_SLOTS = [
  {
    variant: 'icon',
    label: 'Ikon',
    hint: 'Bentuk persegi. Dipakai di sidebar, bilah atas, dan ikon tab peramban.',
    preview: 'bg-white',
    size: 'h-12 w-12',
  },
  {
    variant: 'light',
    label: 'Logo Penuh — Latar Terang',
    hint: 'Logo mendatar lengkap. Dipakai di halaman Masuk versi ponsel dan halaman Pindai QR.',
    preview: 'bg-white',
    size: 'h-12',
  },
  {
    variant: 'dark',
    label: 'Logo Penuh — Latar Gelap',
    hint: 'Versi terang dari logo, untuk panel gelap di halaman Masuk.',
    preview: 'bg-ink-900',
    size: 'h-12',
  },
];

function LogoSlot({ slot, url, canEdit, onUpload, onDelete, busy }) {
  const inputId = `logo-${slot.variant}`;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4 py-4 border-b border-ink-100 last:border-0">
      {/* Pratinjau */}
      <div
        className={`flex items-center justify-center rounded-xl border border-ink-200 px-4 py-3 shrink-0
                    w-full sm:w-44 min-h-[72px] ${slot.preview}`}
      >
        {url ? (
          <img src={url} alt={slot.label} className={`${slot.size} w-auto max-w-full object-contain`} />
        ) : (
          <span className={`text-xs ${slot.variant === 'dark' ? 'text-white/40' : 'text-ink-400'}`}>
            Belum ada
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-ink-800">{slot.label}</p>
        <p className="text-xs text-ink-400 mt-0.5 leading-relaxed">{slot.hint}</p>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <input
              id={inputId}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(slot.variant, file);
                e.target.value = ''; // supaya memilih berkas yang sama lagi tetap memicu
              }}
            />
            <Button
              type="button" variant="secondary" size="xs"
              onClick={() => document.getElementById(inputId).click()}
              disabled={busy}
            >
              <i className="fas fa-upload text-[10px]" aria-hidden="true" />
              {url ? 'Ganti' : 'Unggah'}
            </Button>

            {url && (
              <Button variant="ghost" size="xs" onClick={() => onDelete(slot.variant)} disabled={busy}>
                Hapus
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  useLayoutWidth('narrow');
  const { can } = useAuth();
  const branding = useBranding();
  const { pushSuccess, pushError } = useNotification();

  const [form, setForm] = useState({ appName: '', companyName: '', tagline: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyLogo, setBusyLogo] = useState(false);
  const [error, setError] = useState('');

  const canEdit = can('settings', 'edit');

  useEffect(() => {
    axiosClient.get('/settings')
      .then((res) => {
        setForm({
          appName: res.data.appName || '',
          companyName: res.data.companyName || '',
          tagline: res.data.tagline || '',
        });
      })
      .catch((err) => pushError(err.response?.data?.message || 'Gagal memuat pengaturan.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await axiosClient.put('/settings', form);
      await branding.refresh(); // sidebar, topbar, dan judul tab ikut berubah seketika
      pushSuccess('Pengaturan merek berhasil disimpan.');
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menyimpan pengaturan.');
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadLogo(variant, file) {
    setBusyLogo(true);
    try {
      const data = new FormData();
      data.append('logo', file);
      await axiosClient.post(`/settings/logo/${variant}`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await branding.refresh();
      pushSuccess('Logo berhasil diperbarui.');
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal mengunggah logo.');
    } finally {
      setBusyLogo(false);
    }
  }

  async function handleDeleteLogo(variant) {
    if (!confirm('Hapus logo ini? Tampilan akan kembali memakai huruf awal nama perusahaan.')) return;
    setBusyLogo(true);
    try {
      await axiosClient.delete(`/settings/logo/${variant}`);
      await branding.refresh();
      pushSuccess('Logo dihapus.');
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal menghapus logo.');
    } finally {
      setBusyLogo(false);
    }
  }

  if (loading) {
    return (
      <>
        <Skeleton className="h-7 w-48 mb-6" />
        <div className="space-y-5">
          <Card><Skeleton className="h-40 w-full" /></Card>
          <Card><Skeleton className="h-64 w-full" /></Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Administrasi"
        title="Pengaturan"
        description="Identitas aplikasi — nama, perusahaan, dan logo. Perubahan langsung berlaku untuk semua pengguna."
      />

      {!canEdit && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-ink-200 bg-ink-50 px-4 py-3.5">
          <i className="fas fa-eye mt-0.5 text-ink-400 shrink-0" aria-hidden="true" />
          <p className="text-sm text-ink-600 leading-relaxed">
            Akun Anda hanya berwenang melihat pengaturan ini.
          </p>
        </div>
      )}

      {/* ---------- Identitas teks ---------- */}
      <Card as="form" onSubmit={handleSubmit} className="mb-5">
        <CardHeader
          title="Identitas"
          description="Nama yang muncul di sidebar, halaman Masuk, dan judul tab peramban."
          icon={(p) => <i {...p} className="fas fa-signature text-xs" />}
        />

        <div className="space-y-4">
          <TextField
            label="Nama Aplikasi" name="appName" required
            value={form.appName} onChange={handleChange}
            disabled={!canEdit}
            placeholder="ZASETA"
            hint="Judul sistem itu sendiri. Biarkan umum bila dipakai lintas jenis aset."
          />

          <TextField
            label="Nama Perusahaan" name="companyName" required
            value={form.companyName} onChange={handleChange}
            disabled={!canEdit}
            placeholder="PT Nama Perusahaan"
            hint="Muncul di bawah nama aplikasi dan di kaki halaman Pindai QR publik."
          />

          <TextareaField
            label="Kalimat Pengantar" name="tagline" rows={2}
            value={form.tagline} onChange={handleChange}
            disabled={!canEdit}
            placeholder="Mencatat, memindahkan, dan menelusuri seluruh aset perusahaan dari satu tempat."
            hint="Ditampilkan di panel kiri halaman Masuk. Boleh dikosongkan."
          />

          <FormError>{error}</FormError>

          {canEdit && (
            <Button type="submit" loading={saving}>
              {saving ? 'Menyimpan…' : 'Simpan Identitas'}
            </Button>
          )}
        </div>
      </Card>

      {/* ---------- Logo ---------- */}
      <Card>
        <CardHeader
          title="Logo"
          description="Format PNG, JPG, atau WEBP. Maksimal 1 MB per berkas."
          icon={(p) => <i {...p} className="fas fa-image text-xs" />}
        />

        <div>
          {LOGO_SLOTS.map((slot) => (
            <LogoSlot
              key={slot.variant}
              slot={slot}
              url={branding.logoUrl(slot.variant)}
              canEdit={canEdit}
              busy={busyLogo}
              onUpload={handleUploadLogo}
              onDelete={handleDeleteLogo}
            />
          ))}
        </div>

        <p className="hint mt-4">
          Varian yang dikosongkan otomatis diganti kotak berisi huruf awal nama perusahaan,
          jadi tampilannya tetap utuh meski belum ada logo sama sekali.
        </p>
      </Card>
    </>
  );
}
