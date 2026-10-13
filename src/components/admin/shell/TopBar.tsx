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
      className="console-topbar sticky top-1 z-20 shrink-0 border-b border-[var(--console-line)] bg-background/95 backdrop-blur-md"
    >
      <SidebarTrigger className="console-sidebar-trigger size-8 text-muted-foreground" />
      <Breadcrumbs />
      <CommandPalette role={session.role} />
      <div className="console-topbar-environment flex items-center gap-2">
        <EnvPill target={session.target} role={session.role} />
        {session.target === "live" ? <DemoToggle /> : null}
      </div>
      <div className="console-topbar-account">
        <UserMenu name={session.displayName} email={session.email} role={session.role} />
      </div>
    </header>
  );
}
