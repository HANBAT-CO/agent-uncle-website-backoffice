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
  useSidebar,
} from "@/components/admin/ui/sidebar";
import { signOutAction } from "@/lib/admin/auth/actions";
import { ADMIN_PANEL_NAME } from "@/lib/admin/brand";
import { NAV_FOOTER, activeNavKey, visibleNav, type NavItem } from "@/lib/admin/nav";
import type { AdminRole } from "@/lib/admin/roles";

import { NAV_ICONS } from "./nav-icons";

function NavLink({ item, active, count }: { item: NavItem; active: boolean; count?: number }) {
  const Icon = NAV_ICONS[item.icon];
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={count ? `${item.label} ${count}` : item.label} className="h-10 gap-3 px-3 text-[0.8125rem]">
        <Link href={item.href} aria-current={active ? "page" : undefined} data-nav-key={item.key} onClick={() => { if (isMobile) setOpenMobile(false); }}>
          <Icon aria-hidden weight={active ? "fill" : "regular"} />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {count ? (
            <span
              data-testid={`nav-badge-${item.key}`}
              className="num ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-[4px] bg-sidebar-foreground/10 px-1.5 text-[0.625rem] font-medium text-inherit group-data-[collapsible=icon]:hidden"
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
    <SidebarMenuButton type="submit" disabled={pending} tooltip="로그아웃" className="h-10 gap-3 px-3 text-[0.8125rem]">
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
    <Sidebar collapsible="icon" role="complementary" aria-label="운영 탐색" className="console-sidebar border-r-0 pt-1">
      <SidebarHeader className="px-5 pt-6 pb-7 group-data-[collapsible=icon]:px-2">
        {/* The name lives on the icon so the link keeps it when the sidebar collapses to icons. */}
        <Link href="/admin" className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
          <Image
            src="/brand/samchun-app-icon.png"
            alt={ADMIN_PANEL_NAME}
            width={36}
            height={36}
            className="size-9 shrink-0 rounded-[0.65rem] group-data-[collapsible=icon]:size-8"
          />
          <span aria-hidden className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-[13px]/[1.65] font-semibold tracking-tight break-keep text-sidebar-foreground">{ADMIN_PANEL_NAME}</span>
            <span className="mt-1 truncate text-[9px] tracking-[.16em] text-[#a9c2b4]">OPERATIONS CONSOLE</span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="운영 메뉴" data-testid="admin-nav">
          {groups.map((group) => (
            <SidebarGroup key={group.label} className="px-3 py-1.5 group-data-[collapsible=icon]:px-2" data-nav-group={group.label}>
              <SidebarGroupLabel className="h-7 px-3">{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {group.items.map((item) => (
                    <NavLink key={item.key} item={item} active={active === item.key} count={badges[item.key]} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
      <SidebarSeparator className="mx-3 data-horizontal:w-auto" />
      <SidebarFooter className="px-3 pb-4 group-data-[collapsible=icon]:px-2">
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
        <div aria-hidden className="mt-3 flex items-center justify-between px-3 text-[9px] tracking-[.08em] text-[#a9c2b4] group-data-[collapsible=icon]:hidden">
          <span>사입의 모든 연결</span><span>⌘ B</span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
