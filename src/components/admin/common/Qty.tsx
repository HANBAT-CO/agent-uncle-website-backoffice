import type { QtyUnit } from "@/lib/admin/format";
import { cn } from "@/lib/admin/utils";

/** A count with its unit, number first (screens 9): 2장, 3건, 4회차. */
export function Qty({ n, unit, className }: { n: number | null | undefined; unit: QtyUnit; className?: string }) {
  if (n === null || n === undefined) return <span className={cn("text-muted-foreground", className)}>-</span>;
  return (
    <span className={cn("num whitespace-nowrap", className)}>
      {n.toLocaleString("ko-KR")}
      <span className="ml-px text-[0.92em] text-muted-foreground">{unit}</span>
    </span>
  );
}
