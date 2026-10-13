import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site";

/** Spec 12: index everything, point crawlers at the sitemap. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: new URL("/sitemap.xml", getSiteUrl()).href,
  };
}
