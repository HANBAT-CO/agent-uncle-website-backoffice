import { CheckCircleIcon, ClockIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react/dist/ssr";

import type { Tone, ToneIcon } from "@/lib/admin/labels";
import { cn } from "@/lib/admin/utils";

const ICONS = {
  WarningCircle: WarningCircleIcon,
  Clock: ClockIcon,
  CheckCircle: CheckCircleIcon,
  XCircle: XCircleIcon,
} as const;

const TONE_CLASS: Record<Tone, string> = {
  attention: "bg-status-attention-bg text-status-attention",
  normal: "bg-status-normal-bg text-status-normal",
  done: "bg-status-normal-bg text-status-normal",
  ended: "bg-status-neutral-bg text-status-neutral",
};

/**
 * A chip with an explicit tone (screens 9 chip rules: icon + label + tint).
 * StatusChip derives the tone from a status label; anomaly chips take it
 * from the 중요도 instead, so the same label can be urgent or calm.
 */
export function ToneChip({ label, tone, icon, className }: { label: string; tone: Tone; icon: ToneIcon; className?: string }) {
  const Icon = ICONS[icon];
  return (
    <span
      data-tone={tone}
      className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap", TONE_CLASS[tone], className)}
    >
      <Icon aria-hidden weight={tone === "done" ? "fill" : "bold"} className="size-3.5 shrink-0" />
      {label}
    </span>
  );
}
