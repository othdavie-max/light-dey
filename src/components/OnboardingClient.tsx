"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { acceptConsent, hasConsent } from "@/lib/consent";
import en from "@/i18n/en/onboarding.json";
import pcm from "@/i18n/pcm/onboarding.json";
import { supabase, ensureSession } from "@/lib/supabase/browser";
import { useLang, setActiveSpot, type Lang } from "@/lib/prefs";
import { searchAreas, type AreaLite } from "@/lib/search";
import { nearestAreas } from "@/lib/geo";
import { appConfig } from "../../config/app.config";
import Bulb from "./Bulb";

const dict = { en, pcm } as const;
const LABELS = ["home", "office", "family", "other"] as const;
const BANDS = ["A", "B", "C", "D", "E"] as const;

interface SpotRow { id: string; name: string; is_default: boolean; status_flag: string; disco_id: number | null; band: string | null }
interface Named { id: number; name: string }

const fmt = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="press min-h-12 rounded-full px-4 text-[15px] font-medium"
      style={active
        ? { background: "linear-gradient(180deg,#ffd75e,#ffbf24)", color: "var(--on-text)" }
        : { background: "var(--panel-strong)", border: "1px solid var(--panel-border)" }}
    >
      {children}
    </button>
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="press min-h-14 w-full rounded-2xl text-[17px] font-semibold disabled:opacity-50"
      style={{ background: "linear-gradient(180deg,#ffd75e,#ffbf24)", color: "var(--on-text)", boxShadow: "0 8px 24px -8px rgba(255,190,40,.55), inset 0 1px 0 rgba(255,255,255,.5)" }}
    >
      {children}
    </button>
  );
}

const fieldClass = "panel min-h-12 w-full rounded-2xl px-4 text-[16px] outline-none focus:ring-2 focus:ring-[var(--on)]";

