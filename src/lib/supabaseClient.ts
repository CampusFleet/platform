import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

const timeoutFetch: typeof fetch = (url, options) => {
  const signal = options?.signal || AbortSignal.timeout(6000);
  return fetch(url, { ...options, signal, cache: "no-store" });
};

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
