import { beforeEach, describe, expect, it, vi } from "vitest";

const URL_ = "https://abcdefgh.supabase.co";
const KEY = "anon-key";
const STORE_KEY = "sb-abcdefgh-auth-token";   // the key the official library uses for this project

type FetchCall = { url: string; init: RequestInit };
let calls: FetchCall[];
let store: Record<string, string>;
let respond: (call: FetchCall) => { status?: number; body?: unknown };

async function load() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", KEY);
  return (await import("./lite")).lite;
}

const nowSec = () => Math.floor(Date.now() / 1000);
const session = (over: Record<string, unknown> = {}) => ({
  access_token: "acc-1", refresh_token: "ref-1", token_type: "bearer", expires_in: 3600, expires_at: nowSec() + 3000,
  user: { id: "u1", is_anonymous: true }, ...over,
});
const hdr = (c: FetchCall, name: string) => (c.init.headers as Record<string, string>)[name];

beforeEach(() => {
  calls = [];
  store = {};
  respond = () => ({ body: [] });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; },
  });
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const call = { url, init };
    calls.push(call);
    const r = respond(call);
    const status = r.status ?? 200;
    return { ok: status >= 200 && status < 300, status, statusText: "x", text: async () => (r.body === undefined ? "" : JSON.stringify(r.body)), json: async () => r.body } as Response;
  });
});

describe("reading rows", () => {
  it("builds the request: columns, filters, order, limit", async () => {
    const sb = await load();
    await sb.from("spots").select("id,name").eq("area_id", 5).neq("status_flag", "rejected").order("is_default", { ascending: false }).order("name").limit(10);
    const u = calls[0].url;
    expect(u.startsWith(`${URL_}/rest/v1/spots?`)).toBe(true);
    expect(u).toContain("area_id=eq.5");
    expect(u).toContain("status_flag=neq.rejected");
    expect(u).toContain("order=is_default.desc,name.asc");
    expect(u).toContain("limit=10");
    expect(u).toContain("select=id%2Cname");
    expect(calls[0].init.method).toBe("GET");
  });
  it("sends the public key when nobody is signed in", async () => {
    const sb = await load();
    await sb.from("areas").select("*");
    expect(hdr(calls[0], "apikey")).toBe(KEY);
    expect(hdr(calls[0], "authorization")).toBe(`Bearer ${KEY}`);
  });
  it("sends the person's token when signed in", async () => {
    store[STORE_KEY] = JSON.stringify(session());
    const sb = await load();
    await sb.from("profiles").select("points").eq("id", "u1");
    expect(hdr(calls[0], "authorization")).toBe("Bearer acc-1");
  });
  it("encodes values safely (no way to smuggle in extra filters)", async () => {
    const sb = await load();
    await sb.from("lgas").select("name").eq("states.name", "A&b=c.d");
    expect(calls[0].url).toContain("states.name=eq.A%26b%3Dc.d");
  });
  it("supports an 'or' expression", async () => {
    const sb = await load();
    await sb.from("supply_sessions").select("*").or("ended_at.is.null,ended_at.gte.2026-10-12T23:00:00.000Z");
    expect(decodeURIComponent(calls[0].url)).toContain("or=(ended_at.is.null,ended_at.gte.2026-10-12T23:00:00.000Z)");
  });
  it("returns the rows", async () => {
    respond = () => ({ body: [{ id: 1 }, { id: 2 }] });
    const sb = await load();
    const r = await sb.from("states").select("id");
    expect(r).toEqual({ data: [{ id: 1 }, { id: 2 }], error: null });
  });
  it("maybeSingle: one row, no rows, too many rows", async () => {
    const sb = await load();
    respond = () => ({ body: [{ id: 1 }] });
    expect((await sb.from("spots").select("id").eq("id", 1).maybeSingle()).data).toEqual({ id: 1 });
    respond = () => ({ body: [] });
    expect(await sb.from("spots").select("id").eq("id", 9).maybeSingle()).toEqual({ data: null, error: null });
    respond = () => ({ body: [{ id: 1 }, { id: 2 }] });
    expect((await sb.from("spots").select("id").maybeSingle()).error?.code).toBe("PGRST116");
  });
  it("single: an empty result is an error", async () => {
    respond = () => ({ body: [] });
    const sb = await load();
    expect((await sb.from("spots").select("id").eq("id", 9).single()).error?.code).toBe("PGRST116");
  });
  it("maps a database error", async () => {
    respond = () => ({ status: 401, body: { message: "JWT expired", code: "PGRST303" } });
    const sb = await load();
    expect(await sb.from("spots").select("*")).toEqual({ data: null, error: { message: "JWT expired", code: "PGRST303", details: undefined, hint: undefined } });
  });
  it("turns a dead network into an error result, not a crash", async () => {
    const sb = await load();
    vi.stubGlobal("fetch", async () => { throw new TypeError("Failed to fetch"); });
    const r = await sb.from("spots").select("*");
    expect(r.data).toBeNull();
    expect(r.error?.code).toBe("FETCH_ERROR");
  });
});

