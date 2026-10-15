import { getSiteUrl, site } from "@/lib/site";

/**
 * Structured data (spec 12): one WebSite object. No Organization until the
 * client confirms the public company name (spec 16, question 1), and no
 * SoftwareApplication offers or ratings.
 */
export function JsonLd() {
  const origin = getSiteUrl();
  const data = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.name,
    alternateName: site.englishName,
    "@id": new URL("/#website", origin).href,
    url: new URL("/", origin).href,
    inLanguage: "ko-KR",
    description: site.description,
  };

  return <StructuredData data={data} />;
}

/** Server-rendered JSON-LD, shared by the home and guide pages. */
export function StructuredData({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // Escape "<" so the payload can never close the script element.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
