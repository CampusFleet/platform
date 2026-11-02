import { getSession } from "@/lib/jwt";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getOrFetchWithCache } from "@/lib/redis";
import ConductorLayoutClient from "@/components/conductor/ConductorLayoutClient";
import { ConductorProvider } from "@/components/conductor/ConductorContext";
import type { Trip, Bus, Route, Booking, Stop, Shift, Student, AttendanceRecord } from "@/lib/types";
import { mapBusReservationToBooking } from "@/lib/trip-resolver";

export const dynamic = "force-dynamic";

/**
 * Server Component: Conductor Cockpit Gateway
 * - Performs server-side cryptographic JWT authentication & authorization
 * - Fetches initial trip manifest, routes, and passenger rosters directly from PostgreSQL
 * - Delivers pre-rendered HTML with 0ms client-side wait time
 */
export default async function ConductorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. Authenticate server-side via HttpOnly JWT cookie
  const session = await getSession();

  if (!session) {
    redirect("/login?redirect=/conductor");
  }

  // 2. Strict Role Authorization (Conductor, Driver, Staff, Admin allowed per qualification matrix)
  if (session.role !== "conductor" && session.role !== "driver" && session.role !== "admin" && session.role !== "transport_admin" && session.role !== "transport_manager") {
    redirect("/portal");
  }

  // 3. Parallel fetch: cached shared fleet data, bookings, students roster, and attendance logs
  const [sharedData, bookingsData, studentsData, attendanceData] = await Promise.all([
    // Shared fleet data — identical for all conductors, cached 20s with jitter
    getOrFetchWithCache({
      key: "conductor:shared_fleet_data",
      ttl: 20,
      allowEmpty: true,
      fetchFn: async () => {
        const [
          { data: dbTrips },
          { data: dbBuses },
          { data: dbRoutes },
          { data: dbStops },
          { data: dbShifts },
        ] = await Promise.all([
          supabaseAdmin.from("trips").select("*").order("trip_date", { ascending: false }).order("created_at", { ascending: false }).limit(300),
          supabaseAdmin.from("buses").select("*"),
          supabaseAdmin.from("routes").select("*"),
          supabaseAdmin.from("stops").select("*"),
          supabaseAdmin.from("shifts").select("*"),
        ]);
        return { dbTrips, dbBuses, dbRoutes, dbStops, dbShifts };
      },
    }),
    // Auto-reservations passenger manifest — 10s cache
    getOrFetchWithCache({
      key: "conductor:reservations_manifest_v3",
      ttl: 10,
      allowEmpty: true,
      fetchFn: async () => {
        const { data } = await supabaseAdmin
          .from("bus_reservations_full")
          .select("*")
          .neq("status", "CANCELLED")
          .order("created_at", { ascending: false })
          .limit(500);
        return data || [];
      },
    }),
    // Authoritative Student Directory (photos, college student IDs, route assignments)
    getOrFetchWithCache({
      key: "conductor:students_full",
      ttl: 20,
      allowEmpty: true,
      fetchFn: async () => {
        const { data } = await supabaseAdmin.from("students_full").select("*");
        return data || [];
      },
    }),
    // Active Attendance records (live check-ins, scans, RFID taps)
    getOrFetchWithCache({
      key: "conductor:attendance_records",
      ttl: 10,
      allowEmpty: true,
      fetchFn: async () => {
        const { data } = await supabaseAdmin.from("attendance_records").select("*").order("timestamp", { ascending: false }).limit(300);
        return data || [];
      },
    }),
  ]);

  const { dbTrips, dbBuses, dbRoutes, dbStops, dbShifts } = sharedData;
  const rawReservations = Array.isArray(bookingsData) ? bookingsData : [];
  const dbStudents = studentsData;
  const dbAttendance = attendanceData;

  // 4. Transform PostgreSQL rows to strongly typed domain models
  const trips: Trip[] = (dbTrips || []).map((t: any) => ({
    id: t.id,
    tripCode: t.trip_code,
    routeId: t.route_id,
    busId: t.bus_id,
    shiftId: t.shift_id,
    driverId: t.driver_id || "",
    conductorId: t.conductor_id || "",
    tripDate: t.trip_date,
    status: t.status || "SCHEDULED",
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

  const routes: Route[] = (dbRoutes || []).map((r: any) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description || "",
    direction: r.direction,
    color: r.color || "#2563EB",
    totalDistanceKm: Number(r.total_distance_km || 0),
    estimatedDurationMins: Number(r.estimated_duration_mins || 0),
    isActive: Boolean(r.is_active),
    stops: [],
  }));

  const bookings: Booking[] = (rawReservations || []).map((r: any) =>
    mapBusReservationToBooking(r)
  );

  const stops: Stop[] = (dbStops || []).map((s: any) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    latitude: Number(s.latitude),
    longitude: Number(s.longitude),
    landmark: s.landmark,
    geofenceRadiusMeters: Number(s.geofence_radius || 0),
    campusId: s.campus_id || s.campus,
    campus: s.campus,
    isBusMergeStop: Boolean(s.is_bus_merge_stop),
    zoneCode: s.zone_code,
  }));

  const shifts: Shift[] = (dbShifts || []).map((sh: any) => ({
    id: sh.id,
    name: sh.name,
    shiftType: sh.type,
    direction: sh.direction,
    startTime: sh.start_time ? sh.start_time.substring(0, 5) : "",
    endTime: sh.end_time ? sh.end_time.substring(0, 5) : "",
    bookingCutoffMins: Number(sh.booking_cutoff_minutes || 0),
    isSpecial: Boolean(sh.is_special),
  }));

  // Deduplicate and transform live students roster
  const studentMap = new Map<string, any>();
  for (const s of dbStudents || []) {
    if (s.id && !studentMap.has(s.id)) {
      studentMap.set(s.id, s);
    }
  }

  const students: Student[] = Array.from(studentMap.values()).map((s: any) => ({
    id: s.id,
    userId: s.user_id || s.id,
    fullName: s.full_name || s.name || "Student Commuter",
    email: s.email || "",
    phone: s.phone || null,
    department: s.department || "Engineering",
    semester: s.semester ? String(s.semester) : "5th",
    primaryStopId: s.primary_stop_id || "",
    primaryRouteId: s.primary_route_id || "",
    campusId: s.campus_id || s.campus || "",
    campus: s.campus || "",
    emergencyContact: s.emergency_contact || {
      name: s.emergency_contact_name || null,
      relationship: s.emergency_contact_relation || null,
      phone: s.emergency_contact_phone || null,
    },
    transportAccessSuspended: Boolean(s.transport_access_suspended),
    hasActiveSubscription: Boolean(s.has_active_subscription),
    subscriptionExpiryDate: s.subscription_expiry_date,
    classId: s.class_id,
    className: s.class_name,
    zoneCode: s.zone_code || "ZONE_B",
    paymentStatus: s.payment_status || (s.has_active_subscription ? "APPROVED" : "UNPAID"),
    totalFeeDue: Number(s.total_fee_due || 0),
    totalFeePaid: Number(s.total_fee_paid || 0),
    photoUrl: s.photo_url || "",
    photoLocked: Boolean(s.photo_locked),
    homeLatitude: s.home_latitude ?? undefined,
    homeLongitude: s.home_longitude ?? undefined,
    studentIdCode: s.student_id_code || "",
    rfidCardId: s.rfid_card_id || "",
  }));

  const attendanceRecords: AttendanceRecord[] = (dbAttendance || []).map((a: any) => ({
    id: a.id,
    studentId: a.student_id,
    userId: a.user_id,
    userRole: a.user_role,
    userName: a.user_name,
    tripId: a.trip_id,
    busId: a.bus_id,
    bookingId: a.booking_id,
    method: a.method || "QR_SCAN",
    verifiedBy: a.verified_by || "Conductor",
    signatureToken: a.signature_token,
    deviceId: a.device_id,
    status: a.status || "BOARDED",
    notes: a.notes,
    timestamp: a.timestamp || new Date().toISOString(),
    lockStatus: a.lock_status,
    unlockedBy: a.unlocked_by,
    distanceMeters: a.distance_meters,
    rfidCardId: a.rfid_card_id,
    unlockTimestamp: a.unlock_timestamp,
  }));

  const userRole = (session.role as string) || "";
  const isStaffOrAdmin = userRole === "admin" || userRole === "transport_admin" || userRole === "transport_manager";
  const visibleTrips = trips.filter(t => {
    const isSpecialTrip = t.isSpecial || t.facilityType === "PLACEMENT_DRIVE" || t.facilityType === "EVENT";
    const shift = shifts.find(s => s.id === t.shiftId);
    const isSpecialShift = shift && (shift.isSpecial || shift.name?.toLowerCase().includes("special"));
    if (isSpecialTrip || isSpecialShift) {
      if (isStaffOrAdmin) return true;
      return Boolean(
        session.userId &&
        (t.conductorId === session.userId ||
         t.conductorId === (session as any).id ||
         t.conductorId === (session as any).employeeId ||
         t.conductorId === (session as any).name ||
         t.conductorId === (session as any).fullName)
      );
    }
    return true;
  });

  // 5. Render the interactive client cockpit island with pre-baked server data
  return (
    <ConductorProvider
      initialUser={session}
      initialTrips={visibleTrips}
      initialBuses={buses}
      initialRoutes={routes}
      initialBookings={bookings}
      initialStops={stops}
      initialShifts={shifts}
      initialStudents={students}
      initialAttendanceRecords={attendanceRecords}
    >
      <ConductorLayoutClient>
        {children}
      </ConductorLayoutClient>
    </ConductorProvider>
  );
}
