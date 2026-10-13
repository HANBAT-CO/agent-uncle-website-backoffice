import Link from "next/link";

import { cn } from "@/lib/admin/utils";

const TABS = [
  { key: "history", label: "알림 기록", href: "/admin/notices" },
  { key: "notices", label: "공지", href: "/admin/notices?tab=notices" },
] as const;

/** 알림 기록 / 공지 (screens 10.14). Switching tabs drops the other tab's view, page and editor. */
export function NoticeTabs({ current, counts }: { current: "history" | "notices"; counts?: Partial<Record<"history" | "notices", number>> }) {
  return (
    <nav aria-label="알림·공지 탭" className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max items-center gap-1 border-b px-1">
        {TABS.map((tab) => {
          const active = tab.key === current;
          const count = counts?.[tab.key];
          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-11 items-center gap-1.5 rounded-t-md px-3 text-[0.9375rem] whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
                  active && "font-semibold text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary",
                )}
              >
                {tab.label}
                {count !== undefined ? <span className="num text-xs font-normal text-muted-foreground">{count.toLocaleString("ko-KR")}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
