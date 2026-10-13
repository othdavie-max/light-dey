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

/**
 * Everything a screen needs about one spot: its details, current status, the last week of supply
 * sessions, and live updates (when anyone's report changes the status, it changes here too).
 */
export function useSpotLive(spotId: string | null, days = 7) {
  const [data, setData] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!spotId) return;
    const sb = supabase();
    let channel: ReturnType<typeof sb.channel> | null = null;
    let cancelled = false;

    (async () => {
      const since = new Date(lagosDayStart(new Date()).getTime() - (days - 1) * 86_400_000).toISOString();
      const [spotRes, statusRes, sessRes] = await Promise.all([
        sb.from("spots").select("id,name,band,disco_id,discos(code),areas(id,name,city,lgas(name))").eq("id", spotId).maybeSingle(),
        sb.from("spot_status").select("status,since,last_report_at").eq("spot_id", spotId).maybeSingle(),
        sb.from("supply_sessions").select("status,started_at,ended_at,last_confirmed_at").eq("spot_id", spotId).or(`ended_at.is.null,ended_at.gte.${since}`),
      ]);
      if (cancelled) return;

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
      setData({
        spotId,
        spot,
        row: statusRes.data
          ? { status: statusRes.data.status as SpotState, since: statusRes.data.since ? new Date(statusRes.data.since) : null, lastReportAt: statusRes.data.last_report_at ? new Date(statusRes.data.last_report_at) : null }
          : UNKNOWN,
        sessions: (sessRes.data ?? []).map((s) => ({
          status: s.status as ReportStatus, startedAt: new Date(s.started_at),
          endedAt: s.ended_at ? new Date(s.ended_at) : null, lastConfirmedAt: new Date(s.last_confirmed_at),
        })),
      });

      channel = sb.channel(`spot-${spotId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "spot_status", filter: `spot_id=eq.${spotId}` }, (p) => {
          const n = p.new as { status: SpotState; since: string | null; last_report_at: string | null };
          setData((d) => d && d.spotId === spotId
            ? { ...d, row: { status: n.status, since: n.since ? new Date(n.since) : null, lastReportAt: n.last_report_at ? new Date(n.last_report_at) : null } }
            : d);
        })
        .subscribe();
    })();

    return () => { cancelled = true; if (channel) sb.removeChannel(channel); };
  }, [spotId, days]);

  const current = data && data.spotId === spotId ? data : null;
  const setRow = useCallback((row: StatusRow) => {
    setData((d) => (d && d.spotId === spotId ? { ...d, row } : d));
  }, [spotId]);

  return {
    loaded: current !== null,
    spot: current?.spot ?? null,
    row: current?.row ?? UNKNOWN,
    sessions: current?.sessions ?? [],
    setRow,
  };
}
