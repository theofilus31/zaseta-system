import React, { useEffect, useState } from 'react';
import PlatformLayout from '../components/PlatformLayout.jsx';
import platformAxiosClient from '../api/platformAxiosClient.js';
import { useNotification } from '../context/NotificationContext.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Card, { CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { TextField, FormError } from '../components/ui/Form.jsx';

/**
 * ============================================================================
 *  DAFTAR PUTIH IP — KHUSUS ADMIN PLATFORM (Fase 5 SaaS susulan)
 * ============================================================================
 *  Lahir dari insiden nyata: admin platform sempat terkunci pembatas laju
 *  (rate limiter) signupLimiter di tengah pengujian, dan satu-satunya jalan
 *  membukanya lagi saat itu adalah minta developer me-restart server backend
 *  (yang mengosongkan penghitung di memori). Halaman ini memberi admin
 *  platform jalan mandiri: alamat IP yang didaftarkan di sini lewat SEMUA
 *  pembatas laju di aplikasi (login, lupa kata sandi, signup, verifikasi
 *  surel, rute publik) — lihat utils/ipWhitelist.js dan middleware terkait.
 *
 *  BUKAN tenant-scoped -- daftar ini global untuk seluruh sistem, bukan per
 *  tenant, karena pembatas lajunya sendiri juga bekerja per-IP secara global,
 *  di luar konteks tenant mana pun.
 * ============================================================================
 */

function AddIpModal({ myIp, onClose, onAdded }) {
  const [ipAddress, setIpAddress] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError('');
    if (!ipAddress.trim()) {
      setError('Alamat IP wajib diisi.');
      return;
    }
    setSaving(true);
    try {
      await platformAxiosClient.post('/platform/ip-whitelist', { ipAddress: ipAddress.trim(), label: label.trim() || undefined });
      onAdded(`Alamat IP ${ipAddress.trim()} ditambahkan ke daftar putih.`);
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menambahkan alamat IP.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Tambah Alamat IP"
      description="Alamat ini akan lewat semua pembatas laju di aplikasi (masuk, lupa kata sandi, daftar, verifikasi surel, rute publik)."
      icon="fa-network-wired"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Batal</Button>
          <Button size="sm" onClick={handleSave} loading={saving}>Tambah</Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField
          label="Alamat IP" required autoFocus
          value={ipAddress}
          onChange={(e) => setIpAddress(e.target.value)}
          placeholder={myIp || '127.0.0.1'}
          inputClassName="font-mono"
          hint={myIp ? `IP Anda saat ini: ${myIp}` : undefined}
        />
        <TextField
          label="Label (opsional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Mis. Kantor Pusat, Laptop Developer"
        />
        <FormError>{error}</FormError>
      </div>
    </Modal>
  );
}

export default function PlatformIpWhitelist() {
  const { pushSuccess, pushError } = useNotification();
  const [whitelist, setWhitelist] = useState(null);
  const [myIp, setMyIp] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [busyId, setBusyId] = useState(null);

  function load() {
    platformAxiosClient.get('/platform/ip-whitelist')
      .then((res) => { setWhitelist(res.data.whitelist); setMyIp(res.data.myIp); })
      .catch((err) => pushError(err.response?.data?.message || 'Gagal memuat daftar putih IP.'));
  }

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const myIpAlreadyListed = whitelist?.some((w) => w.ipAddress === myIp);

  async function quickAddMyIp() {
    setBusyId('my-ip');
    try {
      await platformAxiosClient.post('/platform/ip-whitelist', { ipAddress: myIp, label: 'Ditambahkan otomatis dari halaman ini' });
      pushSuccess(`IP Anda (${myIp}) ditambahkan ke daftar putih.`);
      load();
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal menambahkan IP Anda.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(entry) {
    if (!confirm(`Hapus ${entry.ipAddress} dari daftar putih? Alamat ini akan kembali tunduk ke pembatas laju biasa.`)) return;
    setBusyId(entry.id);
    try {
      await platformAxiosClient.delete(`/platform/ip-whitelist/${entry.id}`);
      pushSuccess(`${entry.ipAddress} dihapus dari daftar putih.`);
      load();
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal menghapus alamat IP.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PlatformLayout title="Daftar Putih IP" width="narrow">
      <PageHeader
        eyebrow="Admin Platform"
        title="Daftar Putih IP"
        description="Alamat IP di sini lewat semua pembatas laju (rate limiter) — masuk, lupa kata sandi, daftar, verifikasi surel, rute publik."
        actions={<Button size="sm" onClick={() => setShowAdd(true)}>
          <i className="fas fa-plus text-xs" aria-hidden="true" />
          Tambah Alamat IP
        </Button>}
      />

      {myIp && !myIpAlreadyListed && (
        <Card className="mb-6 border-warning-200 bg-warning-50/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <i className="fas fa-circle-info mt-0.5 text-warning-600" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-ink-800">IP Anda saat ini belum ada di daftar putih</p>
                <p className="text-xs text-ink-500 mt-0.5 font-mono">{myIp}</p>
              </div>
            </div>
            <Button size="sm" variant="secondary" loading={busyId === 'my-ip'} onClick={quickAddMyIp}>
              Tambahkan IP Saya
            </Button>
          </div>
        </Card>
      )}

      <Card className="mb-6 border-ink-200/70">
        <p className="text-xs text-ink-500 leading-relaxed">
          <i className="fas fa-triangle-exclamation text-warning-500 mr-1.5" aria-hidden="true" />
          Alamat yang didaftarkan di sini tidak lagi dibatasi jumlah percobaan masuk/daftar/lupa-kata-sandi sama sekali —
          pakai untuk IP tepercaya (kantor, developer) saja, jangan untuk IP publik/bersama yang tidak Anda kendalikan.
        </p>
      </Card>

      <Card padded={false} className="overflow-hidden">
        <CardHeader title="Alamat Terdaftar" bordered />
        {whitelist === null && <div className="p-4"><Skeleton className="h-32 w-full" /></div>}
        {whitelist && whitelist.length === 0 && (
          <div className="p-4">
            <EmptyState icon="fa-network-wired" title="Belum ada alamat IP di daftar putih" />
          </div>
        )}
        {whitelist && whitelist.length > 0 && (
          <div className="divide-y divide-ink-100">
            {whitelist.map((w) => (
              <div key={w.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-mono font-semibold text-ink-800">
                    {w.ipAddress}
                    {w.ipAddress === myIp && (
                      <span className="ml-2 text-[10px] font-sans font-bold uppercase tracking-wide text-brand-600 bg-brand-50 rounded-full px-1.5 py-0.5">
                        IP Anda
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-ink-400 truncate mt-0.5">
                    {w.label || 'Tanpa label'} — ditambahkan {w.createdByName || 'seseorang'} pada{' '}
                    {new Date(w.createdAt).toLocaleDateString('id-ID', { dateStyle: 'medium' })}
                  </p>
                </div>
                <Button size="xs" variant="destructive" loading={busyId === w.id} onClick={() => handleRemove(w)}>
                  Hapus
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {showAdd && (
        <AddIpModal
          myIp={myIp}
          onClose={() => setShowAdd(false)}
          onAdded={(message) => { setShowAdd(false); pushSuccess(message); load(); }}
        />
      )}
    </PlatformLayout>
  );
}
