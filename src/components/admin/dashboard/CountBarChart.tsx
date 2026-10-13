"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/admin/ui/chart";
import { cn } from "@/lib/admin/utils";

export type CountBar = { key: string; tick: string; label: string; count: number };

const config = { count: { label: "건수", color: "var(--chart-5)" } } satisfies ChartConfig;

/**
 * One series of counts as columns (dataviz rules): deep green `--chart-5`,
 * no legend (the card title names the series), the y axis starts at 0 with
 * whole-number ticks, hairline horizontal grid, columns capped at 24px with a
 * 4px rounded data end. Hover or focus shows "{label} · {n}건". A visually
 * hidden table carries the same numbers for screen readers.
 */
export function CountBarChart({
  data,
  caption,
  unit = "건",
  className,
}: {
  data: CountBar[];
  caption: string;
  unit?: string;
  className?: string;
}) {
  const max = data.reduce((top, bar) => Math.max(top, bar.count), 0);

  return (
    <figure className={cn("flex flex-col", className)}>
      <ChartContainer config={config} className="aspect-auto h-44 w-full" aria-hidden>
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%" accessibilityLayer={false}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
          <XAxis dataKey="tick" tickLine={false} axisLine={false} tickMargin={6} interval="preserveStartEnd" minTickGap={4} />
          <YAxis
            width={28}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            domain={[0, max === 0 ? 1 : "auto"]}
            tickMargin={4}
          />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={
              <ChartTooltipContent
                hideIndicator
                labelFormatter={(_, payload) => (payload?.[0]?.payload as CountBar | undefined)?.label ?? ""}
                formatter={(value) => (
                  <span className="num font-semibold text-foreground">
                    {Number(value).toLocaleString("ko-KR")}
                    {unit}
                  </span>
                )}
              />
            }
          />
          <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {data.map((bar) => (
            <tr key={bar.key}>
              <th scope="row">{bar.label}</th>
              <td>
                {bar.count.toLocaleString("ko-KR")}
                {unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
