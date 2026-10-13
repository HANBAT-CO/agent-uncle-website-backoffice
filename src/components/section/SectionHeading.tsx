import { cn } from "@/lib/cn";

/**
 * A section H2 at the spec scale: Paperlogy 800 (display subset),
 * clamp(30px, 3.4vw, 52px), line-height 1.18, tracking -0.02em. Each copy
 * line is its own block (line breaks by meaning); a space between lines keeps
 * the accessible name readable. Only for strings in DISPLAY_800.
 */
export function SectionHeading({
  id,
  lines,
  className,
}: {
  id: string;
  lines: readonly string[];
  className?: string;
}) {
  return (
    <h2 id={id} className={cn("hangul-display text-display-lg font-extrabold", className)}>
      {lines.map((line, index) => (
        <span key={line} className="block">
          {line}
          {index < lines.length - 1 ? " " : null}
        </span>
      ))}
    </h2>
  );
}
