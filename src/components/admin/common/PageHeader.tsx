import { cn } from "@/lib/admin/utils";

/** Screen title row: h1, optional description and meta line, actions on the right. */
export function PageHeader({
  title,
  description,
  meta,
  actions,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: string;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="flex min-w-0 flex-col gap-2">
        {eyebrow ? <span className="console-eyebrow">{eyebrow}</span> : null}
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.055em] text-foreground lg:text-[2rem]">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        {meta ? <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
