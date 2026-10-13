"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import en from "@/i18n/en/tabs.json";
import pcm from "@/i18n/pcm/tabs.json";
import BottomNav from "./BottomNav";
import { supabase } from "@/lib/supabase/browser";
import { useLang, useTheme } from "@/lib/prefs";
import { searchAreas, type AreaLite } from "@/lib/search";

const dict = { en, pcm } as const;

export default function ExploreClient() {
  const [lang] = useLang();
  const [theme] = useTheme();
  const t = dict[lang].explore;
  const [areas, setAreas] = useState<AreaLite[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase().from("areas").select("id,name,city,lat,lng,lgas(name,states(name))").order("name");
      setAreas((data ?? []).map((a) => {
        const l = a.lgas as unknown as { name: string; states: { name: string } };
        return { id: a.id, name: a.name, city: a.city, lat: a.lat, lng: a.lng, lga: l.name, state: l.states.name };
      }));
    })();
  }, []);

  const shown = useMemo(() => (areas ? (query.trim() ? searchAreas(areas, query, 30) : areas.slice(0, 40)) : []), [areas, query]);

  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 pb-32 pt-6">
      <h1 className="text-[28px] font-light tracking-tight">{t.title}</h1>
      <input
        type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.placeholder} aria-label={t.placeholder}
        className="panel mt-4 min-h-12 w-full rounded-2xl px-4 text-[16px] outline-none"
      />
      <p className="mt-3 text-sm text-muted" role="status">
        {areas === null ? t.loading : query.trim() ? (shown.length ? "" : t.none) : t.all}
      </p>
      <ul className="mt-2 space-y-2">
        {shown.map((a) => (
          <li key={a.id}>
            <Link href={`/area/${a.id}`} className="press panel flex min-h-14 flex-col justify-center rounded-2xl px-4">
              <span className="text-[16px] font-medium">{a.name}</span>
              <span className="text-sm text-muted">{[a.city, a.lga, a.state].filter(Boolean).join(" · ")}</span>
            </Link>
          </li>
        ))}
      </ul>
      <BottomNav />
    </main>
  );
}
