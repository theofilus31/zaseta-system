'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/sc-card';
import { ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/sc-line-charts-9';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';

/**
 * Chart pendapatan gaya "Current Balance" (lihat sc-line-charts-9-demo.tsx,
 * pratinjau statis masih ada di /dev/chart-demo) -- versi ini disambungkan ke
 * `revenueGrowth`/`revenueAllTime` SUNGGUHAN dari GET /api/platform/revenue
 * (lihat PlatformRevenue.jsx), bukan data contoh.
 *
 * Dipasang KHUSUS untuk data uang, berdampingan dengan GrowthChart.jsx yang
 * sudah ada -- GrowthChart.jsx tidak disentuh sama sekali dan tetap dipakai
 * apa adanya di PlatformDashboard.jsx (pertumbuhan pengguna/tenant, bukan
 * data uang).
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

function formatRupiahCompact(v: number) {
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, '')} M`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')} jt`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)} rb`;
  return `${sign}${abs}`;
}

function formatRupiahFull(v: number) {
  return `Rp ${Math.round(v).toLocaleString('id-ID')}`;
}

const chartConfig = {
  value: {
    label: 'Pendapatan',
    color: '#0b111c', // ink-900 (lihat tailwind.config.js) -- sebelumnya ungu shadcn (#a855f7)
  },
} satisfies ChartConfig;

interface RevenuePoint {
  date: string;
  value: number;
}

interface RevenueChartProps {
  data: RevenuePoint[];
  totalRevenue: number;
  rangeLabel: string;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: { date: string; value: number } }>;
}

const CustomTooltip = ({ active, payload }: TooltipProps) => {
  if (active && payload && payload.length) {
    const point = payload[0].payload;
    return (
      <div className="bg-sc-popover border border-sc-border rounded-lg p-3 shadow-lg">
        <div className="text-sm text-sc-muted-foreground mb-1">{formatDateFull(point.date)}</div>
        <div className="text-base font-bold">{formatRupiahFull(point.value)}</div>
      </div>
    );
  }
  return null;
};

export default function RevenueChart({ data, totalRevenue, rangeLabel }: RevenueChartProps) {
  const points = (data || []).map((d) => ({ date: d.date, value: Number(d.value) || 0 }));
  const first = points[0]?.value ?? 0;
  const last = points[points.length - 1]?.value ?? 0;
  const periodGain = last - first;
  const deltaPct = first > 0 ? ((last - first) / first) * 100 : (last > 0 ? 100 : 0);
  const isUp = deltaPct >= 0;
  const highValue = points.length ? Math.max(...points.map((p) => p.value)) : 0;
  const lowValue = points.length ? Math.min(...points.map((p) => p.value)) : 0;
  const firstDate = points[0]?.date;
  const lastDate = points[points.length - 1]?.date;

  if (points.length === 0) return null;

  return (
    <Card className="w-full">
      <CardContent className="flex flex-col items-stretch gap-5">
        <div>
          <h3 className="text-base text-sc-muted-foreground font-medium mb-1">Pendapatan Terkumpul</h3>
          <div className="flex flex-wrap items-baseline gap-1.5 sm:gap-3.5">
            <span className="text-4xl font-bold">{formatRupiahFull(totalRevenue)}</span>
            <div className={`flex items-center gap-1 ${isUp ? 'text-emerald-600' : 'text-red-600'}`}>
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
              <span className="font-semibold">{formatRupiahFull(periodGain)}</span>
            </div>
            <div className="flex items-center gap-6 text-sc-muted-foreground">
              <span>
                Tertinggi: <span className="text-sky-600 font-medium">Rp {formatRupiahCompact(highValue)}</span>
              </span>
              <span>
                Terendah: <span className="text-yellow-600 font-medium">Rp {formatRupiahCompact(lowValue)}</span>
              </span>
            </div>
          </div>

          <ChartContainer
            config={chartConfig}
            className="h-72 w-full [&_.recharts-curve.recharts-tooltip-cursor]:stroke-transparent"
          >
            <ComposedChart data={points} margin={{ top: 20, right: 10, left: 5, bottom: 20 }}>
              <defs>
                <pattern id="revenueDotGrid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="10" cy="10" r="1" fill="var(--sc-input)" fillOpacity="0.3" />
                </pattern>
                <filter id="revenueDotShadow" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="2" dy="3" stdDeviation="3" floodColor="rgba(0,0,0,0.8)" />
                </filter>
              </defs>

              <rect x="0" y="0" width="100%" height="100%" fill="url(#revenueDotGrid)" style={{ pointerEvents: 'none' }} />

              <CartesianGrid strokeDasharray="4 8" stroke="var(--sc-input)" strokeOpacity={1} horizontal vertical={false} />

              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: chartConfig.value.color }}
                tickMargin={15}
                interval="preserveStartEnd"
                tickFormatter={formatDateLabel}
                tickCount={5}
              />

              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: chartConfig.value.color }}
                tickFormatter={(value) => `Rp ${formatRupiahCompact(value)}`}
                tickMargin={10}
                width={72}
                /* Belum ada pendapatan sama sekali (tenant baru/DB baru direset)
                   -- highValue 0 bikin recharts otomatis menghasilkan skala
                   0..4 yang tidak berarti apa-apa (bukan pecahan Rupiah
                   sungguhan). Dipaksa 0..10 di kondisi ini, meniru pola
                   niceMax(0)=10 yang sudah dipakai GrowthChart.jsx untuk
                   kasus data nol yang sama. */
                domain={highValue > 0 ? undefined : [0, 10]}
              />

              <ChartTooltip
                content={<CustomTooltip />}
                cursor={{ strokeDasharray: '3 3', stroke: 'var(--sc-muted-foreground)', strokeOpacity: 0.5 }}
              />

              <Line
                type="monotone"
                dataKey="value"
                stroke={chartConfig.value.color}
                strokeWidth={2}
                dot={(props: { cx?: number; cy?: number; payload: RevenuePoint }) => {
                  const { cx, cy, payload } = props;
                  if (payload.date === firstDate || payload.date === lastDate) {
                    return (
                      <circle
                        key={`dot-${payload.date}`}
                        cx={cx}
                        cy={cy}
                        r={5}
                        fill={chartConfig.value.color}
                        stroke="white"
                        strokeWidth={2}
                        filter="url(#revenueDotShadow)"
                      />
                    );
                  }
                  return <g key={`dot-${payload.date}`} />;
                }}
                activeDot={{ r: 6, fill: chartConfig.value.color, stroke: 'white', strokeWidth: 2 }}
              />
            </ComposedChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}