describe("writing rows", () => {
  it("insert + select + single returns the new row", async () => {
    respond = () => ({ body: [{ id: "new-1", name: "Sunshine" }] });
    const sb = await load();
    const r = await sb.from("spots").insert({ name: "Sunshine" }).select("id,name").single();
    expect(r.data).toEqual({ id: "new-1", name: "Sunshine" });
    expect(calls[0].init.method).toBe("POST");
    expect(hdr(calls[0], "prefer")).toBe("return=representation");
    expect(calls[0].init.body).toBe(JSON.stringify({ name: "Sunshine" }));
    expect(calls[0].url).not.toContain("limit=");
  });
  it("upsert merges duplicates", async () => {
    respond = () => ({ status: 201 });
    const sb = await load();
    const r = await sb.from("saved_spots").upsert({ user_id: "u1", spot_id: "s1" });
    expect(r.error).toBeNull();
    expect(hdr(calls[0], "prefer")).toContain("resolution=merge-duplicates");
  });
  it("update and delete use the right verbs and filters", async () => {
    respond = () => ({ status: 204 });
    const sb = await load();
    await sb.from("profiles").update({ language: "en" }).eq("id", "u1");
    await sb.from("saved_spots").delete().eq("user_id", "u1").eq("spot_id", "s1");
    expect(calls[0].init.method).toBe("PATCH");
    expect(calls[0].url).toContain("id=eq.u1");
    expect(hdr(calls[0], "prefer")).toBe("return=minimal");
    expect(calls[1].init.method).toBe("DELETE");
    expect(calls[1].url).toContain("user_id=eq.u1");
    expect(calls[1].url).toContain("spot_id=eq.s1");
  });
  it("reports a database refusal (for example a duplicate)", async () => {
    respond = () => ({ status: 409, body: { message: "duplicate key", code: "23505" } });
    const sb = await load();
    expect((await sb.from("spots").insert({ name: "x" }).select("id").single()).error?.code).toBe("23505");
  });
});

describe("calling a database function", () => {
  it("posts the arguments", async () => {
    respond = () => ({ body: [{ id: "a", name: "Allen Avenue", similarity: 0.6 }] });
    const sb = await load();
    const r = await sb.rpc("similar_spots", { p_area_id: 1, p_name: "Allen" });
    expect(calls[0].url).toBe(`${URL_}/rest/v1/rpc/similar_spots`);
    expect(calls[0].init.body).toBe(JSON.stringify({ p_area_id: 1, p_name: "Allen" }));
    expect(r.data[0].name).toBe("Allen Avenue");
  });
});

