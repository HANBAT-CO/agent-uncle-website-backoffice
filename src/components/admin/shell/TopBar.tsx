import { SidebarTrigger } from "@/components/admin/ui/sidebar";
import type { AdminSession } from "@/lib/admin/dal";

import { Breadcrumbs } from "./Breadcrumbs";
import { CommandPalette } from "./CommandPalette";
import { DemoToggle } from "./DemoToggle";
import { EnvPill } from "./EnvPill";
import { UserMenu } from "./UserMenu";

/**
 * Console top bar (screens appendix 9): breadcrumb, the ⌘K search button,
 * the environment pill, the demo toggle (live only) and the account menu.
 * Sticky under the 4px rule.
 */
export function TopBar({ session }: { session: AdminSession }) {
  return (
    <header
      data-testid="admin-topbar"
      className="sticky top-1 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background/92 px-4 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80 lg:px-6"
    >
      <SidebarTrigger className="-ml-1 size-8 text-muted-foreground" />
      <Breadcrumbs />
      <div className="flex min-w-0 shrink items-center justify-end gap-2.5">
        <CommandPalette role={session.role} />
        <EnvPill target={session.target} role={session.role} />
        {session.target === "live" ? <DemoToggle /> : null}
        <UserMenu name={session.displayName} email={session.email} role={session.role} />
      </div>
    </header>
  );
}
