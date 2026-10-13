import Link from "next/link";

import { cn } from "@/lib/admin/utils";

import type { AnomalyKind, KindFilter } from "./anomaly-model";

/**
 * Kind chips with counts (screens 10.6). Real links: the kind lives in the
 * URL (`?kind=`), "전체" clears it, and switching goes back to page 1.
 */
export function KindChips({
  filters,
  total,
  selected,
  hrefFor,
}: {
  filters: KindFilter[];
  total: number;
  selected: AnomalyKind | null;
  hrefFor: (kind: AnomalyKind | null) => string;
}) {
  const chips: { kind: AnomalyKind | null; label: string; count: number }[] = [{ kind: null, label: "전체", count: total }, ...filters];
  return (
    <nav aria-label="종류" data-testid="kind-chips">
      <ul className="flex flex-wrap items-center gap-2">
        {chips.map((chip) => {
          const active = chip.kind === selected;
          return (
            <li key={chip.kind ?? "all"}>
              <Link
                href={hrefFor(chip.kind)}
                scroll={false}
                aria-current={active ? "page" : undefined}
                data-kind={chip.kind ?? "all"}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  active ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted",
                )}
              >
                {chip.label}
                <span
                  className={cn(
                    "num rounded-full px-1.5 py-px text-[0.6875rem]",
                    active ? "bg-primary-foreground/15 text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {chip.count.toLocaleString("ko-KR")}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