describe("signing in", () => {
  it("creates an anonymous account and saves it where the official library would", async () => {
    respond = () => ({ body: { access_token: "A", refresh_token: "R", expires_in: 3600, user: { id: "new-user", is_anonymous: true } } });
    const sb = await load();
    const r = await sb.auth.signInAnonymously();
    expect(r.error).toBeNull();
    expect(calls[0].url).toBe(`${URL_}/auth/v1/signup`);
    const saved = JSON.parse(store[STORE_KEY]);
    expect(saved).toMatchObject({ access_token: "A", refresh_token: "R", token_type: "bearer", user: { id: "new-user" } });
    expect(saved.expires_at).toBeGreaterThan(nowSec());
  });
  it("sends the CAPTCHA token when there is one, and none when there is not", async () => {
    respond = () => ({ body: { access_token: "A", refresh_token: "R", expires_in: 3600, user: { id: "u" } } });
    const sb = await load();
    await sb.auth.signInAnonymously("turnstile-token");
    await sb.auth.signInAnonymously();
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ data: {}, gotrue_meta_security: { captcha_token: "turnstile-token" } });
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ data: {} });
  });
  it("reports a refused sign-in (for example a failed CAPTCHA)", async () => {
    respond = () => ({ status: 400, body: { error_code: "captcha_failed", msg: "captcha verification process failed" } });
    const sb = await load();
    const r = await sb.auth.signInAnonymously("bad");
    expect(r.data.session).toBeNull();
    expect(r.error).toMatchObject({ code: "captcha_failed" });
    expect(store[STORE_KEY]).toBeUndefined();
  });
  it("reads a session saved by the official library", async () => {
    // the official library saves extra fields too; they must not confuse us
    store[STORE_KEY] = JSON.stringify(session({ provider_token: null, weak: null }));
    const sb = await load();
    const { data } = await sb.auth.getSession();
    expect(data.session?.user.id).toBe("u1");
    expect((await sb.auth.getUser()).data.user?.id).toBe("u1");
    expect(calls).toHaveLength(0);                                    // no network needed
  });
  it("ignores a damaged saved session", async () => {
    store[STORE_KEY] = "{not json";
    const sb = await load();
    expect((await sb.auth.getSession()).data.session).toBeNull();
    store[STORE_KEY] = JSON.stringify({ hello: "world" });
    expect((await sb.auth.getSession()).data.session).toBeNull();
  });
  it("renews a token that is about to expire, once even for several callers", async () => {
    store[STORE_KEY] = JSON.stringify(session({ expires_at: nowSec() + 10 }));
    respond = () => ({ body: { access_token: "acc-2", refresh_token: "ref-2", expires_in: 3600, user: { id: "u1" } } });
    const sb = await load();
    const [a, b] = await Promise.all([sb.auth.getSession(), sb.auth.getSession()]);
    expect(a.data.session?.access_token).toBe("acc-2");
    expect(b.data.session?.access_token).toBe("acc-2");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${URL_}/auth/v1/token?grant_type=refresh_token`);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ refresh_token: "ref-1" });
    expect(JSON.parse(store[STORE_KEY]).refresh_token).toBe("ref-2");
  });
  it("keeps the old sign-in when renewing fails for lack of network", async () => {
    store[STORE_KEY] = JSON.stringify(session({ expires_at: nowSec() + 10 }));
    const sb = await load();
    vi.stubGlobal("fetch", async () => { throw new TypeError("Failed to fetch"); });
    expect((await sb.auth.getSession()).data.session?.access_token).toBe("acc-1");
    expect(store[STORE_KEY]).toBeDefined();
  });
  it("forgets a sign-in the server says is no longer valid", async () => {
    store[STORE_KEY] = JSON.stringify(session({ expires_at: nowSec() - 5 }));
    respond = () => ({ status: 400, body: { error_code: "refresh_token_not_found" } });
    const sb = await load();
    expect((await sb.auth.getSession()).data.session).toBeNull();
    expect(store[STORE_KEY]).toBeUndefined();
  });
  it("signs out on the phone even with no network", async () => {
    store[STORE_KEY] = JSON.stringify(session());
    const sb = await load();
    vi.stubGlobal("fetch", async () => { throw new TypeError("Failed to fetch"); });
    await sb.auth.signOut();
    expect(store[STORE_KEY]).toBeUndefined();
  });
});
