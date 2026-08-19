import React, { useState } from 'react';
import { FormField } from './Form.jsx';

/**
 * Input kata sandi dengan tombol tampilkan/sembunyikan.
 *
 * Catatan: seluruh prop sisa (termasuk `name`) diteruskan ke <input>. Ini
 * penting karena halaman Profil & Manajemen Pengguna memakai satu handler
 * `handleChange` yang membaca `e.target.name` untuk tahu field mana yang
 * berubah — tanpa diteruskan, isian kata sandi tidak akan pernah tersimpan.
 */
export default function PasswordInput({
  label,
  hint,
  error,
  required = false,
  className = '',
  ...inputProps
}) {
  const [visible, setVisible] = useState(false);

  return (
    <FormField label={label} required={required} hint={hint} error={error} className={className}>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          required={required}
          className={`field pr-11 ${error ? 'field-error' : ''}`}
          {...inputProps}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center
                     rounded-lg text-ink-400 hover:text-ink-600 hover:bg-ink-100 transition-colors"
          aria-label={visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
        >
          {visible ? (
            /* Mata tertutup — kata sandi sedang terlihat, klik untuk sembunyikan */
            <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            /* Mata terbuka — kata sandi tersembunyi, klik untuk tampilkan */
            <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
    </FormField>
  );
}
