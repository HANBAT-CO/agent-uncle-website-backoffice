import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site";

/** Spec 12: index the landing, point crawlers at the sitemap. The console is never crawled (backoffice spec 4). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/admin" },
    sitemap: new URL("/sitemap.xml", getSiteUrl()).href,
  };
}
