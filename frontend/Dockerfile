# ============================================================================
#  FRONTEND — build Vite, disajikan lewat Nginx
# ============================================================================
#  Belum diuji build sungguhan di lingkungan ini (Docker tidak tersedia saat
#  ditulis) -- coba `docker build .` dulu di mesin yang punya Docker sebelum
#  dipakai deploy sungguhan.
#
#  VITE_API_URL/VITE_GOOGLE_CLIENT_ID di-BAKE ke berkas hasil build saat
#  `npm run build` (batas Vite -- env var frontend selalu waktu-build, bukan
#  waktu-jalan) -- WAJIB dioper sebagai --build-arg, bukan cuma --env-file
#  saat `docker run` (itu sudah terlambat, buildnya sudah kelar).
#
#  Build : docker build --build-arg VITE_API_URL=https://api.contoh.com/api
#                        --build-arg VITE_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
#                        -t zaseta-frontend .
#  Jalan : docker run -p 8080:80 zaseta-frontend
# ============================================================================
FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_API_URL
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
