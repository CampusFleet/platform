import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, type SessionPayload } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";
import {
  ALWAYS_STRIPPED,
  CREW_PATCH_COLUMNS,
  CREW_ROLES,
  END_USER_STRIPPED,
  FORBIDDEN_WRITE_COLUMNS,
  OTHER_RIDER_STRIPPED,
  READABLE_TABLES,
  STAFF_READABLE_TABLES,
  SELF_PATCH_COLUMNS,
  STAFF_WRITE_RULES,
  isStaff,
  type ProxyMethod,
} from "@/lib/security/db-proxy-policy";

export const dynamic = "force-dynamic";

/**
 * Authenticated PostgREST proxy for the browser data store.
 *
 * The browser Supabase client is pointed at `/api/db`, so supabase-js calls
 * `/api/db/rest/v1/<table>?<postgrest query>`. This handler checks the session
 * cookie, applies the table/role policy, scopes rows for end users, strips
 * sensitive columns, then forwards to Supabase with the service-role key.
 */

const TABLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;
const FORWARD_REQUEST_HEADERS = ["accept", "content-type", "prefer", "range", "range-unit", "accept-profile", "content-profile"];
const FORWARD_RESPONSE_HEADERS = ["content-type", "content-range", "preference-applied"];

function deny(status: number, message: string) {
  return NextResponse.json({ code: "PROXY_DENIED", message, details: null, hint: null }, { status });
}

async function getOwnStudentId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("students").select("id").eq("user_id", userId).maybeSingle();
  return data?.id || null;
}

function stripKeys(row: any, keys: string[]) {
  if (row && typeof row === "object") for (const k of keys) delete row[k];
}

function sanitize(payload: any, table: string, session: SessionPayload, ownStudentId: string | null) {
  const rows = Array.isArray(payload) ? payload : payload && typeof payload === "object" ? [payload] : [];
  const endUser = !isStaff(session.role);
  for (const row of rows) {
    stripKeys(row, ALWAYS_STRIPPED);
    if (endUser) {
      stripKeys(row, END_USER_STRIPPED);
      if (table === "bus_reservations_full" && row.student_id !== ownStudentId) stripKeys(row, OTHER_RIDER_STRIPPED);
    }
  }
  return payload;
}

function bodyColumns(body: any): string[] {
  const rows = Array.isArray(body) ? body : body && typeof body === "object" ? [body] : [];
  const cols = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) cols.add(k);
  return Array.from(cols);
}

/** Returns an error message if denied, or null when allowed. Mutates `url` to scope rows. */
async function authorize(
  method: ProxyMethod,
  table: string,
  session: SessionPayload,
  url: URL,
  body: any,
  ownStudentId: () => Promise<string | null>
): Promise<string | null> {
  const role = session.role;

  if (method === "GET" || method === "HEAD") {
    const staffOnly = STAFF_READABLE_TABLES.has(table);
    if (!READABLE_TABLES.has(table) && !(staffOnly && isStaff(role))) return `Reading ${table} is not permitted.`;
    if (!isStaff(role)) {
      // End users only see their own identity rows.
      if (table === "users") url.searchParams.append("id", `eq.${session.userId}`);
      if (table === "students_full") url.searchParams.append("user_id", `eq.${session.userId}`);
      if (table === "special_shift_allocations") {
        const sid = await ownStudentId();
        url.searchParams.append("student_id", `eq.${sid || "__none__"}`);
      }
    }
    return null;
  }

  const cols = bodyColumns(body);
  const forbidden = (FORBIDDEN_WRITE_COLUMNS[table] || []).filter((c) => cols.includes(c));
  if (forbidden.length > 0) return `Columns ${forbidden.join(", ")} on ${table} can only be changed through the dedicated API.`;

  if (isStaff(role)) {
    const rules = STAFF_WRITE_RULES[table] || [];
    const rule = rules.find((r) => r.methods.includes(method) && r.roles.includes(role));
    if (!rule) return `${role} may not ${method} ${table}.`;
    if ((CREW_ROLES as readonly string[]).includes(role) && method === "PATCH" && CREW_PATCH_COLUMNS[table]) {
      const extra = cols.filter((c) => !CREW_PATCH_COLUMNS[table].includes(c));
      if (extra.length > 0) return `Crew may only change ${CREW_PATCH_COLUMNS[table].join(", ")} on ${table}.`;
    }
    return null;
  }

  // End users (student / teacher): narrow self-service PATCHes only.
  if (method !== "PATCH" || !SELF_PATCH_COLUMNS[table]) return `${role} may not ${method} ${table}.`;
  const extra = cols.filter((c) => !SELF_PATCH_COLUMNS[table].includes(c));
  if (extra.length > 0) return `Only ${SELF_PATCH_COLUMNS[table].join(", ")} may be changed on ${table}.`;

  if (table === "users") {
    url.searchParams.append("id", `eq.${session.userId}`);
  } else if (table === "bus_reservations") {
    const rows = Array.isArray(body) ? body : [body];
    if (rows.some((r) => r?.status !== undefined && r.status !== "CANCELLED")) return "Riders may only cancel their own reservation.";
    const sid = await ownStudentId();
    if (!sid) return "No student profile for this account.";
    url.searchParams.append("student_id", `eq.${sid}`);
  }
  return null;
}

