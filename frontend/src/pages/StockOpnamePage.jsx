import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axiosClient from '../api/axiosClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useNotification } from '../context/NotificationContext.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Card from '../components/ui/Card.jsx';
import Button, { SegmentedControl } from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Pagination from '../components/ui/Pagination.jsx';
import { SkeletonList } from '../components/ui/Skeleton.jsx';
import { TextField, SearchableSelect, TextareaField } from '../components/ui/Form.jsx';
import { OpnameProgressBar, OPNAME_STATUS } from '../components/opname/OpnameBits.jsx';

/**
 * ============================================================================
 *  STOK OPNAME — DAFTAR SESI
 * ============================================================================
 *  Halaman ini sengaja menaruh sesi yang masih BERJALAN paling atas dan
 *  memberinya batang kemajuan: selama pemeriksaan berlangsung, satu-satunya
 *  hal yang ingin diketahui orang adalah "tinggal berapa lagi?".
 * ============================================================================
 */

export default function StockOpnamePage() {
  const { can } = useAuth();
  const { pushError, pushSuccess } = useNotification();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const muat = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosClient.get('/opnames', { params: { status: status || undefined, page } });
      setSessions(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal memuat daftar opname.');
    } finally {
      setLoading(false);
    }
  }, [status, page, pushError]);

  useEffect(() => { muat(); }, [muat]);

  async function handleCreated(res) {
    setShowCreate(false);
    pushSuccess(res.message);
    navigate(`/opname/${res.id}`);
  }

  return (
    <>
      <PageHeader
        title="Stok Opname"
        description="Pemeriksaan fisik aset: cocokkan yang tercatat dengan yang benar-benar ada di ruangan."
        actions={can('opname', 'create') && (
          <Button onClick={() => setShowCreate(true)}>
            <i className="fas fa-plus text-xs" aria-hidden="true" /> Sesi Baru
          </Button>
        )}
      />

      <div className="mb-5">
        <SegmentedControl
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={[
            { value: '', label: 'Semua' },
            { value: 'berjalan', label: 'Berjalan' },
            { value: 'selesai', label: 'Selesai' },
            { value: 'dibatalkan', label: 'Dibatalkan' },
          ]}
        />
      </div>

      {loading ? (
        <Card><SkeletonList count={4} /></Card>
      ) : sessions.length === 0 ? (
        <Card>
          <EmptyState
            icon="fa-clipboard-check"
            title={status ? 'Tidak ada sesi dengan status itu' : 'Belum pernah ada stok opname'}
            description="Buka sesi baru untuk mulai memeriksa aset per ruangan. Daftar periksanya dibuat otomatis dari data aset yang tercatat di lokasi itu."
            action={can('opname', 'create') && !status && (
              <Button onClick={() => setShowCreate(true)}>
                <i className="fas fa-plus text-xs" aria-hidden="true" /> Buka Sesi Pertama
              </Button>
            )}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => <SessionRow key={s.id} session={s} />)}
        </div>
      )}

      {pagination.totalPages > 1 && (
        <Pagination
          className="mt-5"
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalItems={pagination.total}
          onChange={setPage}
        />
      )}

      {showCreate && (
        <CreateOpnameModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function SessionRow({ session }) {
  const s = session.summary;
  const diperiksa = s.total - s.belum;
  const cakupan = [session.location_name, session.sub_location_name, session.category_name]
    .filter(Boolean).join(' · ') || 'Seluruh aset aktif';
  const tone = OPNAME_STATUS[session.status];

  return (
    <Card
      as={Link}
      to={`/opname/${session.id}`}
      padded={false}
      interactive
      className="block p-5 hover:border-brand-300 transition-colors"
    >
      <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[11px] text-ink-400">{session.code}</span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5
                                text-[11px] font-semibold ring-1 ring-inset ${tone.className}`}>
                <i className={`fas ${tone.icon} text-[9px]`} aria-hidden="true" />
                {tone.label}
              </span>
            </div>
            <p className="text-[15px] font-semibold text-ink-800 mt-1 truncate">{session.name}</p>
            <p className="text-xs text-ink-400 mt-0.5 truncate">{cakupan}</p>
          </div>

          <div className="text-right shrink-0">
            <p className="text-[22px] font-bold tabular-nums text-ink-900 leading-none">
              {diperiksa}<span className="text-ink-300 text-base">/{s.total}</span>
            </p>
            <p className="text-[11px] text-ink-400 mt-1">aset diperiksa</p>
          </div>
        </div>

        <OpnameProgressBar summary={s} className="mt-4" />
      </>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Pembuatan sesi. Cakupan dibiarkan opsional supaya opname kecil ("cuma
 * ruang server hari ini") sama mudahnya dengan opname seluruh kantor —
 * kalau setiap opname harus mencakup semuanya, tidak akan pernah dikerjakan.
 */
function CreateOpnameModal({ onClose, onCreated }) {
  const { pushError } = useNotification();

  const [form, setForm] = useState({ name: '', locationId: '', subLocationId: '', categoryId: '', notes: '' });
  const [locations, setLocations] = useState([]);
  const [subLocations, setSubLocations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      axiosClient.get('/locations'),
      axiosClient.get('/categories'),
    ]).then(([loc, cat]) => {
      setLocations(loc.data.data || loc.data);
      setCategories(cat.data.data || cat.data);
    }).catch(() => pushError('Gagal memuat daftar lokasi/kategori.'));
  }, [pushError]);

  useEffect(() => {
    if (!form.locationId) { setSubLocations([]); return; }
    axiosClient.get('/sub-locations', { params: { locationId: form.locationId } })
      .then((res) => setSubLocations(res.data.data || res.data))
      .catch(() => setSubLocations([]));
  }, [form.locationId]);

  const set = (k) => (e) => setForm((f) => ({
    ...f,
    [k]: e.target.value,
    ...(k === 'locationId' ? { subLocationId: '' } : {}),
  }));
  const setV = (k) => (value) => setForm((f) => ({
    ...f,
    [k]: value,
    ...(k === 'locationId' ? { subLocationId: '' } : {}),
  }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await axiosClient.post('/opnames', {
        name: form.name,
        locationId: form.locationId || null,
        subLocationId: form.subLocationId || null,
        categoryId: form.categoryId || null,
        notes: form.notes || null,
      });
      onCreated(res.data);
    } catch (err) {
      pushError(err.response?.data?.message || 'Gagal membuka sesi opname.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Buka Sesi Opname"
      description="Daftar periksa dibekukan dari data aset saat sesi dibuka."
      icon="fa-clipboard-check"
      onClose={onClose}
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Batal</Button>
          <Button onClick={submit} loading={saving}>Buka Sesi</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <TextField
          label="Nama Sesi" required
          value={form.name} onChange={set('name')}
          placeholder="Opname Lantai 2 — Agustus 2026"
          hint="Nama yang mudah dikenali saat dicari lagi tahun depan."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SearchableSelect
            label="Lokasi" value={form.locationId} onChange={setV('locationId')}
            options={locations} getOptionLabel={(l) => `${l.code} — ${l.name}`}
            placeholder="Cari lokasi…" emptyLabel="Semua lokasi"
          />

          <SearchableSelect
            label="Sub Lokasi" value={form.subLocationId} onChange={setV('subLocationId')}
            disabled={!form.locationId}
            hint={!form.locationId ? 'Pilih lokasi lebih dulu.' : undefined}
            options={subLocations} getOptionLabel={(s) => `${s.code} — ${s.name}`}
            placeholder="Cari sub lokasi…" emptyLabel="Semua sub lokasi"
          />
        </div>

        <SearchableSelect
          label="Kode Barang/Aset" value={form.categoryId} onChange={setV('categoryId')}
          hint="Kosongkan untuk memeriksa semua jenis barang di lokasi tersebut."
          options={categories} placeholder="Cari kode barang/aset…" emptyLabel="Semua jenis"
        />

        <TextareaField
          label="Catatan" value={form.notes} onChange={set('notes')}
          placeholder="Mis. opname rutin akhir semester"
        />

        <p className="flex gap-2.5 rounded-xl bg-info-50 px-3.5 py-3 text-xs text-info-700 leading-relaxed">
          <i className="fas fa-circle-info mt-0.5 shrink-0" aria-hidden="true" />
          Aset yang sudah terjual, hilang, atau dihapuskan tidak ikut diperiksa.
        </p>
      </form>
    </Modal>
  );
}
