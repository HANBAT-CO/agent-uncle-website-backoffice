import type { Metadata, Viewport } from "next";

import { getSiteUrl, site } from "@/lib/site";

import { fontVariables } from "../fonts/paperlogy";
import "../(site)/globals.css";
import "./legal.css";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: { default: site.name, template: `%s | ${site.name}` },
  // Keep out of search until the operational items in docs/legal-release-checklist.md are resolved.
  robots: { index: false, follow: true },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#EDECE3",
  colorScheme: "light",
  viewportFit: "cover",
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={fontVariables} data-phase="day" data-legal="">
      <body className="legal-body font-sans">
        <a className="skip-link" href="#main">본문으로 건너뛰기</a>
        {children}
      </body>
    </html>
  );
}
