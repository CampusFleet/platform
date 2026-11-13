import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const timeoutFetch: typeof fetch = (url, options) => {
  const signal = options?.signal || AbortSignal.timeout(6000);
  return fetch(url, { ...options, signal, cache: "no-store" });
};

/**
 * Data-only client used by the browser store (src/lib/store/*).
 *
 * In the browser it talks to the same-origin `/api/db` proxy, which authenticates
 * the session cookie, enforces per-role table rules and forwards to Supabase with
 * the service-role key. The browser never sends queries to Supabase directly, so
 * the public anon key grants no data access once RLS is enabled.
 */
const browserProxyUrl =
  typeof window !== "undefined" ? `${window.location.origin}/api/db` : null;

/**
 * Browser read batching: GET requests to /api/db/rest/v1/* issued within the same
 * ~15 ms window are sent as ONE POST /api/db/batch. The store fires ~15 parallel
 * reads on page load; this turns them into a single function invocation.
 */
type PendingRead = { path: string; headers: Record<string, string>; resolve: (r: Response) => void; reject: (e: any) => void };
let pendingReads: PendingRead[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const BATCH_WINDOW_MS = 15;
const BATCH_MAX = 25;

async function flushReads() {
  flushTimer = null;
  const batch = pendingReads.splice(0, BATCH_MAX);
  if (pendingReads.length > 0) flushTimer = setTimeout(flushReads, 0);
  if (batch.length === 0) return;
  try {
    const res = await timeoutFetch(`${browserProxyUrl}/batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ requests: batch.map((b) => ({ path: b.path, headers: b.headers })) }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const text = await res.text();
      batch.forEach((b) => b.resolve(new Response(text, { status: res.status, headers: { "content-type": "application/json" } })));
      return;
    }
    const { responses } = await res.json();
    batch.forEach((b, i) => {
      const r = responses?.[i] || { status: 500, headers: {}, body: "{}" };
      const status = r.status === 204 ? 204 : r.status;
      b.resolve(new Response(status === 204 ? null : r.body, { status, headers: r.headers }));
    });
  } catch (err) {
    batch.forEach((b) => b.reject(err));
  }
}

const proxyFetch: typeof fetch = (input, options) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const method = (options?.method || "GET").toUpperCase();
  const restPrefix = `${browserProxyUrl}/rest/v1/`;
  if (method === "GET" && url.startsWith(restPrefix)) {
    const headers: Record<string, string> = {};
    new Headers(options?.headers || {}).forEach((v, k) => (headers[k] = v));
    const u = new URL(url);
    return new Promise<Response>((resolve, reject) => {
      pendingReads.push({ path: u.pathname + u.search, headers, resolve, reject });
      if (!flushTimer) flushTimer = setTimeout(flushReads, BATCH_WINDOW_MS);
    });
  }
  return timeoutFetch(input, { ...options, credentials: "same-origin" });
};

export const supabase = createClient(
  browserProxyUrl || supabaseUrl || "https://placeholder.supabase.co",
  browserProxyUrl ? "session-cookie-proxy" : supabaseAnonKey || "placeholder-key",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: browserProxyUrl ? proxyFetch : timeoutFetch,
    },
  }
);

/**
 * Service-role client for server code only.
 *
 * There is intentionally no fallback to the anon client: a missing
 * SUPABASE_SERVICE_ROLE_KEY must surface as an error, not silently run
 * privileged queries with different permissions. The error is raised lazily on
 * first use so `next build` and client bundles that merely import this module
 * keep working.
 */
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const isServer = typeof window === "undefined";

function misconfigured(): SupabaseClient {
  return new Proxy({} as SupabaseClient, {
    get() {
      throw new Error(
        isServer
          ? "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured for server database access."
          : "supabaseAdmin is server-only and cannot be used in the browser."
      );
    },
  });
}

export const supabaseAdmin: SupabaseClient =
  isServer && supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: timeoutFetch },
      })
    : isServer && process.env.NODE_ENV !== "production"
    ? // Local dev / tests without credentials: an inert client (never the anon key)
      createClient("https://placeholder.supabase.co", "missing-service-role-key", {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : misconfigured();

/**
 * Same service-role client, typed from the live schema (src/lib/database.types.ts,
 * regenerate with tools/gen-db-types.sh). Use `db` in new code so column names and nullability
 * are checked at compile time; existing code still uses the untyped `supabaseAdmin`.
 */
export const db = supabaseAdmin as unknown as SupabaseClient<Database>;
