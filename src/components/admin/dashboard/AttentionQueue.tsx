import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import type { AnomalyRowModel } from "@/components/admin/checks/anomaly-model";
import { ToneChip } from "@/components/admin/checks/ToneChip";
import { EmptyState } from "@/components/admin/states/EmptyState";
import { formatKst, formatRelative } from "@/lib/admin/format";
import { cn } from "@/lib/admin/utils";

const TITLE = "지금 확인할 일";

/**
 * 지금 확인할 일 (screens 10.5): up to 10 queue items from
 * backoffice_overview, most severe first and oldest first within a severity
 * (the SQL order). Each row: reason chip (운영 점검 labels), target summary,
 * relative age and "열기".
 */
export function AttentionQueue({ rows, now, className }: { rows: AnomalyRowModel[]; now: Date; className?: string }) {
  return (
    <section aria-labelledby="queue-title" data-testid="attention-queue" className={cn("flex min-w-0 flex-col rounded-lg border bg-card", className)}>
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 id="queue-title" className="text-sm font-semibold text-foreground">
          {TITLE}
        </h2>
        {rows.length > 0 ? <span className="num text-xs text-muted-foreground">{rows.length.toLocaleString("ko-KR")}건</span> : null}
      </header>
      {rows.length === 0 ? (
        <EmptyState title="지금 확인할 일이 없어요" description="새로 생기면 여기에 바로 보여요." className="min-h-56 border-0 bg-transparent" />
      ) : (
        <ol className="flex flex-col">
          {rows.map((row) => (
            <li key={row.id} data-queue-kind={row.kind} className="flex min-h-14 items-center gap-3 border-b px-4 py-2 last:border-b-0">
              <span className="flex w-40 shrink-0">
                <ToneChip label={row.kindLabel} tone={row.severity.tone} icon={row.severity.icon} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-[0.8125rem] font-semibold text-foreground">{row.target}</span>
                <span className="mt-0.5 truncate text-xs text-muted-foreground">{row.summary}</span>
              </span>
              {row.since ? (
                <time dateTime={row.since} title={formatKst(row.since, { now })} className="num shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                  {formatRelative(row.since, now)}
                </time>
              ) : null}
              {row.href ? (
                <Link
                  href={row.href}
                  prefetch={false}
                  className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-xs font-medium text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  열기
                  <span className="sr-only">
                    : {row.kindLabel}, {row.target}
                  </span>
                  <ArrowRightIcon aria-hidden weight="bold" className="size-3" />
                </Link>
              ) : (
                <span aria-hidden className="w-[3.25rem] shrink-0" />
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
