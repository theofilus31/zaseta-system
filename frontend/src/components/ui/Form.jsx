import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FormField } from './FormField.jsx';
import { DatePicker } from './date-picker/DatePicker.jsx';

/**
 * ============================================================================
 *  KONTROL FORM BERSAMA
 * ============================================================================
 *  Sebelumnya tiap halaman menulis ulang deretan class Tailwind yang sama untuk
 *  input/select/textarea — akibatnya tinggi, radius, dan warna fokusnya
 *  berbeda-beda antar halaman. Semua sekarang mengambil dari kelas `.field`
 *  di index.css lewat komponen di file ini.
 *
 *  Pakai <Field> kalau butuh label + hint + pesan galat sekaligus,
 *  atau <Input>/<Select>/<Textarea> telanjang kalau labelnya diatur sendiri.
 * ============================================================================
 */

export { FormField };
/** DateField sekarang berbasis react-day-picker + dropdown bulan/tahun (lihat date-picker/DatePicker.jsx) — kontrak propnya tidak berubah. */
export { DatePicker as DateField };

export function Input({ sunken = false, invalid = false, className = '', ...props }) {
  return (
    <input
      className={['field', sunken ? 'field-sunken' : '', invalid ? 'field-error' : '', className].join(' ')}
      {...props}
    />
  );
}

export function Textarea({ sunken = false, invalid = false, className = '', rows = 3, ...props }) {
  return (
    <textarea
      rows={rows}
      className={['field resize-y leading-relaxed', sunken ? 'field-sunken' : '', invalid ? 'field-error' : '', className].join(' ')}
      {...props}
    />
  );
}

/** Input dengan ikon di kiri — dipakai untuk kotak pencarian. */
export function SearchInput({ className = '', containerClassName = '', ...props }) {
  return (
    <div className={`relative ${containerClassName}`}>
      <i
        className="fas fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 text-[13px] pointer-events-none"
        aria-hidden="true"
      />
      <input type="search" className={`field field-sunken pl-10 ${className}`} {...props} />
    </div>
  );
}

/** Kotak centang dengan label yang bisa diklik. */
export function Checkbox({ label, description, className = '', ...props }) {
  return (
    <label className={`flex items-start gap-2.5 cursor-pointer group ${className}`}>
      <input type="checkbox" className="mt-0.5 shrink-0" {...props} />
      <span className="min-w-0">
        <span className="block text-sm text-ink-700 group-hover:text-ink-900 transition-colors">{label}</span>
        {description && <span className="block text-xs text-ink-400 mt-0.5">{description}</span>}
      </span>
    </label>
  );
}

/**
 * Field siap pakai: label + <input> dalam satu komponen.
 * Ini bentuk yang paling sering dipakai di halaman form.
 *
 * `className` menata PEMBUNGKUS (label + input + hint sekaligus) — dipakai
 * untuk kelas tata letak seperti `sm:col-span-2`. Kelas yang cuma dimaksudkan
 * untuk kotak input sendiri (mis. `font-mono`, `text-center`, `tracking-*`
 * untuk kode OTP) WAJIB lewat `inputClassName`, bukan `className` — Tailwind
 * mewarisi properti teks secara default, jadi `className` yang salah pakai
 * ikut merenggangkan/mengubah tampilan teks label di atasnya juga (bug nyata
 * yang sempat kejadian di beberapa layar OTP sebelum prop ini ada).
 */
export function TextField({ label, required, hint, error, className, inputClassName = '', ...inputProps }) {
  return (
    <FormField label={label} required={required} hint={hint} error={error} className={className}>
      <Input required={required} invalid={Boolean(error)} className={inputClassName} {...inputProps} />
    </FormField>
  );
}

/**
 * Dropdown dengan kotak pencarian di dalamnya — dipakai menggantikan <select>
 * biasa kalau daftar opsinya panjang (mis. puluhan kode barang/aset) dan
 * men-scroll satu-satu jadi tidak praktis. Ketik untuk menyaring, klik/Enter
 * untuk memilih.
 */
