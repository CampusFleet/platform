import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { getClientState } from "@/lib/client-state-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/client-state[?fresh=1]
 * Data for the browser cache (src/lib/client-store). Scope depends on the session role:
 * MANAGE roles get the admin data set, everyone else master data + their own row.
 * `fresh=1` is honoured for MANAGE roles only (cache bypass after an admin write).
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });

  try {
    const fresh = req.nextUrl.searchParams.get("fresh") === "1";
    const data = await getClientState(session, { fresh });
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("GET /api/client-state failed:", err);
    return NextResponse.json({ success: false, error: "Could not load data." }, { status: 500 });
  }
}
