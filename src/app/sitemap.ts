import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site";

/** Spec 12: the landing page is the site's only indexable URL. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: new URL("/", getSiteUrl()).href,
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
