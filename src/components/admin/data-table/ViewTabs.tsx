"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { cn } from "@/lib/admin/utils";

import { useListHref } from "./use-list-href";

export type ViewTab = { key: string; label: string; count?: number | null };

/**
 * List views with counts (screens 9, 10.x). Real links: the view lives in the
 * URL (`?view=`), the first tab is the default and keeps the URL clean, and
 * switching goes back to page 1.
 */
export function ViewTabs({ tabs, param = "view", label = "보기", className }: { tabs: ViewTab[]; param?: string; label?: string; className?: string }) {
  const searchParams = useSearchParams();
  const hrefWith = useListHref();
  const current = searchParams.get(param) ?? "";
  const activeKey = tabs.some((tab) => tab.key === current) ? current : (tabs[0]?.key ?? "");

  return (
    <nav aria-label={label} className={cn("-mx-1 overflow-x-auto", className)}>
      <ul className="flex min-w-max items-center gap-1 border-b px-1">
        {tabs.map((tab, index) => {
          const active = tab.key === activeKey;
          return (
            <li key={tab.key}>
              <Link
                href={hrefWith({ [param]: index === 0 ? null : tab.key })}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-10 items-center gap-1.5 rounded-t-md px-3 text-sm whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
                  active && "font-semibold text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary",
                )}
              >
                {tab.label}
                {tab.count !== undefined && tab.count !== null ? (
                  <span
                    className={cn(
                      "num rounded-full px-1.5 py-px text-[0.6875rem] font-medium",
                      active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {tab.count.toLocaleString("ko-KR")}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
