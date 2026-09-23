import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import Modal from './Modal.jsx';
import Button from './Button.jsx';

/**
 * ============================================================================
 *  PINDAI QR LEWAT KAMERA PERANGKAT
 * ============================================================================
 *  Dipakai kotak "Pindai atau Ketik Kode Aset" (StockOpnameDetail.jsx) supaya
 *  petugas yang cuma pegang HP (tanpa pemindai barcode genggam terpisah)
 *  tetap bisa memindai label QR aset lewat kamera bawaan.
 *
 *  html5-qrcode dipilih (bukan BarcodeDetector bawaan browser) karena
 *  BarcodeDetector belum didukung Safari/iOS sama sekali -- pilihan ini
 *  jalan di kamera belakang Android MAUPUN iPhone.
 *
 *  Kamera WAJIB dilepas (`stop()` lalu `clear()`) begitu modal ditutup atau
 *  komponen dilepas dari DOM -- kalau tidak, lampu kamera tetap menyala dan
 *  perangkat lain (mis. tab lain yang juga minta kamera) akan gagal
 *  mendapat akses.
 * ============================================================================
 */

const SCANNER_ELEMENT_ID = 'qr-scanner-viewport';

export default function QrScannerModal({ onClose, onDetected }) {
  const html5QrCodeRef = useRef(null);
  const detectedRef = useRef(false);
  const [status, setStatus] = useState('starting'); // starting | scanning | error
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    let started = false; // true hanya SETELAH start() benar-benar resolve (kamera sungguhan menyala)
    const instance = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false });
    html5QrCodeRef.current = instance;

    // Melepas kamera dengan aman -- instance.stop() dari library ini MELEMPAR
    // (bukan menolak/reject Promise) kalau dipanggil SEBELUM start() sungguhan
    // selesai ("Cannot stop, scanner is not running or paused."), dan lemparan
    // sinkron di dalam cleanup effect TIDAK tertangkap React error boundary
    // mana pun -- crash SELURUH aplikasi (layar putih) tanpa pesan galat yang
    // jelas. try/catch di sini adalah jaring pengaman terakhir; pengecekan
    // `started` di atas adalah pencegahan utamanya.
    function teardown() {
      try {
        if (started) {
          instance.stop().catch(() => {}).finally(() => { try { instance.clear(); } catch { /* noop */ } });
        } else {
          instance.clear();
        }
      } catch { /* noop -- pelepasan best-effort, tidak boleh ikut menjatuhkan UI */ }
    }

    instance
      .start(
        { facingMode: 'environment' },
        // qrbox persegi di tengah -- cukup besar untuk label QR aset dilihat
        // dari jarak wajar, tanpa memenuhi seluruh bingkai kamera.
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          /* `cancelled` WAJIB dicek di sini, bukan cuma di .then()/.catch() --
             kalau modal ditutup SELAGI start() masih menegosiasikan kamera
             (izin belum diputuskan), teardown() SENGAJA ditunda sampai
             start() settle (lihat komentar di .then() bawah) supaya
             instance.stop() tidak dipanggil sebelum benar-benar berjalan.
             Tapi itu berarti ADA JEDA singkat di mana kamera sudah aktif dan
             mulai memindai frame padahal pengguna sudah menutup modalnya --
             tanpa pengecekan ini, kode yang kebetulan terpindai di jeda itu
             akan tetap diproses (onDetected -> submitValue -> POST ke
             /opnames/:id/scan) walau modalnya sudah tidak terlihat sama
             sekali, menandai aset yang salah tanpa sepengetahuan siapa pun. */
          if (cancelled || detectedRef.current) return;
          detectedRef.current = true;
          onDetected(decodedText);
        },
        () => {
          /* Callback galat PER-FRAME (dipanggil puluhan kali/detik selama
             kamera menyala tapi belum menemukan kode) -- BUKAN galat fatal,
             sengaja diabaikan. Galat fatal (kamera tidak ditemukan/ditolak)
             ditangkap lewat .catch() di bawah, bukan lewat callback ini. */
        }
      )
      .then(() => {
        started = true;
        // Komponen (atau efek ini, lewat StrictMode dev) sudah keburu
        // dilepas SEBELUM start() sempat resolve -- kamera baru sungguhan
        // menyala SEKARANG, jadi baru sekarang ada sesuatu untuk dilepas.
        if (cancelled) { teardown(); return; }
        setStatus('scanning');
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus('error');
        const name = String(err?.name || err || '');
        setErrorMessage(
          name.includes('NotAllowedError')
            ? 'Izin kamera ditolak. Aktifkan izin kamera untuk situs ini di pengaturan peramban, lalu coba lagi.'
            : name.includes('NotFoundError')
              ? 'Kamera tidak ditemukan di perangkat ini.'
              : 'Gagal membuka kamera. Coba lagi, atau ketik kode secara manual.'
        );
      });

    return () => {
      cancelled = true;
      // Kalau start() belum resolve saat ini jalan, JANGAN teardown sekarang
      // -- ditangani oleh pengecekan `cancelled` di .then() di atas begitu
      // start() akhirnya settle (baik StrictMode dev double-invoke MAUPUN
      // modal ditutup manusia beneran secepat itu, keduanya kasus yang sama).
      if (started) teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal
      title="Pindai Kode QR"
      description="Arahkan kamera ke label QR pada aset."
      icon="fa-camera"
      iconTone="info"
      onClose={onClose}
      footer={<Button variant="secondary" size="sm" onClick={onClose}>Batal</Button>}
    >
      <div className="relative overflow-hidden rounded-xl bg-ink-900 aspect-square">
        <div id={SCANNER_ELEMENT_ID} className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />

        {status === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
            <i className="fas fa-spinner fa-spin mr-2" aria-hidden="true" />
            Membuka kamera…
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white bg-ink-900">
            <p>{errorMessage}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
