"use client";
// The admin area. English only: it is an internal tool for you and your team, not for the public.
// Every request goes to /api/admin, which checks on the server that the caller is a real admin.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { agoShort, suspicionReasons } from "@/lib/admin";

type Tab = "overview" | "spots" | "flags" | "reporters" | "reference";
type Gate = "loading" | "out" | "denied" | "ok";

interface Overview {
  reports_today: number; reporters_today: number; reports_7d: number; reporters_7d: number;
  per_day: { day: string; reports: number; reporters: number }[];
  top_areas: { area: string; city: string | null; reports: number; reporters: number }[];
  totals: { people: number; spots: number; pending_spots: number; open_flags: number; banned: number };
}
interface AuditRow { id: number; action: string; target_type: string; target_id: string; created_at: string; admin: string }
interface AreaRef { id: number; name: string; city: string | null; lgas?: { name: string; states?: { name: string } } | null; lat?: number | null; lng?: number | null }
interface SpotRow {
  id: string; name: string; band: string | null; disco_id: number | null; status_flag: string; is_demo: boolean; is_default: boolean; created_at: string;
  areas: AreaRef | null; creator: { nickname: string; trust_score: number; is_banned: boolean } | null; similar: { id: string; name: string }[];
}
interface FlagRow {
  id: number; kind: string; target_type: string; target_id: string; reason: string | null; created_at: string;
  details: { band?: string; disco_id?: number } | null; spot: { name: string; band: string | null; areas: { name: string } | null } | null; subject: string | null; reporter: string | null;
}
interface ReporterRow {
  user_id: string; nickname: string; is_banned: boolean; trust: number; points: number; reports: string | number; spots: string | number;
  devices: string | number; networks: string | number; max_per_hour: string | number; share_off: string | number | null; last_report: string; open_flags: string | number;
}
interface Disco { id: number; name: string; code: string; is_active: boolean }
interface Band { id: number; band: string; min_hours_per_day: number; effective_date: string; source_note: string | null }

const BANDS = ["A", "B", "C", "D", "E"];
const card = "panel rounded-3xl p-4";
const input = "panel min-h-11 w-full rounded-xl px-3 text-[15px] outline-none focus:ring-2 focus:ring-[var(--on)]";
const btn = "press min-h-11 rounded-xl px-4 text-[14px] font-semibold";
const btnPlain = { background: "var(--panel-strong)", border: "1px solid var(--panel-border)" } as const;
const btnGold = { background: "linear-gradient(180deg,#ffd75e,#ffbf24)", color: "var(--on-text)" } as const;
const btnDanger = { background: "color-mix(in srgb, #ef4444 20%, transparent)", border: "1px solid color-mix(in srgb, #ef4444 50%, transparent)" } as const;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

