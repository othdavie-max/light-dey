import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";
import { appConfig } from "../../config/app.config";

async function areaIds(): Promise<number[]> {
  "use cache";
  cacheLife("hours");
  try {
    const { data } = await adminClient().from("areas").select("id").order("id");
    return (data ?? []).map((a) => a.id as number);
  } catch { return []; }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? appConfig.siteUrl;
  const fixed = ["", "/explore", "/map", "/board", "/about", "/privacy", "/terms"].map((p) => ({ url: `${base}${p}`, changeFrequency: "daily" as const, priority: p === "" ? 1 : 0.6 }));
  const areas = (await areaIds()).map((id) => ({ url: `${base}/area/${id}`, changeFrequency: "hourly" as const, priority: 0.7 }));
  return [...fixed, ...areas];
}
