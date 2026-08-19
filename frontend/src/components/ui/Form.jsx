import React from 'react';

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

/** Label + tanda wajib + hint + pesan galat, membungkus satu kontrol. */
export function FormField({ label, htmlFor, required, hint, error, className = '', children }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}
          {required && <span className="text-danger-500 ml-0.5" aria-hidden="true">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger-600 mt-1.5 flex items-center gap-1.5">
          <i className="fas fa-circle-exclamation text-[10px]" aria-hidden="true" />
          {error}
        </p>
      ) : (
        hint && <p className="hint">{hint}</p>
      )}
    </div>
  );
}

export function Input({ sunken = false, invalid = false, className = '', ...props }) {
  return (
    <input
      className={['field', sunken ? 'field-sunken' : '', invalid ? 'field-error' : '', className].join(' ')}
      {...props}
    />
  );
}

export function Select({ sunken = false, invalid = false, className = '', children, ...props }) {
  return (
    <select
      className={['field-select', sunken ? 'field-sunken' : '', invalid ? 'field-error' : '', className].join(' ')}
      {...props}
    >
      {children}
    </select>
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
 */
export function TextField({ label, required, hint, error, className, ...inputProps }) {
  return (
    <FormField label={label} required={required} hint={hint} error={error} className={className}>
      <Input required={required} invalid={Boolean(error)} {...inputProps} />
    </FormField>
  );
}

/** Field siap pakai: label + <select>. */
export function SelectField({ label, required, hint, error, className, children, ...selectProps }) {
  return (
    <FormField label={label} required={required} hint={hint} error={error} className={className}>
      <Select required={required} invalid={Boolean(error)} {...selectProps}>
        {children}
      </Select>
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
