"use client";
// A tiny Supabase client for the public pages (about 3 KB instead of ~60 KB for the full library).
// It does only what those pages need: read and write rows through the REST API, call a database function,
// and keep an anonymous sign-in alive. It stores the session in the SAME place and format as the full library
// (so the admin page, which uses the full library, and these pages share one sign-in).
// Live updates (realtime) and email sign-in use the full library, loaded only where needed.

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const STORAGE_KEY = `sb-${(URL_.match(/^https?:\/\/([^.]+)\./)?.[1]) ?? "project"}-auth-token`;

export interface LiteError { message: string; code?: string; details?: string; hint?: string }
// A row from the database: column names to values (the exact shape is checked where each page reads it).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export type LiteResult<T = Row[]> = { data: T | null; error: LiteError | null };
export interface LiteSession {
  access_token: string; refresh_token: string; expires_at: number; expires_in?: number; token_type?: string;
  user: { id: string; email?: string; is_anonymous?: boolean; [k: string]: unknown };
}

// ---------------------------------------------------------------- session
function readSession(): LiteSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return s && typeof s.access_token === "string" && s.user?.id ? s : null;
  } catch { return null; }
}
function writeSession(s: LiteSession | null) {
  try { if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); else localStorage.removeItem(STORAGE_KEY); } catch { /* storage blocked */ }
}
function fromAuthResponse(j: Record<string, unknown>): LiteSession | null {
  if (typeof j.access_token !== "string" || typeof j.refresh_token !== "string" || !j.user) return null;
  const expiresIn = Number(j.expires_in ?? 3600);
  return {
    access_token: j.access_token, refresh_token: j.refresh_token, token_type: "bearer", expires_in: expiresIn,
    expires_at: Number(j.expires_at ?? Math.floor(Date.now() / 1000) + expiresIn), user: j.user as LiteSession["user"],
  };
}

let refreshing: Promise<LiteSession | null> | null = null;

/** The saved sign-in, renewed if it is about to expire. Works offline (returns what the phone has). */
async function getSession(): Promise<LiteSession | null> {
  const s = readSession();
  if (!s) return null;
  if (s.expires_at - Math.floor(Date.now() / 1000) > 60) return s;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${URL_}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST", headers: { apikey: KEY, "content-type": "application/json" }, body: JSON.stringify({ refresh_token: s.refresh_token }),
        });
        if (res.ok) { const fresh = fromAuthResponse(await res.json()); if (fresh) { writeSession(fresh); return fresh; } }
        if (res.status >= 400 && res.status < 500) { writeSession(null); return null; }   // the sign-in is no longer valid
        return s;
      } catch { return s; }                                                              // no network: keep what we have
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

const auth = {
  getSession: async () => ({ data: { session: await getSession() } }),
  /** The signed-in person, read from the phone (no network needed). */
  getUser: async () => ({ data: { user: (await getSession())?.user ?? null } }),
  signInAnonymously: async (captchaToken?: string | null): Promise<{ data: { session: LiteSession | null }; error: LiteError | null }> => {
    try {
      const res = await fetch(`${URL_}/auth/v1/signup`, {
        method: "POST", headers: { apikey: KEY, "content-type": "application/json" },
        body: JSON.stringify({ data: {}, ...(captchaToken ? { gotrue_meta_security: { captcha_token: captchaToken } } : {}) }),
      });
      const j = await res.json();
      if (!res.ok) return { data: { session: null }, error: { message: String(j.msg ?? j.message ?? j.error_description ?? "Sign-in failed"), code: String(j.error_code ?? j.code ?? res.status) } };
      const s = fromAuthResponse(j);
      if (s) writeSession(s);
      return { data: { session: s }, error: s ? null : { message: "Unexpected sign-in response" } };
    } catch (e) {
      return { data: { session: null }, error: { message: (e as Error).message, code: "FETCH_ERROR" } };
    }
  },
  signOut: async () => {
    const s = readSession();
    writeSession(null);
    if (s) { try { await fetch(`${URL_}/auth/v1/logout`, { method: "POST", headers: { apikey: KEY, authorization: `Bearer ${s.access_token}` } }); } catch { /* signed out on this phone either way */ } }
    return { error: null };
  },
};

// ---------------------------------------------------------------- queries
type Verb = "select" | "insert" | "update" | "upsert" | "delete";

class Query<T = Row[]> implements PromiseLike<LiteResult<T>> {
  private filters: string[] = [];
  private orders: string[] = [];
  private columns = "*";
  private limitN: number | null = null;
  private wantsRows = false;
  private one: "single" | "maybe" | null = null;
  private body: unknown = undefined;

