import React from 'react';

/**
 * Navigasi halaman.
 *
 * Versi lama merender SATU tombol untuk SETIAP halaman — begitu aset menembus
 * beberapa ratus baris, barisan tombolnya meluber keluar layar. Di sini nomor
 * halaman dipotong jadi jendela di sekitar halaman aktif, dengan elipsis dan
 * pintasan ke halaman pertama/terakhir.
 */
function buildPages(current, total, window = 1) {
  const pages = [];
  const push = (p) => { if (!pages.includes(p)) pages.push(p); };

  push(1);
  for (let p = current - window; p <= current + window; p += 1) {
    if (p > 1 && p < total) push(p);
  }
  if (total > 1) push(total);

  pages.sort((a, b) => a - b);

  // Sisipkan penanda elipsis di celah yang lompat lebih dari satu
  const withGaps = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) withGaps.push(`gap-${p}`);
    withGaps.push(p);
  });
  return withGaps;
}

export default function Pagination({ page, totalPages, onChange, totalItems, className = '' }) {
  if (!totalPages || totalPages <= 1) return null;

  const pages = buildPages(page, totalPages);

  const navButton =
    'h-9 min-w-[36px] px-2 flex items-center justify-center rounded-lg border border-ink-200 bg-white ' +
    'text-ink-500 text-sm transition-colors hover:bg-ink-50 hover:text-ink-700 ' +
    'disabled:opacity-40 disabled:pointer-events-none';

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 mt-5 ${className}`}>
      <p className="text-xs text-ink-400 tabular-nums">
        Halaman <span className="font-medium text-ink-600">{page}</span> dari {totalPages}
        {typeof totalItems === 'number' && ` · ${totalItems} data`}
      </p>

      <nav className="flex items-center gap-1.5 ml-auto" aria-label="Navigasi halaman">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page === 1}
          aria-label="Halaman sebelumnya"
          className={navButton}
        >
          <i className="fas fa-chevron-left text-[11px]" aria-hidden="true" />
        </button>

        {pages.map((p) =>
          typeof p === 'string' ? (
            <span key={p} className="px-1 text-ink-300 select-none" aria-hidden="true">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              aria-current={p === page ? 'page' : undefined}
              className={
                p === page
                  ? 'h-9 min-w-[36px] px-2 flex items-center justify-center rounded-lg bg-brand-500 text-white text-sm font-semibold shadow-brand-sm'
                  : navButton
              }
            >
              {p}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          aria-label="Halaman berikutnya"
          className={navButton}
        >
          <i className="fas fa-chevron-right text-[11px]" aria-hidden="true" />
        </button>
      </nav>
    </div>
  );
}
