import React from 'react';

/**
 * Desain satu kartu barcode/QR aset. Dipakai baik di halaman cetak satuan (QRPrintPage)
 * maupun cetak massal (BatchQrPrintPage) supaya tampilan barcode selalu konsisten.
 */
export default function QrLabelDesign({ asset, sizeCm }) {
  // Proporsi elemen di dalam kartu disesuaikan mengikuti ukuran kartu yang dipilih
  const padding = sizeCm * 0.05;       // ~5% dari ukuran kartu
  const qrSize = sizeCm * 0.63;        // QR mengambil ~63% dari ukuran kartu
  const labelFontPt = sizeCm * 1.8;    // font nama aset
  const codeFontPt = sizeCm * 1.65;    // font kode aset

  return (
    <div
      style={{
        width: `${sizeCm}cm`,
        height: `${sizeCm}cm`,
        border: '1.5pt solid #000',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${padding}cm`,
        fontFamily: 'Arial, sans-serif',
        printColorAdjust: 'exact',
        WebkitPrintColorAdjust: 'exact',
        background: '#fff',
        overflow: 'hidden',
      }}
    >
      <p
        style={{
          fontSize: `${labelFontPt}pt`, fontWeight: 700, margin: 0, lineHeight: 1.15, textAlign: 'center',
          wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {asset.name}
      </p>
      <img
        src={asset.image_path}
        alt="Kode QR"
        style={{ width: `${qrSize}cm`, height: `${qrSize}cm`, margin: `${padding * 0.6}cm 0` }}
      />
      <p style={{ fontSize: `${codeFontPt}pt`, fontWeight: 600, margin: 0, lineHeight: 1.1, textAlign: 'center', wordBreak: 'break-all' }}>
        {asset.asset_code}
      </p>
    </div>
  );
}
