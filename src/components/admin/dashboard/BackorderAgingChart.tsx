import type { Overview } from "@/lib/admin/rpc/schemas";

import { ChartCard } from "./ChartCard";
import { CountBarChart } from "./CountBarChart";
import { agingBars } from "./model";

const TITLE = "미송 경과";

/**
 * 미송 경과 (screens 10.5, also used on 미송 재확인 10.11): requests waiting
 * for a back-order recheck, by days past the recheck day.
 */
export function BackorderAgingChart({ aging, className }: { aging: Overview["backorderAging"]; className?: string }) {
  const bars = agingBars(aging).map((bar) => ({ key: bar.key, tick: bar.label, label: bar.label, count: bar.count }));
  return (
    <ChartCard title={TITLE} testId="chart-backorder-aging" className={className}>
      <CountBarChart data={bars} caption={TITLE} />
    </ChartCard>
  );
}
