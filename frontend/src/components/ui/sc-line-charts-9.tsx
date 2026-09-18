'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import * as RechartsPrimitive from 'recharts';

/**
 * CATATAN PORTING (Tailwind 3, bukan 4):
 *  - `outline-hidden` adalah utility Tailwind 4 -- diganti `outline-none`
 *    (padanan v3 terdekat) di seluruh berkas ini.
 *  - `bg-(--color-bg)` / `border-(--color-border)` (sintaks kurung tanpa
 *    `var()`) adalah gula sintaksis Tailwind 4 -- diganti bentuk v3 baku
 *    `bg-[var(--color-bg)]` / `border-[var(--color-border)]`.
 *  - Kode asli (dari sumber komponen ini) punya bug nyata di ChartStyle:
 *    `.join(...)` dipanggil dengan baris baru literal di dalam string
 *    berkutip tunggal alih-alih escape `\n` -- itu SyntaxError kalau
 *    ditulis apa adanya. Diperbaiki jadi `.join('\n')` yang benar di bawah.
 */

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: '', dark: '.dark' } as const;

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & ({ color?: string; theme?: never } | { color?: never; theme: Record<keyof typeof THEMES, string> });
};

type ChartContextProps = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<'div'> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children'];
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, '')}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "[&_.recharts-cartesian-axis-tick_text]:fill-sc-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-sc-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-sc-border [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-sc-border [&_.recharts-radial-bar-background-sector]:fill-sc-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-sc-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-sc-border flex aspect-video justify-center text-xs [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-sector]:outline-none [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-none",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(([, config]) => config.theme || config.color);

  if (!colorConfig.length) {
    return null;
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(([theme, prefix]) => {
            const vars = colorConfig
              .map(([key, itemConfig]) => {
                const color = itemConfig.theme?.[theme as keyof typeof itemConfig.theme] || itemConfig.color;
                return color ? `  --color-${key}: ${color};` : null;
              })
              .join('\n');
            return `${prefix} [data-chart=${id}] {\n${vars}\n}\n`;
          })
          .join('\n'),
      }}
    />
  );
};

const ChartTooltip = RechartsPrimitive.Tooltip;

export { ChartContainer, ChartTooltip, ChartStyle };
