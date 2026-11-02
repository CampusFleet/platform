import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    // 1. Fetch routes, stops, route_stops
    const { data: routes } = await supabaseAdmin.from("routes").select("*");
    const { data: routeStops } = await supabaseAdmin.from("route_stops").select("*, stops(*)");
    const { data: students } = await supabaseAdmin.from("students_full").select("id, full_name, primary_route_id, primary_stop_id, zone_code, payment_status");
    const { data: bookings } = await supabaseAdmin.from("bus_reservations").select("id, trip_id, bus_id, student_id, boarding_stop_id, status");
    const { data: trips } = await supabaseAdmin.from("trips").select("id, route_id, bus_id, status");
    const { data: buses } = await supabaseAdmin.from("buses").select("id, bus_number, capacity, status");

    const activeBuses = (buses || []).filter(b => b.status === "ACTIVE");
    const avgBusCapacity = activeBuses.length > 0
      ? Math.round(activeBuses.reduce((acc, b) => acc + (b.capacity || 32), 0) / activeBuses.length)
      : 32;

    const analytics = (routes || []).map((route) => {
      // Students registered on this route
      const routeStudents = (students || []).filter(s => s.primary_route_id === route.id);
      const paidStudents = routeStudents.filter(s => s.payment_status === "APPROVED");

      // Trips on this route
      const routeTripIds = (trips || []).filter(t => t.route_id === route.id).map(t => t.id);
      const routeBookings = (bookings || []).filter(b => routeTripIds.includes(b.trip_id) && b.status !== "CANCELLED");

      // Stops on this route from relational route_stops table
      const rawStops = (routeStops || [])
        .filter((rs: any) => rs.route_id === route.id)
        .sort((a: any, b: any) => (a.stop_order ?? 0) - (b.stop_order ?? 0));

      const stopsOnRoute = rawStops.map((rs: any, idx: number) => {
        const stopId = rs.stop_id || rs.stops?.id || `stop-${idx}`;
        const stopName = rs.stops?.name || `Stop ${idx + 1}`;
        const zoneCode = rs.stops?.zone_code || "ZONE_B";
        const stopStudents = routeStudents.filter(s => s.primary_stop_id === stopId);
        const stopBookings = routeBookings.filter(b => b.boarding_stop_id === stopId);
        return {
          stopId,
          stopName,
          zoneCode,
          registeredCount: stopStudents.length,
          activeBookingsCount: stopBookings.length,
        };
      });

      const totalCommuterDemand = Math.max(routeStudents.length, routeBookings.length);

      // Algorithmic Bus Fleet Allocation:
      // Minimum 1 bus if route is active.
      // 10% safety buffer for peak load.
      // recommendedBuses = ceil((totalDemand * 1.1) / avgBusCapacity)
      const bufferDemand = Math.ceil(totalCommuterDemand * 1.1);
      const recommendedBuses = totalCommuterDemand > 0
        ? Math.max(1, Math.ceil(bufferDemand / avgBusCapacity))
        : 1;

      // Currently assigned unique buses to this corridor
      const routeTrips = (trips || []).filter(t => t.route_id === route.id && t.status !== "COMPLETED");
      const assignedBusesCount = new Set(routeTrips.map(t => t.bus_id)).size || 1;

      let fleetStatus: "OPTIMAL" | "UNDER_ALLOCATED" | "OVER_ALLOCATED" = "OPTIMAL";
      if (assignedBusesCount < recommendedBuses) {
        fleetStatus = "UNDER_ALLOCATED";
      } else if (assignedBusesCount > recommendedBuses + 1 && totalCommuterDemand < assignedBusesCount * avgBusCapacity * 0.5) {
        fleetStatus = "OVER_ALLOCATED";
      }

      return {
        routeId: route.id,
        routeCode: route.code,
        routeName: route.name,
        direction: route.direction || "HOME_TO_CAMPUS",
        totalDistanceKm: Number(route.total_distance_km ?? 0),
        registeredStudents: routeStudents.length,
        paidStudents: paidStudents.length,
        activeBookings: routeBookings.length,
        totalCommuterDemand,
        avgBusCapacity,
        recommendedBuses,
        assignedBusesCount,
        fleetStatus,
        utilizationRate: assignedBusesCount > 0 ? Math.min(100, Math.round((totalCommuterDemand / (assignedBusesCount * avgBusCapacity)) * 100)) : 0,
        stops: stopsOnRoute,
      };
    });

    return NextResponse.json({
      success: true,
      analytics,
      summary: {
        totalRoutes: (routes || []).length,
        totalRegisteredStudents: (students || []).length,
        totalActiveBuses: activeBuses.length,
        avgCapacity: avgBusCapacity,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
