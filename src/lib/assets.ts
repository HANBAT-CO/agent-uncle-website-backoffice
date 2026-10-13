/**
 * Brand files in public/brand. App media (stills, clips, film) live in
 * src/content/media.ts: the page shows only the real 2026-10-11 capture of the
 * denim night, never the older screenshot set.
 */
export const brand = {
  symbol: { src: "/brand/saip-samchun-symbol.svg", width: 415, height: 254, alt: "사입삼춘 로고", ink: "#111111" },
  appIcon: { src: "/brand/samchun-app-icon.svg", width: 1024, height: 1024, alt: "사입삼춘 앱 아이콘" },
  appIconPng: { src: "/brand/samchun-app-icon.png", width: 1024, height: 1024, alt: "사입삼춘 앱 아이콘" },
} as const;
