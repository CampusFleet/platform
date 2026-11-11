import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getOrFetchWithCache, CACHE_TTL } from "@/lib/redis";
import { getSessionFromRequest } from "@/lib/jwt";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // Session required (a "cron" user-agent or query flag used to bypass this).
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized access to master data." }, { status: 401 });
    }
    const isStaff = ["admin", "transport_admin", "transport_manager", "driver", "conductor"].includes(session.role);

    // Production-Grade Cache-Aside:
    // - Sub-2ms cache hit
    // - Anti-Stampede TTL Jitter
    // - Negative Cache Guard (avoids DB hammering)
    // - Stale-If-Error (prevents outage if Supabase has a network glitch)
    const [routes, stops, shifts, trips, stopRoutes, buses, transitZones, campuses, plans] = await Promise.all([
      getOrFetchWithCache({
        key: "campusfleet:state:routes",
        ttl: CACHE_TTL.MASTER_DATA_PERMANENT,
        fetchFn: async () => (await supabaseAdmin.from("routes").select("*")).data || [],
      }),
      getOrFetchWithCache({
        key: "campusfleet:state:stops",
        ttl: CACHE_TTL.MASTER_DATA_PERMANENT,
        fetchFn: async () => (await supabaseAdmin.from("stops").select("*")).data || [],
      }),
      getOrFetchWithCache({
        key: "campusfleet:state:shifts",
        ttl: CACHE_TTL.MASTER_DATA_PERMANENT,
        fetchFn: async () => (await supabaseAdmin.from("shifts").select("*")).data || [],
      }),
      getOrFetchWithCache({
        key: "campusfleet:state:trips",
        ttl: CACHE_TTL.HOT_DATA_TRIPS,
        fetchFn: async () => (await supabaseAdmin.from("trips").select("*")).data || [],
      }),
      getOrFetchWithCache({
        key: "campusfleet:state:stop_routes",
        ttl: CACHE_TTL.MASTER_DATA_PERMANENT,
        fetchFn: async () => (await supabaseAdmin.from("route_stops").select("*")).data || [],
      }),
      getOrFetchWithCache({
        key: "campusfleet:state:buses",
        ttl: CACHE_TTL.MASTER_DATA_PERMANENT,
        fetchFn: async () => (await supabaseAdmin.from("buses").select("*")).data || [],
      }),
      // Short TTL: these are edited in admin screens and must show up quickly.
      getOrFetchWithCache({
        key: "campusfleet:state:transit_zones",
        ttl: 60,
        fetchFn: async () => (await supabaseAdmin.from("transit_zones").select("*").order("created_at", { ascending: true })).data || [],
      }),
      getOrFetchWithCache({
        key: "campusfleet:state:campuses",
        ttl: 60,
        fetchFn: async () =>
          (await supabaseAdmin.from("campuses").select("*").order("is_primary", { ascending: false }).order("name", { ascending: true })).data || [],
      }),
      getOrFetchWithCache({
        key: "campusfleet:state:subscription_plans",
        ttl: 300,
        fetchFn: async () => (await supabaseAdmin.from("subscription_plans").select("*")).data || [],
      }),
    ]);

    // AGENTS.md: trip_code is internal-only; never send it to students/teachers.
    const safeTrips = isStaff ? trips : (trips as any[]).map(({ trip_code, ...t }) => t);

    // Aggregate everything into a single payload
    return NextResponse.json({
      success: true,
      data: {
        routes,
        stops,
        shifts,
        trips: safeTrips,
        stopRoutes,
        buses,
        transitZones,
        campuses,
        plans,
      },
    });
  } catch (error: any) {
    console.error("State sync API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch state" },
      { status: 500 }
    );
  }
}
