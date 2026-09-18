import React, { useMemo, useRef, useState } from 'react';
import Card from './Card.jsx';

/**
 * Grafik garis kumulatif dengan hover (crosshair + tooltip) — dipakai
 * Dashboard admin platform untuk "Pertumbuhan Pengguna" dan "Pertumbuhan
 * Tenant Berlangganan" (lihat PlatformDashboard.jsx), ditulis sebagai
 * komponen umum kalau nanti dibutuhkan grafik tren lain (mis. halaman
 * Langganan & Pendapatan).
 *
 * `data`: array {date:'YYYY-MM-DD', value:number|string}, terurut naik,
 * SUDAH kumulatif — komponen ini tidak menjumlahkan apa pun, cuma
 * menggambar. Sumbu Y dibulatkan ke angka "bersih" (bukan nilai maks apa
 * adanya) supaya gridline enak dibaca.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/* PLOT_X0 diberi ruang lebih lapang dari sekadar cukup untuk label jumlah
   pengguna/tenant (biasanya cuma 1-3 digit) — begitu komponen ini dipakai
   untuk nilai Rupiah (lihat PlatformRevenue.jsx), label sumbu-Y-nya bisa
   sepanjang "5.990.000". Dengan PLOT_X0 sekadar 40, label sebesar itu
   tumpang tindih sampai ke luar viewBox (kepotong di tepi kiri, angka
   pertamanya hilang) karena `textAnchor="end"` menggambar teksnya MELEBAR
   KE KIRI dari x = PLOT_X0 - 6. */
const PLOT_X0 = 66;
const PLOT_X1 = 480;
const PLOT_Y0 = 16;
const PLOT_Y1 = 176;
const SVG_W = 500;
const SVG_H = 210;

function niceMax(value) {
  if (!(value > 0)) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  let step;
  if (normalized <= 1) step = 1;
  else if (normalized <= 2) step = 2;
  else if (normalized <= 5) step = 5;
  else step = 10;
  return step * magnitude;
}

