import React, { useEffect, useRef } from 'react';
import QRCodeStyling from 'qr-code-styling';

/**
 * Kode QR bergaya di browser -- titik bulat hitam, tiga kotak sudut hijau
 * brand, logo Zaseta di tengah, koreksi galat 'H'. Dipakai kartu pindai
 * publik (AssetTrackerCard) supaya QR pratinjaunya SAMA dengan template QR
 * yang dibuat server (backend/src/utils/qrGenerator.js) -- bukan lagi kotak
 * hitam polos dari qrcode.react.
 *
 * Digambar di sisi klien dari `value` (bukan memakai gambar tersimpan di
 * database) supaya QR lama yang dibuat sebelum template ini ada pun tampil
 * seragam di halaman publik. Konsekuensinya pengaturan gayanya ada di DUA
 * tempat (di sini & qrGenerator.js) -- ubah keduanya bersamaan.
 *
 * Digambar 240px lalu diskalakan lewat CSS ke `size`, supaya tetap tajam di
 * layar beresolusi tinggi meski tampil kecil.
 */
const RENDER_PX = 240;
const LOGO_URL = '/brand/zaseta-qr-logo.png';
const QR_INK = '#000000';
const CORNER_GREEN = '#2f9c4f'; // brand-500, lihat tailwind.config.js

export default function StyledQrCode({ value, size = 72, className = '' }) {
  const hostRef = useRef(null);
  const qrRef = useRef(null);

  useEffect(() => {
    if (!hostRef.current) return;
    if (!qrRef.current) {
      qrRef.current = new QRCodeStyling({
        width: RENDER_PX,
        height: RENDER_PX,
        type: 'canvas',
        data: value,
        image: LOGO_URL,
        margin: 4,
        qrOptions: { errorCorrectionLevel: 'H' },
        dotsOptions: { color: QR_INK, type: 'dots' },
        cornersSquareOptions: { color: CORNER_GREEN, type: 'extra-rounded' },
        cornersDotOptions: { color: CORNER_GREEN, type: 'dot' },
        backgroundOptions: { color: '#ffffff' },
        imageOptions: { crossOrigin: 'anonymous', margin: 2, imageSize: 0.28, hideBackgroundDots: true },
      });
      qrRef.current.append(hostRef.current);
    } else {
      qrRef.current.update({ data: value });
    }
  }, [value]);

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label="Kode QR"
      style={{ width: size, height: size }}
      className={`[&>canvas]:h-full [&>canvas]:w-full ${className}`}
    />
  );
}