export function SearchableSelect({
  label, required, hint, error, className = '', labelAction,
  value, onChange, options, getOptionLabel = (o) => o.name, getOptionValue = (o) => o.id,
  placeholder = 'Ketik untuk mencari…', emptyLabel = '— Tidak diatur —', clearable = true,
  id, sunken = false, disabled = false, inputClassName = '', searchable = true,
  ...inputProps
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const [coords, setCoords] = useState(null);
  const containerRef = useRef(null);
  const panelRef = useRef(null);

  const selected = options.find((o) => String(getOptionValue(o)) === String(value)) || null;

  /* Saat panel ditutup, kotak menampilkan nama pilihan yang aktif — bukan
     bekas ketikan pencarian. Sinkron di sini, bukan saat memilih, supaya
     tetap benar kalau `value` berubah dari luar (mis. form direset). */
  useEffect(() => {
    if (!open) setQuery(selected ? getOptionLabel(selected) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value]);

  useEffect(() => {
    function handleClickOutside(e) {
      const insideInput = containerRef.current && containerRef.current.contains(e.target);
      const insidePanel = panelRef.current && panelRef.current.contains(e.target);
      if (!insideInput && !insidePanel) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /* Panel dirender lewat portal ke document.body (bukan anak langsung di
     sini) supaya TIDAK ikut terpotong kalau leluhurnya punya overflow-hidden
     atau overflow-y-auto — persis yang terjadi di kartu filter dan isi Modal
     (Modal.jsx membungkus kontennya dengan overflow-y-auto untuk scroll form
     panjang). Posisinya dihitung manual dari getBoundingClientRect() dan
     diperbarui saat scroll/resize karena position:fixed tidak otomatis
     mengikuti kotak input.
     Dibalik ke atas kalau ruang di bawah tidak cukup untuk tinggi maksimum
     panel (16rem/256px) tapi ruang di atas lebih lega. */
  useEffect(() => {
    if (!open) return undefined;

    function updateCoords() {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const PANEL_MAX_HEIGHT = 256;
      const GAP = 6;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < PANEL_MAX_HEIGHT + GAP && rect.top > spaceBelow;
      setCoords({
        left: rect.left,
        width: rect.width,
        openUpward,
        top: openUpward ? undefined : rect.bottom + GAP,
        bottom: openUpward ? window.innerHeight - rect.top + GAP : undefined,
      });
    }

    updateCoords();
    window.addEventListener('scroll', updateCoords, true);
    window.addEventListener('resize', updateCoords);
    return () => {
      window.removeEventListener('scroll', updateCoords, true);
      window.removeEventListener('resize', updateCoords);
    };
  }, [open]);

  useEffect(() => { setHighlighted(0); }, [query, open]);

  /* Kotak tanpa pencarian (searchable=false) selalu menampilkan seluruh
     opsi — `query`-nya cuma cermin dari label yang sedang terpilih (dipakai
     supaya kotaknya tetap menampilkan pilihan aktif), BUKAN kata kunci
     penyaring, jadi tidak boleh ikut memfilter daftar. Tanpa pengecualian
     ini, membuka kotak yang sudah punya pilihan hanya akan menyisakan satu
     opsi (dirinya sendiri) karena `query` masih berisi label lengkapnya. */
  const needle = searchable ? query.trim().toLowerCase() : '';
  const filtered = needle ? options.filter((o) => getOptionLabel(o).toLowerCase().includes(needle)) : options;

  function selectOption(o) {
    onChange(o ? String(getOptionValue(o)) : '');
    setOpen(false);
  }

  function handleKeyDown(e) {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[highlighted]) selectOption(filtered[highlighted]); }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  return (
    <FormField label={label} htmlFor={id} required={required} hint={hint} error={error} className={className} labelAction={labelAction}>
      <div className="relative" ref={containerRef}>
        <div className="relative">
          <i
            className={`fas ${searchable ? 'fa-magnifying-glass' : 'fa-chevron-down'} absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 text-[13px] pointer-events-none`}
            aria-hidden="true"
          />
          <input
            type="text"
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-autocomplete={searchable ? 'list' : 'none'}
            autoComplete="off"
            required={required}
            disabled={disabled}
            readOnly={!searchable}
            className={[
              'field pl-10', sunken ? 'field-sunken' : '', selected ? 'pr-9' : '', error ? 'field-error' : '',
              !searchable ? 'cursor-pointer caret-transparent' : '', inputClassName,
            ].join(' ')}
            value={query}
            placeholder={placeholder}
            onFocus={() => {
              if (disabled) return;
              setOpen(true);
              /* Kosongkan supaya daftar penuh langsung terlihat saat dibuka
                 — kalau `query` dibiarkan berisi label pilihan sekarang,
                 daftar akan langsung tersaring jadi satu (dirinya sendiri)
                 sebelum sempat diketik apa-apa. */
              if (searchable) setQuery('');
            }}
            onChange={(e) => { if (searchable) { setQuery(e.target.value); setOpen(true); } }}
            onKeyDown={handleKeyDown}
            {...inputProps}
          />
          {selected && clearable && !disabled && (
            <button
              type="button"
              onClick={() => selectOption(null)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-md text-ink-400 hover:bg-ink-100 hover:text-ink-600"
              aria-label="Bersihkan pilihan"
            >
              <i className="fas fa-xmark text-xs" aria-hidden="true" />
            </button>
          )}
        </div>

        {open && !disabled && coords && createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed', left: coords.left, width: coords.width,
              top: coords.openUpward ? undefined : coords.top,
              bottom: coords.openUpward ? coords.bottom : undefined,
            }}
            className="z-[100] max-h-64 overflow-y-auto rounded-xl border border-ink-200/70 bg-white shadow-overlay py-1.5 scrollbar-slim"
          >
            {clearable && (
              <button
                type="button"
                onClick={() => selectOption(null)}
                className={`w-full text-left px-3.5 py-2 text-[13px] text-ink-400 hover:bg-ink-50 ${!selected ? 'font-semibold text-ink-600' : ''}`}
              >
                {emptyLabel}
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="px-3.5 py-2.5 text-[13px] text-ink-400">Tidak ada yang cocok.</p>
            ) : (
              filtered.map((o, i) => {
                const val = getOptionValue(o);
                const isSelected = String(val) === String(value);
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => selectOption(o)}
                    className={[
                      'w-full text-left px-3.5 py-2 text-[13px] truncate',
                      i === highlighted ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-ink-50',
                      isSelected ? 'font-semibold' : '',
                    ].join(' ')}
                  >
                    {getOptionLabel(o)}
                  </button>
                );
              })
            )}
          </div>,
          document.body
        )}
      </div>
    </FormField>
  );
}

/** Field siap pakai: label + <textarea>. */
export function TextareaField({ label, required, hint, error, className, ...textareaProps }) {
  return (
    <FormField label={label} required={required} hint={hint} error={error} className={className}>
      <Textarea required={required} invalid={Boolean(error)} {...textareaProps} />
    </FormField>
  );
}

/** Kotak pesan galat untuk kesalahan tingkat form (bukan per-field). */
export function FormError({ children, className = '' }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className={`flex items-start gap-2.5 rounded-xl border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-sm text-danger-700 ${className}`}
    >
      <i className="fas fa-circle-exclamation mt-0.5 shrink-0 text-danger-500" aria-hidden="true" />
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}
