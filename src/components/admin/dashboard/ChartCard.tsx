import { cn } from "@/lib/admin/utils";

/** A dashboard card with an h2 title (the title names a single series, so charts need no legend). */
export function ChartCard({
  title,
  aside,
  children,
  className,
  testId,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section data-testid={testId} aria-label={title} className={cn("flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4", className)}>
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {aside ? <div className="text-xs text-muted-foreground">{aside}</div> : null}
      </header>
      {children}
    </section>
  );
}
