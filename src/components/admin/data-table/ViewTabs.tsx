"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/admin/utils";

import { useListHref } from "./use-list-href";

export type ViewTab = { key: string; label: string; count?: number | null };

/**
 * List views with counts (screens 9, 10.x). Real links: the view lives in the
 * URL (`?view=`), the first tab is the default and keeps the URL clean, and
 * switching goes back to page 1.
 */
export function ViewTabs({ tabs, param = "view", label = "보기", className }: { tabs: ViewTab[]; param?: string; label?: string; className?: string }) {
  const navRef = useRef<HTMLElement>(null);
  const searchParams = useSearchParams();
  const hrefWith = useListHref();
  const current = searchParams.get(param) ?? "";
  const activeKey = tabs.some((tab) => tab.key === current) ? current : (tabs[0]?.key ?? "");

  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active) return;
    const viewport = nav.getBoundingClientRect();
    const tab = active.getBoundingClientRect();

    // Reveal the selected view without moving the page or its table scroll.
    if (tab.right > viewport.right) nav.scrollLeft += tab.right - viewport.right + 4;
    else if (tab.left < viewport.left) nav.scrollLeft -= viewport.left - tab.left + 4;
  }, [activeKey]);

  return (
    <nav ref={navRef} aria-label={label} className={cn("console-view-tabs -mx-1 overflow-x-auto", className)}>
      <ul className="flex min-w-max items-center gap-1 border-b border-[var(--console-line)] px-1">
        {tabs.map((tab, index) => {
          const active = tab.key === activeKey;
          return (
            <li key={tab.key}>
              <Link
                href={hrefWith({ [param]: index === 0 ? null : tab.key })}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-12 items-center gap-2 rounded-t-md px-3 text-[0.8125rem] whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-card/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  active && "font-semibold text-primary after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-primary",
                )}
              >
                {tab.label}
                {tab.count !== undefined && tab.count !== null ? (
                  <span
                    className={cn(
                      "num min-w-5 rounded px-1.5 py-px text-center text-[0.625rem] font-medium",
                      active ? "bg-primary text-primary-foreground" : "bg-muted/70 text-muted-foreground",
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
