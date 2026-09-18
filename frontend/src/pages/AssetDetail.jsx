import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axiosClient from '../api/axiosClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import StatusBadge, { ConditionBadge, STATUS_CONFIG } from '../components/ui/StatusBadge.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { parseSpecDetail } from '../utils/specDetail.js';
import { Badge } from '../components/ui/StatusBadge.jsx';
import { CheckOutModal, CheckInModal } from '../components/assets/AssignmentModals.jsx';
import AssetAttachments from '../components/assets/AssetAttachments.jsx';
import AssetReminders from '../components/assets/AssetReminders.jsx';
import AssetMaintenance from '../components/assets/AssetMaintenance.jsx';

const rupiah = (v) =>
  v === null || v === undefined || v === '' ? null : `Rp ${Number(v).toLocaleString('id-ID')}`;

const tanggal = (v) =>
  v ? new Date(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

/** Satu baris "label → nilai" dalam daftar deskripsi. */
function Info({ label, value, mono = false, wide = false }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className={`text-sm text-ink-800 mt-1 ${mono ? 'font-mono' : 'font-medium'} break-words`}>
        {value || <span className="text-ink-300 font-normal">—</span>}
      </dd>
    </div>
  );
}

/**
 * Detail Spesifikasi: kalau isinya list bernomor (1. 2. 3. …) tampil menurun
 * sebagai daftar dan melebar penuh; kalau bukan, tampil seperti Info biasa.
 */
function SpecDetailInfo({ value }) {
  if (!value || !value.trim()) return <Info label="Detail Spesifikasi" value={null} />;

  const parsed = parseSpecDetail(value);

  if (parsed.isList) {
    return (
      <div className="sm:col-span-2">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Detail Spesifikasi</dt>
        <dd className="mt-2">
          <ul className="space-y-1.5">
            {parsed.items.map((item, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-ink-700">
                <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md bg-ink-100 text-[10px] font-bold text-ink-500 tabular-nums">
                  {i + 1}
                </span>
                <span className="min-w-0">{item}</span>
              </li>
            ))}
          </ul>
        </dd>
      </div>
    );
  }

  return (
    <div className="sm:col-span-2">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Detail Spesifikasi</dt>
      <dd className="text-sm text-ink-800 font-medium mt-1 whitespace-pre-line">{value}</dd>
    </div>
  );
}

