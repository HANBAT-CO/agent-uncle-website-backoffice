/**
 * Brand names and one-liner are verbatim from the app brief, section 1.
 * Search copy describes the verified product without changing that one-liner.
 */

export const site = {
  name: "사입삼춘",
  englishName: "Agent Uncle",
  /** Official app one-liner. */
  oneLiner: "사입 요청부터 상품 수령까지 함께 기록해요.",
  title: "사입삼춘 | 소매업자와 사입삼촌을 위한 사입·미송 관리 앱",
  description: "사입삼춘은 소매업자와 사입삼촌이 사입 요청, 확보, 미송, 전달, 수령을 함께 기록하는 사입 관리 앱입니다. 거래처와 같은 수량을 확인하고, 미송 재확인일과 회차별 전달 기록을 관리하세요.",
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
