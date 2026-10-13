import type { Metadata, Viewport } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { Toaster } from "@/components/admin/ui/sonner";
import { TooltipProvider } from "@/components/admin/ui/tooltip";
import { ADMIN_PANEL_NAME } from "@/lib/admin/brand";

import { paperlogy } from "./fonts";
import "./admin.css";

/*
 * Console root layout (backoffice spec D1, 4). A second root layout next to
 * (site): CSS, fonts and providers never mix with the landing, and moving
 * between / and /admin is a full page load. Light theme only (spec D12).
 * Noindex here plus X-Robots-Tag and no-store from next.config.ts and the
 * proxy.
 */
export const metadata: Metadata = {
  title: { default: ADMIN_PANEL_NAME, template: `%s | ${ADMIN_PANEL_NAME}` },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#EDECE3",
  colorScheme: "light",
};

export default function AdminRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={paperlogy.variable} data-theme="light">
      <body>
        <NuqsAdapter>
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        </NuqsAdapter>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
