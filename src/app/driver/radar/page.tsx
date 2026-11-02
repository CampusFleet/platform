import { getSession } from "@/lib/jwt";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getOrFetchWithCache } from "@/lib/redis";
import DriverLiveRadarView from "@/components/driver/DriverLiveRadarView";
import { UnifiedAppHeader } from "@/components/common/UnifiedAppHeader";
import Link from "next/link";
import { Gauge, ArrowLeft } from "lucide-react";
import type { Trip, Bus, Route, Booking, Stop } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Server Component: Dedicated Full-Screen Driver Live Radar & Navigation
 * - Directly queries Supabase PostgreSQL for trips, routes, stops, and buses
 * - Authenticated via JWT session with Driver/Staff authorization
 * - Provides full-screen navigation radar view inspired by Uber Driver and Rapido Captain
 */
export default async function DriverRadarPage() {
  // 1. Authenticate server-side via HttpOnly JWT session
  const session = await getSession();

  if (!session) {
    redirect("/login?redirect=/driver/radar");
  }

  // Strict Role Authorization:
  if (
    session.role !== "driver" &&
    session.role !== "admin" &&
    session.role !== "transport_admin" &&
    session.role !== "transport_manager" &&
    session.role !== "conductor"
  ) {
    redirect("/portal");
  }

  // 2. Parallel fetch: cached shared fleet data + shorter-TTL bookings
  const [sharedData, dbBookings] = await Promise.all([
    getOrFetchWithCache({
      key: "driver:shared_fleet_data",
      ttl: 20,
      allowEmpty: true,
      fetchFn: async () => {
        const [
          { data: dbTrips },
          { data: dbBuses },
          { data: dbRoutes },
          { data: dbStops },
          { data: dbRouteStops },
        ] = await Promise.all([
          supabaseAdmin.from("trips").select("*").order("trip_code"),
          supabaseAdmin.from("buses").select("*"),
          supabaseAdmin.from("routes").select("*"),
          supabaseAdmin.from("stops").select("*"),
          supabaseAdmin.from("route_stops").select("*").order("stop_order", { ascending: true }),
        ]);
        return { dbTrips, dbBuses, dbRoutes, dbStops, dbRouteStops };
      },
    }),
    getOrFetchWithCache({
      key: "driver:reservations_recent",
      ttl: 15,
      allowEmpty: true,
      fetchFn: async () => {
        const { data } = await supabaseAdmin
          .from("bus_reservations_full")
          .select("*")
          .neq("status", "CANCELLED")
          .order("created_at", { ascending: false })
          .limit(200);
        return data;
      },
    }),
  ]);

  const { dbTrips, dbBuses, dbRoutes, dbStops, dbRouteStops } = sharedData;

  // 3. Map DB records to typed domain models
  const stops: Stop[] = (dbStops || []).map((s: any) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    latitude: Number(s.latitude),
    longitude: Number(s.longitude),
    landmark: s.landmark,
    geofenceRadiusMeters: Number(s.geofence_radius),
    campusId: s.campus_id || s.campus,
    campus: s.campus,
    isBusMergeStop: Boolean(s.is_bus_merge_stop),
    zoneCode: s.zone_code,
  }));

  const stopMap = new Map(stops.map((s) => [s.id, s]));

  const routes: Route[] = (dbRoutes || []).map((r: any) => {
    let routeStops = (dbRouteStops || [])
      .filter((rs: any) => rs.route_id === r.id && stopMap.has(rs.stop_id))
      .sort((a: any, b: any) => (a.stop_order ?? a.stop_sequence ?? 0) - (b.stop_order ?? b.stop_sequence ?? 0))
      .map((rs: any) => ({
        stopId: rs.stop_id,
        stopOrder: rs.stop_order || rs.stop_sequence || 0,
        stopSequence: rs.stop_order || rs.stop_sequence || 0,
        arrivalOffsetMinutes: rs.arrival_offset_minutes || 0,
        bufferTimeMinutes: rs.buffer_time_minutes || 0,
        stop: stopMap.get(rs.stop_id)!,
      }));

    if (routeStops.length === 0 && Array.isArray(r.stops_data) && r.stops_data.length > 0) {
      routeStops = r.stops_data
        .map((rs: any, idx: number) => {
          const stopId = rs.stopId || rs.id || rs.stop?.id;
          const stopObj = stopMap.get(stopId) || rs.stop;
          if (!stopObj) return null;
          return {
            stopId: stopObj.id || stopId,
            stopOrder: rs.stopOrder || idx + 1,
            stopSequence: rs.stopOrder || idx + 1,
            arrivalOffsetMinutes: Number(rs.arrivalOffsetMinutes),
            bufferTimeMinutes: Number(rs.bufferTimeMinutes),
            stop: stopObj,
          };
        })
        .filter(Boolean) as any[];
    }

    return {
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      direction: r.direction,
      color: r.color,
      totalDistanceKm: Number(r.total_distance_km),
      estimatedDurationMins: Number(r.estimated_duration_mins),
      isActive: Boolean(r.is_active),
      stops: routeStops,
    };
  });

  const trips: Trip[] = (dbTrips || []).map((t: any) => ({
    id: t.id,
    tripCode: t.trip_code,
    routeId: t.route_id,
    busId: t.bus_id,
    shiftId: t.shift_id,
    driverId: t.driver_id || "",
    conductorId: t.conductor_id || "",
    tripDate: t.trip_date,
    status: t.status,
    delayMinutes: t.delay_minutes || 0,
    manifestLocked: t.manifest_locked || false,
    manifestLockedAt: t.manifest_locked_at,
    startedAt: t.started_at,
    completedAt: t.completed_at,
    currentStopIndex: t.current_stop_index || 0,
    isSpecial: Boolean(t.is_special),
    facilityType: t.facility_type || (Boolean(t.is_special) ? "PLACEMENT_DRIVE" : "REGULAR"),
  }));

  const buses: Bus[] = (dbBuses || []).map((b: any) => ({
    id: b.id,
    busNumber: b.bus_number,
    registrationNo: b.registration_no || b.bus_number,
    model: b.model || "",
    capacity: Number(b.capacity || 0),
    seatLayout: (b.seat_layout as any) || "NONE",
    status: b.status || "ACTIVE",
    gpsDeviceId: b.gps_device_id || "",
    insuranceExpiry: b.insurance_expiry || "",
    maintenanceDueDate: b.maintenance_due_date || "",
    currentRouteId: b.current_route_id,
  }));

  const bookings: Booking[] = (dbBookings || []).map((b: any) => ({
    id: b.id,
    bookingCode: b.booking_code || `BK-${b.id.slice(0, 6)}`,
    studentId: b.student_id,
    tripId: b.trip_id,
    busId: b.bus_id || "",
    bookingDate: b.booking_date || (b.created_at ? b.created_at.split("T")[0] : ""),
    boardingStopId: b.boarding_stop_id || b.stop_id || "",
    status: b.status,
    waitlistPosition: b.waitlist_position,
    seatNumber: b.seat_number,
    passengerType: b.passenger_type,
    mergeStopId: b.merge_stop_id,
    createdAt: b.created_at || new Date().toISOString(),
  }));

  // Resolve driver's staff ID
  const { data: dbDriverStaff } = await supabaseAdmin
    .from("staff")
    .select("id, employee_code, email, full_name, user_id")
    .or(`user_id.eq.${session.userId},email.eq.${session.email || "none"},id.eq.${session.userId}`)
    .limit(1)
    .maybeSingle();

  const driverStaffId = dbDriverStaff?.id || null;

  // Active Trip resolution
  const effectiveDriverId = session.userId || driverStaffId || session.id || "";
  const myAssignedTrip =
    trips.find(
      (t) =>
        (t.driverId === effectiveDriverId || (driverStaffId && t.driverId === driverStaffId)) &&
        t.status === "IN_PROGRESS"
    ) ||
    trips.find(
      (t) =>
        t.driverId === effectiveDriverId || (driverStaffId && t.driverId === driverStaffId)
    ) ||
    trips.find((t) => t.status === "IN_PROGRESS") ||
    trips[0] ||
    null;

  const activeBus = buses.find((b) => b.id === myAssignedTrip?.busId) || buses[0] || null;
  const activeRoute = routes.find((r) => r.id === myAssignedTrip?.routeId) || routes[0] || null;

  return (
    <div className="min-h-screen bg-white dark:bg-black text-zinc-900 dark:text-white flex flex-col font-sans">
      <UnifiedAppHeader
        role="driver"
        portalTitle="Driver Live Radar"
        portalSubtitle={activeBus ? `Bus ${activeBus.busNumber} • Live Navigation` : "Live Navigation"}
        customActions={
          <div className="flex items-center gap-2">
            <Link
              href="/driver"
              className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Gauge className="w-4 h-4 text-blue-500" />
              <span>Cockpit Telemetry</span>
            </Link>
          </div>
        }
      />

      <main className="flex-1 relative w-full overflow-hidden">
        <DriverLiveRadarView
          initialUser={session}
          initialDriverStaffId={driverStaffId}
          activeTrip={myAssignedTrip}
          route={activeRoute}
          bus={activeBus}
          allTrips={trips}
          allBuses={buses}
          allRoutes={routes}
          allStops={stops}
          bookings={bookings}
        />
      </main>
    </div>
  );
}
