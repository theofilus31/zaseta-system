import React from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Package, QrCode } from 'lucide-react';
import StyledQrCode from './StyledQrCode.jsx';
import { cn } from '../../utils/cn.js';
import StatusBadge from './StatusBadge.jsx';

/**
 * Kartu ringkas untuk halaman pindai publik (PublicScanPage) — tampilan
 * pertama yang dilihat orang setelah memindai label QR, sebelum membuka
 * rincian penuh. Diadaptasi dari pola "package tracker card": lencana di
 * atas, identitas di tengah, kode + QR di bawah.
 *
 * Dipakai bersama oleh pindaian ASET (PublicScanPage.jsx, `status` -> lencana
 * StatusBadge, "Kode Aset") dan BARANG HABIS PAKAI (ConsumablePublicScanPage.jsx,
 * `topBadge` custom -> lencana stok, `codeLabel="Kode Barang"`) -- supaya
 * kedua halaman pindai publik punya tema yang SAMA PERSIS, bukan dua desain
 * terpisah yang kebetulan mirip. `status` tetap dipertahankan apa adanya
 * (bukan diganti wajib jadi `topBadge`) supaya pemanggilan yang sudah ada
 * untuk aset tidak perlu ikut diubah.
 */
export default function AssetTrackerCard({
  status,
  topBadge,
  assetName,
  assetCode,
  codeLabel = 'Kode Aset',
  location,
  date,
  qrValue,
  icon = null,
  expanded = false,
  onToggleDetail,
  className = '',
}) {
  const cardVariants = {
    hidden: { opacity: 0, y: 24 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: 'spring', stiffness: 100, damping: 15, staggerChildren: 0.08 },
    },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 14 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className={cn(
        'w-full overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-raised',
        className
      )}
    >
      {/* Panel identitas — pola titik halus sebagai pengganti foto aset (tidak tersedia di data pindai publik) */}
      <motion.div variants={itemVariants} className="relative flex h-32 w-full items-center justify-center overflow-hidden bg-ink-50">
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, transparent, transparent 22px, rgb(226 232 240) 22px, rgb(226 232 240) 23px), repeating-linear-gradient(-45deg, transparent, transparent 22px, rgb(226 232 240) 22px, rgb(226 232 240) 23px)',
          }}
          aria-hidden="true"
        />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-card">
          {icon || <Package className="h-7 w-7" aria-hidden="true" />}
        </div>
      </motion.div>

      <div className="px-5 py-5">
        <motion.div variants={itemVariants} className="flex items-center justify-between gap-3">
          {topBadge || <StatusBadge status={status} size="sm" />}
          {location && <span className="text-[11px] text-ink-400 text-right truncate">{location}</span>}
        </motion.div>

        <motion.h2 variants={itemVariants} className="mt-2 text-xl font-black text-ink-800 leading-snug break-words">
          {assetName}
        </motion.h2>

        <div className="mt-5 flex items-end justify-between gap-4">
          <motion.div variants={itemVariants} className="min-w-0 space-y-1">
            <p className="text-[11px] text-ink-400">{codeLabel}</p>
            <p className="font-mono text-sm text-ink-800 truncate">{assetCode}</p>
            {date && <p className="text-[11px] text-ink-400">{date}</p>}
          </motion.div>

          <motion.div variants={itemVariants} className="shrink-0 rounded-lg border border-ink-200 p-1">
            {qrValue ? (
              <StyledQrCode value={qrValue} size={72} />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-md bg-ink-100">
                <QrCode className="h-6 w-6 text-ink-400" aria-hidden="true" />
              </div>
            )}
          </motion.div>
        </div>

        {onToggleDetail && (
          <motion.button
            variants={itemVariants}
            type="button"
            onClick={onToggleDetail}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-ink-100 px-4 py-2 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-200"
            aria-expanded={expanded}
          >
            {expanded ? 'Sembunyikan detail' : 'Lihat detail lengkap'}
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')}
              aria-hidden="true"
            />
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}
