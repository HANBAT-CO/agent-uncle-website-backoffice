import type { NextConfig } from "next";

/**
 * Baseline security headers only. No Content-Security-Policy yet: GSAP,
 * three.js/WebGL and inline styles from motion libraries come later, and a CSP
 * should be designed once the page's real script/style sources are known.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    rules: {
      // Tailwind runs on global stylesheets only. Without the condition the
      // rule also matched *.module.css and re-emitted it as plain global CSS
      // (empty class map, unhashed global names). CSS modules use no Tailwind
      // directives, so they keep Next's own CSS-module processing.
      "*.css": {
        condition: { not: { path: "*.module.css" } },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    // AVIF first, WebP fallback (order matters: first match in Accept wins).
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
