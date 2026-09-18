/** Gabungkan className kondisional, mem-filter nilai falsy. Dipakai komponen ui/*. */
export function cn(...values) {
  return values.filter(Boolean).join(' ');
}
