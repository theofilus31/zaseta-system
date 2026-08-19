import React, { useCallback, useEffect, useState } from 'react';
import axiosClient from '../../api/axiosClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotification } from '../../context/NotificationContext.jsx';
import Card, { CardHeader } from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import { SelectField, TextareaField, FormError } from '../ui/Form.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';

/**
 * ============================================================================
 *  LAMPIRAN BERKAS ASET
 * ============================================================================
 *  Faktur, kartu garansi, manual, foto kondisi — dulu semuanya hidup di
 *  lemari arsip terpisah dari catatan asetnya. Komponen ini menempelkannya
 *  langsung ke halaman detail aset, supaya "mana bukti pembeliannya?" bisa
 *  dijawab dengan satu klik, bukan pencarian ke gudang berkas.
 * ============================================================================
 */

const CATEGORY_CONFIG = {
  invoice: { label: 'Faktur/Nota', icon: 'fa-receipt', className: 'bg-brand-50 text-brand-700 ring-brand-500/25' },
  warranty: { label: 'Kartu Garansi', icon: 'fa-shield-halved', className: 'bg-info-50 text-info-700 ring-info-500/25' },
  manual: { label: 'Manual/Panduan', icon: 'fa-book', className: 'bg-accent-50 text-accent-700 ring-accent-500/25' },
  photo: { label: 'Foto Kondisi', icon: 'fa-image', className: 'bg-warning-50 text-warning-700 ring-warning-500/25' },
  other: { label: 'Lainnya', icon: 'fa-paperclip', className: 'bg-ink-100 text-ink-600 ring-ink-400/20' },
};

