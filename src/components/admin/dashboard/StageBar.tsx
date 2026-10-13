"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/admin/ui/tooltip";
import { cn } from "@/lib/admin/utils";

import { ChartCard } from "./ChartCard";
import type { Stage, StageKey } from "./stages";

const TITLE = "요청 단계";

/**
 * Ordinal steps of the brand ramp (light to dark as a request moves on).
 * Steps 1, 2, 4 and 5 of `--chart-1..5`: the widest separation the ramp
 * allows for four slots; the 2px gaps, the legend and the in-bar counts are
 * the secondary encoding, so colour is never the only signal.
 */
const STAGE_STYLE: Record<StageKey, { fill: string; ink: string }> = {
  "확인 대기": { fill: "var(--chart-1)", ink: "text-foreground" },
  "진행 중": { fill: "var(--chart-2)", ink: "text-foreground" },
  "수령 대기": { fill: "var(--chart-4)", ink: "text-white" },
  완료: { fill: "var(--chart-5)", ink: "text-white" },
};

/** Segments narrower than this share skip the in-bar count (it would not fit); the legend and tooltip carry it. */
const LABEL_MIN_SHARE = 0.1;

/**
 * 요청 단계 (screens 10.5): one stacked bar of the four stages from toStages,
 * a legend with counts, and the grey 종료 note (거절 + 취소 종료). `ended`
 * is its own prop: an array property would not survive the RSC payload.
 */
export function StageBar({ stages, ended }: { stages: Stage[]; ended: number }) {
  const total = stages.reduce((sum, stage) => sum + stage.count, 0);
  const visible = stages.filter((stage) => stage.count > 0);
  const summary = stages.map((stage) => `${stage.key} ${stage.count}건`).join(", ");

  return (
    <ChartCard
      title={TITLE}
      testId="chart-stages"
      aside={
        <span data-testid="stages-ended" className="inline-flex items-center gap-1.5 text-status-neutral">
          <span aria-hidden className="size-2 rounded-[2px] bg-status-neutral/45" />
          종료 {ended.toLocaleString("ko-KR")}건
        </span>
      }
    >
      <div className="flex flex-1 flex-col justify-center gap-4 py-2">
        <div role="img" aria-label={`${TITLE}: ${summary}`} className={cn("flex h-6 w-full gap-0.5 overflow-hidden rounded-[4px]", total === 0 ? "bg-muted" : "bg-card")}>
          {visible.map((stage) => {
            const share = stage.count / total;
            const style = STAGE_STYLE[stage.key];
            return (
              <Tooltip key={stage.key}>
                <TooltipTrigger asChild>
                  <div
                    data-stage={stage.key}
                    className={cn("flex h-full min-w-1 items-center justify-center text-[0.6875rem] font-semibold transition-opacity hover:opacity-85", style.ink)}
                    style={{ flexGrow: stage.count, flexBasis: 0, backgroundColor: style.fill }}
                  >
                    {share >= LABEL_MIN_SHARE ? <span aria-hidden className="num">{stage.count.toLocaleString("ko-KR")}</span> : null}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <span className="num font-semibold">{stage.count.toLocaleString("ko-KR")}건</span> · {stage.key}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
          {stages.map((stage) => (
            <li key={stage.key} data-stage-legend={stage.key} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span aria-hidden className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: STAGE_STYLE[stage.key].fill }} />
                {stage.key}
              </span>
              <span className="num font-semibold text-foreground">{stage.count.toLocaleString("ko-KR")}건</span>
            </li>
          ))}
        </ul>
      </div>
    </ChartCard>
  );
}
