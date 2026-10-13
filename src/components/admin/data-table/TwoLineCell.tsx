import { cn } from "@/lib/admin/utils";

/** The table cell pattern (screens 9): a bold first line over a muted second line. */
export function TwoLineCell({
  primary,
  secondary,
  className,
}: {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 flex-col leading-tight", className)}>
      <span className="truncate text-[0.8125rem] font-semibold text-foreground">{primary}</span>
      {secondary ? <span className="mt-0.5 truncate text-xs text-muted-foreground">{secondary}</span> : null}
    </span>
  );
}
