import { NextRequest, NextResponse } from "next/server";
import { cacheDel } from "@/lib/redis";
import { CLIENT_STATE_MASTER_KEY } from "@/lib/client-state-data";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/supabase/invalidate-cache
 * Called by Supabase Database Webhooks when Master Data tables change.
 * Deletes the corresponding Redis cache key to trigger an immediate fresh pull on the next request.
 */
export async function POST(req: NextRequest) {
  try {
    // Basic authorization check: verify webhook secret
    const authHeader = req.headers.get("Authorization") || "";
    const expectedToken = process.env.SUPABASE_WEBHOOK_SECRET;

    // Fail closed: an unset secret must not turn this into an open endpoint.
    const expected = Buffer.from(`Bearer ${expectedToken || ""}`, "utf8");
    const received = Buffer.from(authHeader, "utf8");
    if (!expectedToken || expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const payload = await req.json();
    const table = payload.table;
    
    if (!table) {
      return NextResponse.json({ success: false, error: "Missing table in payload" }, { status: 400 });
    }

    // Tables behind the master data of GET /api/client-state (src/lib/client-state-data.ts).
    const MASTER_TABLES = ["routes", "stops", "shifts", "route_stops", "buses", "transit_zones", "campuses"];
    if (!MASTER_TABLES.includes(table)) {
      console.log(`[Webhook] Ignored cache invalidation for table: ${table}`);
      return NextResponse.json({ success: true, message: "Ignored table" });
    }
    const keysToDelete: string[] = [CLIENT_STATE_MASTER_KEY];

    // Execute deletions in parallel
    await Promise.all(keysToDelete.map(key => cacheDel(key)));

    console.log(`[Webhook] Cache invalidated for table: ${table}. Keys deleted: ${keysToDelete.join(", ")}`);
    return NextResponse.json({ success: true, message: `Invalidated ${keysToDelete.length} keys` });

  } catch (error: any) {
    console.error("[Webhook] Cache invalidation error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