export default function OnboardingClient() {
  const router = useRouter();
  const [lang, setLang] = useLang();
  const t = dict[lang].onboarding;
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [adding, setAdding] = useState(false);
  const [consentOnly, setConsentOnly] = useState(false);          // someone who already has a spot, just agreeing to the terms

  // ---- step 1 state ----
  const [areas, setAreas] = useState<AreaLite[]>([]);
  const [query, setQuery] = useState("");
  const [nearby, setNearby] = useState<(AreaLite & { km: number })[] | null>(null);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [area, setArea] = useState<AreaLite | null>(null);
  const [spots, setSpots] = useState<SpotRow[]>([]);
  const [spotId, setSpotId] = useState<string | null>(null);
  const [label, setLabel] = useState<(typeof LABELS)[number] | null>("home");
  const [showBrowse, setShowBrowse] = useState(false);
  const [states, setStates] = useState<string[]>([]);
  const [stateName, setStateName] = useState("");
  const [lgaName, setLgaName] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [similar, setSimilar] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- step 2 state ----
  const [discos, setDiscos] = useState<Named[]>([]);
  const [discoId, setDiscoId] = useState<number | null>(null);
  const [band, setBand] = useState<string | null>(null);

  const chosen = spots.find((s) => s.id === spotId) ?? null;

  useEffect(() => {
    // "Add another spot" from the home screen skips the welcome screen. The address is only readable in the browser,
    // so these are set once, here, after the page has loaded.
    const params = new URLSearchParams(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect */
    if (params.get("add")) { setAdding(true); setStep(1); }
    if (params.get("consent")) setConsentOnly(true);
    else if (hasConsent()) setStep(1);                        // already agreed on this phone: no need to see the welcome again
    /* eslint-enable react-hooks/set-state-in-effect */
    (async () => {
      const { data } = await supabase().from("areas").select("id,name,city,lat,lng,lgas(name,states(name))").order("name");
      setAreas((data ?? []).map((a) => {
        const l = a.lgas as unknown as { name: string; states: { name: string } };
        return { id: a.id, name: a.name, city: a.city, lat: a.lat, lng: a.lng, lga: l.name, state: l.states.name };
      }));
    })();
  }, []);

  const results = useMemo(() => searchAreas(areas, query), [areas, query]);
  const browseAreas = useMemo(() => areas.filter((a) => a.state === stateName && a.lga === lgaName), [areas, stateName, lgaName]);
  const lgaOptions = useMemo(() => [...new Set(areas.filter((a) => a.state === stateName).map((a) => a.lga))], [areas, stateName]);
  const [allLgas, setAllLgas] = useState<Record<string, string[]>>({});

  async function openBrowse() {
    setShowBrowse(true);
    if (states.length) return;
    const { data } = await supabase().from("states").select("name").order("name");
    setStates((data ?? []).map((s) => s.name));
  }

  async function pickState(name: string) {
    setStateName(name);
    setLgaName("");
    if (name && !allLgas[name]) {
      const { data } = await supabase().from("lgas").select("name,states!inner(name)").eq("states.name", name).order("name");
      setAllLgas((m) => ({ ...m, [name]: (data ?? []).map((l) => l.name) }));
    }
  }

  function useMyLocation() {
    setLocMsg(t.spot.locating);
    if (!navigator.geolocation) { setLocMsg(t.spot.locationDenied); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // The position is used right here to rank areas. It is never saved or sent anywhere.
        const near = nearestAreas(areas, { lat: pos.coords.latitude, lng: pos.coords.longitude });
        setNearby(near);
        setLocMsg(near.length ? null : t.spot.locationNone);
      },
      () => setLocMsg(t.spot.locationDenied),
      { maximumAge: 600_000, timeout: 10_000 },
    );
  }

  async function chooseArea(a: AreaLite) {
    setArea(a);
    setSpotId(null);
    setNewOpen(false);
    setNewName("");
    setSimilar([]);
    setError(null);
    const { data } = await supabase().from("spots").select("id,name,is_default,status_flag,disco_id,band").eq("area_id", a.id).order("is_default", { ascending: false }).order("name");
    const rows = (data ?? []) as SpotRow[];
    setSpots(rows);
    const def = rows.find((r) => r.is_default);
    if (def) setSpotId(def.id);
  }

  // "Did you mean...?" while typing a new spot name
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onNewName(v: string) {
    setNewName(v);
    setError(null);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 3 || !area) { setSimilar([]); return; }
    timer.current = setTimeout(async () => {
      const { data } = await supabase().rpc("similar_spots", { p_area_id: area.id, p_name: v.trim() });
      setSimilar(((data ?? []) as { id: string; name: string }[]).slice(0, 4));
    }, 350);
  }

  async function createSpot() {
    if (!area) return;
    const name = newName.replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim();
    if (name.length < 3) { setError(t.spot.nameShort); return; }
    if (spots.some((s) => s.name.toLowerCase() === name.toLowerCase())) { setError(t.spot.exists); return; }
    setBusy(true);
    await ensureSession();
    const { data: u } = await supabase().auth.getUser();
    const { data, error: e } = await supabase().from("spots")
      .insert({ area_id: area.id, name: name.slice(0, 60), created_by: u.user?.id, status_flag: "pending" })
      .select("id,name,is_default,status_flag,disco_id,band").single();
    setBusy(false);
    if (e || !data) { setError(e?.code === "23505" ? t.spot.exists : t.spot.error); return; }
    setSpots((cur) => [...cur, data as SpotRow]);
    setSpotId(data.id);
    setNewOpen(false);
    setNewName("");
    setSimilar([]);
  }

  async function saveSpot() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      await ensureSession();
      const sb = supabase();
      const { data: u } = await sb.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("no session");
      const { data: existing } = await sb.from("saved_spots").select("spot_id").eq("user_id", uid);
      const already = (existing ?? []).some((s) => s.spot_id === chosen.id);
      if (!already && (existing?.length ?? 0) >= appConfig.maxSavedSpots) { setError(t.spot.full); setBusy(false); return; }
      const { error: e } = await sb.from("saved_spots").upsert({
        user_id: uid, spot_id: chosen.id, label: label ? dict[lang].onboarding.spot.labels[label] : null, position: existing?.length ?? 0,
      });
      if (e) throw e;
      setActiveSpot(chosen.id);
      await sb.from("profiles").update({ language: lang }).eq("id", uid);

      if (chosen.disco_id !== null && chosen.band !== null) router.push("/");
      else {
        const { data: d } = await sb.from("discos").select("id,name,code").eq("is_active", true).order("code");
        setDiscos((d ?? []).map((x) => ({ id: x.id, name: `${x.code} · ${x.name}` })));
        setStep(2);
      }
    } catch {
      setError(t.spot.error);
    }
    setBusy(false);
  }

  async function finish() {
    const needsDisco = chosen?.disco_id === null && discoId !== null;
    const needsBand = chosen?.band === null && band !== null;
    if (chosen && (needsDisco || needsBand)) {
      setBusy(true);
      try {
        const token = await ensureSession();
        await fetch("/api/spot-attributes", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token ?? ""}` },
          body: JSON.stringify({ spotId: chosen.id, discoId: needsDisco ? discoId : null, band: needsBand ? band : null }),
        });
      } catch { /* optional details: carry on */ }
      setBusy(false);
    }
    router.push("/");
  }

  const shell = "mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-6";
  const toggleLang = (l: Lang) => (
    <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l} className="press min-h-12 flex-1 rounded-2xl text-[16px] font-semibold"
      style={lang === l ? { background: "linear-gradient(180deg,#ffd75e,#ffbf24)", color: "var(--on-text)" } : { background: "var(--panel-strong)", border: "1px solid var(--panel-border)" }}>
      {l === "en" ? "English" : "Pidgin"}
    </button>
  );

  // ================= Screen 1: welcome =================
  if (step === 0) {
    return (
      <main className={shell}>
        <div className="flex flex-1 flex-col justify-center text-center">
          <div className="mx-auto mb-8 h-[165px] w-[121px]" aria-hidden="true">
            <div className="origin-top scale-[.59]"><Bulb status="on" /></div>
          </div>
          <h1 className="text-[34px] font-light leading-tight tracking-tight">{t.welcome.title}</h1>
          <p className="mt-4 text-[16px] leading-relaxed text-muted">{t.welcome.body}</p>
          <p className="mt-8 text-sm text-muted">{t.welcome.language}</p>
          <div className="mt-3 flex gap-3">{(["pcm", "en"] as Lang[]).map(toggleLang)}</div>
        </div>
        <p className="mb-4 mt-6 text-center text-xs leading-relaxed text-muted">
          {t.welcome.consent.before}
          <Link href="/terms" className="underline underline-offset-2">{t.welcome.consent.terms}</Link>
          {t.welcome.consent.and}
          <Link href="/privacy" className="underline underline-offset-2">{t.welcome.consent.privacy}</Link>
          {t.welcome.consent.after}
        </p>
        <PrimaryButton onClick={() => { void acceptConsent(); if (consentOnly) router.push("/"); else setStep(1); }}>{t.welcome.next}</PrimaryButton>
      </main>
    );
  }

  // ================= Screen 3: optional details =================
  if (step === 2 && chosen) {
    const discoSet = chosen.disco_id !== null, bandSet = chosen.band !== null;
    return (
      <main className={shell}>
        <h1 className="text-[28px] font-light leading-tight tracking-tight">{t.extras.title}</h1>
        {discoSet && bandSet && <p className="mt-4 text-muted">{t.extras.alreadySet}</p>}
        {!discoSet && (
          <section className="mt-6">
            <label htmlFor="disco" className="text-[15px] font-medium">{t.extras.disco}</label>
            <select id="disco" className={`${fieldClass} mt-2`} value={discoId ?? ""} onChange={(e) => setDiscoId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{t.extras.discoUnknown}</option>
              {discos.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </section>
        )}
        {!bandSet && (
          <section className="mt-6">
            <p className="text-[15px] font-medium">{t.extras.band}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {BANDS.map((b) => <Chip key={b} active={band === b} onClick={() => setBand(band === b ? null : b)}>Band {b}</Chip>)}
            </div>
            <p className="mt-2 text-sm text-muted">{t.extras.bandHelp}</p>
          </section>
        )}
        <section className="panel mt-8 rounded-3xl p-4">
          <p className="text-[15px] font-medium">🔔 {t.extras.notify}</p>
          <p className="mt-1 text-sm text-muted">{t.extras.notifyNote}</p>
        </section>
        <div className="mt-auto space-y-3 pt-8">
          <PrimaryButton onClick={finish} disabled={busy}>{t.extras.done}</PrimaryButton>
          <button onClick={() => router.push("/")} className="press min-h-12 w-full text-[15px] text-muted">{t.extras.skip}</button>
        </div>
      </main>
    );
  }

  // ================= Screen 2: pick your spot =================
  return (
    <main className={shell}>
      <div className="flex items-center gap-3">
        {adding && <button onClick={() => router.push("/")} className="press panel grid h-12 w-12 place-items-center rounded-full" aria-label={t.back}>←</button>}
        <h1 className="text-[26px] font-light leading-tight tracking-tight">{t.spot.title}</h1>
      </div>

      {!area && (
        <>
          <input
            type="search" inputMode="search" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={t.spot.search} aria-label={t.spot.search} className={`${fieldClass} mt-5`} autoFocus
          />

          {query.trim() && (
            <section className="mt-3" aria-live="polite">
              {results.length === 0 ? (
                <p className="px-1 py-3 text-muted">{t.spot.noResults}</p>
              ) : (
                <ul className="panel divide-y divide-[var(--panel-border)] overflow-hidden rounded-3xl">
                  {results.map((a) => (
                    <li key={a.id}>
                      <button onClick={() => chooseArea(a)} className="press flex min-h-14 w-full flex-col items-start justify-center px-4 py-2 text-left">
                        <span className="text-[17px] font-medium">{a.name}</span>
                        <span className="text-sm text-muted">{[a.lga, a.state].join(" · ")}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {!query.trim() && (
            <section className="mt-4">
              <button onClick={useMyLocation} className="press panel flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-medium">
                📍 {t.spot.useLocation}
              </button>
              <p className="mt-2 px-1 text-xs text-muted">{t.spot.locationNote}</p>
              {locMsg && <p className="mt-3 px-1 text-muted" role="status">{locMsg}</p>}
              {nearby && nearby.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 px-1 text-sm font-medium text-muted">{t.spot.nearby}</p>
                  <ul className="panel divide-y divide-[var(--panel-border)] overflow-hidden rounded-3xl">
                    {nearby.map((a) => (
                      <li key={a.id}>
                        <button onClick={() => chooseArea(a)} className="press flex min-h-14 w-full flex-col items-start justify-center px-4 py-2 text-left">
                          <span className="text-[17px] font-medium">{a.name}</span>
                          <span className="text-sm text-muted">{[a.lga, a.state].join(" · ")}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-6">
                {!showBrowse ? (
                  <button onClick={openBrowse} className="press min-h-12 w-full text-[15px] text-muted underline underline-offset-4">{t.spot.browse}</button>
                ) : (
                  <div className="space-y-3">
                    <select className={fieldClass} value={stateName} onChange={(e) => pickState(e.target.value)} aria-label={t.spot.pickState}>
                      <option value="">{t.spot.pickState}</option>
                      {states.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {stateName && (
                      <select className={fieldClass} value={lgaName} onChange={(e) => setLgaName(e.target.value)} aria-label={t.spot.pickLga}>
                        <option value="">{t.spot.pickLga}</option>
                        {(allLgas[stateName] ?? lgaOptions).map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    )}
                    {lgaName && browseAreas.length === 0 && <p className="px-1 text-muted">{fmt(t.spot.noAreasYet, { lga: lgaName })}</p>}
                    {browseAreas.length > 0 && (
                      <ul className="panel divide-y divide-[var(--panel-border)] overflow-hidden rounded-3xl">
                        {browseAreas.map((a) => (
                          <li key={a.id}><button onClick={() => chooseArea(a)} className="press min-h-14 w-full px-4 text-left text-[17px] font-medium">{a.name}</button></li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {area && (
        <section className="mt-5">
          <button onClick={() => { setArea(null); setSpots([]); setSpotId(null); }} className="press mb-3 min-h-12 text-[15px] text-muted">← {t.back}</button>
          <h2 className="text-[20px] font-medium">{fmt(t.spot.spots, { area: area.name })}</h2>

          <ul className="mt-3 space-y-2" role="radiogroup">
            {spots.map((s) => (
              <li key={s.id}>
                <button
                  role="radio" aria-checked={s.id === spotId} onClick={() => setSpotId(s.id)}
                  className="press panel flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl px-4 py-2 text-left"
                  style={s.id === spotId ? { borderColor: "var(--on)", boxShadow: "0 0 0 1px var(--on)" } : undefined}
                >
                  <span>
                    <span className="block text-[16px] font-medium">{s.is_default ? t.spot.wholeArea : s.name}</span>
                    {s.status_flag === "pending" && <span className="text-xs text-muted">{t.spot.pending}</span>}
                  </span>
                  <span aria-hidden="true">{s.id === spotId ? "●" : "○"}</span>
                </button>
              </li>
            ))}
          </ul>

          {!newOpen ? (
            <button onClick={() => setNewOpen(true)} className="press mt-3 min-h-12 w-full text-[15px] text-muted underline underline-offset-4">{t.spot.addSpot}</button>
          ) : (
            <div className="panel mt-4 space-y-3 rounded-3xl p-4">
              <label htmlFor="newspot" className="text-[15px] font-medium">{t.spot.newName}</label>
              <input id="newspot" value={newName} onChange={(e) => onNewName(e.target.value)} placeholder={t.spot.newHint} maxLength={60} className={fieldClass} />
              {similar.length > 0 && (
                <div role="status">
                  <p className="text-sm text-muted">{t.spot.didYouMean}</p>
                  <ul className="mt-2 space-y-2">
                    {similar.map((s) => (
                      <li key={s.id}>
                        <button
                          onClick={() => { setSpotId(s.id); setNewOpen(false); if (!spots.some((x) => x.id === s.id)) setSpots((c) => [...c, { id: s.id, name: s.name, is_default: false, status_flag: "approved", disco_id: null, band: null }]); }}
                          className="press min-h-12 w-full rounded-2xl px-4 text-left text-[16px]" style={{ background: "var(--panel-strong)" }}
                        >{s.name}</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <PrimaryButton onClick={createSpot} disabled={busy || newName.trim().length < 3}>{similar.length ? t.spot.createAnyway : t.spot.create}</PrimaryButton>
            </div>
          )}

          <div className="mt-6">
            <p className="text-[15px] font-medium">{t.spot.label}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {LABELS.map((l) => <Chip key={l} active={label === l} onClick={() => setLabel(label === l ? null : l)}>{t.spot.labels[l]}</Chip>)}
            </div>
          </div>

          {error && <p className="mt-4 text-[15px]" style={{ color: "var(--weak)" }} role="alert">{error}</p>}
          <div className="mt-6">
            <PrimaryButton onClick={saveSpot} disabled={!chosen || busy}>{busy ? t.spot.saving : t.spot.continue}</PrimaryButton>
          </div>
        </section>
      )}
    </main>
  );
}
