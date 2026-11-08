import { getSession } from "@/lib/jwt";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getOrFetchWithCache } from "@/lib/redis";
import type { Route, Bus, Stop, Student, Trip, Booking, Staff, UserAccount, Campus, ClassItem, Shift, TripDirection, RestZone } from "@/lib/types";

export async function getStaffServerData(redirectPath: string = "/transport-admin") {
  const session = await getSession();

  if (!session) {
    redirect(`/login?redirect=${encodeURIComponent(redirectPath)}`);
  }

  if (session.role !== "transport_admin" && session.role !== "admin" && session.role !== "transport_manager") {
    redirect(session.role === "driver" ? "/driver" : session.role === "conductor" ? "/conductor" : "/portal");
  }

  const {
    dbTrips,
    dbBuses,
    dbRoutes,
    dbBookings,
    dbStops,
    dbStudents,
    dbStaff,
    dbUsers,
    dbRouteStops,
    dbCampuses,
    dbClasses,
    dbShifts,
    dbRestZones,
  } = await getOrFetchWithCache({
    key: "staff:transport_admin_raw_tables_v3",
    ttl: 20, // 20s cache with jitter for instant page switching
    allowEmpty: true,
    fetchFn: async () => {
      const [
        { data: dbTrips },
        { data: dbBuses },
        { data: dbRoutes },
        { data: dbBookings },
        { data: dbStops },
        { data: dbStudents },
        { data: dbStaff },
        { data: dbUsers },
        { data: dbRouteStops },
        { data: dbCampuses },
        { data: dbClasses },
        { data: dbShifts },
        { data: dbRestZones },
      ] = await Promise.all([
        supabaseAdmin.from("trips").select("*").order("trip_code"),
        supabaseAdmin.from("buses").select("*"),
        supabaseAdmin.from("routes").select("*"),
        supabaseAdmin.from("bus_reservations_full").select("*").order("created_at", { ascending: false }).limit(250),
        supabaseAdmin.from("stops").select("*"),
        supabaseAdmin.from("students_full").select("*"),
        supabaseAdmin.from("staff").select("*"),
        supabaseAdmin.from("users").select("id, full_name, email, role, phone"),
        supabaseAdmin.from("route_stops").select("*").order("stop_order", { ascending: true }),
        supabaseAdmin.from("campuses").select("*"),
        supabaseAdmin.from("v_classes_expanded").select("*"),
        supabaseAdmin.from("shifts").select("*"),
        supabaseAdmin.from("rest_zones").select("*"),
      ]);

      return {
        dbTrips,
        dbBuses,
        dbRoutes,
        dbBookings,
        dbStops,
        dbStudents,
        dbStaff,
        dbUsers,
        dbRouteStops,
        dbCampuses,
        dbClasses,
        dbShifts,
        dbRestZones,
      };
    },
  });

  const campusNameMap = new Map((dbCampuses || []).map((c: any) => [c.id, c.name]));

  const stops: Stop[] = (dbStops || []).map((s: any) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    latitude: Number(s.latitude),
    longitude: Number(s.longitude),
    landmark: s.landmark,
    geofenceRadiusMeters: Number(s.geofence_radius),
    campusId: s.campus_id,
    campus: campusNameMap.get(s.campus_id) || s.campus || "",
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
      campusId: r.campus_id,
      originCampusId: r.origin_campus_id,
      destinationCampusId: r.destination_campus_id,
      stops: routeStops,
    };
  });

  const buses: Bus[] = (dbBuses || []).map((b: any) => ({
    id: Number(b.id),
    busNumber: Number(b.bus_number),
    registrationNo: b.registration_no || String(b.bus_number),
    model: b.model || "",
    capacity: Number(b.capacity || 0),
    seatLayout: (b.seat_layout as any) || "NONE",
    status: b.status || "ACTIVE",
    gpsDeviceId: b.gps_device_id || "",
    rfidDeviceId: b.rfid_device_id || "",
    insuranceExpiry: b.insurance_expiry || "",
    maintenanceDueDate: b.maintenance_due_date || "",
    currentRouteId: b.current_route_id,
  }));

  // Deduplicate students by id
  const studentMap = new Map<string, any>();
  for (const s of dbStudents || []) {
    if (s.id && !studentMap.has(s.id)) {
      studentMap.set(s.id, s);
    }
  }

  const students: Student[] = Array.from(studentMap.values()).map((s: any) => ({
    id: s.id,
    userId: s.user_id,
    fullName: s.full_name || s.name || "",
    email: s.email || "",
    phone: s.phone,
    department: s.department || "",
    semester: s.semester ? String(s.semester) : "",
    zoneCode: s.zone_code,
    primaryStopId: s.primary_stop_id,
    primaryRouteId: s.primary_route_id,
    campusId: s.campus_id,
    campus: s.campus,
    emergencyContact: s.emergency_contact || null,
    transportAccessSuspended: Boolean(s.transport_access_suspended),
    hasActiveSubscription: Boolean(s.has_active_subscription),
    subscriptionExpiryDate: s.subscription_expiry_date,
    paymentStatus: s.payment_status,
    totalFeeDue: Number(s.total_fee_due || 0),
    totalFeePaid: Number(s.total_fee_paid || 0),
    photoUrl: s.photo_url || "",
    photoLocked: Boolean(s.photo_locked),
    classId: s.class_id,
    className: s.class_name || "",
    studentIdCode: s.student_id_code || "",
    rfidCardId: s.rfid_card_id || "",
    homeLatitude: s.home_latitude !== null && s.home_latitude !== undefined ? Number(s.home_latitude) : undefined,
    homeLongitude: s.home_longitude !== null && s.home_longitude !== undefined ? Number(s.home_longitude) : undefined,
    homeAddress: s.home_address || "",
  }));

  const shiftMap = new Map((dbShifts || []).map((s: any) => [s.id, s]));

  const shifts: Shift[] = (dbShifts || []).map((sh: any) => ({
    id: sh.id,
    name: sh.name,
    shiftType: sh.type,
    direction: (sh.direction || "HOME_TO_CAMPUS") as TripDirection,
    startTime: sh.start_time ? sh.start_time.slice(0, 5) : "",
    endTime: sh.end_time ? sh.end_time.slice(0, 5) : "",
    bookingCutoffMins: Number(sh.booking_cutoff_minutes || 0),
    isSpecial: Boolean(sh.is_special),
  }));

  const trips: Trip[] = (dbTrips || []).map((t: any) => {
    const shift = shiftMap.get(t.shift_id);
    const direction: TripDirection =
      (shift?.direction as TripDirection) ||
      (t.direction as TripDirection) ||
      (t.is_special ? "CAMPUS_TO_CAMPUS" : "HOME_TO_CAMPUS");

    const isC2C =
      direction === "CAMPUS_TO_CAMPUS" ||
      Boolean(t.is_special) ||
      Boolean(shift?.is_special) ||
      Boolean(t.trip_code && (t.trip_code.includes("C2C") || t.trip_code.includes("DDN")));

    return {
      id: t.id,
      tripCode: t.trip_code || "",
      routeId: t.route_id || "",
      busId: Number(t.bus_id || 0),
      shiftId: t.shift_id || "",
      driverId: t.driver_id || "",
      conductorId: t.conductor_id || "",
      tripDate: t.trip_date || (t.created_at ? t.created_at.split("T")[0] : ""),
      status: t.status,
      startedAt: t.started_at,
      completedAt: t.completed_at,
      delayMinutes: Number(t.delay_minutes || 0),
      manifestLocked: Boolean(t.manifest_locked),
      manifestLockedAt: t.manifest_locked_at,
      currentStopIndex: Number(t.current_stop_index || 0),
      direction,
      scheduleType: t.schedule_type || "EVERY_DAY",
      customDays: t.custom_days,
      departureTime: shift?.start_time ? shift.start_time.slice(0, 5) : (t.departure_time ? t.departure_time.slice(0, 5) : ""),
      arrivalTime: shift?.end_time ? shift.end_time.slice(0, 5) : (t.arrival_time ? t.arrival_time.slice(0, 5) : ""),
      isSpecial: isC2C,
      facilityType: t.facility_type || (isC2C ? "PLACEMENT_DRIVE" : "REGULAR"),
    };
  });

  const bookings: Booking[] = (dbBookings || []).map((b: any) => ({
    id: b.id,
    bookingCode: b.booking_code || b.booking_ref || "",
    bookingRef: b.booking_ref || "",
    studentId: b.student_id,
    tripId: b.trip_id,
    busId: b.bus_id ? Number(b.bus_id) : undefined,
    seatNumber: b.seat_number || "",
    bookingDate: b.booking_date || (b.created_at ? b.created_at.split("T")[0] : ""),
    boardingStopId: b.boarding_stop_id,
    boardingStopName: b.boarding_stop_name || "",
    scheduledBoardingTime: b.scheduled_boarding_time || "",
    actualBoardingTime: b.actual_boarding_time,
    status: b.status,
    fareCharged: Number(b.fare_charged || 0),
    paidWithPass: Boolean(b.paid_with_pass),
    qrToken: b.qr_token || "",
    verifiedByConductor: Boolean(b.verified_by_conductor),
    verifiedAt: b.verified_at,
    isSpecialShift: Boolean(b.is_special_shift),
    createdAt: b.created_at || new Date().toISOString(),
  }));

  const staff: Staff[] = (dbStaff || []).map((st: any) => ({
    id: st.id,
    userId: st.user_id,
    employeeCode: st.employee_code || st.employee_id || "",
    fullName: st.full_name || st.name || "",
    email: st.email || "",
    phone: st.phone || null,
    category: st.category as any,
    rank: st.rank as any,
    role: st.role as any,
    permissions: st.permissions || [],
    licenseNo: st.license_no || st.license_number,
    isActive: Boolean(st.is_active ?? true),
  }));

  const users: UserAccount[] = (dbUsers || []).map((u: any) => ({
    id: u.id,
    fullName: u.full_name || "",
    email: u.email || "",
    role: (u.role || "student") as any,
    phone: u.phone,
    provider: "email",
    createdAt: u.created_at || new Date().toISOString(),
  }));

  const campuses: Campus[] = (dbCampuses || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    address: c.address,
    city: c.city,
    latitude: Number(c.latitude),
    longitude: Number(c.longitude),
    geofenceRadiusMeters: Number(c.geofence_radius || 0),
    isPrimary: Boolean(c.is_primary),
  }));

  const restZones: RestZone[] = (dbRestZones || []).map((rz: any) => ({
    id: rz.id,
    name: rz.name,
    code: rz.code,
    latitude: Number(rz.latitude),
    longitude: Number(rz.longitude),
    landmark: rz.landmark || "",
    fleetCapacity: Number(rz.fleet_capacity ?? 25),
    operatingHours: rz.operating_hours || "24/7 Fleet Staging",
    campusId: rz.campus_id || "",
    isActive: Boolean(rz.is_active ?? true),
    createdAt: rz.created_at,
    updatedAt: rz.updated_at,
  }));

  const classes: ClassItem[] = (dbClasses || []).map((cl: any) => ({
    id: cl.id,
    name: cl.name,
    course: cl.course || cl.name || "",
    department: cl.department,
    semester: cl.semester,
    year: cl.year || "",
    section: cl.section || "",
    isActive: cl.is_active ?? true,
    studentCount: 0,
    createdAt: cl.created_at,
  }));

  return {
    session,
    stops,
    routes,
    buses,
    students,
    trips,
    bookings,
    staff,
    users,
    campuses,
    restZones,
    classes,
    shifts,
  };
}