  constructor(private table: string, private verb: Verb) {}

  select(columns = "*") { this.columns = columns; this.wantsRows = true; return this; }
  insert(row: unknown) { this.verb = "insert"; this.body = row; return this; }
  update(row: unknown) { this.verb = "update"; this.body = row; return this; }
  upsert(row: unknown) { this.verb = "upsert"; this.body = row; return this; }
  delete() { this.verb = "delete"; return this; }
  eq(col: string, v: string | number | boolean) { this.filters.push(`${col}=eq.${encodeURIComponent(String(v))}`); return this; }
  neq(col: string, v: string | number | boolean) { this.filters.push(`${col}=neq.${encodeURIComponent(String(v))}`); return this; }
  or(expr: string) { this.filters.push(`or=${encodeURIComponent(`(${expr})`)}`); return this; }
  order(col: string, opts: { ascending?: boolean } = {}) { this.orders.push(`${col}.${opts.ascending === false ? "desc" : "asc"}`); return this; }
  limit(n: number) { this.limitN = n; return this; }
  single(): Query<Row> { this.one = "single"; return this as unknown as Query<Row>; }
  maybeSingle(): Query<Row> { this.one = "maybe"; return this as unknown as Query<Row>; }

  then<A = LiteResult<T>, B = never>(ok?: ((r: LiteResult<T>) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): Promise<A | B> {
    return this.run().then(ok, bad);
  }

  private async run(): Promise<LiteResult<T>> {
    const session = await getSession();
    const params: string[] = [...this.filters];
    if (this.verb === "select" || this.wantsRows) params.push(`select=${encodeURIComponent(this.columns)}`);
    if (this.orders.length) params.push(`order=${this.orders.join(",")}`);
    if (this.verb === "select" && (this.limitN !== null || this.one)) params.push(`limit=${this.one ? 2 : this.limitN}`);   // 2 so "more than one row" can be noticed
    const headers: Record<string, string> = { apikey: KEY, authorization: `Bearer ${session?.access_token ?? KEY}` };
    const prefer: string[] = [];
    if (this.verb === "upsert") prefer.push("resolution=merge-duplicates");
    if (this.verb !== "select") prefer.push(this.wantsRows ? "return=representation" : "return=minimal");
    if (prefer.length) headers.prefer = prefer.join(",");
    if (this.body !== undefined) headers["content-type"] = "application/json";
    const method = { select: "GET", insert: "POST", upsert: "POST", update: "PATCH", delete: "DELETE" }[this.verb];
    try {
      const res = await fetch(`${URL_}/rest/v1/${this.table}${params.length ? `?${params.join("&")}` : ""}`, {
        method, headers, body: this.body !== undefined ? JSON.stringify(this.body) : undefined,
      });
      const text = await res.text();
      const parsed = text ? JSON.parse(text) : null;
      if (!res.ok) return { data: null, error: { message: String(parsed?.message ?? res.statusText), code: parsed?.code, details: parsed?.details, hint: parsed?.hint } };
      if (this.one) {
        const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
        if (rows.length === 1) return { data: rows[0], error: null };
        if (rows.length === 0 && this.one === "maybe") return { data: null, error: null };
        return { data: null, error: { message: rows.length === 0 ? "No rows found" : "More than one row found", code: "PGRST116" } };
      }
      return { data: parsed, error: null };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message, code: "FETCH_ERROR" } };
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rpc(fn: string, args: Record<string, unknown> = {}): Promise<LiteResult<any>> {
  const session = await getSession();
  try {
    const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
      method: "POST", headers: { apikey: KEY, authorization: `Bearer ${session?.access_token ?? KEY}`, "content-type": "application/json" }, body: JSON.stringify(args),
    });
    const text = await res.text();
    const parsed = text ? JSON.parse(text) : null;
    if (!res.ok) return { data: null, error: { message: String(parsed?.message ?? res.statusText), code: parsed?.code } };
    return { data: parsed, error: null };
  } catch (e) {
    return { data: null, error: { message: (e as Error).message, code: "FETCH_ERROR" } };
  }
}

export const lite = {
  auth,
  from: (table: string) => ({
    select: (columns = "*") => new Query(table, "select").select(columns),
    insert: (row: unknown) => new Query(table, "insert").insert(row),
    update: (row: unknown) => new Query(table, "update").update(row),
    upsert: (row: unknown) => new Query(table, "upsert").upsert(row),
    delete: () => new Query(table, "delete").delete(),
  }),
  rpc,
};
export type LiteClient = typeof lite;
