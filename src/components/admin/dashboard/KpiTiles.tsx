import { ArrowUpRightIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import type { KpiTile } from "./model";

/**
 * The six KPI tiles (screens 10.5): label, big number and unit, and a link to
 * the filtered list. Tiles that need a human carry the attention icon while
 * they are above 0 (never colour alone).
 */
export function KpiTiles({ tiles }: { tiles: KpiTile[] }) {
  return (
    <ul aria-label="주요 지표" className="kpi-strip">
      {tiles.map((tile) => (
        <li key={tile.key}>
          <Link
            href={tile.href}
            data-kpi={tile.key}
            className="kpi-link"
          >
            <span className="flex items-start justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">{tile.label}</span>
              {tile.attention ? (
                <span className="flex size-4 shrink-0 items-center justify-center text-status-attention">
                  <WarningCircleIcon aria-hidden weight="bold" className="size-3.5" />
                </span>
              ) : null}
            </span>
            <span className="flex items-end justify-between gap-2">
              <span className="num flex items-baseline gap-1.5 text-foreground">
                <span data-kpi-value>
                  {tile.value.toLocaleString("ko-KR")}
                </span>
                <span className="text-xs text-muted-foreground">{tile.unit}</span>
              </span>
              <ArrowUpRightIcon
                aria-hidden
                weight="bold"
                className="kpi-arrow size-4 shrink-0 text-primary"
              />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
