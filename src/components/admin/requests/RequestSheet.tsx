"use client";

import { useRouter } from "next/navigation";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/admin/ui/sheet";

/**
 * The intercepted request Sheet over a console list (screens 10.9). It is
 * always open while its route matches; closing it (Escape, the overlay, the
 * close button) goes back in history, so the list returns with its scroll
 * position and selection, and the URL with it.
 */
export function RequestSheet({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) router.back();
      }}
    >
      <SheetContent
        side="right"
        data-testid="request-sheet"
        // Focus the sheet itself, not its first control: that would pop a time tooltip open.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
        className="w-full gap-0 overflow-y-auto bg-background p-0 data-[side=right]:sm:max-w-[min(64rem,calc(100vw-4rem))]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="px-6 pt-6 pb-10 text-sm">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
