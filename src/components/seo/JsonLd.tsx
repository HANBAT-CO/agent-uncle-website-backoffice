import { getSiteUrl, site } from "@/lib/site";

/**
 * Structured data (spec 12): one WebSite object. No Organization until the
 * client confirms the public company name (spec 16, question 1), and no
 * SoftwareApplication offers or ratings.
 */
export function JsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.name,
    alternateName: site.englishName,
    url: new URL("/", getSiteUrl()).href,
    inLanguage: "ko-KR",
    description: site.oneLiner,
  };

  return (
    <script
      type="application/ld+json"
      // Escape "<" so the payload can never close the script element.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
