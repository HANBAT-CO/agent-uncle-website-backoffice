import { ArrowRightIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { cn } from "@/lib/admin/utils";

import type { KpiTile } from "./model";

/**
 * The six KPI tiles (screens 10.5): label, big number and unit, and a link to
 * the filtered list. Tiles that need a human carry the attention icon while
 * they are above 0 (never colour alone).
 */
export function KpiTiles({ tiles }: { tiles: KpiTile[] }) {
  return (
    <ul aria-label="주요 지표" className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {tiles.map((tile) => (
        <li key={tile.key}>
          <Link
            href={tile.href}
            data-kpi={tile.key}
            className={cn(
              "group/tile flex h-full min-h-28 flex-col justify-between gap-3 rounded-lg border bg-card p-4 transition-colors outline-none",
              "hover:border-primary/40 hover:bg-[color-mix(in_oklab,var(--card),var(--primary)_4%)] focus-visible:ring-2 focus-visible:ring-ring/40",
            )}
          >
            <span className="flex items-start justify-between gap-2">
              <span className="text-[0.8125rem] font-medium text-muted-foreground">{tile.label}</span>
              {tile.attention ? (
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-status-attention-bg text-status-attention">
                  <WarningCircleIcon aria-hidden weight="bold" className="size-3.5" />
                </span>
              ) : null}
            </span>
            <span className="flex items-end justify-between gap-2">
              <span className="flex items-baseline gap-0.5 text-foreground">
                <span data-kpi-value className="text-[1.75rem] leading-none font-semibold tracking-tight">
                  {tile.value.toLocaleString("ko-KR")}
                </span>
                <span className="text-sm font-medium">{tile.unit}</span>
              </span>
              <ArrowRightIcon
                aria-hidden
                weight="bold"
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover/tile:translate-x-0.5 group-hover/tile:text-primary"
              />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