async function api(method: "GET" | "POST", path: string, body?: unknown) {
  const { data } = await supabase().auth.getSession();
  const res = await fetch(`/api/admin${path}`, {
    method, cache: "no-store",
    headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

export default function AdminClient() {
  const [gate, setGate] = useState<Gate>("loading");
  const [tab, setTab] = useState<Tab>("overview");
  const [demo, setDemo] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [signInMsg, setSignInMsg] = useState<string | null>(null);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [spots, setSpots] = useState<SpotRow[]>([]);
  const [spotQuery, setSpotQuery] = useState("");
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [reporters, setReporters] = useState<ReporterRow[]>([]);
  const [days, setDays] = useState(7);
  const [discos, setDiscos] = useState<Disco[]>([]);
  const [bands, setBands] = useState<Band[]>([]);
  const [areas, setAreas] = useState<AreaRef[]>([]);
  const [areaQuery, setAreaQuery] = useState("");
  const [now, setNow] = useState(0);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4000); };

  // Who is looking at this page? (The first call to the server decides.)
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase().auth.getSession();
      if (!data.session || data.session.user.is_anonymous) { if (alive) setGate("out"); return; }
      const r = await api("GET", "?view=overview");
      if (!alive) return;
      if (r.status === 401) return setGate("out");
      if (r.status === 403) return setGate("denied");
      setOverview(r.json.overview as Overview);
      setAudit(r.json.audit as AuditRow[]);
      setNow(Date.now());
      setGate("ok");
    })();
    return () => { alive = false; };
  }, []);

  const load = useCallback(async (which: Tab) => {
    const d = demo ? "&demo=1" : "";
    if (which === "overview") {
      const r = await api("GET", `?view=overview${d}`);
      if (r.json.ok) { setOverview(r.json.overview as Overview); setAudit(r.json.audit as AuditRow[]); }
    } else if (which === "spots") {
      const r = await api("GET", `?view=spots${d}${spotQuery.trim() ? `&q=${encodeURIComponent(spotQuery.trim())}` : ""}`);
      if (r.json.ok) setSpots(r.json.spots as SpotRow[]);
    } else if (which === "flags") {
      const r = await api("GET", "?view=flags");
      if (r.json.ok) setFlags(r.json.flags as FlagRow[]);
    } else if (which === "reporters") {
      const r = await api("GET", `?view=reporters&days=${days}${d}`);
      if (r.json.ok) setReporters(r.json.reporters as ReporterRow[]);
    } else {
      const r = await api("GET", `?view=reference${areaQuery.trim() ? `&q=${encodeURIComponent(areaQuery.trim())}` : ""}`);
      if (r.json.ok) { setDiscos(r.json.discos as Disco[]); setBands(r.json.bands as Band[]); setAreas(r.json.areas as AreaRef[]); }
    }
    setNow(Date.now());
  }, [demo, spotQuery, days, areaQuery]);

  useEffect(() => {
    if (gate !== "ok") return;
    let alive = true;
    Promise.resolve().then(() => { if (alive) void load(tab); });
    return () => { alive = false; };
  }, [gate, tab, demo, days, load]);

  // The Spots tab also needs the DisCo list for its edit form
  useEffect(() => {
    if (gate !== "ok" || tab !== "spots" || discos.length) return;
    (async () => { const r = await api("GET", "?view=reference"); if (r.json.ok) setDiscos(r.json.discos as Disco[]); })();
  }, [gate, tab, discos.length]);

  async function act(body: Record<string, unknown>, okMessage: string, confirmText?: string): Promise<boolean> {
    if (confirmText && !window.confirm(confirmText)) return false;
    const r = await api("POST", "", body);
    if (r.json.ok) { say(okMessage); await load(tab); return true; }
    say(`Could not do that: ${String(r.json.error ?? r.status).replaceAll("_", " ")}`);
    return false;
  }

  async function sendLink() {
    setSignInMsg(null);
    const { error } = await supabase().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/admin` } });
    setSignInMsg(error ? `Could not send the link: ${error.message}` : "Check your email for the sign-in link, then come back to this page.");
  }
  async function signOut() { await supabase().auth.signOut(); window.location.reload(); }

  // ---------------------------------------------------------------- gates
  if (gate === "loading") return <main className="mx-auto max-w-md px-5 pt-16 text-center text-muted">Checking who you are…</main>;

  if (gate === "out" || gate === "denied") {
    return (
      <main className="mx-auto max-w-md px-5 pt-16">
        <h1 className="text-[28px] font-light tracking-tight">Admin</h1>
        {gate === "denied" ? (
          <>
            <p className="mt-3 text-muted">You are signed in, but this account is not an admin.</p>
            <button onClick={signOut} className={`${btn} mt-5`} style={btnPlain}>Sign out</button>
          </>
        ) : (
          <>
            <p className="mt-3 text-muted">Sign in with the email address of an admin account. We will email you a link.</p>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={`${input} mt-5`} aria-label="Email" />
            <button disabled={!email.includes("@")} onClick={sendLink} className={`${btn} mt-3 w-full disabled:opacity-50`} style={btnGold}>Email me a sign-in link</button>
            {signInMsg && <p className="mt-4 text-sm" role="status">{signInMsg}</p>}
          </>
        )}
      </main>
    );
  }

  // ---------------------------------------------------------------- the dashboard
  const tabs: [Tab, string][] = [["overview", "Overview"], ["spots", "Spots"], ["flags", "Flags"], ["reporters", "Reporters"], ["reference", "Data"]];
  const pendingBadge = overview?.totals.pending_spots ?? 0, flagBadge = overview?.totals.open_flags ?? 0;
  const maxReports = Math.max(1, ...(overview?.per_day.map((d) => d.reports) ?? [1]));

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-[24px] font-light tracking-tight">Light Dey? Admin</h1>
        <div className="flex items-center gap-2">
          <label className="flex min-h-11 items-center gap-2 text-sm text-muted"><input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} /> Include demo data</label>
          <button onClick={signOut} className={btn} style={btnPlain}>Sign out</button>
        </div>
      </header>

      <nav className="mt-4 flex gap-2 overflow-x-auto" aria-label="Admin sections">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} aria-current={tab === k} className={`${btn} shrink-0`}
            style={tab === k ? btnGold : btnPlain}>
            {label}{k === "spots" && pendingBadge > 0 ? ` (${pendingBadge})` : ""}{k === "flags" && flagBadge > 0 ? ` (${flagBadge})` : ""}
          </button>
        ))}
      </nav>

      {toast && <p role="status" className="mt-3 rounded-xl px-4 py-2.5 text-sm" style={{ background: "var(--panel-strong)", border: "1px solid var(--panel-border)" }}>{toast}</p>}

      {/* ---------------- Overview ---------------- */}
      {tab === "overview" && overview && (
        <section className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([["Reporters today", overview.reporters_today], ["Reports today", overview.reports_today], ["Reporters, 7 days", overview.reporters_7d], ["Reports, 7 days", overview.reports_7d],
              ["People", overview.totals.people], ["Spots", overview.totals.spots], ["Spots to review", overview.totals.pending_spots], ["Open flags", overview.totals.open_flags]] as [string, number][]).map(([l, v]) => (
              <div key={l} className={card}><p className="text-[26px] font-light">{v}</p><p className="text-xs text-muted">{l}</p></div>
            ))}
          </div>

          <div className={card}>
            <h2 className="mb-3 text-[16px] font-medium">Reports per day (last 14 days)</h2>
            {overview.per_day.length === 0 ? <p className="text-muted">No reports yet.</p> : (
              <div className="flex h-32 items-end justify-center gap-1.5">
                {overview.per_day.map((d) => (
                  <div key={d.day} className="flex h-full max-w-[44px] flex-1 flex-col justify-end text-center" title={`${d.day}: ${d.reports} reports from ${d.reporters} people`}>
                    <span className="text-[10px] text-muted">{d.reports}</span>
                    <div className="rounded-t-md" style={{ height: `${Math.max(3, (d.reports / maxReports) * 90)}px`, background: "linear-gradient(180deg,#ffd75e,#ffbf24)" }} />
                    <span className="mt-1 text-[10px] text-muted">{d.day.slice(8)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={card}>
            <h2 className="mb-3 text-[16px] font-medium">Top areas this week</h2>
            {overview.top_areas.length === 0 ? <p className="text-muted">Nothing yet.</p> : (
              <ol className="space-y-1.5 text-[15px]">
                {overview.top_areas.map((a, i) => (
                  <li key={a.area + i} className="flex justify-between gap-3"><span>{i + 1}. {a.area}{a.city ? <span className="text-muted"> · {a.city}</span> : null}</span><span className="text-muted">{plural(a.reports, "report")}, {plural(a.reporters, "person", "people")}</span></li>
                ))}
              </ol>
            )}
          </div>

          <div className={card}>
            <h2 className="mb-3 text-[16px] font-medium">Recent admin actions</h2>
            {audit.length === 0 ? <p className="text-muted">None yet.</p> : (
              <ul className="space-y-1 text-sm">
                {audit.map((a) => <li key={a.id} className="flex justify-between gap-3"><span>{a.action} <span className="text-muted">({a.target_type})</span></span><span className="text-muted">{a.admin} · {agoShort(a.created_at, now)}</span></li>)}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* ---------------- Spots ---------------- */}
      {tab === "spots" && (
        <section className="mt-4 space-y-3">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void load("spots"); }}>
            <input value={spotQuery} onChange={(e) => setSpotQuery(e.target.value)} placeholder="Search any spot by name (empty = spots waiting for review)" className={input} aria-label="Search spots" />
            <button className={btn} style={btnPlain}>Search</button>
          </form>
          {spots.length === 0 && <p className="text-muted">{spotQuery.trim() ? "No spot found." : "Nothing is waiting for review. 🎉"}</p>}
          {spots.map((s) => <SpotCard key={s.id} spot={s} discos={discos} now={now} act={act} />)}
        </section>
      )}

      {/* ---------------- Flags ---------------- */}
      {tab === "flags" && (
        <section className="mt-4 space-y-3">
          {flags.length === 0 && <p className="text-muted">No open flags. 🎉</p>}
          {flags.map((f) => (
            <div key={f.id} className={card}>
              <p className="text-sm text-muted">{f.kind} · {agoShort(f.created_at, now)} ago{f.reporter ? ` · from ${f.reporter}` : ""}</p>
              <p className="mt-1 text-[16px] font-medium">
                {f.spot ? `${f.spot.name}${f.spot.areas ? ` (${f.spot.areas.name})` : ""}` : f.subject ? `Person: ${f.subject}` : `${f.target_type} ${f.target_id.slice(0, 8)}`}
              </p>
              <p className="mt-1 text-[15px]">{f.reason ?? "(no details)"}</p>
              {f.kind === "attributes" && f.spot && <p className="mt-1 text-sm text-muted">Now: band {f.spot.band ?? "none"}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button className={btn} style={btnGold} onClick={() => act({ action: "flag.resolve", id: f.id, status: "resolved" }, "Kept and closed")}>Looks right: keep</button>
                {f.kind === "attributes" && <button className={btn} style={btnDanger} onClick={() => act({ action: "flag.resolve", id: f.id, status: "resolved", undo: true }, "Suggestion undone", "Take this suggestion back and clear the value on the spot?")}>Wrong: undo</button>}
                <button className={btn} style={btnPlain} onClick={() => act({ action: "flag.resolve", id: f.id, status: "dismissed" }, "Dismissed")}>Dismiss</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ---------------- Reporters ---------------- */}
      {tab === "reporters" && (
        <section className="mt-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted">
            Busiest reporters over the last
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="panel min-h-11 rounded-xl px-3 text-[15px]" aria-label="Period">
              <option value={1}>day</option><option value={7}>7 days</option><option value={30}>30 days</option>
            </select>
          </div>
          <p className="text-xs text-muted">Highlights are hints only. Busy or multi-phone people are often honest. Look before you ban.</p>
          {reporters.length === 0 && <p className="text-muted">No reporters in this period.</p>}
          {reporters.map((r) => {
            const why = suspicionReasons(r);
            return (
              <div key={r.user_id} className={card} style={why.length ? { borderColor: "var(--weak)" } : undefined}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[16px] font-medium">{r.nickname}{r.is_banned ? <span className="ml-2 rounded-full px-2 py-0.5 text-xs" style={btnDanger}>banned</span> : null}</p>
                    <p className="text-sm text-muted">{r.reports} reports · {r.spots} spots · {r.devices} phones · {r.networks} networks · peak {r.max_per_hour}/hour · {r.share_off === null ? "–" : Math.round(Number(r.share_off) * 100)}% “no light” · trust {Number(r.trust).toFixed(2)} · last {agoShort(r.last_report, now)} ago</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {r.is_banned
                      ? <button className={btn} style={btnPlain} onClick={() => act({ action: "user.unban", id: r.user_id }, "Unbanned")}>Unban</button>
                      : <button className={btn} style={btnDanger} onClick={() => act({ action: "user.ban", id: r.user_id }, "Banned", `Ban ${r.nickname}? Their reports will be refused from now on.`)}>Ban</button>}
                    <button className={btn} style={btnPlain} onClick={() => act({ action: "user.resetTrust", id: r.user_id }, "Trust reset")}>Reset trust</button>
                  </div>
                </div>
                {why.length > 0 && <p className="mt-2 text-sm" style={{ color: "var(--weak)" }}>⚠ {why.join(" · ")}</p>}
              </div>
            );
          })}
        </section>
      )}

      {/* ---------------- Reference data ---------------- */}
      {tab === "reference" && (
        <ReferenceTab discos={discos} bands={bands} areas={areas} areaQuery={areaQuery} setAreaQuery={setAreaQuery} reload={() => load("reference")} act={act} />
      )}
    </main>
  );
}

// ======================================================================== one spot in the review queue
function SpotCard({ spot, discos, now, act }: { spot: SpotRow; discos: Disco[]; now: number; act: (b: Record<string, unknown>, ok: string, confirm?: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(spot.name);
  const [band, setBand] = useState(spot.band ?? "");
  const [disco, setDisco] = useState(spot.disco_id ? String(spot.disco_id) : "");
  const [merging, setMerging] = useState(false);
  const [q, setQ] = useState(spot.name.split(" ").slice(0, 2).join(" "));
  const [targets, setTargets] = useState<SpotRow[]>([]);
  const area = spot.areas ? `${spot.areas.name}${spot.areas.lgas ? ` · ${spot.areas.lgas.name} · ${spot.areas.lgas.states?.name ?? ""}` : ""}` : "";

  async function searchTargets() {
    const r = await api("GET", `?view=spots&demo=1&q=${encodeURIComponent(q.trim())}`);
    if (r.json.ok) setTargets((r.json.spots as SpotRow[]).filter((t) => t.id !== spot.id && t.status_flag !== "merged" && t.status_flag !== "rejected"));
  }
  const merge = (intoId: string, intoName: string) =>
    act({ action: "spot.merge", fromId: spot.id, intoId }, "Merged", `Merge “${spot.name}” into “${intoName}”? Reports and saved spots move over, and “${spot.name}” is hidden.`);

  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[17px] font-medium">{spot.name} {spot.is_demo && <span className="text-xs text-muted">(demo)</span>}</p>
          <p className="text-sm text-muted">{area}</p>
          <p className="text-sm text-muted">
            {spot.status_flag} · {agoShort(spot.created_at, now)} ago{spot.creator ? ` · by ${spot.creator.nickname} (trust ${Number(spot.creator.trust_score).toFixed(2)}${spot.creator.is_banned ? ", banned" : ""})` : ""}
            {spot.band ? ` · Band ${spot.band}` : ""}{spot.disco_id ? ` · ${discos.find((d) => d.id === spot.disco_id)?.code ?? "DisCo"}` : ""}
          </p>
        </div>
      </div>

      {spot.similar.length > 0 && (
        <div className="mt-3 rounded-2xl p-3" style={{ background: "color-mix(in srgb, var(--weak) 10%, transparent)" }}>
          <p className="text-sm font-medium">Possible duplicates in this area:</p>
          <ul className="mt-2 space-y-2">
            {spot.similar.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-[15px]">
                <span>{s.name}</span>
                <button className={btn} style={btnPlain} onClick={() => merge(s.id, s.name)}>Merge into this</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {spot.status_flag !== "approved" && <button className={btn} style={btnGold} onClick={() => act({ action: "spot.approve", id: spot.id }, "Approved")}>Approve</button>}
        {spot.status_flag !== "rejected" && <button className={btn} style={btnDanger} onClick={() => act({ action: "spot.reject", id: spot.id }, "Rejected", `Reject “${spot.name}”? It will be hidden from people.`)}>Reject</button>}
        <button className={btn} style={btnPlain} onClick={() => setEditing(!editing)}>Edit</button>
        <button className={btn} style={btnPlain} onClick={() => { setMerging(!merging); if (!merging) void searchTargets(); }}>Merge into…</button>
      </div>

      {editing && (
        <form className="mt-3 grid gap-2" onSubmit={async (e) => {
          e.preventDefault();
          const body: Record<string, unknown> = { action: "spot.update", id: spot.id, band: band || null, discoId: disco ? Number(disco) : null };
          if (name.trim() !== spot.name) body.name = name;
          if (await act(body, "Saved")) setEditing(false);
        }}>
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} aria-label="Name" maxLength={60} />
          <div className="grid grid-cols-2 gap-2">
            <select value={band} onChange={(e) => setBand(e.target.value)} className={input} aria-label="Band"><option value="">Band: unknown</option>{BANDS.map((b) => <option key={b} value={b}>Band {b}</option>)}</select>
            <select value={disco} onChange={(e) => setDisco(e.target.value)} className={input} aria-label="DisCo"><option value="">DisCo: unknown</option>{discos.filter((d) => d.is_active || d.id === spot.disco_id).map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}</select>
          </div>
          <button className={btn} style={btnGold}>Save changes</button>
        </form>
      )}

      {merging && (
        <div className="mt-3 space-y-2">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void searchTargets(); }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} className={input} aria-label="Find the spot to keep" placeholder="Find the real spot to keep" />
            <button className={btn} style={btnPlain}>Find</button>
          </form>
          {targets.length === 0 && <p className="text-sm text-muted">No other spots match.</p>}
          {targets.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 text-[15px]">
              <span>{t.name} <span className="text-muted">· {t.areas?.name} · {t.status_flag}</span></span>
              <button className={btn} style={btnPlain} onClick={() => merge(t.id, t.name)}>Keep this one</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ======================================================================== DisCos, band thresholds, areas
function ReferenceTab({ discos, bands, areas, areaQuery, setAreaQuery, reload, act }: {
  discos: Disco[]; bands: Band[]; areas: AreaRef[]; areaQuery: string; setAreaQuery: (v: string) => void; reload: () => void;
  act: (b: Record<string, unknown>, ok: string, confirm?: string) => Promise<boolean>;
}) {
  const [newName, setNewName] = useState(""), [newCode, setNewCode] = useState("");
  const [bBand, setBBand] = useState("A"), [bHours, setBHours] = useState(""), [bDate, setBDate] = useState(""), [bNote, setBNote] = useState("");
  const [editArea, setEditArea] = useState<number | null>(null);
  const [aForm, setAForm] = useState({ name: "", city: "", lat: "", lng: "" });
  const today = new Date().toISOString().slice(0, 10);

  // The newest threshold per band that has already started
  const current = BANDS.map((b) => bands.filter((x) => x.band === b && x.effective_date <= today).sort((x, y) => y.effective_date.localeCompare(x.effective_date))[0]).filter(Boolean);

  return (
    <section className="mt-4 space-y-4">
      <div className={card}>
        <h2 className="mb-1 text-[16px] font-medium">Tariff band promises</h2>
        <p className="mb-3 text-sm text-muted">Hours of supply per day each band promises. Add a new row when NERC changes the rules (old rows are kept as history). <strong>Please check these against NERC&apos;s current order.</strong></p>
        <ul className="space-y-1 text-[15px]">
          {current.map((b) => <li key={b.id} className="flex justify-between"><span>Band {b.band}: at least {b.min_hours_per_day} hours/day</span><span className="text-muted">since {b.effective_date}</span></li>)}
        </ul>
        {bands.length > current.length && (
          <details className="mt-3 text-sm text-muted"><summary className="cursor-pointer">All rows (history and future)</summary>
            <ul className="mt-2 space-y-1">{bands.map((b) => <li key={b.id}>Band {b.band}: {b.min_hours_per_day}h from {b.effective_date}{b.source_note ? ` (${b.source_note})` : ""}</li>)}</ul>
          </details>
        )}
        <form className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" onSubmit={async (e) => {
          e.preventDefault();
          if (await act({ action: "band.add", band: bBand, minHoursPerDay: Number(bHours), effectiveDate: bDate, sourceNote: bNote || undefined }, "Threshold added")) { setBHours(""); setBNote(""); }
        }}>
          <select value={bBand} onChange={(e) => setBBand(e.target.value)} className={input} aria-label="Band">{BANDS.map((b) => <option key={b}>{b}</option>)}</select>
          <input value={bHours} onChange={(e) => setBHours(e.target.value)} inputMode="decimal" placeholder="Hours/day" className={input} aria-label="Hours per day" />
          <input value={bDate} onChange={(e) => setBDate(e.target.value)} type="date" className={input} aria-label="Effective from" />
          <input value={bNote} onChange={(e) => setBNote(e.target.value)} placeholder="Source (e.g. NERC order)" className={input} aria-label="Source note" />
          <button disabled={!bHours || !bDate} className={`${btn} col-span-2 disabled:opacity-50 sm:col-span-4`} style={btnGold}>Add threshold</button>
        </form>
      </div>

      <div className={card}>
        <h2 className="mb-3 text-[16px] font-medium">DisCos</h2>
        <ul className="space-y-2">
          {discos.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 text-[15px]">
              <span style={d.is_active ? undefined : { opacity: 0.55 }}>{d.code} · {d.name}{d.is_active ? "" : " (off)"}</span>
              <button className={btn} style={btnPlain} onClick={() => act({ action: "disco.upsert", id: d.id, name: d.name, code: d.code, isActive: !d.is_active }, d.is_active ? "Switched off" : "Switched on")}>{d.is_active ? "Switch off" : "Switch on"}</button>
            </li>
          ))}
        </ul>
        <form className="mt-4 grid grid-cols-3 gap-2" onSubmit={async (e) => { e.preventDefault(); if (await act({ action: "disco.upsert", name: newName, code: newCode, isActive: true }, "DisCo added")) { setNewName(""); setNewCode(""); } }}>
          <input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="Code" className={input} aria-label="DisCo code" maxLength={12} />
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" className={`${input} col-span-2`} aria-label="DisCo name" />
          <button disabled={newName.trim().length < 3 || newCode.trim().length < 2} className={`${btn} col-span-3 disabled:opacity-50`} style={btnGold}>Add DisCo</button>
        </form>
      </div>

      <div className={card}>
        <h2 className="mb-3 text-[16px] font-medium">Areas</h2>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); reload(); }}>
          <input value={areaQuery} onChange={(e) => setAreaQuery(e.target.value)} placeholder="Search an area to edit" className={input} aria-label="Search areas" />
          <button className={btn} style={btnPlain}>Search</button>
        </form>
        <ul className="mt-3 space-y-2">
          {areas.map((a) => (
            <li key={a.id} className="text-[15px]">
              <div className="flex items-center justify-between gap-2">
                <span>{a.name} <span className="text-muted">· {a.lgas?.name} · {a.lgas?.states?.name}{a.lat != null ? ` · ${a.lat}, ${a.lng}` : " · no coordinates"}</span></span>
                <button className={btn} style={btnPlain} onClick={() => { setEditArea(editArea === a.id ? null : a.id); setAForm({ name: a.name, city: a.city ?? "", lat: a.lat != null ? String(a.lat) : "", lng: a.lng != null ? String(a.lng) : "" }); }}>Edit</button>
              </div>
              {editArea === a.id && (
                <form className="mt-2 grid grid-cols-2 gap-2" onSubmit={async (e) => {
                  e.preventDefault();
                  const body: Record<string, unknown> = { action: "area.update", id: a.id, name: aForm.name, city: aForm.city || null, lat: aForm.lat === "" ? null : Number(aForm.lat), lng: aForm.lng === "" ? null : Number(aForm.lng) };
                  if (await act(body, "Area saved")) setEditArea(null);
                }}>
                  <input value={aForm.name} onChange={(e) => setAForm({ ...aForm, name: e.target.value })} className={input} aria-label="Area name" />
                  <input value={aForm.city} onChange={(e) => setAForm({ ...aForm, city: e.target.value })} placeholder="City (e.g. Abuja)" className={input} aria-label="City" />
                  <input value={aForm.lat} onChange={(e) => setAForm({ ...aForm, lat: e.target.value })} placeholder="Latitude" inputMode="decimal" className={input} aria-label="Latitude" />
                  <input value={aForm.lng} onChange={(e) => setAForm({ ...aForm, lng: e.target.value })} placeholder="Longitude" inputMode="decimal" className={input} aria-label="Longitude" />
                  <button className={`${btn} col-span-2`} style={btnGold}>Save area</button>
                </form>
              )}
            </li>
          ))}
          {areaQuery.trim() && areas.length === 0 && <li className="text-muted">No area found.</li>}
        </ul>
      </div>
    </section>
  );
}
