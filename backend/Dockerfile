# ============================================================================
#  BACKEND — image produksi
# ============================================================================
#  Belum diuji build sungguhan di lingkungan ini (Docker tidak tersedia saat
#  ditulis) -- coba `docker build .` dulu di mesin yang punya Docker sebelum
#  dipakai deploy sungguhan.
#
#  Skema database TIDAK dijalankan otomatis oleh image ini -- jalankan
#  `psql -f schema.postgres.sql` (instalasi baru) sekali secara terpisah
#  terhadap database produksi sebelum container ini pertama kali dinyalakan.
#
#  Build : docker build -t zaseta-backend .
#  Jalan : docker run -p 4000:4000 --env-file .env zaseta-backend
#  (Variabel wajib: lihat .env.example di folder ini -- JWT_SECRET, DB_*, dst.)
# ============================================================================
FROM node:20-alpine

WORKDIR /app

# Cache layer terpisah: dependency cuma diinstal ulang kalau package*.json
# berubah, bukan setiap kali kode sumber berubah.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 4000

CMD ["node", "src/server.js"]
