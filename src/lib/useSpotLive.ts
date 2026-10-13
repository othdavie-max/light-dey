"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase/browser";
import { lagosDayStart } from "./status/hours";
import type { ReportStatus, SpotState, SupplySession } from "./status/types";

export interface SpotInfo {
  id: string;
  name: string;
  band: string | null;
  disco: string | null;
  discoId: number | null;
  areaId: number;
  areaName: string;
  city: string | null;
  lga: string | null;
}
export interface StatusRow { status: SpotState; since: Date | null; lastReportAt: Date | null }

const UNKNOWN: StatusRow = { status: "unknown", since: null, lastReportAt: null };

interface Loaded { spotId: string; spot: SpotInfo | null; row: StatusRow; sessions: SupplySession[] }

// ---- A copy kept on the phone, so the last known status shows instantly and still shows with no network ----
const cacheKey = (id: string) => `ld_cache_${id}`;
const ms = (d: Date | null) => (d ? d.getTime() : null);
const dt = (n: number | null) => (n === null ? null : new Date(n));

function writeCache(d: Loaded) {
  if (!d.spot) return;
  try {
    localStorage.setItem(cacheKey(d.spotId), JSON.stringify({
      spotId: d.spotId, spot: d.spot,
      row: { status: d.row.status, since: ms(d.row.since), lastReportAt: ms(d.row.lastReportAt) },
      sessions: d.sessions.map((s) => ({ status: s.status, startedAt: ms(s.startedAt), endedAt: ms(s.endedAt), lastConfirmedAt: ms(s.lastConfirmedAt) })),
    }));
  } catch { /* storage full or blocked: nothing is lost, it just will not be remembered */ }
}

function readCache(id: string): Loaded | null {
  try {
    const raw = localStorage.getItem(cacheKey(id));
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (c.spotId !== id || !c.spot) return null;
    return {
      spotId: id, spot: c.spot as SpotInfo,
      row: { status: c.row.status as SpotState, since: dt(c.row.since), lastReportAt: dt(c.row.lastReportAt) },
      sessions: (c.sessions as { status: ReportStatus; startedAt: number; endedAt: number | null; lastConfirmedAt: number }[]).map((s) => ({
        status: s.status, startedAt: new Date(s.startedAt), endedAt: dt(s.endedAt), lastConfirmedAt: new Date(s.lastConfirmedAt),
      })),
    };
  } catch {
    return null;
  }
}

/**
 * Everything a screen needs about one spot: its details, current status, the last week of supply
 * sessions, and live updates (when anyone's report changes the status, it changes here too).
 * The last answer is also kept on the phone: it shows immediately while fresh data loads, and stays on
 * screen when there is no network.
 */
export function useSpotLive(spotId: string | null, days = 7) {
  const [data, setData] = useState<Loaded | null>(null);
  const [nonce, setNonce] = useState(0);

  // When the network comes back, load again
  useEffect(() => {
    const again = () => setNonce((n) => n + 1);
    window.addEventListener("online", again);
    return () => window.removeEventListener("online", again);
  }, []);

  useEffect(() => {
    if (!spotId) return;
    const sb = supabase();
    let channel: ReturnType<typeof sb.channel> | null = null;
    let cancelled = false;

    (async () => {
      await Promise.resolve();                          // keep state changes out of the effect's synchronous part
      const cached = readCache(spotId);
      if (cached && !cancelled) setData((d) => (d && d.spotId === spotId ? d : cached));

      const since = new Date(lagosDayStart(new Date()).getTime() - (days - 1) * 86_400_000).toISOString();
      const [spotRes, statusRes, sessRes] = await Promise.all([
        sb.from("spots").select("id,name,band,disco_id,discos(code),areas(id,name,city,lgas(name))").eq("id", spotId).maybeSingle(),
        sb.from("spot_status").select("status,since,last_report_at").eq("spot_id", spotId).maybeSingle(),
        sb.from("supply_sessions").select("status,started_at,ended_at,last_confirmed_at").eq("spot_id", spotId).or(`ended_at.is.null,ended_at.gte.${since}`),
      ]);
      if (cancelled) return;
      // A failed request (usually no network) must not wipe what we already know
      if (spotRes.error || statusRes.error || sessRes.error) return;

      let spot: SpotInfo | null = null;
      if (spotRes.data) {
        const s = spotRes.data as unknown as {
          id: string; name: string; band: string | null; disco_id: number | null; discos: { code: string } | null;
          areas: { id: number; name: string; city: string | null; lgas: { name: string } | null } | null;
        };
        spot = {
          id: s.id, name: s.name, band: s.band, disco: s.discos?.code ?? null, discoId: s.disco_id,
          areaId: s.areas?.id ?? 0, areaName: s.areas?.name ?? "", city: s.areas?.city ?? null, lga: s.areas?.lgas?.name ?? null,
        };
      }
      const fresh: Loaded = {
        spotId,
        spot,
        row: statusRes.data
          ? { status: statusRes.data.status as SpotState, since: statusRes.data.since ? new Date(statusRes.data.since) : null, lastReportAt: statusRes.data.last_report_at ? new Date(statusRes.data.last_report_at) : null }
          : UNKNOWN,
        sessions: (sessRes.data ?? []).map((s) => ({
          status: s.status as ReportStatus, startedAt: new Date(s.started_at),
          endedAt: s.ended_at ? new Date(s.ended_at) : null, lastConfirmedAt: new Date(s.last_confirmed_at),
        })),
      };
      setData(fresh);
      writeCache(fresh);

      channel = sb.channel(`spot-${spotId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "spot_status", filter: `spot_id=eq.${spotId}` }, (p) => {
          const n = p.new as { status: SpotState; since: string | null; last_report_at: string | null };
          setData((d) => {
            if (!d || d.spotId !== spotId) return d;
            const next = { ...d, row: { status: n.status, since: n.since ? new Date(n.since) : null, lastReportAt: n.last_report_at ? new Date(n.last_report_at) : null } };
            writeCache(next);
            return next;
          });
        })
        .subscribe();
    })();

    return () => { cancelled = true; if (channel) sb.removeChannel(channel); };
  }, [spotId, days, nonce]);

  const current = data && data.spotId === spotId ? data : null;
  const setRow = useCallback((row: StatusRow) => {
    setData((d) => {
      if (!d || d.spotId !== spotId) return d;
      const next = { ...d, row };
      writeCache(next);
      return next;
    });
  }, [spotId]);

  return {
    loaded: current !== null,
    spot: current?.spot ?? null,
    row: current?.row ?? UNKNOWN,
    sessions: current?.sessions ?? [],
    setRow,
  };
}
