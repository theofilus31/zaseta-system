import React, { useEffect, useRef, useState } from 'react';

/**
 * ============================================================================
 *  PETA TITIK BERANIMASI — panel kiri Login.jsx
 * ============================================================================
 *  Latar animasi untuk panel identitas di halaman Masuk: kisi titik
 *  membentuk siluet peta dunia, dengan beberapa "rute" bergerak di
 *  atasnya (canvas 2D, bukan library peta sungguhan — cuma dekorasi).
 *
 *  Warna SENGAJA mengikuti token brand/info aplikasi (hijau & biru — dua
 *  warna daun di logo RMS, lihat catatan di tailwind.config.js), bukan
 *  biru/indigo generik. Titik dasarnya putih transparan tipis supaya
 *  kebaca di atas panel gelap (lihat pemakaiannya di Login.jsx), beda dari
 *  versi aslinya yang dirancang untuk latar terang.
 *
 *  Menghormati prefers-reduced-motion: kalau pengguna memintanya, rute
 *  cuma digambar diam di posisi akhir (tanpa requestAnimationFrame terus
 *  berjalan), titik latar tetap tampil sebagai tekstur statis.
 * ============================================================================
 */
const ROUTES = [
  { start: { x: 100, y: 150, delay: 0 }, end: { x: 200, y: 80, delay: 2 } },
  { start: { x: 200, y: 80, delay: 2 }, end: { x: 260, y: 120, delay: 4 } },
  { start: { x: 50, y: 50, delay: 1 }, end: { x: 150, y: 180, delay: 3 } },
  { start: { x: 280, y: 60, delay: 0.5 }, end: { x: 180, y: 180, delay: 2.5 } },
];

const LINE_COLOR = '#4a90c4'; // info-400
const POINT_COLOR = '#54b95d'; // brand-400
const GLOW_COLOR = 'rgba(84, 185, 93, 0.35)'; // brand-400 tint

function generateDots(width, height) {
  const dots = [];
  const gap = 12;

  for (let x = 0; x < width; x += gap) {
    for (let y = 0; y < height; y += gap) {
      const isInMapShape =
        ((x < width * 0.25 && x > width * 0.05) && (y < height * 0.4 && y > height * 0.1)) || // Amerika Utara
        ((x < width * 0.25 && x > width * 0.15) && (y < height * 0.8 && y > height * 0.4)) || // Amerika Selatan
        ((x < width * 0.45 && x > width * 0.3) && (y < height * 0.35 && y > height * 0.15)) || // Eropa
        ((x < width * 0.5 && x > width * 0.35) && (y < height * 0.65 && y > height * 0.35)) || // Afrika
        ((x < width * 0.7 && x > width * 0.45) && (y < height * 0.5 && y > height * 0.1)) || // Asia
        ((x < width * 0.8 && x > width * 0.65) && (y < height * 0.8 && y > height * 0.6)); // Australia

      if (isInMapShape && Math.random() > 0.3) {
        dots.push({ x, y, opacity: Math.random() * 0.35 + 0.12 });
      }
    }
  }
  return dots;
}

export default function DotMap() {
  const canvasRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
      canvas.width = width;
      canvas.height = height;
    });

    resizeObserver.observe(canvas.parentElement);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!dimensions.width || !dimensions.height) return undefined;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return undefined;

    const dots = generateDots(dimensions.width, dimensions.height);
    let animationFrameId;
    let startTime = Date.now();

    function drawDots() {
      ctx.clearRect(0, 0, dimensions.width, dimensions.height);
      dots.forEach((dot) => {
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, 1, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${dot.opacity})`;
        ctx.fill();
      });
    }

    function drawRoute(route, progress) {
      const x = route.start.x + (route.end.x - route.start.x) * progress;
      const y = route.start.y + (route.end.y - route.start.y) * progress;

      ctx.beginPath();
      ctx.moveTo(route.start.x, route.start.y);
      ctx.lineTo(x, y);
      ctx.strokeStyle = LINE_COLOR;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(route.start.x, route.start.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = LINE_COLOR;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = GLOW_COLOR;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = POINT_COLOR;
      ctx.fill();
    }

    if (reducedMotion) {
      drawDots();
      ROUTES.forEach((route) => drawRoute(route, 1));
      return undefined;
    }

    function animate() {
      const currentTime = (Date.now() - startTime) / 1000;
      drawDots();
      ROUTES.forEach((route) => {
        const elapsed = currentTime - route.start.delay;
        if (elapsed <= 0) return;
        drawRoute(route, Math.min(elapsed / 3, 1));
      });
      if (currentTime > 15) startTime = Date.now(); // ulangi dari awal
      animationFrameId = requestAnimationFrame(animate);
    }
    animate();

    return () => cancelAnimationFrame(animationFrameId);
  }, [dimensions, reducedMotion]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
