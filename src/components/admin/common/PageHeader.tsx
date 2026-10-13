import { cn } from "@/lib/admin/utils";

/** Screen title row: h1, optional description and meta line, actions on the right. */
export function PageHeader({
  title,
  description,
  meta,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        {meta ? <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
