'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/sc-card';
import { ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/sc-line-charts-9';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';

/**
 * Chart tren kumulatif gaya "Current Balance" (lihat sc-line-charts-9-demo.tsx,
 * pratinjau statis masih ada di /dev/chart-demo) -- versi generik yang dipakai
 * ulang untuk SEMUA grafik pertumbuhan di dashboard (admin platform maupun
 * tenant), menggantikan GrowthChart.jsx (SVG buatan sendiri) sepenuhnya.
 * Dipakai oleh PlatformRevenue.jsx (pendapatan, format Rupiah) dan
 * PlatformDashboard.jsx (pertumbuhan pengguna/tenant, format angka biasa) --
 * format nilai (Rupiah vs angka polos) diserahkan ke pemanggil lewat
 * `formatFull`/`formatAxis`, supaya komponen ini sendiri tidak perlu tahu
 * jenis satuannya.
 *
 * Beberapa elemen dekoratif di demo asli dibuang karena tidak punya makna
 * dengan data sungguhan: ReferenceLine di tanggal tertentu ("Jan 17") dan
 * pemicu dot berdasar nilai ambang batas hardcode -- di sini dot yang selalu
 * ditandai adalah titik pertama & terakhir dari rentang yang dipilih.
 */

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function formatDateLabel(isoDate: string) {
  const d = new Date(isoDate + 'T00:00:00');
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

function formatDateFull(isoDate: string) {
  const d = new Date(isoDate + 'T00:00:00');
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

// ink-400 (lihat tailwind.config.js) -- sama seperti warna label sumbu di GrowthChart.jsx
const AXIS_COLOR = '#94a3b8';

interface DataPoint {
  date: string;
  value: number;
}

interface LineChartCardProps {
  data: DataPoint[];
  /** Judul kecil di atas angka besar, mis. "Pendapatan Terkumpul" / "Pengguna Sudah Login". */
  headerLabel: string;
  /** Angka besar di header -- biasanya total/terkini, BUKAN cuma nilai terakhir di rentang chart (lihat totalRevenue di PlatformRevenue.jsx). */
  headerValue: number;
  rangeLabel: string;
  /** Warna garis & dot -- ambil dari salah satu dari 3 warna utama sistem ini (brand/info/warning, lihat tailwind.config.js), bukan warna lepas. */
  color: string;
  /** Format lengkap: header besar, tooltip, "Bertambah periode ini". */
  formatFull: (v: number) => string;
  /** Format ringkas: sumbu-Y & Tertinggi/Terendah -- boleh sertakan prefix/suffix satuan sendiri (mis. "Rp 1,2 jt"). */
  formatAxis: (v: number) => string;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DataPoint }>;
}

function makeTooltip(formatFull: (v: number) => string) {
  return function ChartCustomTooltip({ active, payload }: TooltipProps) {
    if (active && payload && payload.length) {
      const point = payload[0].payload;
      return (
        <div className="bg-sc-popover border border-sc-border rounded-lg p-3 shadow-lg">
          <div className="text-sm text-sc-muted-foreground mb-1">{formatDateFull(point.date)}</div>
          <div className="text-base font-bold">{formatFull(point.value)}</div>
        </div>
      );
    }
    return null;
  };
}

export default function LineChartCard({ data, headerLabel, headerValue, rangeLabel, color, formatFull, formatAxis }: LineChartCardProps) {
  const points = (data || []).map((d) => ({ date: d.date, value: Number(d.value) || 0 }));
  const first = points[0]?.value ?? 0;
  const last = points[points.length - 1]?.value ?? 0;
  const periodGain = last - first;
  const deltaPct = first > 0 ? ((last - first) / first) * 100 : (last > 0 ? 100 : 0);
  const isUp = deltaPct >= 0;
  const highValue = points.length ? Math.max(...points.map((p) => p.value)) : 0;
  const lowValue = points.length ? Math.min(...points.map((p) => p.value)) : 0;
  const isFlatZero = highValue === 0 && lowValue === 0;
  const firstDate = points[0]?.date;
  const lastDate = points[points.length - 1]?.date;

  if (points.length === 0) return null;

  const chartConfig = { value: { label: headerLabel, color } } satisfies ChartConfig;
  const CustomTooltip = makeTooltip(formatFull);

  return (
    <Card className="w-full">
      <CardContent className="flex flex-col items-stretch gap-5">
        <div>
          <h3 className="text-base text-sc-muted-foreground font-medium mb-1">{headerLabel}</h3>
          <div className="flex flex-wrap items-baseline gap-1.5 sm:gap-3.5">
            <span className="text-4xl font-bold">{formatFull(headerValue)}</span>
            <div className={`flex items-center gap-1 ${isUp ? 'text-brand-600' : 'text-danger-600'}`}>
              {isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span className="font-medium">
                {isUp ? '+' : ''}
                {deltaPct.toFixed(1).replace('.', ',')}%
              </span>
              <span className="text-sc-muted-foreground font-normal">{rangeLabel}</span>
            </div>
          </div>
        </div>

        <div className="grow">
          <div className="flex items-center justify-between flex-wrap gap-2.5 text-sm mb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sc-muted-foreground">Bertambah periode ini:</span>
              <span className="font-semibold">{formatFull(periodGain)}</span>
            </div>
            <div className="flex items-center gap-6 text-sc-muted-foreground">
              <span>
                Tertinggi: <span className="text-info-600 font-medium">{formatAxis(highValue)}</span>
              </span>
              <span>
                Terendah: <span className="text-warning-600 font-medium">{formatAxis(lowValue)}</span>
              </span>
            </div>
          </div>

          <ChartContainer
            config={chartConfig}
            className="h-72 w-full [&_.recharts-curve.recharts-tooltip-cursor]:stroke-transparent"
          >
            <ComposedChart data={points} margin={{ top: 20, right: 10, left: 5, bottom: 20 }}>
              <defs>
                <pattern id="lineChartDotGrid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="10" cy="10" r="1" fill="var(--sc-input)" fillOpacity="0.3" />
                </pattern>
                <filter id="lineChartDotShadow" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="2" dy="3" stdDeviation="3" floodColor="rgba(0,0,0,0.8)" />
                </filter>
              </defs>

              <rect x="0" y="0" width="100%" height="100%" fill="url(#lineChartDotGrid)" style={{ pointerEvents: 'none' }} />

              <CartesianGrid strokeDasharray="4 8" stroke="var(--sc-input)" strokeOpacity={1} horizontal vertical={false} />

              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: AXIS_COLOR }}
                tickMargin={15}
                interval="preserveStartEnd"
                tickFormatter={formatDateLabel}
                tickCount={5}
              />

              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: AXIS_COLOR }}
                tickFormatter={formatAxis}
                tickMargin={10}
                width={72}
                /* Belum ada data sama sekali (tenant baru/DB baru direset) --
                   domain [0,0] default recharts membuatnya menghasilkan tick
                   0/3/6/10 yang terlihat seperti nilai sungguhan padahal cuma
                   skala kosong tanpa arti. Domain dipaksa [0,10] TAPI cuma
                   satu tick (0) yang ditampilkan, supaya sumbu-Y kondisi
                   kosong jujur menunjukkan "0" saja. */
                domain={isFlatZero ? [0, 10] : undefined}
                ticks={isFlatZero ? [0] : undefined}
              />

              <ChartTooltip
                content={<CustomTooltip />}
                cursor={{ strokeDasharray: '3 3', stroke: 'var(--sc-muted-foreground)', strokeOpacity: 0.5 }}
              />

              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                dot={(props: { cx?: number; cy?: number; payload: DataPoint }) => {
                  const { cx, cy, payload } = props;
                  if (payload.date === firstDate || payload.date === lastDate) {
                    return (
                      <circle
                        key={`dot-${payload.date}`}
                        cx={cx}
                        cy={cy}
                        r={5}
                        fill={color}
                        stroke="white"
                        strokeWidth={2}
                        filter="url(#lineChartDotShadow)"
                      />
                    );
                  }
                  return <g key={`dot-${payload.date}`} />;
                }}
                activeDot={{ r: 6, fill: color, stroke: 'white', strokeWidth: 2 }}
              />
            </ComposedChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}
