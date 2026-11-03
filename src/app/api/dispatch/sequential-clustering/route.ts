import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { store } from "@/lib/store";
import { clusterRouteStudentsSequentially } from "@/lib/sequential-bus-clustering";
import type { Route, Stop, Bus } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/dispatch/sequential-clustering?routeId=...
 * POST /api/dispatch/sequential-clustering { routeId: "...", busCapacity?: number }
 * 
 * Executes the Sequential Express Zone & Bus Clustering algorithm:
 * - Orders route stops from start to end (campus).
 * - Clusters students by assigned pickup stop along the corridor.
 * - Fills Bus 1 to 100% capacity from the first stops, then converts Bus 1 to EXPRESS DIRECT to campus.
 * - Dispatches Bus 2 starting directly from (last full stop + 1) to eliminate deadhead empty miles.
 * - Computes total minutes and fuel saved for the fleet.
 */
export async function GET(req: NextRequest) {
  try {
    const routeId = req.nextUrl.searchParams.get("routeId");
    return handleClustering(routeId);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message || "Failed to execute clustering." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const routeId = body.routeId || req.nextUrl.searchParams.get("routeId");
    return handleClustering(routeId, body.customStudents, body.customBuses);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message || "Failed to execute clustering." },
      { status: 500 }
    );
  }
}

async function handleClustering(routeId?: string | null, customStudents?: any[], customBuses?: any[]) {
  // 1. Fetch routes, stops, and buses (try Supabase first, fallback to store)
  let dbRoutes: any[] = [];
  let dbStops: any[] = [];
  let dbBuses: any[] = [];
  let dbStudents: any[] = [];
  let dbRouteStops: any[] = [];

  try {
    const [rRes, sRes, bRes, stRes, rsRes] = await Promise.all([
      supabaseAdmin.from("routes").select("*"),
      supabaseAdmin.from("stops").select("*"),
      supabaseAdmin.from("buses").select("*"),
      supabaseAdmin.from("students_full").select("id, full_name, primary_stop_id, primary_route_id, auto_assigned_stop_id, home_latitude, home_longitude"),
      supabaseAdmin.from("route_stops").select("*").order("stop_order"),
    ]);

    dbRoutes = rRes.data || [];
    dbStops = sRes.data || [];
    dbBuses = bRes.data || [];
    dbStudents = stRes.data || [];
    dbRouteStops = rsRes.data || [];
  } catch (dbErr) {
    console.warn("[sequential-clustering] Supabase query fallback to store:", dbErr);
  }

  // Fallbacks to store if database returns empty
  const routes: Route[] = dbRoutes.length > 0 ? dbRoutes : store.getRoutes();
  const stops: Stop[] = dbStops.length > 0 ? dbStops : store.getStops();
  const buses: Bus[] = customBuses || (dbBuses.length > 0 ? dbBuses : store.getBuses());

  // Target route
  const targetRoute = routeId ? routes.find(r => r.id === routeId) || routes[0] : routes[0];
  if (!targetRoute) {
    return NextResponse.json(
      { success: false, message: "No transit routes found to cluster." },
      { status: 404 }
    );
  }

  // Populate route stops if missing
  if (!targetRoute.stops || targetRoute.stops.length === 0) {
    const matchingRs = dbRouteStops.filter((rs: any) => rs.route_id === targetRoute.id);
    if (matchingRs.length > 0) {
      targetRoute.stops = matchingRs
        .map((rs: any) => {
          const matchedStop = stops.find(s => s.id === rs.stop_id);
          if (!matchedStop) return null;
          return {
            stopId: rs.stop_id,
            stopOrder: rs.stop_order ?? 0,
            arrivalOffsetMinutes: rs.arrival_offset_minutes ?? 0,
            bufferTimeMinutes: 2,
            stop: matchedStop,
          };
        })
        .filter((rs: any): rs is NonNullable<typeof rs> => Boolean(rs));
    }
  }

  // Gather students on this route
  const studentPool = customStudents || (dbStudents.length > 0
    ? dbStudents
        .filter((s: any) => {
          const stopId = s.primary_stop_id || s.auto_assigned_stop_id;
          if (!stopId) return false;
          if (s.primary_route_id && s.primary_route_id === targetRoute.id) return true;
          return (targetRoute.stops || []).some((rs: any) => (rs.stopId || rs.stop_id) === stopId);
        })
        .map((s: any) => ({
          studentId: s.id,
          studentName: s.full_name,
          pickupStopId: s.primary_stop_id || s.auto_assigned_stop_id,
          homeLatitude: s.home_latitude,
          homeLongitude: s.home_longitude,
        }))
    : store.getStudents()
        .filter(s => {
          const stopId = s.primaryStopId || (s as any).autoAssignedStopId;
          return (targetRoute.stops || []).some((rs: any) => (rs.stopId || rs.stop_id) === stopId);
        })
        .map(s => ({
          studentId: s.id,
          studentName: s.fullName,
          pickupStopId: s.primaryStopId || (s as any).autoAssignedStopId,
          homeLatitude: (s as any).homeLatitude,
          homeLongitude: (s as any).homeLongitude,
        })));

  const result = clusterRouteStudentsSequentially(
    targetRoute,
    stops,
    studentPool,
    buses
  );

  // Build Route Stops Manifest: [Route Start -> Route End] with allocated student IDs
  const sortedRouteStops = (targetRoute.stops || [])
    .slice()
    .sort((a, b) => a.stopOrder - b.stopOrder);

  const routeStopsManifest = sortedRouteStops.map(rs => {
    const stopObj = rs.stop || stops.find(s => s.id === rs.stopId);
    const assignedStudentsAtStop = studentPool.filter(s => s.pickupStopId === rs.stopId);
    return {
      stopId: rs.stopId,
      stopName: stopObj?.name || `Stop #${rs.stopOrder}`,
      stopOrder: rs.stopOrder,
      studentCount: assignedStudentsAtStop.length,
      studentIds: assignedStudentsAtStop.map(s => s.studentId),
      students: assignedStudentsAtStop,
    };
  });

  return NextResponse.json({
    success: true,
    route: {
      id: targetRoute.id,
      name: targetRoute.name,
      code: targetRoute.code,
    },
    routeStopsManifest,
    clustering: result,
  });
}
