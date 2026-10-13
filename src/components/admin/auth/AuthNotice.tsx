import { InfoIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/admin/utils";

/**
 * One-line notice on the access screens. Attention uses the app red as a weak
 * tint, always with its icon and text (spec D13); neutral is for information.
 */
export function AuthNotice({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "attention" | "neutral";
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = tone === "attention" ? WarningCircleIcon : InfoIcon;
  return (
    <div
      role={tone === "attention" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-md px-3 py-2.5 text-sm/relaxed",
        tone === "attention" ? "bg-status-attention-bg text-status-attention" : "bg-status-neutral-bg text-status-neutral",
        className,
      )}
    >
      <Icon aria-hidden weight="bold" className="mt-[0.2em] size-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