const FILE_ICON = (mime) => {
  if (mime === 'application/pdf') return 'fa-file-pdf';
  if (mime?.startsWith('image/')) return 'fa-file-image';
  if (mime?.includes('word')) return 'fa-file-word';
  if (mime?.includes('sheet') || mime?.includes('excel')) return 'fa-file-excel';
  return 'fa-file';
};

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const tanggal = (v) =>
  v ? new Date(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export default function AssetAttachments({ assetId }) {
  const { can } = useAuth();
  const { pushError, pushSuccess } = useNotification();

  const [items, setItems] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const canUpload = can('assets', 'create');
  const canDelete = can('assets', 'delete');

  const muat = useCallback(async () => {
    try {
      const res = await axiosClient.get(`/assets/${assetId}/attachments`);
      setItems(res.data);
    } catch {
      pushError('Gagal memuat daftar lampiran.');
    }
  }, [assetId, pushError]);

  useEffect(() => { muat(); }, [muat]);

  async function handleDelete(item) {
    if (!confirm(`Hapus "${item.fileName}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    setDeletingId(item.id);
    try {
      await axiosClient.delete(`/assets/${assetId}/attachments/${item.id}`);
      pushSuccess(`${item.fileName} dihapus.`);
      muat();
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal menghapus lampiran.');
    } finally {
      setDeletingId(null);
    }
  }

  function bukaBerkas(item) {
    /* Lewat axios, bukan tautan <a href> biasa: berkas butuh header
       Authorization, dan endpoint ini bukan publik seperti logo merek. */
    axiosClient.get(`/assets/${assetId}/attachments/${item.id}`, { responseType: 'blob' })
      .then((res) => {
        const url = URL.createObjectURL(new Blob([res.data], { type: item.mimeType }));
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      })
      .catch(() => pushError('Gagal membuka berkas.'));
  }

  return (
    <Card padded={false}>
      <CardHeader
        title="Lampiran Berkas"
        description="Faktur, kartu garansi, manual, atau foto kondisi aset."
        bordered
        action={canUpload && (
          <Button size="sm" onClick={() => setShowUpload(true)}>
            <i className="fas fa-paperclip text-xs" aria-hidden="true" /> Unggah
          </Button>
        )}
      />

      <div className="p-5">
        {items === null ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon="fa-paperclip"
            title="Belum ada lampiran"
            description="Unggah faktur pembelian atau kartu garansi supaya mudah ditemukan saat dibutuhkan."
            action={canUpload && (
              <Button size="sm" onClick={() => setShowUpload(true)}>
                <i className="fas fa-paperclip text-xs" aria-hidden="true" /> Unggah Berkas Pertama
              </Button>
            )}
          />
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const cat = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.other;
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl border border-ink-200/70 px-3.5 py-3 hover:bg-ink-50/60 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => bukaBerkas(item)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500 hover:bg-ink-200 transition-colors"
                    title="Buka berkas"
                  >
                    <i className={`fas ${FILE_ICON(item.mimeType)}`} aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() => bukaBerkas(item)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="text-[13px] font-medium text-ink-800 truncate hover:text-brand-600">
                      {item.fileName}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${cat.className}`}>
                        <i className={`fas ${cat.icon} text-[8px]`} aria-hidden="true" />
                        {cat.label}
                      </span>
                      <span className="text-[11px] text-ink-400">
                        {formatSize(item.fileSize)} · {tanggal(item.createdAt)}
                        {item.uploadedBy && ` · ${item.uploadedBy}`}
                      </span>
                    </div>
                    {item.notes && <p className="text-[11px] text-ink-500 mt-1 truncate">{item.notes}</p>}
                  </button>

                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      disabled={deletingId === item.id}
                      className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg text-ink-400 hover:text-danger-600 hover:bg-danger-50 transition-colors disabled:opacity-50"
                      title="Hapus lampiran"
                    >
                      <i className={`fas ${deletingId === item.id ? 'fa-spinner fa-spin' : 'fa-trash-can'} text-xs`} aria-hidden="true" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showUpload && (
        <UploadModal
          assetId={assetId}
          onClose={() => setShowUpload(false)}
          onUploaded={() => { setShowUpload(false); muat(); }}
        />
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

const MAX_SIZE = 8 * 1024 * 1024;
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,application/pdf,image/*';

function UploadModal({ assetId, onClose, onUploaded }) {
  const { pushSuccess } = useNotification();
  const [file, setFile] = useState(null);
  const [category, setCategory] = useState('invoice');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function pilihBerkas(f) {
    if (!f) { setFile(null); return; }
    if (f.size > MAX_SIZE) {
      setError(`Berkas terlalu besar (${(f.size / 1024 / 1024).toFixed(1)} MB). Maksimal 8 MB.`);
      return;
    }
    setFile(f);
    setError('');
  }

  async function submit(e) {
    e.preventDefault();
    if (!file) { setError('Pilih berkas terlebih dahulu.'); return; }

    setSaving(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('category', category);
      if (notes.trim()) form.append('notes', notes.trim());

      await axiosClient.post(`/assets/${assetId}/attachments`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      pushSuccess('Berkas berhasil diunggah.');
      onUploaded();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengunggah berkas.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Unggah Lampiran"
      description="PDF, gambar, atau dokumen Word/Excel. Maksimal 8 MB."
      icon="fa-paperclip"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Batal</Button>
          <Button type="submit" form="upload-attachment-form" loading={saving}>Unggah</Button>
        </>
      }
    >
      <form id="upload-attachment-form" onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Berkas</label>
          <label
            className={`flex items-center gap-3 rounded-xl border-2 border-dashed px-4 py-4 cursor-pointer
                        transition-colors ${
                          file
                            ? 'border-brand-300 bg-brand-50/60'
                            : 'border-ink-300 bg-white hover:border-brand-400 hover:bg-ink-50'
                        }`}
          >
            <input
              type="file"
              accept={ACCEPT}
              onChange={(e) => pilihBerkas(e.target.files?.[0] || null)}
              className="sr-only"
            />
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              file ? 'bg-brand-100 text-brand-600' : 'bg-ink-100 text-ink-400'
            }`}>
              <i className={`fas ${file ? 'fa-file-circle-check' : 'fa-cloud-arrow-up'}`} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink-800 truncate">
                {file ? file.name : 'Pilih berkas dari komputer'}
              </span>
              <span className="block text-xs text-ink-400 mt-0.5">
                {file ? `${(file.size / 1024).toFixed(1)} KB · klik untuk mengganti` : 'PDF, JPG, PNG, WEBP, DOC, XLS'}
              </span>
            </span>
          </label>
        </div>

        <SelectField label="Kategori" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="invoice">Faktur/Nota Pembelian</option>
          <option value="warranty">Kartu Garansi</option>
          <option value="manual">Manual/Panduan</option>
          <option value="photo">Foto Kondisi</option>
          <option value="other">Lainnya</option>
        </SelectField>

        <TextareaField
          label="Catatan (opsional)" value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Mis. nomor faktur, tanggal pembelian"
        />

        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}
