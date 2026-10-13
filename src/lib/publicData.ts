// SERVER ONLY. A few public facts used to make link previews (title and picture) for shared pages.
import { cacheLife } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";

export interface PublicSpot { id: string; name: string; areaName: string; city: string | null }

export async function getPublicSpot(id: string): Promise<PublicSpot | null> {
  "use cache";
  cacheLife("minutes");
  try {
    const { data } = await adminClient().from("spots").select("id,name,status_flag,areas(name,city)").eq("id", id).maybeSingle();
    if (!data || data.status_flag === "rejected") return null;
    const a = data.areas as unknown as { name: string; city: string | null } | null;
    return { id: data.id, name: data.name.replace(/ \(whole area\)$/, ""), areaName: a?.name ?? "", city: a?.city ?? null };
  } catch { return null; }
}

export async function getPublicArea(id: number): Promise<{ id: number; name: string; city: string | null } | null> {
  "use cache";
  cacheLife("minutes");
  try {
    const { data } = await adminClient().from("areas").select("id,name,city").eq("id", id).maybeSingle();
    return data ? { id: data.id, name: data.name, city: data.city } : null;
  } catch { return null; }
}
