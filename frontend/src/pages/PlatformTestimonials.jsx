import React, { useEffect, useState } from 'react';
import PlatformLayout from '../components/PlatformLayout.jsx';
import axiosClient from '../api/axiosClient.js';
import { useNotification } from '../context/NotificationContext.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { Badge } from '../components/ui/StatusBadge.jsx';
import { SegmentedControl } from '../components/ui/Button.jsx';

/**
 * ============================================================================
 *  TINJAU TESTIMONI — KHUSUS ADMIN PLATFORM
 * ============================================================================
 *  Testimoni diisi tenant lewat popup di dalam aplikasi (lihat
 *  components/TestimonialPrompt.jsx, ditawarkan tiap kelipatan 3 login) dan
 *  TIDAK PERNAH langsung tampil publik — halaman ini tempat menyetujui/
 *  menolaknya sebelum muncul di landing page (GET /public/testimonials
 *  hanya mengembalikan yang berstatus 'approved').
 * ============================================================================
 */

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Menunggu' },
  { value: 'approved', label: 'Disetujui' },
  { value: 'rejected', label: 'Ditolak' },
  { value: 'all', label: 'Semua' },
];

const STATUS_TONE = { pending: 'warning', approved: 'brand', rejected: 'danger' };
const STATUS_LABEL = { pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak' };

function Stars({ rating }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} dari 5 bintang`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <i key={n} className={`fas fa-star text-[11px] ${n <= rating ? 'text-warning-400' : 'text-ink-200'}`} aria-hidden="true" />
      ))}
    </div>
  );
}

export default function PlatformTestimonials() {
  const { pushSuccess, pushError } = useNotification();
  const [status, setStatus] = useState('pending');
  const [testimonials, setTestimonials] = useState(null);
  const [busyId, setBusyId] = useState(null);

  function load() {
    setTestimonials(null);
    axiosClient.get('/platform/testimonials', { params: { status } })
      .then((res) => setTestimonials(res.data.testimonials))
      .catch((err) => pushError(err.response?.data?.message || 'Gagal memuat testimoni.'));
  }

  useEffect(load, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function resolve(id, approve) {
    setBusyId(id);
    try {
      await axiosClient.post(`/platform/testimonials/${id}/${approve ? 'approve' : 'reject'}`);
      pushSuccess(approve ? 'Testimoni disetujui, sekarang tampil di landing page.' : 'Testimoni ditolak.');
      load();
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal memproses testimoni.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PlatformLayout title="Testimoni" width="narrow">
      <PageHeader
        eyebrow="Admin Platform"
        title="Tinjau Testimoni"
        description="Testimoni yang disetujui langsung tampil di landing page — belum ada di sana sebelum ditinjau di sini."
      />

      <div className="mb-5">
        <SegmentedControl options={STATUS_OPTIONS} value={status} onChange={setStatus} size="sm" />
      </div>

      <Card padded={false} className="overflow-hidden">
        <CardHeader title="Daftar Testimoni" bordered />
        {testimonials === null && <div className="p-4"><Skeleton className="h-32 w-full" /></div>}
        {testimonials && testimonials.length === 0 && (
          <div className="p-4">
            <EmptyState icon="fa-star" title="Tidak ada testimoni di sini" />
          </div>
        )}
        {testimonials && testimonials.length > 0 && (
          <div className="divide-y divide-ink-100">
            {testimonials.map((t) => (
              <div key={t.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <p className="text-[13px] font-bold text-ink-800">{t.authorName}</p>
                    <span className="text-[11.5px] text-ink-400">
                      {[t.authorRole, t.companyName].filter(Boolean).join(' · ')}
                    </span>
                    <Badge tone={STATUS_TONE[t.status]} size="sm">{STATUS_LABEL[t.status]}</Badge>
                  </div>
                  <Stars rating={t.rating} />
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-700">{t.message}</p>
                  <p className="mt-1.5 text-[11px] text-ink-400">
                    {new Date(t.createdAt).toLocaleDateString('id-ID', { dateStyle: 'medium' })}
                  </p>
                </div>
                {t.status === 'pending' && (
                  <div className="flex shrink-0 gap-2">
                    <Button size="xs" variant="secondary" loading={busyId === t.id} onClick={() => resolve(t.id, false)}>Tolak</Button>
                    <Button size="xs" loading={busyId === t.id} onClick={() => resolve(t.id, true)}>Setujui</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </PlatformLayout>
  );
}
