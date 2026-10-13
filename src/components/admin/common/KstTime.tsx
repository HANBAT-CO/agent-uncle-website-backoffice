"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/admin/ui/tooltip";
import { formatKst, formatRelative } from "@/lib/admin/format";
import { cn } from "@/lib/admin/utils";

/**
 * A KST time (screens 9): absolute text '10월 13일 02:05', relative tooltip
 * ('12시간 전'). The tooltip content only renders while open, so the
 * time-dependent relative text never takes part in hydration.
 */
export function KstTime({
  iso,
  withYear,
  time,
  className,
}: {
  iso: string | null | undefined;
  withYear?: "auto" | "always";
  time?: boolean;
  className?: string;
}) {
  const text = formatKst(iso, { withYear, time });
  if (!iso || text === "-") return <span className={cn("text-muted-foreground", className)}>-</span>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={iso} tabIndex={0} className={cn("num whitespace-nowrap outline-none focus-visible:underline", className)}>
          {text}
        </time>
      </TooltipTrigger>
      <TooltipContent>
        <RelativeTime iso={iso} />
      </TooltipContent>
    </Tooltip>
  );
}

function RelativeTime({ iso }: { iso: string }) {
  return <>{formatRelative(iso)}</>;
}
