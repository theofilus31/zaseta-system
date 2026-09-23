import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatformAuth } from '../context/PlatformAuthContext.jsx';
import PasswordInput from '../components/ui/PasswordInput.jsx';
import Button from '../components/ui/Button.jsx';
import { TextField, FormError } from '../components/ui/Form.jsx';
import ProductBrandMark from '../components/ProductBrandMark.jsx';

/**
 * ============================================================================
 *  LOGIN ADMIN PLATFORM — /platform/login
 * ============================================================================
 *  SENGAJA TIDAK DITAUTKAN dari halaman mana pun yang bisa dibuka publik
 *  (landing page, /login, /:slug/login) -- permintaan eksplisit pemilik
 *  produk: publik tidak boleh tahu jalur masuk admin platform ini sama
 *  sekali, hanya bisa dibuka lewat mengetik URL-nya langsung. Tampilannya
 *  juga sengaja polos (tanpa peta beranimasi/split-panel seperti Login.jsx)
 *  supaya tidak terlihat seperti pintu masuk produk yang "wajar" ditemukan.
 *
 *  Sesi di sini lewat PlatformAuthContext (TERPISAH TOTAL dari AuthContext
 *  tenant) -- lihat migration_separate_platform_admins.sql.
 * ============================================================================
 */
export default function PlatformLogin() {
  const { login } = usePlatformAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/platform/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal masuk. Periksa nama pengguna dan kata sandi Anda.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh w-full flex items-center justify-center bg-ink-950 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-ink-200/70 shadow-overlay p-8">
        <ProductBrandMark tone="light" className="mb-8 justify-center" />

        <h1 className="text-xl font-black text-ink-900 tracking-tight text-center mb-1">Admin Platform</h1>
        <p className="text-sm text-ink-500 text-center mb-7">Khusus staf internal.</p>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <TextField
            label="Nama Pengguna atau Surel"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            required
            autoFocus
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
          />
          <PasswordInput
            label="Kata Sandi"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <FormError>{error}</FormError>
          <Button type="submit" size="lg" pill block loading={loading}>
            {loading ? 'Memproses…' : 'Masuk'}
          </Button>
        </form>
      </div>
    </div>
  );
}
