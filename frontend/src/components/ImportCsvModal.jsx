import React, { useState } from 'react';
import Modal from './ui/Modal.jsx';
import Button from './ui/Button.jsx';
import { FormError } from './ui/Form.jsx';

/**
 * Modal generik untuk impor data dari CSV — dipakai di halaman Aset, Lokasi,
 * dan Kode Barang/Aset supaya alurnya tidak diduplikasi.
 *
 * Props:
 * - title             judul modal
 * - expectedColumns   array nama kolom CSV yang diharapkan
 * - sampleRows        contoh baris untuk template yang bisa diunduh
 * - templateFileName  nama berkas saat template diunduh
 * - helpText          keterangan tambahan di bawah daftar kolom (opsional)
 * - onUpload          async (file) => summaryObject
 * - onImported        dipanggil setelah impor sukses, biasanya untuk reload data
 * - onClose           () => void
 */

/* Nama teknis dari backend diterjemahkan supaya ringkasan hasil impor bisa
   dibaca tanpa perlu tahu istilah internalnya. */
const SUMMARY_LABEL = {
  assetsCreated: 'Aset dibuat',
  categoriesCreated: 'Kode barang dibuat',
  categoriesReactivated: 'Kode barang diaktifkan',
  locationsCreated: 'Lokasi dibuat',
  locationsReactivated: 'Lokasi diaktifkan',
  subLocationsCreated: 'Sub lokasi dibuat',
  subLocationsReactivated: 'Sub lokasi diaktifkan',
  departmentsCreated: 'Departemen dibuat',
  departmentsReactivated: 'Departemen diaktifkan',
};

export default function ImportCsvModal({
  title,
  expectedColumns,
  sampleRows = [],
  templateFileName = 'template-import.csv',
  helpText,
  onUpload,
  onClose,
  onImported,
}) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);

  function escapeCsvCell(value) {
    const str = String(value ?? '');
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  }

  function handleDownloadTemplate() {
    const lines = [expectedColumns.join(',')];
    for (const row of sampleRows) lines.push(row.map(escapeCsvCell).join(','));

    //  (BOM) di depan supaya Excel membaca UTF-8 dengan benar.
    // Ditulis sebagai escape, bukan karakter mentah, agar tidak hilang tanpa
    // sadar saat berkas ini disunting — karakternya tidak terlihat di editor.
    const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = templateFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) { setError('Pilih berkas CSV terlebih dahulu.'); return; }

    setLoading(true);
    setError('');
    try {
      const result = await onUpload(file);
      setSummary(result);
      onImported?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengimpor berkas.');
    } finally {
      setLoading(false);
    }
  }

  /* Angka hasil impor dipisahkan dari daftar galat/lewatan supaya bisa
     ditampilkan sebagai kartu ringkasan. */
  const counters = summary
    ? Object.entries(summary).filter(([k, v]) => k !== 'skipped' && k !== 'errors' && typeof v === 'number')
    : [];

  return (
    <Modal
      title={title}
      description={summary ? 'Ringkasan hasil impor.' : 'Unggah berkas CSV sesuai format kolom di bawah.'}
      icon={summary ? 'fa-clipboard-check' : 'fa-file-csv'}
      iconTone={summary ? 'brand' : 'info'}
      onClose={onClose}
      width="lg"
      footer={
        summary ? (
          <Button onClick={onClose}>Selesai</Button>
        ) : (
          <>
            <Button type="button" variant="secondary" onClick={onClose}>Batal</Button>
            <Button type="submit" form="import-csv-form" loading={loading}>
              {loading ? 'Mengunggah…' : 'Unggah & Impor'}
            </Button>
          </>
        )
      }
    >
      {!summary ? (
        <form id="import-csv-form" onSubmit={handleSubmit} className="space-y-4">

          {/* Panduan format kolom */}
          <div className="rounded-xl border border-ink-200 bg-ink-50 p-4">
            <p className="text-xs font-semibold text-ink-700 mb-2">Kolom CSV yang diharapkan</p>
            <div className="flex flex-wrap gap-1.5">
              {expectedColumns.map((col) => (
                <code
                  key={col}
                  className="rounded-md border border-ink-200 bg-white px-2 py-1 font-mono text-[11px] text-ink-600"
                >
                  {col}
                </code>
              ))}
            </div>

            {helpText && (
              <p className="mt-3 text-xs text-ink-500 leading-relaxed">{helpText}</p>
            )}

            {sampleRows.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={handleDownloadTemplate}
                className="mt-3 -ml-2 !text-brand-600 hover:!bg-brand-50"
              >
                <i className="fas fa-download text-[10px]" aria-hidden="true" />
                Unduh Template CSV
              </Button>
            )}
          </div>

          {/* Pemilih berkas */}
          <div>
            <label className="label">Berkas CSV</label>
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
                accept=".csv,text/csv"
                onChange={(e) => { setFile(e.target.files?.[0] || null); setError(''); }}
                className="sr-only"
              />
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  file ? 'bg-brand-100 text-brand-600' : 'bg-ink-100 text-ink-400'
                }`}
              >
                <i className={`fas ${file ? 'fa-file-circle-check' : 'fa-cloud-arrow-up'}`} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink-800 truncate">
                  {file ? file.name : 'Pilih berkas CSV'}
                </span>
                <span className="block text-xs text-ink-400 mt-0.5">
                  {file ? `${(file.size / 1024).toFixed(1)} KB · klik untuk mengganti` : 'Klik untuk memilih dari komputer'}
                </span>
              </span>
            </label>
          </div>

          <FormError>{error}</FormError>
        </form>
      ) : (
        <div className="space-y-4">
          {/* Kartu angka hasil impor */}
          {counters.length > 0 && (
            <div className="grid grid-cols-2 gap-2.5">
              {counters.map(([key, value]) => (
                <div key={key} className="rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-3">
                  <p className="text-[11px] text-ink-400 leading-tight">{SUMMARY_LABEL[key] || key}</p>
                  <p className="text-xl font-bold text-ink-900 mt-1 tabular-nums">{value}</p>
                </div>
              ))}
            </div>
          )}

          {summary.errors?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-danger-700 mb-2">
                {summary.errors.length} baris gagal diimpor
              </p>
              <ul className="max-h-40 overflow-y-auto scrollbar-slim space-y-1.5 rounded-xl border border-danger-200 bg-danger-50 p-3">
                {summary.errors.map((e, i) => (
                  <li key={i} className="text-xs text-danger-700 leading-relaxed">
                    <span className="font-semibold">Baris {e.row}:</span> {e.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.skipped?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-ink-600 mb-2">
                {summary.skipped.length} baris dilewati
              </p>
              <ul className="max-h-40 overflow-y-auto scrollbar-slim space-y-1.5 rounded-xl border border-ink-200 bg-ink-50 p-3">
                {summary.skipped.map((s, i) => (
                  <li key={i} className="text-xs text-ink-500 leading-relaxed">
                    <span className="font-semibold text-ink-600">Baris {s.row}:</span> {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {counters.every(([, v]) => v === 0) && !summary.errors?.length && !summary.skipped?.length && (
            <p className="text-sm text-ink-500 text-center py-4">Tidak ada data yang diproses dari berkas ini.</p>
          )}
        </div>
      )}
    </Modal>
  );
}
