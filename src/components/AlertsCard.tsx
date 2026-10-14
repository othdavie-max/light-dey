"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/browser";
import { stopFollowing } from "@/lib/pushClient";

interface Words { title: string; none: string; quiet: string; quietFrom: string; quietTo: string; remove: string; saved: string }
interface Follow { spot_id: string; quiet_enabled: boolean; quiet_start: string; quiet_end: string; spots: { name: string } | null }

const hhmm = (t: string) => t.slice(0, 5);

/** The spots a person gets alerts for, plus their quiet hours (no alerts at night). */
export default function AlertsCard({ t }: { t: Words }) {
  const [rows, setRows] = useState<Follow[] | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const { data: s } = await sb.auth.getSession();
      const uid = s.session?.user.id;
      if (!uid) { setRows([]); return; }
      const { data } = await sb.from("follows").select("spot_id,quiet_enabled,quiet_start,quiet_end,spots(name)").eq("user_id", uid);
      setRows((data as unknown as Follow[] | null) ?? []);
    })();
  }, []);

  if (rows === null || rows.length === 0) {
    return rows === null ? null : (
      <section className="panel mt-5 rounded-[24px] p-4">
        <h2 className="text-[16px] font-medium">{t.title}</h2>
        <p className="mt-1 text-sm text-muted">{t.none}</p>
      </section>
    );
  }

  const first = rows[0];

  async function saveQuiet(patch: { quiet_enabled?: boolean; quiet_start?: string; quiet_end?: string }) {
    setRows((r) => (r ?? []).map((x) => ({ ...x, ...patch })));
    const sb = supabase();
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return;
    const res = await sb.from("follows").update(patch).eq("user_id", u.user.id);
    setNote(res.error ? "" : t.saved);
  }

  async function remove(id: string) {
    if (await stopFollowing(id)) setRows((r) => (r ?? []).filter((x) => x.spot_id !== id));
  }

  return (
    <section className="panel mt-5 rounded-[24px] p-4">
      <h2 className="text-[16px] font-medium">{t.title}</h2>
      <ul className="mt-2 space-y-2">
        {rows.map((r) => (
          <li key={r.spot_id} className="flex items-center gap-2">
            <Link href={`/spot/${r.spot_id}`} className="min-w-0 flex-1 truncate text-[15px]">{(r.spots?.name ?? "").replace(/ \(whole area\)$/, "")}</Link>
            <button onClick={() => remove(r.spot_id)} className="press min-h-11 px-3 text-sm text-muted">{t.remove}</button>
          </li>
        ))}
      </ul>
      <label className="mt-3 flex min-h-11 items-center gap-3 text-[15px]">
        <input type="checkbox" className="h-5 w-5" checked={first.quiet_enabled} onChange={(e) => saveQuiet({ quiet_enabled: e.target.checked })} />
        {t.quiet}
      </label>
      {first.quiet_enabled && (
        <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
          <label className="text-muted">{t.quietFrom}
            <input type="time" value={hhmm(first.quiet_start)} onChange={(e) => e.target.value && saveQuiet({ quiet_start: e.target.value })} className="panel mt-1 min-h-11 w-full rounded-xl px-3 text-[15px] text-[color:var(--text)]" />
          </label>
          <label className="text-muted">{t.quietTo}
            <input type="time" value={hhmm(first.quiet_end)} onChange={(e) => e.target.value && saveQuiet({ quiet_end: e.target.value })} className="panel mt-1 min-h-11 w-full rounded-xl px-3 text-[15px] text-[color:var(--text)]" />
          </label>
        </div>
      )}
      {note && <p className="mt-2 text-xs" role="status" style={{ color: "var(--ok)" }}>{note}</p>}
    </section>
  );
}
