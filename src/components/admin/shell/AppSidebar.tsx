"use client";

import { SignOutIcon } from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFormStatus } from "react-dom";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/admin/ui/sidebar";
import { signOutAction } from "@/lib/admin/auth/actions";
import { NAV_FOOTER, activeNavKey, visibleNav, type NavItem } from "@/lib/admin/nav";
import type { AdminRole } from "@/lib/admin/roles";

import { NAV_ICONS } from "./nav-icons";

function NavLink({ item, active, count }: { item: NavItem; active: boolean; count?: number }) {
  const Icon = NAV_ICONS[item.icon];
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={count ? `${item.label} ${count}` : item.label} className="h-8 gap-2.5 px-2.5 text-[0.8125rem]">
        <Link href={item.href} aria-current={active ? "page" : undefined} data-nav-key={item.key}>
          <Icon aria-hidden weight={active ? "fill" : "regular"} />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {count ? (
            <span
              data-testid={`nav-badge-${item.key}`}
              className="ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-secondary px-1.5 text-[0.6875rem] font-semibold text-secondary-foreground num group-data-[collapsible=icon]:hidden"
            >
              {count > 999 ? "999+" : count}
              <span className="sr-only">건</span>
            </span>
          ) : null}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function SignOutMenuButton() {
  const { pending } = useFormStatus();
  return (
    <SidebarMenuButton type="submit" disabled={pending} tooltip="로그아웃" className="h-8 gap-2.5 px-2.5 text-[0.8125rem]">
      <SignOutIcon aria-hidden />
      <span>{pending ? "로그아웃하는 중…" : "로그아웃"}</span>
    </SidebarMenuButton>
  );
}

/**
 * Grouped console navigation (screens appendix 9): items above the staff
 * member's role are hidden, counts come from backoffice_overview, and the
 * footer holds 내 계정 and 로그아웃. Collapses to icons (⌘B).
 */
export function AppSidebar({ role, badges }: { role: AdminRole; badges: Record<string, number> }) {
  const pathname = usePathname();
  const active = activeNavKey(pathname);
  const groups = visibleNav(role);

  return (
    <Sidebar collapsible="icon" className="pt-1">
      <SidebarHeader className="px-3 pt-3 pb-1 group-data-[collapsible=icon]:px-2">
        {/* The name lives on the icon so the link keeps it when the sidebar collapses to icons. */}
        <Link href="/admin" className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
          <Image
            src="/brand/samchun-app-icon.png"
            alt="사입삼춘 운영"
            width={32}
            height={32}
            className="size-8 shrink-0 rounded-[0.6rem] ring-1 ring-foreground/10"
          />
          <span aria-hidden className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-bold tracking-tight text-foreground">사입삼춘 운영</span>
            <span className="truncate text-[0.6875rem] text-muted-foreground">운영 콘솔</span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="운영 메뉴" data-testid="admin-nav">
          {groups.map((group) => (
            <SidebarGroup key={group.label} className="py-0.5" data-nav-group={group.label}>
              <SidebarGroupLabel className="h-6 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground">{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <NavLink key={item.key} item={item} active={active === item.key} count={badges[item.key]} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
      <SidebarSeparator className="mx-3" />
      <SidebarFooter className="px-2 pb-3">
        <SidebarMenu>
          {NAV_FOOTER.map((item) => (
            <NavLink key={item.key} item={item} active={active === item.key} />
          ))}
          <SidebarMenuItem>
            <form action={signOutAction}>
              <input type="hidden" name="scope" value="local" />
              <SignOutMenuButton />
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
