import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

// Runs the REAL public/sw.js against a small fake of the browser's service-worker world:
// a cache store, a network we can switch off, and the install/activate/fetch events.
const SOURCE = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "http://localhost:3000";

type Handler = (e: Record<string, unknown>) => void;

class FakeCache {
  entries = new Map<string, Response>();
  private key = (r: Request | string) => (typeof r === "string" ? new URL(r, ORIGIN).href : r.url);
  async match(r: Request | string, opts?: { ignoreSearch?: boolean }) {
    const k = this.key(r);
    for (const [url, res] of this.entries) {
      if (url === k || (opts?.ignoreSearch && url.split("?")[0] === k.split("?")[0])) return res.clone();
    }
    return undefined;
  }
  async put(r: Request | string, res: Response) { this.entries.set(this.key(r), res); }
  async add(r: Request) { this.entries.set(r.url, new Response("cached " + r.url)); }
  async keys() { return [...this.entries.keys()].map((u) => new Request(u)); }
  async delete(r: Request | string) { return this.entries.delete(this.key(r)); }
}

function setup() {
  const handlers: Record<string, Handler> = {};
  const stores = new Map<string, FakeCache>();
  const state = { online: true, slow: false, networkCalls: 0, skipWaiting: 0, claimed: 0, status: 200 };
  const caches = {
    open: async (n: string) => { if (!stores.has(n)) stores.set(n, new FakeCache()); return stores.get(n)!; },
    keys: async () => [...stores.keys()],
    delete: async (n: string) => stores.delete(n),
  };
  const fetchFn = async (req: Request) => {
    state.networkCalls++;
    if (state.slow) return new Promise<Response>(() => {});          // a network that never answers
    if (!state.online) throw new TypeError("Failed to fetch");
    const res = new Response("network " + req.url, { status: state.status });
    Object.defineProperty(res, "type", { value: "basic" });          // what a real same-origin response reports
    return res;
  };
  // Inside a service worker, "/offline" means "this site's /offline". Node needs that spelled out.
  class SwRequest extends Request {
    constructor(input: string | Request, init?: RequestInit) { super(typeof input === "string" ? new URL(input, ORIGIN).href : input, init); }
  }
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, h: Handler) => { handlers[type] = h; },
    skipWaiting: async () => { state.skipWaiting++; },
    clients: { claim: async () => { state.claimed++; } },
  };
  runInNewContext(SOURCE, { self, caches, fetch: fetchFn, Request: SwRequest, Response, URL, Promise, setTimeout, console });

  const lifecycle = async (type: "install" | "activate") => {
    let work: Promise<unknown> = Promise.resolve();
    handlers[type]({ waitUntil: (p: Promise<unknown>) => { work = p; } });
    await work;
  };
  const request = async (path: string, init: { method?: string; navigate?: boolean; origin?: string } = {}) => {
    const url = new URL(path, init.origin ?? ORIGIN).href;
    const req = new Request(url, { method: init.method ?? "GET" });
    Object.defineProperty(req, "mode", { value: init.navigate ? "navigate" : "cors" });
    let responded = null as Promise<Response> | null;
    handlers.fetch({ request: req, respondWith: (p: Promise<Response>) => { responded = p; } });
    return responded ? { handled: true as const, response: await responded } : { handled: false as const };
  };
  return { state, stores, lifecycle, request };
}

describe("service worker: install and update", () => {
  it("saves the offline page and takes over straight away", async () => {
    const sw = setup();
    await sw.lifecycle("install");
    expect(sw.stores.get("ld-pages-v1")?.entries.has(`${ORIGIN}/offline`)).toBe(true);
    expect(sw.state.skipWaiting).toBe(1);
  });
  it("saves every bulb picture so the home screen works offline whatever the status", async () => {
    const sw = setup();
    await sw.lifecycle("install");
    const saved = [...(sw.stores.get("ld-assets-v1")?.entries.keys() ?? [])].map((u) => u.replace(ORIGIN, "")).sort();
    expect(saved).toEqual(["/bulb-glass-off.webp?v=1", "/bulb-glass-on.webp?v=1", "/bulb-glass-weak.webp?v=1", "/bulb-off.webp?v=1", "/bulb-on.webp?v=1", "/bulb-weak.webp?v=1"]);
  });
  it("deletes caches from older versions but keeps the current ones and other sites' caches alone", async () => {
    const sw = setup();
    for (const n of ["ld-pages-v0", "ld-assets-v0", "ld-pages-v1", "ld-assets-v1", "someone-elses-cache"]) {
      sw.stores.set(n, new FakeCache());
    }
    await sw.lifecycle("activate");
    expect([...sw.stores.keys()].sort()).toEqual(["ld-assets-v1", "ld-pages-v1", "someone-elses-cache"]);
    expect(sw.state.claimed).toBe(1);
  });
});