function formatDateLabel(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function formatDateFull(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function GrowthChart({ title, subtitle, data, color, tintClass, unitLabel }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);

  const chart = useMemo(() => {
    const points = (data || []).map((d) => ({ date: d.date, value: Number(d.value) || 0 }));
    if (points.length === 0) return null;

    const days = points.length - 1;
    /* Lantai aman di 0, BUKAN 1 — dulu dipaksa minimal 1 supaya Math.max()
       tidak pernah dapat -Infinity, tapi itu juga memaksa niceMax(1)
       dipanggil setiap kali datanya benar-benar nol semua (mis. tenant baru
       belum ada tagihan sama sekali). niceMax(1) menghasilkan maxY=1, dan
       gridline tengahnya (0,5) dibulatkan JADI "1" JUGA — sumbu-Y jadi
       menampilkan "1" dua kali. niceMax(0) sudah punya jalur khusus
       (kembalikan 10) yang justru menghindari tabrakan pembulatan ini. */
    const rawMax = Math.max(...points.map((p) => p.value), 0);
    const maxY = niceMax(rawMax);

    const xFor = (i) => PLOT_X0 + (days === 0 ? 0 : (i / days) * (PLOT_X1 - PLOT_X0));
    const yFor = (v) => PLOT_Y1 - (v / maxY) * (PLOT_Y1 - PLOT_Y0);

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(p.value).toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L${xFor(days).toFixed(1)},${PLOT_Y1} L${xFor(0).toFixed(1)},${PLOT_Y1} Z`;

    const gridLines = [0, 0.5, 1].map((frac) => {
      const val = maxY * frac;
      const y = yFor(val);
      return { y, label: Math.round(val).toLocaleString('id-ID') };
    });

    const tickCount = Math.min(5, points.length);
    const tickIdx = Array.from({ length: tickCount }, (_, i) => Math.round((i / (tickCount - 1 || 1)) * days));
    const xTicks = [...new Set(tickIdx)].map((i, pos, arr) => ({
      x: xFor(i),
      label: formatDateLabel(points[i].date),
      anchor: pos === 0 ? 'start' : pos === arr.length - 1 ? 'end' : 'middle',
    }));

    const first = points[0].value;
    const last = points[days].value;
    const deltaPct = first > 0 ? (((last - first) / first) * 100) : 0;

    return { points, days, maxY, xFor, yFor, linePath, areaPath, gridLines, xTicks, endX: xFor(days), endY: yFor(last), deltaPct, last };
  }, [data]);

  if (!chart) return null;

  function handleMove(evt) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = SVG_W / rect.width;
    const localX = (evt.clientX - rect.left) * scaleX;
    let idx = Math.round(((localX - PLOT_X0) / (PLOT_X1 - PLOT_X0)) * chart.days);
    idx = Math.max(0, Math.min(chart.days, idx));
    setHoverIdx(idx);
  }

  /* Jalur keyboard untuk lapisan tangkap di bawah — panah kiri/kanan
     menggeser satu titik, Home/End loncat ke ujung. `role="slider"` dipilih
     karena ini memang kontrol penjelajah rentang waktu (bukan tombol aksi
     tunggal), dan aria-valuetext dibaca pembaca layar sebagai isi tooltip
     yang sama seperti yang dilihat pengguna pointer. */
  function handleKeyDown(evt) {
    if (evt.key === 'ArrowRight') {
      evt.preventDefault();
      setHoverIdx((i) => Math.min(chart.days, (i ?? chart.days) + 1));
    } else if (evt.key === 'ArrowLeft') {
      evt.preventDefault();
      setHoverIdx((i) => Math.max(0, (i ?? chart.days) - 1));
    } else if (evt.key === 'Home') {
      evt.preventDefault();
      setHoverIdx(0);
    } else if (evt.key === 'End') {
      evt.preventDefault();
      setHoverIdx(chart.days);
    }
  }

  const hovered = hoverIdx !== null ? chart.points[hoverIdx] : null;
  const hoverX = hovered ? chart.xFor(hoverIdx) : 0;
  const hoverY = hovered ? chart.yFor(hovered.value) : 0;
  const tipLeft = hoverX > 300 ? hoverX - 118 : hoverX + 14;
  const tipTop = Math.max(0, hoverY - 40);
  /* Tooltip-nya <div> HTML biasa di atas <svg> yang di-scale (w-full, viewBox
     500x210) -- tipLeft/tipTop di atas dihitung dalam satuan viewBox, BUKAN
     px sungguhan di layar. Kalau lebar SVG yang dirender != 500px (mis. di
     grid dua-chart yang cuma dapat ~350-450px), posisinya meleset kalau
     dipasang langsung sebagai px. Dikonversi ke persentase supaya ikut
     skala yang sama seperti SVG-nya, di lebar mana pun. */
  const tipLeftPct = (tipLeft / SVG_W) * 100;
  const tipTopPct = (tipTop / SVG_H) * 100;

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <p className="text-[14.5px] font-bold text-ink-800">{title}</p>
          {subtitle && <p className="text-xs text-ink-400 mt-1">{subtitle}</p>}
        </div>
        <span className={`text-[11.5px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${tintClass}`}>
          {chart.deltaPct >= 0 ? '▲' : '▼'} {Math.abs(chart.deltaPct).toFixed(1).replace('.', ',')}%
        </span>
      </div>

      <div className="relative mt-3">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full h-auto block"
          onPointerLeave={() => setHoverIdx(null)}
        >
          {/* Seluruh gambar garis/grid/label dekoratif — dijelaskan lewat
              aria-live + tabel tersembunyi di bawah, bukan lewat elemen ini,
              jadi pembaca layar tidak perlu (dan tidak seharusnya) membaca
              puluhan <text> koordinat di dalamnya satu per satu. */}
          <g aria-hidden="true">
            {chart.gridLines.map((gl, i) => (
              <g key={i}>
                <line x1={PLOT_X0} y1={gl.y} x2={PLOT_X1} y2={gl.y} stroke="#e2e8f0" strokeWidth="1" />
                <text x={PLOT_X0 - 6} y={gl.y + 3.5} textAnchor="end" fontSize="10.5" fill="#94a3b8">{gl.label}</text>
              </g>
            ))}
            {chart.xTicks.map((xt, i) => (
              <text key={i} x={xt.x} y={196} textAnchor={xt.anchor} fontSize="10.5" fill="#94a3b8">{xt.label}</text>
            ))}

            <path d={chart.areaPath} fill={color} fillOpacity="0.1" stroke="none" />
            <path d={chart.linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={chart.endX} cy={chart.endY} r="5" fill={color} stroke="#ffffff" strokeWidth="2" />
            {/* Dikunci minimal y=14 -- titik terakhir yang nilainya dekat
                puncak sumbu-Y (endY mendekati PLOT_Y0) sebelumnya membuat
                label ini terdorong ke atas sampai kepotong tepi SVG. */}
            <text x={chart.endX - 10} y={Math.max(chart.endY - 12, 14)} textAnchor="end" fontSize="12" fontWeight="700" fill="#1c2534">
              {Math.round(chart.last).toLocaleString('id-ID')}
            </text>

            {hovered && (
              <>
                <line x1={hoverX} y1={PLOT_Y0} x2={hoverX} y2={PLOT_Y1} stroke="#cbd5e1" strokeWidth="1" />
                <circle cx={hoverX} cy={hoverY} r="5" fill={color} stroke="#ffffff" strokeWidth="2" />
              </>
            )}

            {hoverIdx !== null && (
              <rect
                x={PLOT_X0} y={PLOT_Y0} width={PLOT_X1 - PLOT_X0} height={PLOT_Y1 - PLOT_Y0}
                fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="3 3" rx="2"
              />
            )}
          </g>

          {/* Lapisan tangkap pointer + fokus keyboard — SATU-SATUNYA bagian
              grafik ini yang tetap ada di pohon aksesibilitas. role="slider"
              karena ini kontrol penjelajah rentang waktu: panah kiri/kanan
              menggeser satu titik, Home/End loncat ke ujung (lihat
              handleKeyDown), dan aria-valuetext membacakan isi yang sama
              seperti tooltip pointer. */}
          <rect
            x={PLOT_X0}
            y={PLOT_Y0}
            width={PLOT_X1 - PLOT_X0}
            height={PLOT_Y1 - PLOT_Y0}
            fill="transparent"
            /* outline: 'none' -- tanpa ini browser menggambar kotak fokus
               bawaan (solid, biasanya hitam/biru) mengelilingi SELURUH area
               plot begitu elemen ini fokus/di-tab ke. Sudah ada indikator
               fokus sendiri di sini (rect putus-putus warna brand + garis
               crosshair, lihat blok hoverIdx di atas), jadi kotak bawaan itu
               cuma dobel dan terlihat seperti elemen error/nyasar. */
            style={{ cursor: 'crosshair', outline: 'none' }}
            tabIndex={0}
            role="slider"
            aria-label={`${title}, telusuri per hari`}
            aria-valuemin={0}
            aria-valuemax={chart.days}
            aria-valuenow={hoverIdx ?? chart.days}
            aria-valuetext={
              hovered
                ? `${formatDateFull(hovered.date)}: ${Math.round(hovered.value).toLocaleString('id-ID')} ${unitLabel}`
                : `${formatDateFull(chart.points[chart.days].date)}: ${Math.round(chart.last).toLocaleString('id-ID')} ${unitLabel} (terbaru)`
            }
            onPointerMove={handleMove}
            onKeyDown={handleKeyDown}
            onFocus={() => setHoverIdx((i) => (i === null ? chart.days : i))}
            onBlur={() => setHoverIdx(null)}
          />
        </svg>

        {hovered && (
          <div
            className="absolute pointer-events-none rounded-lg bg-ink-900 px-2.5 py-1.5 shadow-raised"
            style={{ left: `${tipLeftPct}%`, top: `${tipTopPct}%` }}
          >
            <p className="text-[13px] font-bold text-white leading-tight">
              {Math.round(hovered.value).toLocaleString('id-ID')} {unitLabel}
            </p>
            <p className="text-[10.5px] text-white/55 mt-0.5">{formatDateFull(hovered.date)}</p>
          </div>
        )}
      </div>

      {/* Fallback penuh untuk pembaca layar -- data yang sama persis dengan
          grafik visual, dalam bentuk tabel biasa yang bisa dijelajahi tanpa
          bergantung pada interaksi pointer/keyboard di atas sama sekali. */}
      <table className="sr-only">
        <caption>{title} — data harian{subtitle ? `, ${subtitle}` : ''}</caption>
        <thead>
          <tr><th scope="col">Tanggal</th><th scope="col">{unitLabel}</th></tr>
        </thead>
        <tbody>
          {chart.points.map((p) => (
            <tr key={p.date}>
              <td>{formatDateFull(p.date)}</td>
              <td>{Math.round(p.value).toLocaleString('id-ID')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
