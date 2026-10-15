/**
 * Site-wide constants. Strings here are verbatim from the app
 * (.context/brief/product.md section 1); do not paraphrase them.
 */

export const site = {
  name: "사입삼춘",
  englishName: "Agent Uncle",
  /** Official one-liner: web manifest + <meta description> in the app. */
  oneLiner: "사입 요청부터 상품 수령까지 함께 기록해요.",
  title: "사입삼춘 | 사입 요청부터 상품 수령까지 함께 기록해요",
  locale: "ko_KR",
  themeColor: "#0C483E",
} as const;

/** id of the page's <main>; the skip link in the root layout targets it. */
export const MAIN_CONTENT_ID = "main";

const DEFAULT_SITE_URL = "https://www.the-saena.ai";

function parseUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    // Canonicals, sitemap entries and schema IDs must all use the same origin.
    return new URL(parsed.origin);
  } catch {
    return null;
  }
}

/**
 * Absolute site origin for metadataBase, canonical URLs and OG images.
 * NEXT_PUBLIC_SITE_URL can override the confirmed production origin for local
 * metadata checks. Deployment/preview hostnames must not replace our canonical.
 */
export function getSiteUrl(): URL {
  return (
    parseUrl(process.env.NEXT_PUBLIC_SITE_URL) ??
    new URL(DEFAULT_SITE_URL)
  );
}
