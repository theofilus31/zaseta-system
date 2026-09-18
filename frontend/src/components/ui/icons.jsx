import React from 'react';

/**
 * Ikon KPI kecil yang dipakai di lebih dari satu dasbor (Dashboard.jsx,
 * PlatformDashboard.jsx, PlatformRevenue.jsx) — dipindah ke sini supaya
 * SVG-nya tidak di-copy-paste ulang di tiap halaman. Ikon yang cuma dipakai
 * satu halaman tetap didefinisikan lokal di halaman itu.
 */
export const ICON_STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

export const IconWallet = (p) => <svg {...p} viewBox="0 0 24 24" {...ICON_STROKE}><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" /><circle cx="16" cy="13" r="1.5" /></svg>;
export const IconBuilding = (p) => <svg {...p} viewBox="0 0 24 24" {...ICON_STROKE}><rect x="4" y="2" width="16" height="20" rx="1" /><path d="M9 22v-4h6v4M9 6h.01M9 10h.01M9 14h.01M15 6h.01M15 10h.01M15 14h.01" /></svg>;
export const IconPulse = (p) => <svg {...p} viewBox="0 0 24 24" {...ICON_STROKE}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>;
