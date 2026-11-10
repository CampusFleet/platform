import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

export const supabase = createClient(
  browserProxyUrl || supabaseUrl || "https://placeholder.supabase.co",
  browserProxyUrl ? "session-cookie-proxy" : supabaseAnonKey || "placeholder-key",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: browserProxyUrl
        ? (url, options) => timeoutFetch(url, { ...options, credentials: "same-origin" })
        : timeoutFetch,
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
