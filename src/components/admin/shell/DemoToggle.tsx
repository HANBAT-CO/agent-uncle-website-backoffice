"use client";

import { useQueryState } from "nuqs";
import { useTransition } from "react";

import { Switch } from "@/components/admin/ui/switch";
import { pageParsers } from "@/lib/admin/search-params";

/**
 * Live only (spec 8): seeded demo rows (data.demoBatch) stay hidden unless
 * `demo` is on. Changing it re-renders the server page with the new flag.
 */
export function DemoToggle() {
  const [pending, startTransition] = useTransition();
  const [demo, setDemo] = useQueryState("demo", pageParsers.demo.withOptions({ shallow: false, startTransition, clearOnDefault: true }));

  return (
    <label className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-2 rounded-full px-2 text-xs font-medium text-muted-foreground hover:bg-muted">
      <Switch checked={demo} onCheckedChange={(checked) => void setDemo(checked)} aria-busy={pending} />
      데모 데이터 포함
    </label>
  );
}
