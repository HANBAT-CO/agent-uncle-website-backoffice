import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site";

/** Public search entry points. Legal documents and the console stay excluded. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: new URL("/", getSiteUrl()).href,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: new URL("/guide", getSiteUrl()).href,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
