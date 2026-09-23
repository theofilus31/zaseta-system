import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axiosClient from '../api/axiosClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button, { SegmentedControl } from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { SkeletonList } from '../components/ui/Skeleton.jsx';
import { SearchInput, Checkbox, TextareaField } from '../components/ui/Form.jsx';
import { OpnameProgressBar, ResultBadge, OPNAME_STATUS } from '../components/opname/OpnameBits.jsx';

/* Dimuat lazy (bukan import biasa di atas) -- html5-qrcode berat (~110KB
   gzip) dan cuma dibutuhkan kalau petugas benar-benar menekan tombol kamera
   di kartu pindai, bukan berat yang wajar dipikul SETIAP pembukaan halaman
   ini (apalagi halaman lain yang tidak menyentuh scanner sama sekali). */
const QrScannerModal = lazy(() => import('../components/ui/QrScannerModal.jsx'));

/**
 * ============================================================================
 *  STOK OPNAME — SATU SESI
 * ============================================================================
 *  Layar kerja lapangan. Urutan isinya mengikuti urutan pekerjaannya:
 *  kotak pindai lebih dulu (itu yang dipakai ratusan kali), lalu daftar
 *  periksa, baru tombol menutup sesi.
 *
 *  Kotak pindai menerima ketikan maupun tempelan dari pemindai barcode
 *  genggam — alat itu pada dasarnya mengetikkan kode lalu menekan Enter, jadi
 *  input teks biasa yang selalu terfokus justru bentuk yang paling cocok.
 * ============================================================================
 */

export default function StockOpnameDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const { pushError, pushSuccess } = useNotification();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showFinish, setShowFinish] = useState(false);
  const [exporting, setExporting] = useState(false);

  const canEdit = can('opname', 'edit');

  const muat = useCallback(async () => {
    try {
      const res = await axiosClient.get(`/opnames/${id}`, {
        params: { result: filter || undefined, search: search || undefined },
      });
      setSession(res.data);
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal memuat sesi opname.');
    } finally {
      setLoading(false);
    }
  }, [id, filter, search, pushError]);

  useEffect(() => { muat(); }, [muat]);

  /* Lewat axios, bukan tautan biasa: token JWT dikirim di header, jadi
     <a href> ke endpoint ekspor akan ditolak 401. */
  async function unduhLaporan() {
    setExporting(true);
    try {
      const res = await axiosClient.get(`/opnames/${id}/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${session.code.replace(/\//g, '-')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      pushError('Gagal mengunduh laporan opname.');
    } finally {
      setExporting(false);
    }
  }

  async function batalkanSesi() {
    try {
      const res = await axiosClient.post(`/opnames/${id}/cancel`);
      pushSuccess(res.data.message);
      muat();
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal membatalkan sesi.');
    }
  }

  if (loading) {
    return <Card><SkeletonList count={6} /></Card>;
  }
  if (!session) {
    return (
      <EmptyState
        icon="fa-clipboard-question"
        title="Sesi tidak ditemukan"
        description="Sesi opname ini mungkin sudah dihapus."
        action={<Button to="/opname">Kembali ke Daftar</Button>}
      />
    );
  }

  const berjalan = session.status === 'berjalan';
  const tone = OPNAME_STATUS[session.status];
  const cakupan = [session.location_name, session.sub_location_name, session.category_name]
    .filter(Boolean).join(' · ') || 'Seluruh aset aktif';

  return (
    <>
      <PageHeader
        backTo="/opname"
        backLabel="Daftar Opname"
        eyebrow={session.code}
        title={session.name}
        description={`Cakupan: ${cakupan}`}
        actions={
          <>
            <Button variant="secondary" onClick={unduhLaporan} loading={exporting}>
              <i className="fas fa-file-csv text-xs" aria-hidden="true" /> Unduh Laporan
            </Button>
            {berjalan && canEdit && (
              <>
                <Button variant="destructive" onClick={batalkanSesi}>Batalkan</Button>
                <Button onClick={() => setShowFinish(true)}>
                  <i className="fas fa-flag-checkered text-xs" aria-hidden="true" /> Selesaikan
                </Button>
              </>
            )}
          </>
        }
      />

      {/* Ringkasan selalu di atas — ini yang ditanya orang saat lewat */}
      <Card className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1
                            text-xs font-semibold ring-1 ring-inset ${tone.className}`}>
            <i className={`fas ${tone.icon} text-[10px]`} aria-hidden="true" />
            {tone.label}
          </span>
          <p className="text-xs text-ink-400">
            Dibuka oleh {session.created_by_name || '—'}
            {session.finished_by_name && ` · Ditutup oleh ${session.finished_by_name}`}
          </p>
        </div>
        <OpnameProgressBar summary={session.summary} />
      </Card>

      {berjalan && canEdit && <ScanBox opnameId={id} onDone={muat} />}

      <Card padded={false} className="overflow-hidden">
        <div className="p-5 pb-4 border-b border-ink-200/70 space-y-3">
          <CardHeader
            title="Daftar Periksa"
            description={`${session.summary.total} aset dibekukan saat sesi dibuka.`}
          />
          <div className="flex flex-col sm:flex-row gap-3">
            <SearchInput
              placeholder="Cari nama, kode aset, atau nomor seri…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              containerClassName="flex-1"
            />
            <SegmentedControl
              value={filter}
              onChange={setFilter}
              options={[
                { value: '', label: 'Semua' },
                { value: 'belum', label: 'Belum' },
                { value: 'salah_lokasi', label: 'Salah Lokasi' },
                { value: 'tidak_ditemukan', label: 'Tidak Ada' },
                { value: 'ditemukan', label: 'Ditemukan' },
              ]}
            />
          </div>
        </div>

        {session.items.length === 0 ? (
          <EmptyState
            icon="fa-magnifying-glass"
            title="Tidak ada aset yang cocok"
            description="Ubah kata kunci atau saringan hasilnya."
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {session.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                opnameId={id}
                editable={berjalan && canEdit}
                onDone={muat}
              />
            ))}
          </ul>
        )}
      </Card>

      {showFinish && (
        <FinishModal
          session={session}
          onClose={() => setShowFinish(false)}
          onFinished={(msg) => { setShowFinish(false); pushSuccess(msg); muat(); }}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

/* Ditampilkan SEBENTAR saat berkas QrScannerModal (lazy) masih diunduh --
   tanpa ini, jeda antara tombol kamera ditekan dan modal sungguhan muncul
   terasa seperti ketukannya tidak terekam sama sekali, terutama di koneksi
   lambat. */
function ScannerLoadingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 backdrop-blur-sm">
      <i className="fas fa-spinner fa-spin text-2xl text-white" aria-hidden="true" />
    </div>
  );
}

