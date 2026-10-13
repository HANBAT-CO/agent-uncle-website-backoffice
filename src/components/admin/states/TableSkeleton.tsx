import { Skeleton } from "@/components/admin/ui/skeleton";
import { cn } from "@/lib/admin/utils";

/**
 * Loading rows matching the table's column widths (screens 9). `columns` is a
 * count or a list of CSS widths; rows are 48px like the real table.
 */
export function TableSkeleton({
  columns = 6,
  rows = 8,
  label = "목록을 불러오는 중…",
  className,
}: {
  columns?: number | string[];
  rows?: number;
  label?: string;
  className?: string;
}) {
  const widths = typeof columns === "number" ? Array.from({ length: columns }, () => "auto") : columns;
  return (
    <div role="status" aria-live="polite" className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <span className="sr-only">{label}</span>
      <div className="flex h-10 items-center gap-4 border-b px-3" aria-hidden>
        {widths.map((width, index) => (
          <Skeleton key={index} className="h-3 flex-1" style={width === "auto" ? undefined : { flex: `0 0 ${width}` }} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex h-12 items-center gap-4 border-b px-3 last:border-0" aria-hidden>
          {widths.map((width, index) => (
            <div key={index} className="flex flex-1 flex-col gap-1.5" style={width === "auto" ? undefined : { flex: `0 0 ${width}` }}>
              <Skeleton className={cn("h-3", index === 0 ? "w-4/5" : "w-3/5")} />
              {index === 0 ? <Skeleton className="h-2.5 w-2/5" /> : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
