import { NextRequest, NextResponse } from "next/server";
import { cacheDel } from "@/lib/redis";
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

    // Map table names to Redis cache keys
    const keysToDelete: string[] = [];

    switch (table) {
      case "routes":
        keysToDelete.push("campusfleet:state:routes");
        break;
      case "stops":
        keysToDelete.push("campusfleet:state:stops");
        break;
      case "shifts":
        keysToDelete.push("campusfleet:state:shifts");
        break;
      case "trips":
        keysToDelete.push("campusfleet:state:trips");
        break;
      case "route_stops":
        keysToDelete.push("campusfleet:state:stop_routes");
        break;
      case "buses":
        keysToDelete.push("campusfleet:state:buses");
        break;
      case "transit_zones":
      case "campuses":
        keysToDelete.push("campusfleet:state:routes");
        break;
      default:
        console.log(`[Webhook] Ignored cache invalidation for table: ${table}`);
        return NextResponse.json({ success: true, message: "Ignored table" });
    }

    // Execute deletions in parallel
    await Promise.all(keysToDelete.map(key => cacheDel(key)));

    console.log(`[Webhook] Cache invalidated for table: ${table}. Keys deleted: ${keysToDelete.join(", ")}`);
    return NextResponse.json({ success: true, message: `Invalidated ${keysToDelete.length} keys` });

  } catch (error: any) {
    console.error("[Webhook] Cache invalidation error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
