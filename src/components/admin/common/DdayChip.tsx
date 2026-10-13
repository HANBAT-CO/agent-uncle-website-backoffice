import { CalendarBlankIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";

import { dday } from "@/lib/admin/format";
import { cn } from "@/lib/admin/utils";

const TONE_CLASS = {
  attention: "bg-status-attention-bg text-status-attention",
  normal: "bg-status-normal-bg text-status-normal",
  neutral: "bg-status-neutral-bg text-status-neutral",
} as const;

/** Recheck D-day (screens 9): '오늘', '{n}일 지남' (attention), '{n}일 남음'. Nothing without a date. */
export function DdayChip({ days, className }: { days: number | null | undefined; className?: string }) {
  const value = dday(days);
  if (!value) return null;
  const Icon = value.tone === "attention" ? WarningCircleIcon : CalendarBlankIcon;
  return (
    <span
      data-tone={value.tone}
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 text-[0.6875rem] font-medium whitespace-nowrap",
        TONE_CLASS[value.tone],
        className,
      )}
    >
      <Icon aria-hidden weight="bold" className="size-3 shrink-0" />
      {value.label}
    </span>
  );
}
