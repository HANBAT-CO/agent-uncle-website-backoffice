import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/admin/utils";

/**
 * The side summary (screens 10.5): one fact per line. The maintenance line
 * turns to the attention tone (with its icon) while 점검 모드 is on.
 */
export function SideSummary({ lines, maintenanceOn }: { lines: string[]; maintenanceOn: boolean }) {
  return (
    <section aria-labelledby="summary-title" data-testid="side-summary" className="flex min-w-0 flex-col self-start rounded-lg border bg-card">
      <h2 id="summary-title" className="sr-only">
        운영 요약
      </h2>
      <ul className="flex flex-col">
        {lines.map((line, index) => {
          const last = index === lines.length - 1;
          const alert = last && maintenanceOn;
          return (
            <li
              key={line}
              className={cn(
                "flex min-h-11 items-center gap-2 border-b px-4 py-2 text-[0.8125rem] text-foreground last:border-b-0",
                alert && "bg-status-attention-bg font-semibold text-status-attention",
              )}
            >
              {alert ? <WarningCircleIcon aria-hidden weight="bold" className="size-4 shrink-0" /> : null}
              <span className="min-w-0">{line}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
