"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/admin/ui/chart";

import type { AgingBar } from "./backorder-model";

const config = { count: { label: "요청", color: "var(--chart-5)" } } satisfies ChartConfig;

function AgingTooltip({ active, payload }: { active?: boolean; payload?: { payload?: AgingBar }[] }) {
  const bar = payload?.[0]?.payload;
  if (!active || !bar) return null;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-sm">
      <span className="text-muted-foreground">{bar.label}</span> <span className="num font-semibold">{bar.count}건</span>
    </div>
  );
}

/**
 * 미송 경과 (screens 10.11): the dashboard's back-order aging buckets, days
 * past the recheck date of the requests labelled 미송 재확인. One series in
 * deep green, no legend, a zero baseline, thin columns with a rounded top
 * and hover values. The same numbers sit beside the chart as a list, so the
 * values never depend on the chart alone.
 */
export function AgingChart({ bars }: { bars: AgingBar[] }) {
  const total = bars.reduce((sum, bar) => sum + bar.count, 0);
  return (
    <section aria-labelledby="aging-title" className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 id="aging-title" className="text-sm font-semibold text-foreground">
          미송 경과
        </h2>
        <p className="text-xs text-muted-foreground">
          미송 재확인 <span className="num">{total}</span>건
        </p>
      </div>
      <div className="grid items-center gap-6 md:grid-cols-[minmax(0,36rem)_minmax(0,16rem)]">
        <ChartContainer config={config} className="aspect-auto h-32 w-full" aria-hidden>
          <BarChart data={bars} margin={{ top: 4, right: 4, bottom: 0, left: -24 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border)" }} tickMargin={6} interval={0} />
            <YAxis allowDecimals={false} domain={[0, (max: number) => Math.max(max, 2)]} tickLine={false} axisLine={false} width={48} />
            <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<AgingTooltip />} />
            <Bar dataKey="count" fill="var(--color-count)" barSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
        <dl aria-label="재확인일부터 지난 날짜별 요청" className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {bars.map((bar) => (
            <div key={bar.key} className="flex items-baseline justify-between gap-3 border-b border-border/70 pb-1.5">
              <dt className="text-xs text-muted-foreground">{bar.label}</dt>
              <dd className="num font-semibold text-foreground">{bar.count}건</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
