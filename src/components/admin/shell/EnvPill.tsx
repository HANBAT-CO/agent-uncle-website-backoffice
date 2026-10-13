import { DatabaseIcon, EyeIcon, FlaskIcon } from "@phosphor-icons/react/dist/ssr";

import { envPill } from "@/lib/admin/nav";
import type { AdminRole } from "@/lib/admin/roles";
import { cn } from "@/lib/admin/utils";

const TONE = {
  local: { className: "bg-status-neutral-bg text-status-neutral ring-1 ring-inset ring-foreground/10", Icon: FlaskIcon },
  "live-read": { className: "bg-secondary text-secondary-foreground", Icon: EyeIcon },
  "live-write": { className: "bg-primary text-primary-foreground", Icon: DatabaseIcon },
} as const;

/**
 * Which database this console talks to, and whether this role can change it
 * (screens appendix 9). Writable live data gets the stronger fill.
 */
export function EnvPill({ target, role, className }: { target: "local" | "live"; role: AdminRole; className?: string }) {
  const pill = envPill(target, role);
  const { className: tone, Icon } = TONE[pill.tone];
  return (
    <span
      data-testid="env-pill"
      data-tone={pill.tone}
      className={cn("inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap", tone, className)}
    >
      <Icon aria-hidden weight="bold" className="size-3.5" />
      {pill.label}
    </span>
  );
}
