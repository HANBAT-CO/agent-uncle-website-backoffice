import type { Overview } from "@/lib/admin/rpc/schemas";

import { ChartCard } from "./ChartCard";
import { CountBarChart } from "./CountBarChart";
import { dayBars } from "./model";

const TITLE = "새 사입 요청 · 14일";

/** 새 사입 요청 · 14일 (screens 10.5): requests created per KST day, deep green bars. */
export function NewRequestsChart({ series }: { series: Overview["newRequestsByDay"] }) {
  const bars = dayBars(series).map((bar) => ({ key: bar.day, tick: bar.tick, label: bar.label, count: bar.count }));
  return (
    <ChartCard title={TITLE} testId="chart-new-requests">
      <CountBarChart data={bars} caption={TITLE} />
    </ChartCard>
  );
}
