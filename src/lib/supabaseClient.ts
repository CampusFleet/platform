import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Data-only Supabase client — NO auth features, just database & realtime
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-key",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: (url, options) => {
        const signal = options?.signal || AbortSignal.timeout(6000);
        return fetch(url, { ...options, signal, cache: 'no-store' });
      },
    },
  }
);

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const supabaseAdmin = serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        fetch: (url, options) => {
          const signal = options?.signal || AbortSignal.timeout(6000);
          return fetch(url, { ...options, signal, cache: 'no-store' });
        },
      },
    })
  : supabase;
