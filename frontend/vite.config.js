import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true }, // host: true = bind ke 0.0.0.0, bisa diakses dari IP LAN
});
