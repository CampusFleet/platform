import { getSession } from "@/lib/jwt";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getOrFetchWithCache } from "@/lib/redis";
import UnifiedCommuteHub from "@/components/portal/UnifiedCommuteHub";
import type { Student, Bus, Route, Stop, Shift, Trip, Booking, Staff } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function StudentPortalPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?redirect=/portal");
  }

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
  const currentDayOfWeek = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][istDate.getUTCDay()];

  // ── Parallel fetch: cached shared fleet data + per-student dynamic queries ──
  const [sharedData, ...perStudentResults] = await Promise.all([
    // Shared fleet data — identical for ALL students, cached 20s with jitter
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
        ] = await Promise.all([
          supabaseAdmin.from("buses").select("*"),
          supabaseAdmin.from("routes").select("*"),
          supabaseAdmin.from("stops").select("*"),
          supabaseAdmin.from("shifts").select("*"),
          supabaseAdmin.from("trips").select("*").order("created_at", { ascending: false }).limit(60),
          supabaseAdmin.from("route_stops").select("*").order("stop_order", { ascending: true }),
          supabaseAdmin.from("campuses").select("*"),
        ]);
        return { dbBuses, dbRoutes, dbStops, dbShifts, dbTrips, dbRouteStops, dbCampuses };
      },
    }),
    // Per-student queries — MUST stay dynamic (user-specific)
    supabaseAdmin
      .from("bookings_full")
      .select("*")
      .or(`student_id.eq.${resolvedStudentId},student_id.eq.${session.userId}`)
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("special_shift_allocations")
      .select("*")
      .or(`student_id.eq.${resolvedStudentId},student_id.eq.${session.userId}`),
    supabaseAdmin
      .from("bus_reservations")
      .select("*, buses(*)")
      .or(`student_id.eq.${resolvedStudentId},student_id.eq.${session.userId}`)
      .in("reservation_date", allowedDates)
      .neq("status", "CANCELLED")
      .order("created_at", { ascending: false })
      .limit(1),
    activeStudentRow?.class_id
      ? getOrFetchWithCache({
          key: `schedule:class:${activeStudentRow.class_id}:${currentDayOfWeek}`,
          ttl: 120,
          allowEmpty: true,
          fetchFn: async () => {
            const { data } = await supabaseAdmin
              .from("class_shift_schedules")
              .select("incoming_shift_id, outgoing_shift_id, is_today_off")
              .eq("class_id", activeStudentRow.class_id)
              .eq("day_of_week", currentDayOfWeek)
              .maybeSingle();
            return data;
          },
        }).then(data => ({ data }))
      : Promise.resolve({ data: null }),
  ]);

  const { dbBuses, dbRoutes, dbStops, dbShifts, dbTrips, dbRouteStops, dbCampuses } = sharedData;
  const { data: dbBookings } = perStudentResults[0];
  const { data: dbAllocations } = perStudentResults[1];
  const { data: dbReservations } = perStudentResults[2];
  const { data: dbClassSchedule } = perStudentResults[3] || { data: null };

  const campusNameMap = new Map((dbCampuses || []).map((c: any) => [c.id, c.name]));
  const stopMap = new Map((dbStops || []).map((s: any) => [s.id, s]));

  const dbStaff: any[] = [];

  const students: Student[] = (dbStudents || []).map((s: any) => ({
    id: s.id,
    userId: s.user_id || s.id,
    fullName: s.full_name || s.name || "",
    email: s.email || "",
    phone: s.phone || "",
    department: s.department || "",
    semester: s.semester ? String(s.semester) : "",
    zoneCode: s.zone_code,
    primaryStopId: s.primary_stop_id || s.stop_id || "",
    primaryRouteId: s.primary_route_id || s.route_id || "",
    campusId: s.campus_id || s.campus,
    campus: s.campus,
    emergencyContact: s.emergency_contact || (s.emergency_contact_name || s.emergency_contact_phone ? {
      name: s.emergency_contact_name || null,
      relationship: s.emergency_contact_relationship || "Parent",
      phone: s.emergency_contact_phone || null,
    } : null),
    transportAccessSuspended: Boolean(s.transport_access_suspended),
    hasActiveSubscription: Boolean(s.has_active_subscription),
    subscriptionExpiryDate: s.subscription_expiry_date,
    classId: s.class_id,
    className: s.class_name,
    paymentStatus: s.payment_status,
    totalFeeDue: Number(s.total_fee_due || 0),
    totalFeePaid: Number(s.total_fee_paid || 0),
    photoUrl: s.photo_url || "",
    photoLocked: Boolean(s.photo_locked),
    homeLatitude: s.home_latitude !== null && s.home_latitude !== undefined ? Number(s.home_latitude) : undefined,
    homeLongitude: s.home_longitude !== null && s.home_longitude !== undefined ? Number(s.home_longitude) : undefined,
    homeAddress: s.home_address || "",
    autoAssignedStopId: s.auto_assigned_stop_id || "",
  }));

  const currentStudent = students.find(
    s =>
      s.userId === session.userId ||
      (session as any).id === s.userId ||
      s.id === session.userId ||
      s.id === (session as any).id ||
      s.email?.toLowerCase() === session.email?.toLowerCase()
  );

  const buses: Bus[] = (dbBuses || []).map((b: any) => ({
    id: b.id,
    busNumber: b.bus_number || b.busNumber || "",
    registrationNo: b.registration_no || b.registrationNo || "",
    model: b.model || "",
    capacity: Number(b.capacity || 0),
    seatLayout: (b.seat_layout || b.seatLayout || "NONE") as any,
    status: b.status || "ACTIVE",
    gpsDeviceId: b.gps_device_id || b.gpsDeviceId || "",
    insuranceExpiry: b.insurance_expiry || b.insuranceExpiry || "",
    maintenanceDueDate: b.maintenance_due_date || b.maintenanceDueDate || "",
    currentRouteId: b.route_id || b.currentRouteId,
    teacherSeatsCount: typeof b.teacher_seats_count === "number" ? b.teacher_seats_count : b.teacherSeatsCount,
  }));

  const routes: Route[] = (dbRoutes || []).map((r: any) => {
    const routeStops = (dbRouteStops || [])
      .filter((rs: any) => rs.route_id === r.id && stopMap.has(rs.stop_id))
      .sort((a: any, b: any) => (a.stop_order ?? 0) - (b.stop_order ?? 0))
      .map((rs: any) => ({
        stopId: rs.stop_id,
        stopOrder: rs.stop_order || 0,
        arrivalOffsetMinutes: rs.arrival_offset_minutes || 0,
        bufferTimeMinutes: rs.buffer_time_minutes || 0,
        stop: stopMap.get(rs.stop_id)!,
      }));

    return {
      id: r.id,
      name: r.name,
      code: r.code,
      description: r.description || (r.origin && r.destination ? `${r.origin} to ${r.destination}` : ""),
      direction: (r.direction) as any,
      color: r.color || "#2563EB",
      isActive: Boolean(r.is_active),
      stops: routeStops,
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

  const shifts: Shift[] = (dbShifts || []).map((sh: any) => ({
    id: sh.id,
    name: sh.name,
    shiftType: sh.type,
    direction: sh.direction,
    startTime: sh.start_time ? sh.start_time.substring(0, 5) : "",
    endTime: sh.end_time ? sh.end_time.substring(0, 5) : "",
    bookingCutoffMins: Number(sh.booking_cutoff_minutes),
    isSpecial: Boolean(sh.is_special),
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
    status: (t.status) as any,
    delayMinutes: Number(t.delay_minutes || 0),
    manifestLocked: Boolean(t.manifest_locked),
    currentStopIndex: Number(t.current_stop_index || 0),
    isSpecial: Boolean(t.is_special),
    facilityType: t.facility_type || (Boolean(t.is_special) ? "PLACEMENT_DRIVE" : "REGULAR"),
  }));

  const bookings: Booking[] = (dbBookings || []).map((b: any) => ({
    id: b.id,
    bookingCode: b.booking_code || `BK-${b.id.slice(0, 6)}`,
    studentId: b.student_id,
    tripId: b.trip_id,
    busId: b.bus_id || "",
    bookingDate: b.booking_date || (b.created_at ? b.created_at.split("T")[0] : ""),
    boardingStopId: b.boarding_stop_id || b.stop_id || "",
    status: b.status || "",
    waitlistPosition: b.waitlist_position,
    seatNumber: b.seat_number,
    passengerType: b.passenger_type || "",
    createdAt: b.created_at || new Date().toISOString(),
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

  // Filter special trips & shifts: strictly restricted to allocated students only
  const studentAllocations = (dbAllocations || []).filter((a: any) =>
    a.student_id === currentStudent?.id || a.student_id === session.userId
  );
  const allocatedShiftIds = new Set(studentAllocations.map((a: any) => a.shift_id));
  const allocatedTripIds = new Set(studentAllocations.map((a: any) => a.trip_id).filter(Boolean));

  const visibleShifts = shifts.filter(sh => !sh.isSpecial || allocatedShiftIds.has(sh.id));

  const visibleTrips = trips.filter(t => {
    const isSpecialTrip = t.isSpecial || t.facilityType === "PLACEMENT_DRIVE" || t.facilityType === "EVENT";
    const shift = shifts.find(sh => sh.id === t.shiftId);
    const isSpecialShift = shift && (shift.isSpecial || shift.name?.toLowerCase().includes("special"));
    if (isSpecialTrip || isSpecialShift) {
      return allocatedShiftIds.has(t.shiftId) || (t.id && allocatedTripIds.has(t.id));
    }
    return true;
  });

  const normalizedUser = {
    ...session,
    id: session.userId,
    userId: session.userId,
    studentId: resolvedStudentId,
  };

  const isTodayOff = Boolean(
    dbClassSchedule?.is_today_off ||
    (dbClassSchedule && !dbClassSchedule.incoming_shift_id && !dbClassSchedule.outgoing_shift_id)
  );

  const initialSchedule = dbClassSchedule
    ? {
        incomingShiftId: isTodayOff ? "" : (dbClassSchedule.incoming_shift_id || ""),
        outgoingShiftId: isTodayOff ? "" : (dbClassSchedule.outgoing_shift_id || ""),
        isTodayOff,
        isAllShiftsOver: false,
        dayOfWeek: currentDayOfWeek,
        reason: dbClassSchedule.is_today_off ? "CLASS_DAY_OFF" : "NO_SHIFTS_CONFIGURED",
      }
    : null;

  // If today is marked off for this user's class, initialReservation is strictly null to prevent flashing booking UI
  const rawReservation = (!isTodayOff && dbReservations?.[0]) ? dbReservations[0] : null;
  const initialReservation = rawReservation
    ? {
        ...rawReservation,
        bus: rawReservation.buses
          ? {
              ...rawReservation.buses,
              busNumber: rawReservation.buses.bus_number,
              registrationNo: rawReservation.buses.registration_no,
              seatLayout: rawReservation.buses.seat_layout,
            }
          : null,
      }
    : null;

  return (
    <UnifiedCommuteHub
      initialUser={normalizedUser}
      initialStudents={students}
      initialBuses={buses}
      initialTrips={visibleTrips}
      initialShifts={visibleShifts}
      initialStops={stops}
      initialBookings={bookings}
      initialStaff={staff}
      initialRoutes={routes}
      initialReservation={initialReservation}
      initialSchedule={initialSchedule}
    />
  );
}
