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
export function AttentionQueue({ rows, now, className, includeDemo = false }: { rows: AnomalyRowModel[]; now: Date; className?: string; includeDemo?: boolean }) {
  return (
    <section aria-labelledby="queue-title" data-testid="attention-queue" className={cn("console-panel flex min-w-0 flex-col", className)}>
      <header className="console-panel-header">
        <h2 id="queue-title" className="console-panel-title flex items-center gap-2.5">
          {TITLE}
          {rows.length > 0 ? <span className="num rounded-md bg-status-attention-bg px-1.5 py-0.5 text-[10px] text-status-attention">{rows.length.toLocaleString("ko-KR")}건</span> : null}
        </h2>
        <Link href={`/admin/checks${includeDemo ? "?demo=1" : ""}`} className="console-section-link">전체 보기 <ArrowRightIcon aria-hidden className="size-3.5" /></Link>
      </header>
      {rows.length === 0 ? (
        <EmptyState title="지금 확인할 일이 없어요" description="새로 생기면 여기에 바로 보여요." className="min-h-56 border-0 bg-transparent" />
      ) : (
        <div className="queue-scroll" tabIndex={0} role="region" aria-label="확인이 필요한 항목 목록">
        <ol>
          {rows.map((row) => (
            <li key={row.id} data-queue-kind={row.kind} className="queue-row">
              <span className="flex min-w-0">
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
                  href={includeDemo ? `${row.href}${row.href.includes("?") ? "&" : "?"}demo=1` : row.href}
                  prefetch={false}
                  className="queue-open"
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
        </div>
      )}
      {rows.length > 0 ? <p className="mt-auto border-t border-[var(--console-line)] px-[22px] py-3 text-[10px] text-muted-foreground">중요도와 대기 시간을 기준으로 정렬했어요.</p> : null}
    </section>
  );
}
