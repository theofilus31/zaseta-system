import React from 'react';

/**
 * ============================================================================
 *  KOSAKATA VISUAL STOK OPNAME
 * ============================================================================
 *  Satu tempat untuk warna, label, dan ikon status sesi maupun hasil
 *  pemeriksaan — sama seperti StatusBadge untuk status aset. Halaman daftar,
 *  halaman detail, dan panel hasil pindaian semuanya menariknya dari sini,
 *  supaya "salah lokasi" tidak pernah tampil kuning di satu layar dan biru di
 *  layar lain.
 * ============================================================================
 */

export const OPNAME_STATUS = {
  berjalan: {
    label: 'Berjalan', icon: 'fa-circle-play',
    className: 'bg-info-50 text-info-700 ring-info-500/25',
  },
  selesai: {
    label: 'Selesai', icon: 'fa-circle-check',
    className: 'bg-brand-50 text-brand-700 ring-brand-500/25',
  },
  dibatalkan: {
    label: 'Dibatalkan', icon: 'fa-circle-xmark',
    className: 'bg-ink-200/70 text-ink-700 ring-ink-500/20',
  },
};

export const RESULT_CONFIG = {
  belum: {
    label: 'Belum Diperiksa', short: 'Belum', icon: 'fa-circle-dashed',
    className: 'bg-ink-100 text-ink-600 ring-ink-400/20',
    bar: 'bg-ink-200',
  },
  ditemukan: {
    label: 'Ditemukan', short: 'Ditemukan', icon: 'fa-circle-check',
    className: 'bg-brand-50 text-brand-700 ring-brand-500/25',
    bar: 'bg-brand-500',
  },
  salah_lokasi: {
    label: 'Salah Lokasi', short: 'Salah Lokasi', icon: 'fa-location-crosshairs',
    className: 'bg-warning-50 text-warning-700 ring-warning-500/25',
    bar: 'bg-warning-500',
  },
  tidak_ditemukan: {
    label: 'Tidak Ditemukan', short: 'Tidak Ada', icon: 'fa-circle-question',
    className: 'bg-danger-50 text-danger-700 ring-danger-500/25',
    bar: 'bg-danger-500',
  },
};

export function ResultBadge({ result, className = '' }) {
  const c = RESULT_CONFIG[result] || RESULT_CONFIG.belum;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5
                      text-[11px] font-semibold ring-1 ring-inset ${c.className} ${className}`}>
      <i className={`fas ${c.icon} text-[9px]`} aria-hidden="true" />
      {c.label}
    </span>
  );
}

/**
 * Batang kemajuan bersegmen.
 *
 * Sengaja bukan satu batang "sekian persen selesai": angka yang menentukan
 * kesimpulan opname bukan berapa banyak yang sudah disentuh, melainkan
 * komposisinya — 100% diperiksa dengan 20 barang hilang adalah keadaan yang
 * sama sekali berbeda dari 100% diperiksa tanpa selisih, dan batang satu warna
 * menyembunyikan perbedaan itu.
 */
export function OpnameProgressBar({ summary, className = '' }) {
  const total = summary.total || 1;
  const segments = [
    { key: 'ditemukan', value: summary.ditemukan },
    { key: 'salah_lokasi', value: summary.salahLokasi },
    { key: 'tidak_ditemukan', value: summary.tidakDitemukan },
    { key: 'belum', value: summary.belum },
  ].filter((s) => s.value > 0);

  return (
    <div className={className}>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-ink-100">
        {segments.map((s) => (
          <div
            key={s.key}
            className={RESULT_CONFIG[s.key].bar}
            style={{ width: `${(s.value / total) * 100}%` }}
            title={`${RESULT_CONFIG[s.key].label}: ${s.value}`}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-[11px] text-ink-500">
        {segments.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${RESULT_CONFIG[s.key].bar}`} aria-hidden="true" />
            {RESULT_CONFIG[s.key].short}
            <span className="font-semibold tabular-nums text-ink-700">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
