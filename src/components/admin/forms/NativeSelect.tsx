import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/admin/utils";

/**
 * A styled native <select> for ActionForm fields: it takes part in FormData
 * and form.reset() like any input, which the Radix Select does not.
 */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className={cn("relative w-full", className)}>
      <select
        className="h-9 w-full appearance-none rounded-md border border-input bg-background/60 pr-8 pl-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive"
        {...props}
      >
        {children}
      </select>
      <CaretDownIcon aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
