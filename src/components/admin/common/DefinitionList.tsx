import { cn } from "@/lib/admin/utils";

export type DefinitionItem = { term: string; value: React.ReactNode; hint?: React.ReactNode };

/** Label and value pairs (dossier 프로필 tab, 속성 panels). Empty values read '-'. */
export function DefinitionList({ items, columns = 2, className }: { items: DefinitionItem[]; columns?: 1 | 2 | 3; className?: string }) {
  return (
    <dl
      className={cn(
        "grid gap-x-8 gap-y-3 text-sm",
        columns === 1 ? "grid-cols-1" : columns === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-3",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.term} className="flex min-w-0 flex-col gap-0.5 border-b border-border/70 pb-2">
          <dt className="text-xs text-muted-foreground">{item.term}</dt>
          <dd className="min-w-0 break-words text-foreground">
            {item.value === null || item.value === undefined || item.value === "" ? <span className="text-muted-foreground">-</span> : item.value}
            {item.hint ? <span className="mt-0.5 block text-xs text-muted-foreground">{item.hint}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
