import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site";

/** Allow public pages and point crawlers at the sitemap. Exclude the console (backoffice spec 4). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/admin" },
    sitemap: new URL("/sitemap.xml", getSiteUrl()).href,
  };
}
