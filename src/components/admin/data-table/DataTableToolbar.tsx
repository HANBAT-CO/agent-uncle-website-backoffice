import { cn } from "@/lib/admin/utils";

/** Row above a table: search and filters on the left, sort and actions (CSV) on the right. */
export function DataTableToolbar({
  children,
  actions,
  className,
}: {
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