describe("service worker: what it leaves alone", () => {
  it("never touches reports, other API calls, or the worker file", async () => {
    const sw = setup();
    expect((await sw.request("/api/report", { method: "POST" })).handled).toBe(false);
    // These WOULD be saved if the safeguard were missing: a page-style request and a file-style request under /api/
    expect((await sw.request("/api/report", { navigate: true })).handled).toBe(false);
    expect((await sw.request("/api/chart.png")).handled).toBe(false);
    expect((await sw.request("/sw.js", { navigate: true })).handled).toBe(false);
    expect(sw.state.networkCalls).toBe(0);
  });
  it("never touches other websites (Supabase, Cloudflare)", async () => {
    const sw = setup();
    // File- and page-style requests that would be saved if they were ours
    expect((await sw.request("/_next/static/chunks/x.js", { origin: "https://challenges.cloudflare.com" })).handled).toBe(false);
    expect((await sw.request("/storage/v1/object/photo.png", { origin: "https://abc.supabase.co" })).handled).toBe(false);
    expect((await sw.request("/", { origin: "https://abc.supabase.co", navigate: true })).handled).toBe(false);
    expect(sw.state.networkCalls).toBe(0);
  });
  it("only handles GET requests", async () => {
    const sw = setup();
    expect((await sw.request("/", { method: "POST", navigate: true })).handled).toBe(false);
  });
});

describe("service worker: pages", () => {
  it("online: gives the newest page and saves a copy", async () => {
    const sw = setup();
    const r = await sw.request("/", { navigate: true });
    expect(r.handled && await r.response.text()).toContain("network");
    expect(sw.stores.get("ld-pages-v1")?.entries.has(`${ORIGIN}/`)).toBe(true);
  });
  it("offline: shows the saved copy of a page visited before", async () => {
    const sw = setup();
    await sw.request("/spot/abc", { navigate: true });                 // visited while online
    sw.state.online = false;
    const r = await sw.request("/spot/abc", { navigate: true });
    expect(r.handled && await r.response.text()).toContain("network");  // the saved copy
  });
  it("offline: a page never visited falls back to the home page", async () => {
    const sw = setup();
    await sw.request("/", { navigate: true });
    sw.state.online = false;
    const r = await sw.request("/area/7", { navigate: true });
    expect(r.handled && r.response.ok).toBe(true);
    expect(r.handled && await r.response.text()).toContain(`${ORIGIN}/`);
  });
  it("offline with nothing saved: shows the 'No network' page", async () => {
    const sw = setup();
    await sw.lifecycle("install");
    sw.state.online = false;
    const r = await sw.request("/", { navigate: true });
    expect(r.handled && await r.response.text()).toContain("/offline");
  });
  it("a slow network does not keep people waiting when a saved copy exists", async () => {
    vi.useFakeTimers();
    const sw = setup();
    await sw.request("/", { navigate: true });                          // saved while online
    sw.state.slow = true;
    const pending = sw.request("/", { navigate: true });
    await vi.advanceTimersByTimeAsync(5100);
    const r = await pending;
    vi.useRealTimers();
    expect(r.handled && r.response.ok).toBe(true);
  });
  it("does not save error pages", async () => {
    const sw = setup();
    sw.state.status = 500;
    await sw.request("/", { navigate: true });
    expect(sw.stores.get("ld-pages-v1")?.entries.has(`${ORIGIN}/`) ?? false).toBe(false);
  });
});

describe("service worker: app files", () => {
  beforeEach(() => vi.useRealTimers());
  it("fetches a file once, then serves it from the phone", async () => {
    const sw = setup();
    await sw.request("/_next/static/chunks/abc.js");
    const calls = sw.state.networkCalls;
    sw.state.online = false;
    const again = await sw.request("/_next/static/chunks/abc.js");
    expect(again.handled && again.response.ok).toBe(true);
    expect(sw.state.networkCalls).toBe(calls);                         // no second network trip
  });
  it("caches icons and fonts too", async () => {
    const sw = setup();
    for (const p of ["/pwa-icon/192", "/_next/static/media/font.woff2", "/logo.png"]) await sw.request(p);
    expect(sw.stores.get("ld-assets-v1")?.entries.size).toBe(3);
  });
  it("does not keep failed downloads", async () => {
    const sw = setup();
    sw.state.status = 404;
    await sw.request("/_next/static/chunks/missing.js");
    expect(sw.stores.get("ld-assets-v1")?.entries.size ?? 0).toBe(0);
  });
  it("stops the cache growing forever", async () => {
    const sw = setup();
    for (let i = 0; i < 170; i++) await sw.request(`/_next/static/chunks/f${i}.js`);
    await new Promise((r) => setTimeout(r, 20));
    expect(sw.stores.get("ld-assets-v1")!.entries.size).toBeLessThanOrEqual(150);
  });
});
