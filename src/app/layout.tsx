import type { Metadata, Viewport } from "next";

import { SmoothScroll } from "@/components/motion/SmoothScroll";
import { getSiteUrl, MAIN_CONTENT_ID, site } from "@/lib/site";

import { fontVariables } from "./fonts/paperlogy";
import "./globals.css";

// No `alternates.canonical` or `openGraph.url` here: metadata is shallow-merged
// down the tree, so a layout canonical would be inherited by every route
// (404, a future /privacy) and point them all at "/". Set them per page.
export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: site.title,
    template: `%s | ${site.name}`,
  },
  description: site.oneLiner,
  applicationName: site.name,
  openGraph: {
    type: "website",
    locale: site.locale,
    siteName: site.name,
    title: site.title,
    description: site.oneLiner,
  },
  twitter: {
    card: "summary_large_image",
    title: site.title,
    description: site.oneLiner,
  },
  // App copy contains numbers like 01012345678; keep iOS from auto-linking them.
  formatDetection: { telephone: false, email: false, address: false },
};

// The page opens at night (22:00); PhaseSync moves theme-color to #EDECE3 at dawn.
// viewportFit cover: the mobile record pill and the sticky submit bar sit
// above env(safe-area-inset-bottom), which is 0 without it.
export const viewport: Viewport = {
  themeColor: "#07231C",
  colorScheme: "light",
  viewportFit: "cover",
};

/*
 * Runs before first paint (spec S1 draw-in): html.js-draw hides the hero map
 * strokes so they can draw in, only on desktop motion and not on low-power
 * devices (Save-Data, 4 or fewer cores, 4 GB or less memory; spec 6.6).
 * Without JS, or when this does not match, the map stays fully drawn.
 * The query mirrors MQ.desktopMotion in src/lib/gsap-plugins.ts and the
 * low-power test mirrors isLowPower() in src/lib/device.ts, including its
 * rule that WebKit's clamped core count of 4 on iOS / iPadOS is unknown.
 */
const JS_DRAW = `(function(){try{var n=navigator,c=n.connection,h=n.hardwareConcurrency||0,m=n.deviceMemory||0,u=n.userAgent||"",q=window.matchMedia("(min-width: 1024px) and (prefers-reduced-motion: no-preference)").matches;if(!q)return;document.documentElement.classList.add("js-motion");if(h===4&&(/iPhone|iPad|iPod/.test(u)||(/Macintosh/.test(u)&&n.maxTouchPoints>1)))h=0;if(c&&c.saveData)return;if((h>0&&h<=4)||(m>0&&m<=4))return;document.documentElement.classList.add("js-draw")}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-phase starts at night in SSR (spec 5.5). The inline script and
    // PhaseSync change html attributes before and after hydration.
    <html lang="ko" className={fontVariables} data-phase="night" suppressHydrationWarning>
      <head>
        <script id="js-draw" dangerouslySetInnerHTML={{ __html: JS_DRAW }} />
      </head>
      <body className="font-sans text-fg">
        <a href={`#${MAIN_CONTENT_ID}`} className="skip-link">
          본문으로 건너뛰기
        </a>
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
