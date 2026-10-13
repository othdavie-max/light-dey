"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import en from "@/i18n/en/tabs.json";
import pcm from "@/i18n/pcm/tabs.json";
import BottomNav from "./BottomNav";
import { supabase } from "@/lib/supabase/browser";
import { useLang, useTheme } from "@/lib/prefs";
import { computeStatus } from "@/lib/status/compute";

const dict = { en, pcm } as const;
const COLOUR = { on: "#ffc233", weak: "#ff9a4d", off: "#5b7bd5", mixed: "#8a93a8", unknown: "#8a93a8" } as const;
type St = keyof typeof COLOUR;

interface Dot { id: number; name: string; lat: number; lng: number; status: St }

export default function MapClient() {
  const [lang] = useLang();
  const [theme] = useTheme();
  const t = dict[lang].map;
  const el = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [counts, setCounts] = useState({ on: 0, weak: 0, off: 0, unknown: 0 });

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    (async () => {
      try {
        const sb = supabase();
        const [areasRes, spotsRes, statusRes, L] = await Promise.all([
          sb.from("areas").select("id,name,lat,lng"),
          sb.from("spots").select("id,area_id").eq("is_default", true),
          sb.from("spot_status").select("spot_id,status,since,last_report_at"),
          import("leaflet"),
        ]);
        if (cancelled || !el.current) return;
        if (areasRes.error || spotsRes.error || statusRes.error) { setState("error"); return; }

        const spotArea = new Map<string, number>((spotsRes.data ?? []).map((s) => [s.id as string, s.area_id as number]));
        const byArea = new Map<number, St>();
        const now = new Date();
        for (const r of statusRes.data ?? []) {
          const areaId = spotArea.get(r.spot_id as string);
          if (!areaId) continue;
          const shown = computeStatus([], { status: r.status, since: r.since ? new Date(r.since) : null, lastReportAt: r.last_report_at ? new Date(r.last_report_at) : null }, now);
          byArea.set(areaId, shown.status as St);
        }
        const dots: Dot[] = (areasRes.data ?? [])
          .filter((a) => typeof a.lat === "number" && typeof a.lng === "number")
          .map((a) => ({ id: a.id as number, name: a.name as string, lat: a.lat as number, lng: a.lng as number, status: byArea.get(a.id as number) ?? "unknown" }));

        const c = { on: 0, weak: 0, off: 0, unknown: 0 };
        for (const d of dots) c[d.status === "on" ? "on" : d.status === "weak" ? "weak" : d.status === "off" ? "off" : "unknown"]++;
        setCounts(c);

        map = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([9.1, 7.4], 7);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap contributors" }).addTo(map);
        const group = L.featureGroup();
        for (const d of dots) {
          const known = d.status !== "unknown" && d.status !== "mixed";
          const m = L.circleMarker([d.lat, d.lng], { radius: known ? 11 : 7, color: "#0a1020", weight: 2, fillColor: COLOUR[d.status], fillOpacity: known ? 0.95 : 0.6 });
          const pop = document.createElement("div");
          const a = document.createElement("a");
          a.href = `/area/${d.id}`;
          a.textContent = d.name;
          a.style.fontWeight = "600";
          const s = document.createElement("div");
          s.textContent = t.status[d.status];
          pop.append(a, s);
          m.bindPopup(pop);
          m.addTo(group);
        }
        group.addTo(map);
        if (dots.length) map.fitBounds(group.getBounds(), { padding: [30, 30], maxZoom: 11 });
        setState("ready");
      } catch { if (!cancelled) setState("error"); }
    })();
    return () => { cancelled = true; map?.remove(); };
  }, [t.status]);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 pb-32 pt-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[28px] font-light tracking-tight">{t.title}</h1>
        <Link href="/explore" className="press panel grid min-h-11 place-items-center rounded-full px-4 text-[14px] font-medium">{t.list}</Link>
      </div>
      <div ref={el} className="isolate mt-4 h-[56dvh] w-full overflow-hidden rounded-[24px]" style={{ background: "var(--panel)", border: "1px solid var(--panel-border)" }} role="region" aria-label={t.title} />
      <p className="mt-3 text-sm text-muted" role="status">{state === "loading" ? t.loading : state === "error" ? t.error : ""}</p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {(["on", "weak", "off", "unknown"] as const).map((k) => (
          <li key={k} className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: COLOUR[k] }} />{t.status[k]} <span className="text-muted">{counts[k]}</span></li>
        ))}
      </ul>
      <BottomNav />
    </main>
  );
}
