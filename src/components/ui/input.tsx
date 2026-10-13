import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/**
 * Text field (spec 10), a native input in the app's form style: 56px tall,
 * radius 16, fill #E4E3DA, 1px #808080 border, 16px text (no iOS zoom),
 * focus ring 2px #0C483E with a 2px offset. aria-invalid adds the 2px
 * deep-green left rule; errors are never red. Read-only (while sending) keeps
 * the text readable and shows progress on hover.
 *
 * The fill alone is 1.2:1 against the sheet, so a 1px #808080 base border
 * (3.6:1 on #F5F4EE) marks where to type (WCAG 1.4.11), as a filled app
 * field does.
 */
export const fieldControlClass = cn(
  "block w-full rounded-input border border-grey-500 bg-grey-100 px-4 text-base text-ink",
  "transition-[border-color,box-shadow] duration-200 ease-snap",
  "hover:border-grey-600",
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-800 focus-visible:outline-solid",
  "aria-invalid:shadow-[inset_2px_0_0_var(--color-green-800)]",
  "read-only:cursor-progress read-only:hover:border-grey-500",
  // Browser autofill paints its own fill; keep the app's.
  "autofill:shadow-[inset_0_0_0_100px_var(--color-grey-100)] autofill:[-webkit-text-fill-color:var(--color-ink)]",
);

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(fieldControlClass, "h-14 leading-[1.5]", className)}
      {...props}
    />
  );
}
