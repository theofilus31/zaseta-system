import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Helper standar shadcn/ui -- gabung className kondisional (clsx) lalu
 * selesaikan konflik utility Tailwind yang tumpang tindih (tailwind-merge).
 * Dipakai HANYA oleh komponen shadcn baru di components/ui/*.tsx -- kode
 * lama proyek ini menggabung className dengan array.join(' ')/template
 * string biasa (lihat mis. components/ui/Button.jsx) dan tidak perlu
 * diubah untuk memakai ini.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
