import { InfoIcon, SealWarningIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";

import { NOTICE_SEVERITY_LABEL } from "@/lib/admin/labels";
import type { NoticeSeverity } from "@/lib/admin/rpc/enums";
import { cn } from "@/lib/admin/utils";

const STYLE: Record<NoticeSeverity, { className: string; Icon: typeof InfoIcon }> = {
  info: { className: "bg-status-neutral-bg text-status-neutral", Icon: InfoIcon },
  important: { className: "bg-status-normal-bg text-status-normal", Icon: SealWarningIcon },
  critical: { className: "bg-status-attention-bg text-status-attention", Icon: WarningCircleIcon },
};

/** 중요도 (screens 10.14): 안내 / 중요 / 긴급, always icon + label + tint. */
export function SeverityBadge({ severity, className }: { severity: NoticeSeverity; className?: string }) {
  const { className: tone, Icon } = STYLE[severity];
  return (
    <span data-severity={severity} className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap", tone, className)}>
      <Icon aria-hidden weight="bold" className="size-3.5 shrink-0" />
      {NOTICE_SEVERITY_LABEL[severity]}
    </span>
  );
}
