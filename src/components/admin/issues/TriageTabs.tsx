import Link from "next/link";

import { cn } from "@/lib/admin/utils";

import type { TriageTab } from "./triage-model";

const TABS: { key: TriageTab; label: string }[] = [
  { key: "issues", label: "문제" },
  { key: "proposals", label: "변경·취소·정정" },
];

/**
 * The two triage tabs (screens 10.12): 문제 and 변경·취소·정정. Switching
 * starts the other list fresh (its first view, page 1, first row), keeping
 * only the live demo switch.
 */
export function TriageTabs({ active, demo }: { active: TriageTab; demo: boolean }) {
  return (
    <nav aria-label="문제·정정 종류">
      <ul className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
        {TABS.map((tab) => {
          const params = new URLSearchParams();
          if (tab.key === "proposals") params.set("tab", "proposals");
          if (demo) params.set("demo", "true");
          const query = params.toString();
          const current = tab.key === active;
          return (
            <li key={tab.key}>
              <Link
                href={query ? `/admin/issues?${query}` : "/admin/issues"}
                scroll={false}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center rounded-md px-3 text-sm whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
                  current && "bg-card font-semibold text-foreground shadow-xs",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
