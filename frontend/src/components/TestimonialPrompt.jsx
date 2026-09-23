import React, { useEffect, useMemo, useState } from 'react';
import axiosClient from '../api/axiosClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import Modal from './ui/Modal.jsx';
import Button from './ui/Button.jsx';
import { TextareaField, TextField, FormError } from './ui/Form.jsx';

/**
 * ============================================================================
 *  POPUP PERMINTAAN TESTIMONI
 * ============================================================================
 *  Ditawarkan tiap KELIPATAN 3 KALI LOGIN (users.login_count, dinaikkan di
 *  authController.login/googleLogin) selama pengguna belum pernah mengisi
 *  ATAU memilih "Lewati" (users.testimonial_status, lihat
 *  migration_add_testimonials.sql). Tiga aksi:
 *  - Kirim   -> POST /testimonials, status jadi 'submitted', tidak ditawarkan lagi.
 *  - Lewati  -> POST /testimonials/skip, status jadi 'skipped', tidak
 *               ditawarkan lagi SELAMANYA.
 *  - Ingatkan Nanti -> SENGAJA tidak memanggil API apa pun. Status tetap
 *               'none', jadi otomatis ditawarkan lagi begitu login_count
 *               mencapai kelipatan 3 berikutnya -- tidak perlu kolom
 *               "pengingat" terpisah.
 *
 *  sessionStorage (BUKAN localStorage) mencegah popup muncul BERULANG KALI
 *  pada login_count YANG SAMA selama satu sesi tab (mis. pengguna me-refresh
 *  halaman berkali-kali) -- kuncinya menyertakan angka login_count itu
 *  sendiri, jadi begitu login_count naik lagi (login baru), kuncinya beda
 *  dan popup boleh muncul lagi secara alami.
 */
export default function TestimonialPrompt() {
  const { user, setUser } = useAuth();
  const { pushSuccess, pushError } = useNotification();

  const eligible = useMemo(() => {
    const count = Number(user?.loginCount) || 0;
    return Boolean(
      user
      && user.testimonialStatus === 'none'
      && count > 0
      && count % 3 === 0
    );
  }, [user]);

  const sessionKey = user ? `zenta_testimonial_seen_${user.id}_${user.loginCount}` : null;

  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!eligible || !sessionKey) return;
    try {
      if (sessionStorage.getItem(sessionKey)) return;
    } catch {
      // sessionStorage bisa gagal (mode privat, dst.) -- kalau begitu biarkan
      // popup tetap boleh tampil, lebih baik tampil lagi daripada tidak
      // pernah tampil sama sekali karena penyimpanan gagal.
    }
    setOpen(true);
  }, [eligible, sessionKey]);

  function markSeen() {
    if (!sessionKey) return;
    try { sessionStorage.setItem(sessionKey, '1'); } catch { /* lihat catatan di atas */ }
  }

  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [authorRole, setAuthorRole] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [skipping, setSkipping] = useState(false);

  function close() {
    setOpen(false);
    markSeen();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!rating) { setError('Pilih rating bintang dulu.'); return; }
    if (!message.trim()) { setError('Ceritakan pengalaman Anda sedikit.'); return; }

    setSubmitting(true);
    setError('');
    try {
      await axiosClient.post('/testimonials', { rating, message: message.trim(), authorRole: authorRole.trim() || undefined });
      setUser((prev) => {
        const merged = { ...prev, testimonialStatus: 'submitted' };
        localStorage.setItem('user', JSON.stringify(merged));
        return merged;
      });
      pushSuccess('Terima kasih atas testimoninya!');
      close();
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal mengirim testimoni.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSkip() {
    setSkipping(true);
    try {
      await axiosClient.post('/testimonials/skip');
      setUser((prev) => {
        const merged = { ...prev, testimonialStatus: 'skipped' };
        localStorage.setItem('user', JSON.stringify(merged));
        return merged;
      });
      close();
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal menyimpan pilihan.');
    } finally {
      setSkipping(false);
    }
  }

  if (!open) return null;

  return (
    <Modal
      title="Bagaimana pengalaman Anda?"
      description="Testimoni singkat Anda membantu tim kami dan calon pengguna lain."
      icon="fa-star"
      iconTone="warning"
      onClose={close}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={close} disabled={submitting || skipping}>Ingatkan Nanti</Button>
          <Button variant="secondary" size="sm" onClick={handleSkip} loading={skipping} disabled={submitting}>Lewati</Button>
          <Button size="sm" onClick={handleSubmit} loading={submitting} disabled={skipping}>Kirim Testimoni</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="label">Rating</p>
          <div className="flex items-center gap-1" onMouseLeave={() => setHoverRating(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                onMouseEnter={() => setHoverRating(n)}
                className="p-0.5 text-2xl transition-colors"
                aria-label={`${n} bintang`}
              >
                <i
                  className={`fas fa-star ${(hoverRating || rating) >= n ? 'text-warning-400' : 'text-ink-200'}`}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </div>

        <TextField
          label="Jabatan Anda (opsional)"
          value={authorRole}
          onChange={(e) => setAuthorRole(e.target.value)}
          placeholder="Mis. Manajer IT, Staf GA"
          maxLength={150}
        />

        <TextareaField
          label="Testimoni"
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ceritakan bagaimana Zaseta membantu pekerjaan Anda…"
          maxLength={1000}
        />

        <p className="text-xs text-ink-400 leading-relaxed">
          Nama, jabatan, dan nama perusahaan Anda akan ditampilkan APA ADANYA kalau testimoni ini disetujui untuk tampil di halaman depan Zaseta.
        </p>

        <FormError>{error}</FormError>
      </form>
    </Modal>
  );
}
