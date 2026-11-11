import { NextRequest, NextResponse } from "next/server";
import { GET as proxyGet } from "@/app/api/db/rest/v1/[table]/route";

export const dynamic = "force-dynamic";

/**
 * POST /api/db/batch
 * Runs several read-only /api/db/rest/v1/<table> requests in ONE function call.
 * The browser store batches its parallel startup reads into this endpoint, so a
 * page load costs one request instead of ~15. Each sub-request goes through the
 * normal proxy handler, so the same session, role rules and column stripping apply.
 */
const MAX_REQUESTS = 25;
const UPSTREAM_CONCURRENCY = 4; // cap parallel PostgREST calls per page load
const PATH_PREFIX = "/api/db/rest/v1/";
const FORWARD = ["accept", "prefer", "range", "range-unit", "accept-profile"];

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const requests: { path: string; headers?: Record<string, string> }[] = Array.isArray(body?.requests) ? body.requests : [];
  if (requests.length === 0 || requests.length > MAX_REQUESTS) {
    return NextResponse.json({ error: `Send between 1 and ${MAX_REQUESTS} requests.` }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  const cookie = req.headers.get("cookie") || "";

  const runOne = async (r: { path: string; headers?: Record<string, string> }) => {
    if (typeof r?.path !== "string" || !r.path.startsWith(PATH_PREFIX)) {
      return { status: 400, headers: {}, body: JSON.stringify({ message: "Invalid batch path." }) };
    }
    const url = new URL(r.path, origin);
    const table = url.pathname.slice(PATH_PREFIX.length);
    const headers = new Headers({ cookie });
    for (const h of FORWARD) {
      const v = r.headers?.[h];
      if (typeof v === "string") headers.set(h, v);
    }
    try {
      const res = await proxyGet(new NextRequest(url, { method: "GET", headers }), { params: { table } });
      const outHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => (outHeaders[k] = v));
      return { status: res.status, headers: outHeaders, body: await res.text() };
    } catch (err: any) {
      return { status: 500, headers: {}, body: JSON.stringify({ message: err?.message || "Batch item failed." }) };
    }
  };

  // Bounded concurrency so one page load can't flood the database.
  const results: any[] = new Array(requests.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(UPSTREAM_CONCURRENCY, requests.length) }, async () => {
      while (next < requests.length) {
        const i = next++;
        results[i] = await runOne(requests[i]);
      }
    })
  );

  return NextResponse.json({ responses: results }, { headers: { "cache-control": "no-store" } });
}
