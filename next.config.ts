import type { NextConfig } from "next";

type Header = { key: string; value: string };

/**
 * Baseline security headers only. No Content-Security-Policy yet: GSAP,
 * three.js/WebGL and inline styles from motion libraries come later, and a CSP
 * should be designed once the page's real script/style sources are known.
 */
const securityHeaders: Header[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

/** Origin of an absolute http(s) URL, or null. */
function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

/**
 * Console headers (backoffice spec 4). They follow the global rule, so the
 * same keys (X-Frame-Options, Referrer-Policy) override it under /admin. The
 * CSP ships in production builds only (dev needs eval for React refresh) and
 * only when BACKOFFICE_SUPABASE_URL is set: Supabase is the one third-party
 * origin (signed file URLs).
 */
export function adminHeaders({ nodeEnv, supabaseUrl }: { nodeEnv: string | undefined; supabaseUrl: string | undefined }): Header[] {
  const headers: Header[] = [
    { key: "X-Robots-Tag", value: "noindex, nofollow" },
    { key: "Cache-Control", value: "private, no-store" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "no-referrer" },
  ];
  const supabase = originOf(supabaseUrl);
  if (nodeEnv === "production" && supabase) {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${supabase}`,
      `frame-src ${supabase}`,
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
    ];
    headers.push({ key: "Content-Security-Policy", value: csp.join("; ") });
  }
  return headers;
}

/**
 * The landing stylesheet (src/app/(site)/globals.css) uses Tailwind's
 * automatic source detection over the whole project. These lines, appended
 * at build time by scripts/next/append-css-loader.cjs, keep the console
 * folders out of that scan, so no console utility or token (--sidebar-*,
 * --status-*) reaches the landing CSS. The file itself stays byte-identical.
 * The backoffice spec and plan docs are excluded too: their prose would add
 * unused utilities. Paths are relative to src/app/(site)/. The console has
 * its own entry, src/app/(admin)/admin.css, with source(none) and explicit
 * @source paths.
 */
export const LANDING_CSS_EXCLUDES = [
  '@source not "../(admin)";',
  '@source not "../../components/admin";',
  '@source not "../../lib/admin";',
  '@source not "../../hooks/admin";',
  '@source not "../../../tests/e2e-admin";',
  '@source not "../../../docs/superpowers/*/2026-10-13-backoffice-*";',
];

const LANDING_GLOBALS_CSS = /(^|\/)src\/app\/\(site\)\/globals\.css$/;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Two root layouts ((site) and (admin)): unmatched URLs render
    // src/app/global-not-found.tsx instead of reloading in a loop in dev.
    globalNotFound: true,
  },
  turbopack: {
    rules: {
      // Tailwind runs on global stylesheets only. Without the condition the
      // rule also matched *.module.css and re-emitted it as plain global CSS
      // (empty class map, unhashed global names). CSS modules use no Tailwind
      // directives, so they keep Next's own CSS-module processing.
      // The landing globals.css gets the console exclusions first (loaders
      // run last to first); every other global stylesheet is unchanged.
      "*.css": [
        {
          condition: { all: [{ not: { path: "*.module.css" } }, { path: LANDING_GLOBALS_CSS }] },
          loaders: [
            "@tailwindcss/turbopack",
            { loader: "./scripts/next/append-css-loader.cjs", options: { append: LANDING_CSS_EXCLUDES.join("\n") } },
          ],
          as: "*.css",
        },
        {
          condition: { all: [{ not: { path: "*.module.css" } }, { not: { path: LANDING_GLOBALS_CSS } }] },
          loaders: ["@tailwindcss/turbopack"],
          as: "*.css",
        },
      ],
    },
  },
  images: {
    // AVIF first, WebP fallback (order matters: first match in Accept wins).
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/admin/:path*",
        headers: adminHeaders({ nodeEnv: process.env.NODE_ENV, supabaseUrl: process.env.BACKOFFICE_SUPABASE_URL }),
      },
    ];
  },
};

export default nextConfig;