export default function AssetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const { pushError, pushSuccess } = useNotification();

  const [asset, setAsset] = useState(null);
  const [regenerating, setRegenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showCheckOut, setShowCheckOut] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(false);

  function load() {
    return axiosClient.get(`/assets/${id}`).then((res) => setAsset(res.data));
  }

  useEffect(() => { load(); }, [id]);

  async function handleRegenerateQr() {
    if (!confirm('Kode QR lama tidak akan berlaku lagi setelah ini. Lanjutkan?')) return;
    setRegenerating(true);
    try {
      await axiosClient.post(`/assets/${id}/qr/regenerate`);
      await load();
      pushSuccess('Kode QR berhasil dibuat ulang. Label lama perlu dicetak ulang.');
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal membuat ulang Kode QR.');
    } finally {
      setRegenerating(false);
    }
  }

  async function handleCheckOut(form) {
    await axiosClient.post('/assignments', { assetId: Number(id), ...form });
    setShowCheckOut(false);
    await load();
    pushSuccess(`Aset diserahkan kepada ${form.holderName}.`);
  }

  async function handleCheckIn(form) {
    await axiosClient.put(`/assignments/${asset.currentAssignment.id}/return`, form);
    setShowCheckIn(false);
    await load();
    pushSuccess(`Aset diterima kembali dari ${asset.currentAssignment.holder_name}.`);
  }

  async function handleDelete() {
    if (!confirm('Hapus aset ini? Tindakan ini tidak bisa dibatalkan.')) return;
    setDeleting(true);
    try {
      await axiosClient.delete(`/assets/${id}`);
      navigate('/assets');
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal menghapus aset.');
      setDeleting(false);
    }
  }

  /* ---------- Keadaan memuat ---------- */
  if (!asset) {
    return (
      <>
        <Skeleton className="h-4 w-24 mb-3" />
        <Skeleton className="h-7 w-64 mb-2" />
        <Skeleton className="h-4 w-40 mb-7" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <Card><Skeleton className="h-4 w-32 mb-5" /><Skeleton className="h-40 w-full" /></Card>
            <Card><Skeleton className="h-4 w-32 mb-5" /><Skeleton className="h-24 w-full" /></Card>
          </div>
          <Card><Skeleton className="h-44 w-full" /></Card>
        </div>
      </>
    );
  }

  const location = [asset.location_name, asset.sub_location_name].filter(Boolean).join(' · ') || asset.location;
  const originLocation = [asset.origin_location_name, asset.origin_sub_location_name].filter(Boolean).join(' · ');
  const activeCustomFields = (asset.customFields || []).filter((cf) => cf.value_text);

  return (
    <>
      <PageHeader
        backTo="/assets"
        backLabel="Daftar Aset"
        eyebrow={asset.category_name}
        title={asset.name}
        description={
          <span className="font-mono text-ink-600">{asset.asset_code}</span>
        }
        actions={
          <>
            <Button to={`/assets/${id}/qr`} variant="secondary" size="sm">
              <i className="fas fa-qrcode text-xs" aria-hidden="true" /> Cetak Label
            </Button>
            {can('assets', 'edit') && (
              <Button to={`/assets/${id}/edit`} size="sm">
                <i className="fas fa-pen text-xs" aria-hidden="true" /> Ubah Aset
              </Button>
            )}
            {can('assets', 'delete') && (
              <Button variant="destructive" size="sm" onClick={handleDelete} loading={deleting}>
                {deleting ? 'Menghapus…' : <><i className="fas fa-trash-can text-xs" aria-hidden="true" /> Hapus</>}
              </Button>
            )}
          </>
        }
      />

      {/* Aset yang sudah keluar dari inventaris: alasan dan berita acaranya
          ditaruh paling atas — itu informasi pertama yang dicari orang saat
          membuka aset yang hilang atau dihapuskan. */}
      {['hilang', 'dihapuskan'].includes(asset.status) && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-danger-200 bg-danger-50 px-4 py-3.5">
          <i className="fas fa-file-signature mt-0.5 text-danger-600 shrink-0" aria-hidden="true" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-danger-800">
              Aset {asset.status === 'hilang' ? 'dinyatakan hilang' : 'sudah dihapuskan dari inventaris'}
              {asset.retired_date && ` — ${tanggal(asset.retired_date)}`}
            </p>
            {asset.retired_reason && (
              <p className="text-danger-700 mt-1 leading-relaxed">{asset.retired_reason}</p>
            )}
            {asset.retired_doc_no && (
              <p className="text-danger-700 mt-1 text-[13px]">
                No. berita acara: <span className="font-mono">{asset.retired_doc_no}</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Peringatan khusus aset berstatus "dipindah" — konteks paling penting
          diletakkan sebelum detail, bukan terkubur di dalam daftar. */}
      {asset.status === 'dipindah' && originLocation && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-accent-200 bg-accent-50 px-4 py-3.5">
          <i className="fas fa-route mt-0.5 text-accent-600 shrink-0" aria-hidden="true" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-accent-800">Aset sedang dalam status dipindahkan</p>
            <p className="text-accent-700 mt-0.5 leading-relaxed">
              Lokasi asal: <span className="font-medium">{originLocation}</span>. Status hanya bisa
              dikembalikan ke Dipakai/Menganggur setelah lokasi diatur persis seperti lokasi asal.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">

        {/* ================= KOLOM UTAMA ================= */}
        <div className="lg:col-span-2 space-y-5 order-2 lg:order-1">

          <Card>
            <CardHeader title="Identitas Aset" description="Informasi utama yang menempel pada aset ini." />
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              <Info label="Kategori Aset" value={asset.asset_type_name} />
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Kondisi Fisik</dt>
                <dd className="mt-1.5"><ConditionBadge condition={asset.condition_status} /></dd>
              </div>
              <Info label="Brand" value={asset.brand} />
              <Info label="Model" value={asset.model} />
              <Info label="Nomor Seri" value={asset.serial_number} mono />
              <Info label="Lokasi" value={location} />
              <Info
                label="Departemen"
                value={asset.department_name
                  ? `${asset.department_code} · ${asset.department_name}`
                  : null}
              />
              <SpecDetailInfo value={asset.spec_detail} />
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Informasi Keuangan"
              description="Pembelian, garansi, penyusutan, dan penjualan aset."
              action={
                asset.warranty && (
                  <Badge
                    tone={{ active: 'brand', expiring: 'warning', expired: 'danger' }[asset.warranty.state]}
                    size="sm"
                  >
                    <i className="fas fa-shield-halved text-[9px] mr-1.5" aria-hidden="true" />
                    {asset.warranty.state === 'expired'
                      ? `Garansi habis ${Math.abs(asset.warranty.daysRemaining)} hari lalu`
                      : `Garansi ${asset.warranty.daysRemaining} hari lagi`}
                  </Badge>
                )
              }
            />

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              <Info label="Vendor" value={asset.vendor} />
              <Info label="Tanggal Beli" value={tanggal(asset.purchase_date)} />
              <Info label="Harga Beli" value={rupiah(asset.purchase_price)} />
              <Info label="Garansi Berakhir" value={tanggal(asset.warranty_expiry)} />
              <Info label="Harga Jual / Net" value={rupiah(asset.sale_value_net)} />
              <Info label="Tanggal Terjual" value={tanggal(asset.sold_date)} />
              <Info label="Harga Terjual" value={rupiah(asset.sold_price)} />
            </dl>

            {/* ---------- Penyusutan garis lurus ---------- */}
            {asset.depreciation ? (
              <div className="mt-6 pt-5 border-t border-ink-200/70">
                <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Nilai Buku Saat Ini</p>
                    <p className="text-2xl font-black text-ink-900 tabular-nums mt-1">
                      {rupiah(asset.depreciation.bookValue)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-ink-400">
                      {asset.depreciation.monthsElapsed} dari {asset.useful_life_months} bulan
                    </p>
                    <p className="text-[13px] font-semibold text-ink-600 tabular-nums">
                      {asset.depreciation.percentDepreciated.toFixed(0)}% tersusut
                    </p>
                  </div>
                </div>

                <div className="progress-track">
                  <div
                    className={`progress-fill ${asset.depreciation.isFullyDepreciated ? 'bg-ink-400' : 'bg-warning-500'}`}
                    style={{ width: `${Math.min(100, asset.depreciation.percentDepreciated)}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4 text-xs">
                  <div>
                    <p className="text-ink-400">Penyusutan / bulan</p>
                    <p className="text-ink-800 font-semibold tabular-nums mt-0.5">{rupiah(asset.depreciation.perMonth)}</p>
                  </div>
                  <div>
                    <p className="text-ink-400">Akumulasi penyusutan</p>
                    <p className="text-ink-800 font-semibold tabular-nums mt-0.5">{rupiah(asset.depreciation.accumulated)}</p>
                  </div>
                  <div>
                    <p className="text-ink-400">Nilai residu</p>
                    <p className="text-ink-800 font-semibold tabular-nums mt-0.5">{rupiah(asset.salvage_value) || 'Rp 0'}</p>
                  </div>
                </div>

                {asset.depreciation.isFullyDepreciated && (
                  <p className="mt-3 flex gap-2 rounded-lg bg-ink-100 px-3 py-2 text-xs text-ink-600 leading-relaxed">
                    <i className="fas fa-circle-info mt-0.5 shrink-0" aria-hidden="true" />
                    Masa manfaat sudah habis. Aset masih bisa dipakai, tapi nilainya tinggal nilai residu —
                    saat yang tepat untuk mempertimbangkan peremajaan.
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-6 pt-5 border-t border-ink-200/70 flex gap-2 text-xs text-ink-400 leading-relaxed">
                <i className="fas fa-circle-info mt-0.5 shrink-0" aria-hidden="true" />
                Nilai buku belum bisa dihitung. Lengkapi <strong className="text-ink-600">Tanggal Beli</strong>,{' '}
                <strong className="text-ink-600">Harga Beli</strong>, dan{' '}
                <strong className="text-ink-600">Masa Manfaat</strong> lewat Ubah Aset.
              </p>
            )}
          </Card>

          {activeCustomFields.length > 0 && (
            <Card>
              <CardHeader title="Bidang Kustom" description="Informasi tambahan khusus kode barang/aset ini." />
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                {activeCustomFields.map((cf) => (
                  <Info key={cf.field_id} label={cf.field_label} value={cf.value_text} />
                ))}
              </dl>
            </Card>
          )}

          {asset.notes && (
            <Card>
              <CardHeader title="Catatan" />
              <p className="text-sm text-ink-600 leading-relaxed whitespace-pre-line">{asset.notes}</p>
            </Card>
          )}

          <AssetAttachments assetId={id} />

          <AssetReminders assetId={id} />

          <AssetMaintenance assetId={id} />

          {/* ---------- Riwayat serah terima ---------- */}
          {asset.assignmentHistory?.length > 0 && (
            <Card padded={false}>
              <CardHeader
                title="Riwayat Serah Terima"
                description="Siapa saja yang pernah memegang aset ini."
                bordered
              />
              <div className="overflow-x-auto scrollbar-slim">
                <table className="table-base min-w-[620px]">
                  <thead>
                    <tr>
                      <th>Pemegang</th>
                      <th>Periode</th>
                      <th>Kondisi Kembali</th>
                      <th>Catatan</th>
                      <th className="print-hide">Berita Acara</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asset.assignmentHistory.map((h) => (
                      <tr key={h.id} className={!h.returned_at ? 'is-selected' : ''}>
                        <td>
                          <p className="font-medium text-ink-800">{h.holder_name}</p>
                          {h.department && <p className="text-[11px] text-ink-400 mt-0.5">{h.department}</p>}
                        </td>
                        <td className="text-[13px] text-ink-600 whitespace-nowrap">
                          {tanggal(h.assigned_at)}
                          <span className="text-ink-300 mx-1.5">→</span>
                          {h.returned_at
                            ? tanggal(h.returned_at)
                            : <Badge tone="brand" size="sm">Masih dipegang</Badge>}
                        </td>
                        <td>
                          {h.return_condition
                            ? <ConditionBadge condition={h.return_condition} size="sm" />
                            : <span className="text-ink-300">—</span>}
                        </td>
                        <td className="text-[13px] text-ink-500 max-w-[16rem]">
                          {h.return_note || h.assign_note || <span className="text-ink-300">—</span>}
                        </td>
                        <td className="print-hide">
                          <div className="flex gap-1">
                            <Button
                              size="xs" variant="ghost" to={`/assignments/${h.id}/bast?type=serah`} target="_blank"
                              title="Cetak berita acara serah"
                            >
                              <i className="fas fa-file-signature text-[11px]" aria-hidden="true" />
                            </Button>
                            {h.returned_at && (
                              <Button
                                size="xs" variant="ghost" to={`/assignments/${h.id}/bast?type=kembali`} target="_blank"
                                title="Cetak berita acara pengembalian"
                              >
                                <i className="fas fa-rotate-left text-[11px]" aria-hidden="true" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ---------- Riwayat status sebagai garis waktu ---------- */}
          <Card padded={false}>
            <CardHeader
              title="Riwayat Status"
              description="Setiap perubahan status tercatat otomatis."
              bordered
            />
            <div className="p-5 sm:p-6">
              {asset.statusHistory.length > 0 ? (
                <ol className="relative space-y-5">
                  {/* Garis vertikal penghubung titik-titik riwayat */}
                  <span className="absolute left-[7px] top-2 bottom-2 w-px bg-ink-200" aria-hidden="true" />
                  {asset.statusHistory.map((h, i) => {
                    const cfg = STATUS_CONFIG[h.new_status];
                    return (
                      <li key={i} className="relative flex gap-4 pl-0">
                        <span
                          className="relative z-10 mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-[3px] border-white ring-1 ring-ink-200"
                          style={{ backgroundColor: cfg?.chart || '#94a3b8' }}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <p className="text-sm text-ink-700">
                            {h.old_status ? (
                              <>
                                <span className="text-ink-500">{STATUS_CONFIG[h.old_status]?.label || h.old_status}</span>
                                <i className="fas fa-arrow-right text-[9px] text-ink-300 mx-2" aria-hidden="true" />
                                <span className="font-semibold text-ink-800">{cfg?.label || h.new_status}</span>
                              </>
                            ) : (
                              <>Dibuat dengan status <span className="font-semibold text-ink-800">{cfg?.label || h.new_status}</span></>
                            )}
                          </p>
                          <p className="text-[11px] text-ink-400 tabular-nums shrink-0">
                            {new Date(h.changed_at).toLocaleString('id-ID', {
                              day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <EmptyState
                  icon="fa-clock-rotate-left"
                  title="Belum ada riwayat"
                  description="Perubahan status aset ini akan muncul di sini."
                  className="py-6"
                />
              )}
            </div>
          </Card>
        </div>

        {/* ================= KOLOM SAMPING ================= */}
        <div className="space-y-5 order-1 lg:order-2 lg:sticky lg:top-20">

          <Card className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-3">Status Saat Ini</p>
            <StatusBadge status={asset.status} size="lg" />
          </Card>

          {/* ---------- Custody: siapa yang sedang memegang ---------- */}
          <Card>
            <CardHeader
              title="Pemegang Aset"
              icon={(p) => <i {...p} className="fas fa-user-tag text-xs" />}
            />

            {asset.currentAssignment ? (
              <div>
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl
                               bg-gradient-to-br from-info-500 to-brand-500 text-white font-semibold"
                    aria-hidden="true"
                  >
                    {asset.currentAssignment.holder_name[0]?.toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-800 truncate">
                      {asset.currentAssignment.holder_name}
                    </p>
                    {asset.currentAssignment.department && (
                      <p className="text-xs text-ink-500 truncate">{asset.currentAssignment.department}</p>
                    )}
                  </div>
                </div>

                <dl className="mt-4 space-y-2 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-400">Sejak</dt>
                    <dd className="text-ink-700 font-medium">{tanggal(asset.currentAssignment.assigned_at)}</dd>
                  </div>
                  {asset.currentAssignment.holder_contact && (
                    <div className="flex justify-between gap-3 min-w-0">
                      <dt className="text-ink-400 shrink-0">Kontak</dt>
                      <dd className="text-ink-700 font-medium truncate">{asset.currentAssignment.holder_contact}</dd>
                    </div>
                  )}
                  {asset.currentAssignment.assign_note && (
                    <div className="pt-2 border-t border-ink-100">
                      <dt className="text-ink-400 mb-1">Catatan</dt>
                      <dd className="text-ink-600 leading-relaxed">{asset.currentAssignment.assign_note}</dd>
                    </div>
                  )}
                </dl>

                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm" variant="secondary" block
                    to={`/assignments/${asset.currentAssignment.id}/bast?type=serah`}
                    target="_blank"
                  >
                    <i className="fas fa-file-signature text-xs" aria-hidden="true" /> Cetak Berita Acara (BAST)
                  </Button>
                  {can('assets', 'edit') && (
                    <Button size="sm" block onClick={() => setShowCheckIn(true)}>
                      <i className="fas fa-rotate-left text-xs" aria-hidden="true" /> Terima Kembali
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-2">
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-ink-100 text-ink-400">
                  <i className="fas fa-user-slash text-sm" aria-hidden="true" />
                </div>
                <p className="text-[13px] text-ink-500">Belum diserahkan ke siapa pun</p>
                <p className="text-[11px] text-ink-400 mt-1 leading-relaxed">
                  Aset ini masih di bawah kendali bagian IT.
                </p>

                {can('assets', 'edit') && !['dijual', 'terjual', 'dipindah'].includes(asset.status) && (
                  <Button size="sm" block className="mt-4" onClick={() => setShowCheckOut(true)}>
                    <i className="fas fa-hand-holding-hand text-xs" aria-hidden="true" /> Serahkan Aset
                  </Button>
                )}
              </div>
            )}
          </Card>

          {asset.qr && (
            <Card className="text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-4">Kode QR Aset</p>

              {asset.qr.image_path ? (
                <div className="inline-block rounded-2xl border border-ink-200 bg-white p-3 shadow-sm">
                  <img src={asset.qr.image_path} alt={`Kode QR untuk ${asset.name}`} className="h-36 w-36" />
                </div>
              ) : (
                <p className="text-xs text-danger-600 py-8">Gambar Kode QR tidak valid.</p>
              )}

              <p className="text-xs text-ink-400 mt-3.5">
                Sudah dipindai <span className="font-semibold text-ink-600 tabular-nums">{asset.qr.scan_count}</span> kali
              </p>

              <div className="flex flex-col gap-2 mt-4">
                <Button to={`/assets/${id}/qr`} variant="secondary" size="sm" block>
                  <i className="fas fa-print text-xs" aria-hidden="true" /> Cetak Label
                </Button>
                {can('assets', 'edit') && (
                  <Button variant="ghost" size="sm" block onClick={handleRegenerateQr} loading={regenerating}>
                    {regenerating ? 'Membuat ulang…' : 'Buat Ulang Kode QR'}
                  </Button>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      {showCheckOut && (
        <CheckOutModal asset={asset} onConfirm={handleCheckOut} onClose={() => setShowCheckOut(false)} />
      )}

      {showCheckIn && asset.currentAssignment && (
        <CheckInModal
          asset={asset}
          assignment={asset.currentAssignment}
          onConfirm={handleCheckIn}
          onClose={() => setShowCheckIn(false)}
        />
      )}
    </>
  );
}