async function handle(req: NextRequest, { params }: { params: { table: string } }) {
  const method = req.method.toUpperCase() as ProxyMethod;
  if (!["GET", "HEAD", "POST", "PATCH", "DELETE"].includes(method)) return deny(405, "Method not allowed.");

  const table = params.table;
  if (!TABLE_NAME.test(table)) return deny(400, "Invalid table.");

  const session = await getSessionFromRequest(req);
  if (!session) return deny(401, "Authentication required.");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return deny(503, "Database proxy is not configured.");

  const rawBody = method === "POST" || method === "PATCH" ? await req.text() : "";
  let body: any = null;
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      return deny(400, "Invalid JSON body.");
    }
  }

  // Unfiltered DELETE/PATCH would hit every row.
  const incoming = new URL(req.url);
  const hasFilter = Array.from(incoming.searchParams.keys()).some((k) => !["select", "columns", "on_conflict", "limit", "order"].includes(k));
  if ((method === "DELETE" || method === "PATCH") && !hasFilter) return deny(400, "Filtered updates/deletes only.");

  const upstream = new URL(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${table}`);
  incoming.searchParams.forEach((v, k) => upstream.searchParams.append(k, v));

  let cachedStudentId: string | null | undefined;
  const ownStudentId = async () => {
    if (cachedStudentId === undefined) cachedStudentId = await getOwnStudentId(session.userId);
    return cachedStudentId;
  };

  const denial = await authorize(method, table, session, upstream, body, ownStudentId);
  if (denial) return deny(403, denial);

  const headers = new Headers();
  for (const h of FORWARD_REQUEST_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("apikey", serviceKey);
  headers.set("authorization", `Bearer ${serviceKey}`);

  const res = await fetch(upstream.toString(), {
    method,
    headers,
    body: rawBody || undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  const outHeaders = new Headers();
  for (const h of FORWARD_RESPONSE_HEADERS) {
    const v = res.headers.get(h);
    if (v) outHeaders.set(h, v);
  }
  outHeaders.set("cache-control", "no-store");

  if (method === "HEAD" || res.status === 204) {
    return new NextResponse(null, { status: res.status, headers: outHeaders });
  }

  const text = await res.text();
  const isJson = (res.headers.get("content-type") || "").includes("json");
  if (!isJson || !text || !res.ok) {
    return new NextResponse(text, { status: res.status, headers: outHeaders });
  }

  const sid = isStaff(session.role) ? null : await ownStudentId();
  const sanitized = sanitize(JSON.parse(text), table, session, sid);
  return new NextResponse(JSON.stringify(sanitized), { status: res.status, headers: outHeaders });
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
