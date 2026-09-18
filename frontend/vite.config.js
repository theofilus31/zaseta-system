import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Alias '@' -> 'src' -- konvensi shadcn/ui (lihat components.json), dipakai
// komponen di src/components/ui/*.tsx (chart/card/button/badge/avatar) yang
// mengimpor '@/lib/utils' dst. Kode lama proyek ini TIDAK memakainya sama
// sekali (semua import relatif, mis. '../components/ui/Card.jsx') dan tidak
// perlu diubah -- alias ini murni tambahan, tidak menggantikan apa pun.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5173, host: true }, // host: true = bind ke 0.0.0.0, bisa diakses dari IP LAN
});
