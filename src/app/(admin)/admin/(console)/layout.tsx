import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";

import { AppSidebar } from "@/components/admin/shell/AppSidebar";
import { LiveRule } from "@/components/admin/shell/LiveRule";
import { SkipLink } from "@/components/admin/shell/SkipLink";
import { TopBar } from "@/components/admin/shell/TopBar";
import { ErrorState } from "@/components/admin/states/ErrorState";
import { SidebarProvider } from "@/components/admin/ui/sidebar";
import { currentAdminPath, verifyAdmin, type AdminSession } from "@/lib/admin/dal";
import { navBadges } from "@/lib/admin/nav";
import { rpc } from "@/lib/admin/rpc";

const CONSOLE_ERROR_MESSAGE = "화면을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";

/** `demo` from the console path (live only): seeded demo rows count in the badges too. */
function demoFlag(path: string): boolean {
  const value = new URLSearchParams(path.split("?")[1] ?? "").get("demo");
  return value === "1" || value === "true";
}

/**
 * Console shell (backoffice spec 4, 9; screens appendix 9). Every route under
 * (console) passes verifyAdmin() here; pages still call requireRole() for
 * screens above viewer, and Postgres re-checks every RPC. Badges come from
 * backoffice_overview and simply disappear when it fails. The `sheet` slot
 * carries the intercepted request Sheet (WP-07) and is null elsewhere.
 */
export default async function ConsoleLayout({ children, sheet }: { children: React.ReactNode; sheet: React.ReactNode }) {
  let session: AdminSession;
  try {
    session = await verifyAdmin();
  } catch (error) {
    unstable_rethrow(error);
    console.error("[backoffice] console gate failed", error instanceof Error ? error.message : "unknown");
    return (
      <>
        <LiveRule />
        <main id="main" className="grid min-h-dvh place-items-center px-6">
          <ErrorState message={CONSOLE_ERROR_MESSAGE} className="flex w-full max-w-md flex-col items-center gap-3 rounded-xl border border-dashed bg-card/60 p-8 text-center" />
        </main>
      </>
    );
  }

  const [path, cookieStore] = await Promise.all([currentAdminPath(), cookies()]);
  const overview = await rpc.overview({ includeDemo: session.target === "live" && demoFlag(path), days: 1 });
  const badges = navBadges(overview.ok ? overview.data : null);
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <SkipLink />
      <LiveRule />
      <AppSidebar role={session.role} badges={badges} />
      <div data-slot="console-column" className="flex min-h-svh min-w-0 flex-1 flex-col pt-1">
        <TopBar session={session} />
        <main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col gap-6 px-4 pt-6 pb-16 outline-none lg:px-8">
          {children}
        </main>
      </div>
      {sheet}
    </SidebarProvider>
  );
}