/**
 * Kotak pindai. Fokusnya dikembalikan sendiri setelah tiap pemindaian supaya
 * petugas bisa memindai berturut-turut tanpa menyentuh layar — dengan tangan
 * memegang pemindai dan aset, tidak ada tangan tersisa untuk mengklik.
 */
function ScanBox({ opnameId, onDone }) {
  const { pushError, pushSuccess, pushInfo } = useNotification();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState([]);
  const [showScanner, setShowScanner] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  /* Diambil terpisah dari handler form supaya bisa dipanggil LANGSUNG dengan
     nilai hasil pindai kamera (lihat handleCameraDetected) -- kalau lewat
     setCode() dulu baru submit, nilainya belum tentu ter-update saat submit
     jalan (setState di React tidak seketika). */
  async function submitValue(rawValue) {
    const nilai = rawValue.trim();
    if (!nilai || busy) return;

    setBusy(true);
    try {
      /* Isi kotak URL juga diterima: petugas yang memindai pakai kamera ponsel
         (baik lewat pemindai QR bawaan HP di luar aplikasi ini, MAUPUN kamera
         di dalam aplikasi ini sendiri lewat tombol di bawah) mendapat tautan
         lengkap /scan/<kode>, dan menyuruh mereka memotong bagian depannya
         sendiri hanya menciptakan kesalahan ketik. */
      const kode = nilai.includes('/scan/') ? nilai.split('/scan/').pop().split(/[?#]/)[0] : nilai;

      const res = await axiosClient.post(`/opnames/${opnameId}/scan`, { code: kode });
      const { assetName, assetCode, result, alreadyChecked } = res.data;

      if (alreadyChecked) pushInfo(`${assetName} sudah diperiksa sebelumnya — ditandai ulang.`);
      else pushSuccess(res.data.message);

      setRecent((r) => [{ assetName, assetCode, result, at: Date.now() }, ...r].slice(0, 5));
      onDone();
    } catch (err) {
      pushError(err.response?.data?.message || 'Kode tidak dikenali.');
    } finally {
      setCode('');
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    submitValue(code);
  }

  /* Begitu kamera menemukan kode, langsung diproses (tanpa menunggu petugas
     menekan "Tandai" lagi) -- sama seperti pemindai barcode genggam yang
     "menembak" lalu Enter otomatis, cuma sumbernya kamera di dalam aplikasi
     ini sendiri. Modalnya juga langsung ditutup supaya petugas langsung
     melihat hasilnya di kartu ini, bukan tetap di layar kamera. */
  function handleCameraDetected(text) {
    setShowScanner(false);
    submitValue(text);
  }

  return (
    <Card className="mb-5 border-info-200 bg-info-50/40">
      <form onSubmit={handleSubmit}>
        <label className="label" htmlFor="opname-scan">Pindai atau Ketik Kode Aset</label>
        <div className="flex gap-2">
          <input
            id="opname-scan"
            ref={inputRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            /* Enter ditangani sendiri, tidak menyandarkan diri pada submit
               implisit form. Pemindai barcode genggam mengirim kode lalu Enter
               sebagai satu tembakan cepat, dan itu jalur utama halaman ini —
               terlalu berisiko dibiarkan bergantung pada perilaku bawaan
               peramban yang bisa berbeda antar perangkat. */
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitValue(code); } }}
            className="field flex-1"
            placeholder="Tembakkan pemindai ke label, atau tempel tautannya di sini"
            autoComplete="off"
          />
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => setShowScanner(true)}
            title="Pindai lewat kamera"
            aria-label="Pindai lewat kamera"
          >
            <i className="fas fa-camera" aria-hidden="true" />
          </Button>
          <Button type="submit" loading={busy} disabled={!code.trim()}>Tandai</Button>
        </div>
        <p className="hint">
          Aset ditandai ditemukan otomatis. Kalau lokasinya berbeda dari catatan, hasilnya jadi “salah lokasi”.
          Tanpa pemindai genggam? Ketuk ikon kamera untuk memindai lewat kamera HP.
        </p>
      </form>

      {showScanner && (
        <Suspense fallback={<ScannerLoadingOverlay />}>
          <QrScannerModal onClose={() => setShowScanner(false)} onDetected={handleCameraDetected} />
        </Suspense>
      )}

      {recent.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-info-200/60 pt-3">
          {recent.map((r) => (
            <li key={r.at} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="truncate text-ink-700">
                {r.assetName} <span className="font-mono text-[11px] text-ink-400">{r.assetCode}</span>
              </span>
              <ResultBadge result={r.result} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function ItemRow({ item, opnameId, editable, onDone }) {
  const { pushError } = useNotification();
  const [busy, setBusy] = useState(false);

  const lokasiTercatat = [item.expected_location_name, item.expected_sub_location_name]
    .filter(Boolean).join(' · ') || '—';
  const lokasiTemuan = [item.found_location_name, item.found_sub_location_name]
    .filter(Boolean).join(' · ');

  async function tandai(result) {
    setBusy(true);
    try {
      await axiosClient.put(`/opnames/${opnameId}/items/${item.id}`, { result });
      onDone();
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal menyimpan hasil.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-5 py-4 hover:bg-ink-50/60 transition-colors">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to={`/assets/${item.asset_id}`} className="text-[15px] font-semibold text-ink-800 hover:text-brand-600 truncate">
              {item.asset_name}
            </Link>
            <ResultBadge result={item.result} />
          </div>

          <p className="font-mono text-[11px] text-ink-400 mt-0.5">{item.asset_code}</p>

          <p className="text-xs text-ink-500 mt-1.5">
            Tercatat di <span className="text-ink-700">{lokasiTercatat}</span>
            {item.result === 'salah_lokasi' && lokasiTemuan && (
              <>
                {' · '}ditemukan di <span className="font-medium text-warning-700">{lokasiTemuan}</span>
              </>
            )}
          </p>

          {item.checked_by_name && (
            <p className="text-[11px] text-ink-400 mt-1">
              Diperiksa {item.checked_by_name}
              {item.note && ` · ${item.note}`}
            </p>
          )}
        </div>

        {editable && (
          <div className="flex gap-1.5 shrink-0">
            <Button
              size="xs" variant={item.result === 'ditemukan' ? 'primary' : 'secondary'}
              onClick={() => tandai('ditemukan')} disabled={busy}
            >
              <i className="fas fa-check text-[10px]" aria-hidden="true" /> Ada
            </Button>
            <Button
              size="xs" variant={item.result === 'tidak_ditemukan' ? 'destructive' : 'secondary'}
              onClick={() => tandai('tidak_ditemukan')} disabled={busy}
            >
              <i className="fas fa-xmark text-[10px]" aria-hidden="true" /> Tidak Ada
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Penutupan sesi. Tiga penerapan dipisah karena bobot akibatnya berbeda:
 * membetulkan lokasi itu administratif, sedangkan menandai HILANG berkonsekuensi
 * dan karenanya tidak dicentang secara bawaan.
 */
function FinishModal({ session, onClose, onFinished }) {
  const { pushError } = useNotification();
  const s = session.summary;

  const [applyLocation, setApplyLocation] = useState(s.salahLokasi > 0);
  const [applyCondition, setApplyCondition] = useState(true);
  const [markMissingAsLost, setMarkMissing] = useState(false);
  const [notes, setNotes] = useState(session.notes || '');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const res = await axiosClient.post(`/opnames/${session.id}/finish`, {
        applyLocation, applyCondition, markMissingAsLost, notes,
      });
      onFinished(res.data.message);
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal menutup sesi.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Selesaikan Sesi Opname"
      description="Setelah ditutup, hasilnya tidak bisa diubah lagi."
      icon="fa-flag-checkered"
      iconTone="brand"
      onClose={onClose}
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Batal</Button>
          <Button onClick={submit} loading={saving}>Tutup Sesi</Button>
        </>
      }
    >
      <div className="space-y-4">
        {s.belum > 0 && (
          <p className="flex gap-2.5 rounded-xl bg-warning-50 px-3.5 py-3 text-xs text-warning-800 leading-relaxed">
            <i className="fas fa-triangle-exclamation mt-0.5 shrink-0" aria-hidden="true" />
            Masih ada <strong>{s.belum} aset</strong> yang belum diperiksa. Kalau sesi ditutup sekarang,
            aset itu tercatat sebagai belum diperiksa — bukan sebagai hilang.
          </p>
        )}

        <div className="rounded-xl bg-ink-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-3">Terapkan Temuan</p>
          <div className="space-y-3">
            <Checkbox
              checked={applyLocation}
              onChange={(e) => setApplyLocation(e.target.checked)}
              label={`Betulkan lokasi ${s.salahLokasi} aset yang salah lokasi`}
              description="Lokasi di data aset diganti dengan tempat barangnya benar-benar ditemukan."
              disabled={s.salahLokasi === 0}
            />
            <Checkbox
              checked={applyCondition}
              onChange={(e) => setApplyCondition(e.target.checked)}
              label="Perbarui kondisi fisik sesuai temuan"
              description="Hanya untuk aset yang kondisinya sempat dicatat berbeda saat diperiksa."
            />
            <Checkbox
              checked={markMissingAsLost}
              onChange={(e) => setMarkMissing(e.target.checked)}
              label={`Tandai ${s.tidakDitemukan} aset tidak ditemukan sebagai "Hilang"`}
              description="Status aset berubah jadi Hilang dan tercatat di riwayat status. Jangan dicentang kalau pencarian masih akan dilanjutkan."
              disabled={s.tidakDitemukan === 0}
            />
          </div>
        </div>

        <TextareaField
          label="Catatan Penutup"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Mis. dua unit menyusul diperiksa minggu depan"
        />
      </div>
    </Modal>
  );
}