/**
 * Ultra-fast server data loader specifically for Hardware Management desks:
 * /transport-admin/rfid and /transport-admin/esp32.
 * Queries only the 4 required tables (buses, routes, stops, students) in parallel,
 * bypassing heavyweight bookings, full trips, and users tables for instant navigation.
 */
export async function getHardwareDeskServerData(redirectPath: string = "/transport-admin/rfid") {
  const session = await getSession();

  if (!session) {
    redirect(`/login?redirect=${encodeURIComponent(redirectPath)}`);
  }

  if (session.role !== "transport_admin" && session.role !== "admin" && session.role !== "transport_manager") {
    redirect(session.role === "driver" ? "/driver" : session.role === "conductor" ? "/conductor" : "/portal");
  }

  const deskData = await getOrFetchWithCache({
    key: "telematics:hardware_desk_server_data",
    ttl: 30, // 30s cache with jitter for instant page switching
    allowEmpty: true,
    fetchFn: async () => {
      const [
        { data: dbBuses },
        { data: dbRoutes },
        { data: dbStops },
        { data: dbStudents },
      ] = await Promise.all([
        supabaseAdmin
          .from("buses")
          .select("id, bus_number, registration_no, model, capacity, seat_layout, status, gps_device_id, rfid_device_id, insurance_expiry, maintenance_due_date, current_route_id")
          .order("bus_number", { ascending: true }),
        supabaseAdmin
          .from("routes")
          .select("id, code, name, description, direction, color, total_distance_km, estimated_duration_mins, is_active"),
        supabaseAdmin
          .from("stops")
          .select("id, name, code, latitude, longitude, landmark, geofence_radius, campus_id, zone_code"),
        supabaseAdmin
          .from("students_full")
          .select("id, user_id, full_name, email, phone, department, semester, zone_code, primary_stop_id, primary_route_id, rfid_card_id, student_id_code, photo_url, photo_locked, class_name, has_active_subscription")
          .order("full_name", { ascending: true }),
      ]);

      const buses: Bus[] = (dbBuses || []).map((b: any) => ({
        id: Number(b.id),
        busNumber: Number(b.bus_number),
        registrationNo: b.registration_no || String(b.bus_number),
        model: b.model || "",
        capacity: Number(b.capacity || 0),
        seatLayout: (b.seat_layout as any) || "NONE",
        status: b.status || "ACTIVE",
        gpsDeviceId: b.gps_device_id || "",
        rfidDeviceId: b.rfid_device_id || "",
        insuranceExpiry: b.insurance_expiry || "",
        maintenanceDueDate: b.maintenance_due_date || "",
        currentRouteId: b.current_route_id,
      }));

      const routes: Route[] = (dbRoutes || []).map((r: any) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        direction: r.direction,
        color: r.color,
        totalDistanceKm: Number(r.total_distance_km || 0),
        estimatedDurationMins: Number(r.estimated_duration_mins || 0),
        isActive: Boolean(r.is_active),
        stops: [],
      }));

      const stops: Stop[] = (dbStops || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        latitude: Number(s.latitude),
        longitude: Number(s.longitude),
        landmark: s.landmark,
        geofenceRadiusMeters: Number(s.geofence_radius || 0),
        campusId: s.campus_id,
        zoneCode: s.zone_code,
      }));

      const students: Student[] = (dbStudents || []).map((s: any) => ({
        id: s.id,
        userId: s.user_id,
        fullName: s.full_name || "",
        email: s.email || "",
        phone: s.phone,
        department: s.department || "",
        semester: s.semester ? String(s.semester) : "",
        zoneCode: s.zone_code,
        primaryStopId: s.primary_stop_id,
        primaryRouteId: s.primary_route_id,
        hasActiveSubscription: Boolean(s.has_active_subscription),
        emergencyContact: null,
        transportAccessSuspended: false,
        rfidCardId: s.rfid_card_id || undefined,
        studentIdCode: s.student_id_code,
        photoUrl: s.photo_url,
        photoLocked: Boolean(s.photo_locked),
        className: s.class_name,
      }));

      return { buses, routes, stops, students };
    },
  });

  return { session, ...deskData };
}
