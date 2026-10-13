import { cn } from "@/lib/admin/utils";

import { highlightParts } from "./palette-model";

/** `text` with every case-insensitive match of `query` in <mark>. User text stays text, never HTML. */
export function Highlight({ text, query, className }: { text: string | null | undefined; query: string; className?: string }) {
  if (!text) return null;
  return (
    <span className={className}>
      {highlightParts(text, query).map((part, index) =>
        part.match ? (
          <mark key={index} className={cn("rounded-[3px] bg-secondary px-px text-secondary-foreground")}>
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </span>
  );
}
