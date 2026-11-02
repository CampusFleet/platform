import { getSession } from "@/lib/jwt";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getOrFetchWithCache } from "@/lib/redis";
import FullScreenLiveRadarView from "@/components/portal/FullScreenLiveRadarView";
import type { Student, Bus, Route, Stop, Shift, Trip, Booking, Staff, Campus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LiveRadarPage({
  searchParams,
}: {
  searchParams?: Promise<{ busId?: string }> | { busId?: string };
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login?redirect=/portal/radar");
  }

  const resolvedParams = searchParams ? await Promise.resolve(searchParams) : {};
  const selectedBusId = resolvedParams.busId || null;

  // Resolve student record by user_id, id, or email with sub-2ms Redis cache-aside
  const studentOrFilter = [
    `user_id.eq.${session.userId}`,
    `id.eq.${session.userId}`,
    session.email ? `email.eq.${session.email}` : null,
  ].filter(Boolean).join(",");

  const dbStudents = await getOrFetchWithCache({
    key: `portal:student_row:${session.userId}`,
    ttl: 60,
    allowEmpty: true,
    fetchFn: async () => {
      const { data } = await supabaseAdmin
        .from("students_full")
        .select("*")
        .or(studentOrFilter);
      return data || [];
    },
  });

  const activeStudentRow = dbStudents?.[0];
  const resolvedStudentId = activeStudentRow?.id || session.userId;

  const now = new Date();
  const istDate = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const todayIST = istDate.toISOString().split("T")[0];
  const todayUTC = now.toISOString().split("T")[0];
  const allowedDates = Array.from(new Set([todayIST, todayUTC]));

  // ── Parallel fetch: cached shared fleet data + per-student dynamic queries ──
  const [sharedData, { data: dbBookings }, { data: dbReservations }] = await Promise.all([
    getOrFetchWithCache({
      key: "portal:shared_fleet_data",
      ttl: 20,
      allowEmpty: true,
      fetchFn: async () => {
        const [
          { data: dbBuses },
          { data: dbRoutes },
          { data: dbStops },
          { data: dbShifts },
          { data: dbTrips },
          { data: dbRouteStops },
          { data: dbCampuses },
          { data: dbStaff },
        ] = await Promise.all([
          supabaseAdmin.from("buses").select("*"),
          supabaseAdmin.from("routes").select("*"),
          supabaseAdmin.from("stops").select("*"),
          supabaseAdmin.from("shifts").select("*"),
          supabaseAdmin.from("trips").select("*").order("created_at", { ascending: false }).limit(60),
          supabaseAdmin.from("route_stops").select("*").order("stop_order", { ascending: true }),
          supabaseAdmin.from("campuses").select("*"),
          supabaseAdmin.from("staff").select("*"),
        ]);
        return { dbBuses, dbRoutes, dbStops, dbShifts, dbTrips, dbRouteStops, dbCampuses, dbStaff };
      },
    }),
    supabaseAdmin
      .from("bus_reservations_full")
      .select("*")
      .or(`student_id.eq.${resolvedStudentId},student_id.eq.${session.userId}`)
      .order("created_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("bus_reservations")
      .select("*, buses(*)")
      .or(`student_id.eq.${resolvedStudentId},student_id.eq.${session.userId}`)
      .in("reservation_date", allowedDates)
      .neq("status", "CANCELLED")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const {
    dbBuses = [],
    dbRoutes = [],
    dbStops = [],
    dbShifts = [],
    dbTrips = [],
    dbRouteStops = [],
    dbCampuses = [],
    dbStaff = [],
  } = (sharedData as any) || {};

  const campusNameMap = new Map((dbCampuses || []).map((c: any) => [c.id, c.name]));

  // Build route-stop relational structure
  const routeStopsMap = new Map<string, any[]>();
  (dbRouteStops || []).forEach((rs: any) => {
    if (!routeStopsMap.has(rs.route_id)) {
      routeStopsMap.set(rs.route_id, []);
    }
    const matchingStop = (dbStops || []).find((s: any) => s.id === rs.stop_id);
    routeStopsMap.get(rs.route_id)?.push({
      stopId: rs.stop_id,
      stopOrder: rs.stop_order,
      stop: matchingStop
        ? {
            id: matchingStop.id,
            name: matchingStop.name,
            code: matchingStop.code,
            latitude: Number(matchingStop.latitude),
            longitude: Number(matchingStop.longitude),
            landmark: matchingStop.landmark || "",
            geofenceRadiusMeters: Number(matchingStop.geofence_radius || 80),
            campusId: matchingStop.campus_id,
            campus: campusNameMap.get(matchingStop.campus_id) || "",
            isBusMergeStop: Boolean(matchingStop.is_bus_merge_stop),
            zoneCode: matchingStop.zone_code,
          }
        : undefined,
    });
  });

  const routes: Route[] = (dbRoutes || []).map((r: any) => {
    const rStops = routeStopsMap.get(r.id) || [];
    return {
      id: r.id,
      name: r.name,
      code: r.code,
      color: r.color || "#10B981",
      isActive: Boolean(r.is_active),
      stops: rStops,
      totalDistanceKm: Number(r.total_distance_km || 0),
      estimatedDurationMins: Number(r.estimated_duration_mins || 0),
      campusId: r.campus_id,
    };
  });

  const stops: Stop[] = (dbStops || []).map((st: any) => ({
    id: st.id,
    name: st.name,
    code: st.code,
    latitude: Number(st.latitude),
    longitude: Number(st.longitude),
    landmark: st.landmark || "",
    geofenceRadiusMeters: Number(st.geofence_radius || 80),
    campusId: st.campus_id,
    campus: campusNameMap.get(st.campus_id) || "",
    isBusMergeStop: Boolean(st.is_bus_merge_stop),
    zoneCode: st.zone_code,
  }));

  const buses: Bus[] = (dbBuses || []).map((b: any) => ({
    id: b.id,
    busNumber: b.bus_number,
    registrationNumber: b.registration_no || b.registration_number || "",
    capacity: Number(b.capacity || 50),
    model: b.model || "",
    isActive: Boolean(b.is_active),
    campusId: b.campus_id,
    gpsDeviceId: b.gps_device_id,
  }));

  const trips: Trip[] = (dbTrips || []).map((t: any) => ({
    id: t.id,
    tripCode: t.trip_code,
    shiftId: t.shift_id,
    routeId: t.route_id || "",
    busId: t.bus_id || "",
    driverId: t.driver_id || "",
    conductorId: t.conductor_id || "",
    tripDate: t.trip_date || new Date().toISOString().split("T")[0],
    status: t.status as any,
    delayMinutes: Number(t.delay_minutes || 0),
    manifestLocked: Boolean(t.manifest_locked),
    currentStopIndex: Number(t.current_stop_index || 0),
    isSpecial: Boolean(t.is_special),
    facilityType: t.facility_type || (Boolean(t.is_special) ? "PLACEMENT_DRIVE" : "REGULAR"),
  }));

  const staff: Staff[] = (dbStaff || []).map((st: any) => ({
    id: st.id,
    userId: st.user_id || st.id,
    employeeCode: st.employee_code || st.employee_id || `EMP-${st.id.slice(0, 4)}`,
    fullName: st.full_name || st.name || "",
    email: st.email || "",
    phone: st.phone || "",
    category: (st.category || "") as any,
    rank: (st.rank || "") as any,
    role: (st.role || "") as any,
    permissions: st.permissions || [],
    isActive: st.is_active ?? true,
  }));

  const campuses: Campus[] = (dbCampuses || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    latitude: Number(c.latitude),
    longitude: Number(c.longitude),
    isPrimary: Boolean(c.is_primary),
    address: c.address,
    landmark: c.landmark,
    geofenceRadiusMeters: Number(c.geofence_radius || 150),
  }));

  const activeStudent: Student | null = activeStudentRow
    ? {
        id: activeStudentRow.id,
        userId: activeStudentRow.user_id,
        fullName: activeStudentRow.full_name,
        email: activeStudentRow.email,
        phone: activeStudentRow.phone || "",
        department: activeStudentRow.department || "",
        semester: activeStudentRow.semester || "",
        campus: activeStudentRow.campus || "",
        campusId: activeStudentRow.campus_id || "",
        primaryStopId: activeStudentRow.primary_stop_id || "",
        primaryRouteId: activeStudentRow.primary_route_id || "",
        emergencyContact: activeStudentRow.emergency_contact || { name: "", relationship: "", phone: "" },
        transportAccessSuspended: Boolean(activeStudentRow.transport_access_suspended),
        hasActiveSubscription: Boolean(activeStudentRow.has_active_subscription) || activeStudentRow.payment_status === "APPROVED",
        subscriptionExpiryDate: activeStudentRow.subscription_expiry_date || null,
        classId: activeStudentRow.class_id,
        className: activeStudentRow.class_name,
        zoneCode: activeStudentRow.zone_code || "ZONE_B",
        paymentStatus: activeStudentRow.payment_status || "UNPAID",
        totalFeeDue: Number(activeStudentRow.total_fee_due) || 0,
        totalFeePaid: Number(activeStudentRow.total_fee_paid) || 0,
        photoUrl: activeStudentRow.photo_url || "",
        photoLocked: Boolean(activeStudentRow.photo_url && activeStudentRow.photo_url.trim() !== "") || Boolean(activeStudentRow.photo_locked),
        studentIdCode: activeStudentRow.student_id_code || null,
        homeLatitude: activeStudentRow.home_latitude ?? null,
        homeLongitude: activeStudentRow.home_longitude ?? null,
        homeAddress: activeStudentRow.home_address || null,
        autoAssignedStopId: activeStudentRow.auto_assigned_stop_id || null,
      }
    : null;

  const currentReservation = dbReservations?.[0] || null;
  const currentBooking = dbBookings?.[0] || null;

  return (
    <FullScreenLiveRadarView
      initialUser={session}
      initialStudent={activeStudent}
      initialBuses={buses}
      initialRoutes={routes}
      initialStops={stops}
      initialTrips={trips}
      initialStaff={staff}
      initialCampuses={campuses}
      initialReservation={currentReservation}
      activeBooking={currentBooking}
      selectedBusId={selectedBusId}
    />
  );
}
