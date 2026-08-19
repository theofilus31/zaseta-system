import React from 'react';

/** Balok abu berdenyut sebagai penanda "sedang dimuat". */
export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-ink-200/70 rounded-md ${className}`} aria-hidden="true" />;
}

/** Placeholder baris tabel — jumlah kolom disamakan dengan tabel aslinya. */
export function SkeletonRows({ rows = 5, cols = 5 }) {
  return (
    <div role="status" aria-label="Memuat data">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-4 border-b border-ink-100 last:border-0">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className={`h-3.5 ${c === 0 ? 'w-32' : 'flex-1 max-w-[110px]'}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Placeholder kartu KPI di Dasbor. */
export function SkeletonCards({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" role="status" aria-label="Memuat ringkasan">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-ink-200/70 shadow-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <Skeleton className="h-3 w-20 mb-3" />
              <Skeleton className="h-7 w-14" />
            </div>
            <Skeleton className="h-11 w-11 rounded-xl" />
          </div>
          <Skeleton className="h-1.5 w-full mt-5 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder daftar kartu (tampilan mobile daftar aset). */
export function SkeletonList({ count = 5 }) {
  return (
    <div role="status" aria-label="Memuat daftar">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-4 border-b border-ink-100 last:border-0">
          <Skeleton className="h-4 w-2/3 mb-2.5" />
          <Skeleton className="h-3 w-1/3 mb-2" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
