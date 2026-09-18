import React from 'react';

/** Label + tanda wajib + hint + pesan galat, membungkus satu kontrol.
 *  `labelAction` (opsional) — tombol kecil di ujung kanan baris label, mis.
 *  "+ Buat Baru" di sebelah dropdown Kode Barang/Lokasi pada AssetForm.jsx,
 *  supaya tenant baru tidak wajib membuka menu Data Acuan dulu sebelum bisa
 *  menambah aset pertamanya. */
export function FormField({ label, htmlFor, required, hint, error, className = '', labelAction, children }) {
  return (
    <div className={className}>
      {label && (
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={htmlFor} className="label">
            {label}
            {required && <span className="text-danger-500 ml-0.5" aria-hidden="true">*</span>}
          </label>
          {labelAction}
        </div>
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
