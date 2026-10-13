import { LockKeyIcon } from "@phosphor-icons/react/dist/ssr";

import { ROLE_LABEL, type AdminRole } from "@/lib/admin/roles";

/** A screen above the staff member's role (screens 9). Rendered in place: no authInterrupts. */
export function ForbiddenState({ min, className }: { min: AdminRole; className?: string }) {
  return (
    <div
      role="status"
      className={
        className ?? "flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/60 p-6 text-center"
      }
    >
      <span className="flex size-8 items-center justify-center rounded-md bg-status-neutral-bg text-status-neutral">
        <LockKeyIcon aria-hidden weight="bold" className="size-4" />
      </span>
      <p className="text-sm font-semibold text-foreground">이 화면은 {ROLE_LABEL[min]} 이상만 볼 수 있어요.</p>
    </div>
  );
}
