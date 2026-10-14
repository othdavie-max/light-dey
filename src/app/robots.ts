import type { MetadataRoute } from "next";
import { appConfig } from "../../config/app.config";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? appConfig.siteUrl;
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/my-data", "/onboarding", "/offline"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
