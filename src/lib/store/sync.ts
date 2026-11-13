import { CampusFleetStore } from "./_base";
import { supabase } from "../supabaseClient";
import { telematicsService } from "../telematicsService";
import type { Student } from "../types";

// ── Simple Debounce Utility ──────────────────────────────────────────────────
function debounce<T extends (...args: any[]) => void>(func: T, wait: number): T {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return function (this: any, ...args: Parameters<T>) {
    const context = this;
    if (timeout !== null) clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  } as T;
}

// ── Module Augmentation ─────────────────────────────────────────────────────
declare module "./_base" {
  interface CampusFleetStore {
    syncFromSupabase(): Promise<void>;
    syncMasterData(): Promise<void>;
    syncLiveTransit(): Promise<void>;
    syncUserData(): Promise<void>;
    
    initCrossTabSync(): void;
    initSupabaseRealtime(): void;
    initStudentPaymentSync(): void;
    initTelematicsSync(): void;

    // Debounced versions for real-time listeners
    debouncedSyncMasterData: () => void;
    debouncedSyncLiveTransit: () => void;
    debouncedSyncUserData: () => void;
  }
}

// Attach debounced functions to the prototype
CampusFleetStore.prototype.debouncedSyncMasterData = debounce(function(this: CampusFleetStore) {
  this.syncMasterData();
}, 1000);

CampusFleetStore.prototype.debouncedSyncLiveTransit = debounce(function(this: CampusFleetStore) {
  this.syncLiveTransit();
}, 1000);

CampusFleetStore.prototype.debouncedSyncUserData = debounce(function(this: CampusFleetStore) {
  this.syncUserData();
}, 1000);

// ── Real-time cross-tab synchronization via BroadcastChannel & Storage Event ──

CampusFleetStore.prototype.initCrossTabSync = function (this: CampusFleetStore) {
  if (typeof window === "undefined") return;

  if (typeof BroadcastChannel !== "undefined") {
    try {
      this.syncChannel = new BroadcastChannel("campusfleet_cross_sync");
      this.syncChannel.onmessage = async (event) => {
        if (event.data?.type === "DATA_CHANGED") {
          try {
            this.isSyncingFromRemote = true;
            await this.syncFromSupabase();
          } finally {
            this.isSyncingFromRemote = false;
          }
        }
      };
    } catch (err) {
      console.warn("BroadcastChannel initialization warning:", err);
    }
  }

  window.addEventListener("storage", async (e) => {
    if (e.key === "campusfleet_sync_trigger") {
      try {
        this.isSyncingFromRemote = true;
        await this.syncFromSupabase();
      } finally {
        this.isSyncingFromRemote = false;
      }
    }
  });
};

// ── Real-time Supabase postgres_changes synchronization ──

CampusFleetStore.prototype.initSupabaseRealtime = function (this: CampusFleetStore) {
  // KILLED POSTGRES POLLING: 
  // We no longer subscribe to postgres_changes because it triggers full-table fetches
  // on every single db update, causing gigabytes of egress.
  // Data is now fetched once upon initialization.
  console.log("[Sync] Supabase Realtime polling disabled to prevent egress spikes.");
};

// ── Student payment/subscription polling ──

CampusFleetStore.prototype.initStudentPaymentSync = function (this: CampusFleetStore) {
  if (typeof window === "undefined") return;

  const syncStudentStatus = async () => {
    const user = this.currentUser;
    if (!user || user.role !== "student") return;

    try {
      const res = await fetch(`/api/students/me?_t=${Date.now()}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const { student } = await res.json();
      if (!student) return;

      const serverStudent: Student = {
        id: student.id,
        userId: student.userId || user.id,
        fullName: student.fullName || user.fullName,
        email: student.email || user.email,
        phone: student.phone || null,
        department: student.department || "",
        semester: student.semester || "",
        campusId: student.campusId || user.campusId || "",
        campus: student.campus || (user as any).campus || "",
        primaryStopId: student.primaryStopId || "",
        primaryRouteId: student.primaryRouteId || "",
        emergencyContact: student.emergencyContact || { name: null, relationship: null, phone: null },
        transportAccessSuspended: Boolean(student.transportAccessSuspended),
        hasActiveSubscription: Boolean(student.hasActiveSubscription),
        subscriptionExpiryDate: student.subscriptionExpiryDate,
        classId: student.classId,
        className: student.className,
        zoneCode: student.zoneCode || undefined,
        paymentStatus: student.paymentStatus || "UNPAID",
        totalFeeDue: Number(student.totalFeeDue) || 0,
        totalFeePaid: Number(student.totalFeePaid) || 0,
        photoUrl: student.photoUrl || "",
        photoLocked: Boolean(student.photoLocked),
      };

      const existingIdx = this.students.findIndex(
        s => s.id === serverStudent.id ||
          (s.email && s.email.toLowerCase() === user.email?.toLowerCase()) ||
          (s.userId && s.userId === user.id)
      );

      if (existingIdx >= 0) {
        this.students[existingIdx] = { ...this.students[existingIdx], ...serverStudent };
      } else {
        this.students.push(serverStudent);
      }

      this.saveToLocalStorage();
      this.notify();
    } catch {
      // Silent fail
    }
  };

  syncStudentStatus();
  // KILLED: setInterval(syncStudentStatus, 30_000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      syncStudentStatus();
    }
  });
  window.addEventListener("focus", syncStudentStatus);
};

// ── Telematics synchronization ──

CampusFleetStore.prototype.initTelematicsSync = function (this: CampusFleetStore) {
  telematicsService.subscribe((incomingLocation) => {
    this.liveLocation = {
      ...this.liveLocation,
      ...incomingLocation,
    };
    this.listeners.forEach((cb) => cb());
  });
};

// ── Cache Fetching Utility ──

let lastCachedState: any = null;
let lastCacheTime = 0;
let ongoingFetchPromise: Promise<any> | null = null;
const CACHE_TTL_MS = 60000; // 60 seconds

// True when /api/sync/state said there is no session: skip all other DB reads.
let isSignedOut = false;

async function getCachedState() {
  if (typeof window === "undefined") return null;
  
  const now = Date.now();
  if (lastCachedState && (now - lastCacheTime < CACHE_TTL_MS)) {
    return lastCachedState;
  }
  
  if (ongoingFetchPromise) {
    return ongoingFetchPromise;
  }

  ongoingFetchPromise = (async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const res = await fetch("/api/sync/state", { signal: controller.signal });
      clearTimeout(timeoutId);
      
      isSignedOut = res.status === 401;
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          lastCachedState = json.data;
          lastCacheTime = Date.now();
          return json.data;
        }
      }
    } catch (e) {
      console.warn("Cache fetch failed or timed out:", e);
    } finally {
      ongoingFetchPromise = null;
    }
    return null;
  })();

  return ongoingFetchPromise;
}

// ── Modular Sync Functions ──

CampusFleetStore.prototype.syncMasterData = async function(this: CampusFleetStore) {
  try {
    const cachedState = await getCachedState();

    // 0. Fetch Transit Zones
    const dbZones: any[] = cachedState?.transitZones || (await supabase.from("transit_zones").select("*").order("created_at", { ascending: true })).data || [];
    if (dbZones && dbZones.length > 0) {
      this.transitZones = dbZones.map(z => ({
        id: z.id || `zone-${z.code}`,
        code: z.code,
        name: z.name,
        corridorDescription: z.corridor_description || "",
        semesterFee: Number(z.semester_fee) || 0,
        installmentsAllowed: Number(z.installments_allowed) || 3,
        campusId: z.campus_id || "",
        isActive: z.is_active ?? true,
        createdAt: z.created_at,
        updatedAt: z.updated_at,
      }));
    }

    // 0.1 Fetch Campus Locations
    const dbCampuses: any[] = cachedState?.campuses || (await supabase
      .from("campuses")
      .select("*")
      .order("is_primary", { ascending: false })
      .order("name", { ascending: true })).data || [];
    if (dbCampuses && dbCampuses.length > 0) {
      this.campuses = dbCampuses.map(c => ({
        id: c.id,
        name: c.name,
        code: c.code,
        address: c.address || "",
        landmark: c.landmark || "",
        latitude: Number(c.latitude),
        longitude: Number(c.longitude),
        geofenceRadiusMeters: Number(c.geofence_radius ?? 100),
        fleetCapacity: Number(c.fleet_capacity ?? 50),
        parkingBays: Number(c.parking_bays ?? 20),
        contactPhone: c.contact_phone || "",
        contactEmail: c.contact_email || "",
        isPrimary: Boolean(c.is_primary),
        isActive: Boolean(c.is_active ?? true),
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      }));
    }

    // 1. Fetch Stops
    const dbStops: any[] = cachedState?.stops || (await supabase.from("stops").select("*")).data || [];
    if (dbStops && dbStops.length > 0) {
      this.stops = dbStops.map((s: any) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        latitude: s.latitude,
        longitude: s.longitude,
        landmark: s.landmark,
        geofenceRadiusMeters: s.geofence_radius || 80,
        campusId: s.campus_id || s.campus || "",
        isBusMergeStop: Boolean(s.is_bus_merge_stop),
        zoneCode: s.zone_code || "ZONE_B",
      }));

    }

    // 10. Fetch Subscription Plans
    const dbPlans: any[] = cachedState?.plans || (await supabase.from("subscription_plans").select("*")).data || [];
    if (dbPlans && dbPlans.length > 0) {
      this.plans = dbPlans.map(p => ({
        id: p.id,
        name: p.name,
        durationMonths: p.duration_months || 6,
        price: p.price,
        description: p.description || "Official Semester Bus Pass (6 Months)",
        corridorTier: p.corridor_tier,
        stoppages: p.stoppages || [],
        features: [
          "Unlimited Morning & Evening Shifts",
          "Reserved Bus Seat Allocation",
          "Digital Dynamic QR Pass",
          "Real-Time GPS Telematics & Delay Alerts",
        ],
      }));
    }

    // 11. Fetch Stop-Route mappings
    const dbStopRoutes: any[] = cachedState?.stopRoutes || (await supabase.from("route_stops").select("*")).data || [];
    if (dbStopRoutes && dbStopRoutes.length > 0) {
      this.stopRoutes = dbStopRoutes.map((sr: any) => ({
        stopId: sr.stop_id,
        routeId: sr.route_id,
        busId: sr.bus_id || "",
        stopOrder: sr.stop_order || 0,
      }));
    }

    // 3. Fetch Routes
    const dbRoutes: any[] = cachedState?.routes || (await supabase.from("routes").select("*")).data || [];
    if (dbRoutes && dbRoutes.length > 0) {
      this.routes = dbRoutes.map((r: any) => {
        let stopsList = [];
        if (r.stops_data && Array.isArray(r.stops_data) && r.stops_data.length > 0) {
          stopsList = r.stops_data
            .map((rs: any, idx: number) => {
              const stopObj = this.stops.find(s => s.id === rs.stopId || s.id === rs.stop?.id) || rs.stop;
              return {
                stopId: rs.stopId || rs.stop?.id || "",
                stopOrder: rs.stopOrder || idx + 1,
                arrivalOffsetMinutes: rs.arrivalOffsetMinutes ?? idx * 8,
                bufferTimeMinutes: rs.bufferTimeMinutes ?? 2,
                stop: stopObj,
              };
            })
            .filter((rs: any) => rs.stop);
        }
        if (stopsList.length === 0) {
          const relational = this.stopRoutes
            .filter(sr => sr.routeId === r.id)
            .sort((a, b) => a.stopOrder - b.stopOrder)
            .map(sr => {
              const st = this.stops.find(s => s.id === sr.stopId);
              return st ? {
                stopId: st.id,
                stopOrder: sr.stopOrder,
                arrivalOffsetMinutes: (sr.stopOrder - 1) * 8,
                bufferTimeMinutes: 2,
                stop: st,
              } : null;
            })
            .filter(Boolean);
          stopsList = (relational.length > 0 ? relational : []) as any[];
        }
        return {
          id: r.id,
          code: r.code,
          name: r.name,
          description: r.description,
          direction: r.direction || "HOME_TO_CAMPUS",
          color: r.color || "#2563EB",
          totalDistanceKm: r.total_distance_km || 28.0,
          estimatedDurationMins: r.estimated_duration_mins || 55,
          isActive: r.is_active ?? true,
          stops: stopsList,
        };
      });
    }

    // 4. Fetch Shifts
    const dbShifts: any[] = cachedState?.shifts || (await supabase.from("shifts").select("*")).data || [];
    if (dbShifts && dbShifts.length > 0) {
      this.shifts = dbShifts.map((sh: any) => ({
        id: sh.id,
        name: sh.name,
        shiftType: sh.type,
        direction: sh.direction,
        startTime: sh.start_time ? sh.start_time.substring(0, 5) : "",
        endTime: sh.end_time ? sh.end_time.substring(0, 5) : "",
        bookingCutoffMins: Number(sh.booking_cutoff_minutes || 0),
        isSpecial: Boolean(
          sh.is_special ||
          sh.type === "CUSTOM" ||
          sh.name?.toLowerCase().includes("placement") ||
          sh.name?.toLowerCase().includes("conclave") ||
          sh.name?.toLowerCase().includes("special")
        ),
        isPlacement: Boolean(sh.name?.toLowerCase().includes("placement")),
      }));
    }

    this.notify();
  } catch (e) {
    console.warn("syncMasterData failed:", e);
  }
};

CampusFleetStore.prototype.syncLiveTransit = async function(this: CampusFleetStore) {
  try {
    const cachedState = await getCachedState();

    // 2. Fetch Buses
    const dbBuses: any[] = cachedState?.buses || (await supabase.from("buses").select("*")).data || [];
    if (dbBuses && dbBuses.length > 0) {
      this.buses = dbBuses.map((b: any) => ({
        id: Number(b.id),
        busNumber: Number(b.bus_number),
        registrationNo: b.registration_no,
        model: b.model,
        capacity: Number(b.capacity),
        seatLayout: b.seat_layout || "NONE",
        totalRows: b.total_rows ? Number(b.total_rows) : undefined,
        status: b.status || "ACTIVE",
        gpsDeviceId: b.gps_device_id,
        insuranceExpiry: b.insurance_expiry,
        maintenanceDueDate: b.maintenance_due_date,
        currentRouteId: b.current_route_id,
      }));
    }

    // 6. Fetch Trips
    const dbTrips: any[] = cachedState?.trips || (await supabase.from("trips").select("*")).data || [];
    if (dbTrips && dbTrips.length > 0) {
      this.trips = dbTrips.map((t: any) => ({
        id: t.id,
        tripCode: t.trip_code,
        routeId: t.route_id,
        busId: Number(t.bus_id),
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
        direction: t.direction || undefined,
        scheduleType: t.schedule_type || undefined,
        customDays: t.custom_days || undefined,
        departureTime: t.departure_time || undefined,
        arrivalTime: t.arrival_time || undefined,
        isSpecial: Boolean(t.is_special),
        facilityType: t.facility_type || (Boolean(t.is_special) ? "PLACEMENT_DRIVE" : "REGULAR"),
      }));
    }

    // 12. Fetch Attendance Records
    const { data: dbAttendance } = await supabase
      .from("attendance_records")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(100);
    if (dbAttendance && dbAttendance.length > 0) {
      this.attendanceRecords = dbAttendance.map(a => ({
        id: a.id,
        studentId: a.student_id,
        bookingId: a.booking_id || "",
        tripId: a.trip_id,
        method: a.method || "QR_SCAN",
        status: a.status || "BOARDED",
        verifiedBy: a.verified_by || a.conductor_id || "Conductor Terminal",
        signatureToken: a.signature_token || "",
        notes: a.notes,
        timestamp: a.timestamp || new Date().toISOString(),
      }));
    }

    // 13. Fetch Vehicle Issues
    const { data: dbIssues } = await supabase
      .from("vehicle_issues_full")
      .select("*")
      .order("reported_at", { ascending: false })
      .limit(50);
    if (dbIssues && dbIssues.length > 0) {
      this.issues = dbIssues.map(i => ({
        id: i.id,
        busId: Number(i.bus_id),
        busNumber: Number(i.bus_number),
        reportedBy: i.reported_by,
        issueType: i.issue_type,
        severity: i.severity,
        description: i.description,
        status: i.status || "OPEN",
        location: (i.latitude && i.longitude) ? { latitude: i.latitude, longitude: i.longitude } : undefined,
        reportedAt: i.reported_at,
        resolvedAt: i.resolved_at,
      }));
    }

    this.notify();
  } catch (e) {
    console.warn("syncLiveTransit failed:", e);
  }
};

CampusFleetStore.prototype.syncUserData = async function(this: CampusFleetStore) {
  try {
    const isBasicUser =
      this.currentUser?.role === "student" ||
      this.currentUser?.role === "driver" ||
      this.currentUser?.role === "conductor";

    // 4.1 Fetch Special Shift Allocations
    const { data: dbAllocations } = await supabase.from("special_shift_allocations").select("*");
    if (dbAllocations) {
      this.specialShiftAllocations = dbAllocations.map(a => ({
        id: a.id,
        shiftId: a.shift_id,
        studentId: a.student_id,
        tripId: a.trip_id || undefined,
        notes: a.notes || undefined,
        allocatedBy: a.allocated_by || undefined,
        createdAt: a.created_at || undefined,
      }));
    }

    if (isBasicUser) {
      // Ensure we load the single active student profile to prevent layout redirects
      const activeStudentUser = this.currentUser;
      if (activeStudentUser && activeStudentUser.role === "student") {
        let profile = this.students.find(
          s => s.userId === activeStudentUser.id || s.email?.toLowerCase() === activeStudentUser.email?.toLowerCase()
        );
        
        if (!profile) {
          // Fetch just this student
          const { data: s } = await supabase
            .from("students_full")
            .select("*")
            .or(`user_id.eq.${activeStudentUser.id},email.ilike.${activeStudentUser.email}`)
            .single();
            
          if (s) {
            profile = {
              id: s.id,
              userId: s.user_id,
              fullName: s.full_name,
              email: s.email,
              phone: s.phone || null,
              department: s.department || "",
              semester: s.semester || "",
              campusId: s.campus_id || s.campus || "",
              campus: s.campus || "",
              primaryStopId: s.primary_stop_id || "",
              primaryRouteId: s.primary_route_id || "",
              emergencyContact: s.emergency_contact || {
                name: s.emergency_contact_name || null,
                relationship: s.emergency_contact_relation || null,
                phone: s.emergency_contact_phone || null,
              },
              transportAccessSuspended: s.transport_access_suspended || false,
              hasActiveSubscription: s.has_active_subscription || false,
              subscriptionExpiryDate: s.subscription_expiry_date,
              classId: s.class_id,
              className: s.class_name,
              zoneCode: s.zone_code || "ZONE_B",
              paymentStatus: s.payment_status || (s.has_active_subscription ? "APPROVED" : "UNPAID"),
              totalFeeDue: s.total_fee_due || (s.zone_semester_fee ? Number(s.zone_semester_fee) : 12000),
              totalFeePaid: s.total_fee_paid || 0,
              photoUrl: s.photo_url || "",
              photoLocked: Boolean(s.photo_url && s.photo_url.trim() !== "") || Boolean(s.photo_locked),
              homeLatitude: s.home_latitude ?? undefined,
              homeLongitude: s.home_longitude ?? undefined,
              homeAddress: s.home_address ?? undefined,
              autoAssignedStopId: s.auto_assigned_stop_id ?? undefined,
            };
          }
        }
        
        if (profile) {
          this.students = [profile];
        }
      }
      this.notify();
      return;
    }

    // 5. Fetch Users
    const { data: dbUsers } = await supabase.from("users").select("*");
    if (dbUsers && dbUsers.length > 0) {
      this.users = dbUsers.map(u => ({
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        role: u.role || "student",
        provider: u.provider || "Google",
        phone: u.phone,
        campusId: u.campus_id || u.campus || "",
        photoUrl: u.photo_url || "",
        avatarUrl: u.photo_url || "",
        createdAt: u.created_at || new Date().toISOString(),
      }));
    }

    // 7. Fetch Students
    const { data: dbStudents } = await supabase.from("students_full").select("*");
    let mappedStudents: Student[] = [];
    if (dbStudents && dbStudents.length > 0) {
      mappedStudents = dbStudents.map(s => ({
        id: s.id,
        userId: s.user_id,
        fullName: s.full_name,
        email: s.email,
        phone: s.phone || null,
        department: s.department || "",
        semester: s.semester || "",
        campusId: s.campus_id || s.campus || "",
        campus: s.campus || "",
        primaryStopId: s.primary_stop_id || "",
        primaryRouteId: s.primary_route_id || "",
        emergencyContact: s.emergency_contact || {
          name: s.emergency_contact_name || null,
          relationship: s.emergency_contact_relation || null,
          phone: s.emergency_contact_phone || null,
        },
        transportAccessSuspended: s.transport_access_suspended || false,
        hasActiveSubscription: s.has_active_subscription || false,
        subscriptionExpiryDate: s.subscription_expiry_date,
        classId: s.class_id,
        className: s.class_name,
        zoneCode: s.zone_code || "ZONE_B",
        paymentStatus: s.payment_status || (s.has_active_subscription ? "APPROVED" : "UNPAID"),
        totalFeeDue: s.total_fee_due || (s.zone_semester_fee ? Number(s.zone_semester_fee) : 12000),
        totalFeePaid: s.total_fee_paid || 0,
        photoUrl: s.photo_url || "",
        photoLocked: Boolean(s.photo_url && s.photo_url.trim() !== "") || Boolean(s.photo_locked),
        homeLatitude: s.home_latitude ?? undefined,
        homeLongitude: s.home_longitude ?? undefined,
        studentIdCode: s.student_id_code || "",
        rfidCardId: s.rfid_card_id || "",
      }));
    }

    // PREVENT DATA LOSS ON REFRESH FOR STUDENTS
    // But ONLY merge fields that the server might not provide (e.g. temporary local state)
    // NEVER overwrite paymentStatus, hasActiveSubscription, or expiry dates from the server!
    const activeStudentUser = this.currentUser;
    if (activeStudentUser && activeStudentUser.role === "student") {
      const existingProfile = this.students.find(
        s => s.userId === activeStudentUser.id || s.email?.toLowerCase() === activeStudentUser.email?.toLowerCase()
      );
      if (existingProfile && existingProfile.campusId) {
        const mappedIdx = mappedStudents.findIndex(
          s => s.userId === activeStudentUser.id || s.email?.toLowerCase() === activeStudentUser.email?.toLowerCase()
        );
        if (mappedIdx >= 0) {
          // Merge safely: Server data is the source of truth for payment/access control
          mappedStudents[mappedIdx] = {
            ...existingProfile,
            ...mappedStudents[mappedIdx],
            // Explicitly force the server values for critical payment fields just to be 100% sure
            hasActiveSubscription: mappedStudents[mappedIdx].hasActiveSubscription,
            paymentStatus: mappedStudents[mappedIdx].paymentStatus,
            subscriptionExpiryDate: mappedStudents[mappedIdx].subscriptionExpiryDate,
          };
        } else {
          // Server returned nothing (maybe still processing), so keep the local profile alive
          mappedStudents.push(existingProfile);
        }
      }
    }
    this.students = mappedStudents;

    // 8. Fetch Staff
    const { data: dbStaff } = await supabase.from("staff_full").select("*");
    if (dbStaff && dbStaff.length > 0) {
      this.staff = dbStaff.map(s => ({
        id: s.id,
        userId: s.user_id || s.id,
        employeeCode: s.employee_code || `EMP-${s.id}`,
        fullName: s.full_name,
        email: s.email,
        phone: s.phone || null,
        category: s.category || "TRANSPORT_OPS",
        rank: (s.rank || "REGULAR") as "SENIOR" | "REGULAR" | "PROBATIONARY",
        role: (s.role || "driver") as any,
        permissions: [],
        licenseNo: s.license_no,
        isActive: s.is_active ?? true,
      }));
    }

    // 9. Fetch Auto Reservations (Authoritative Commuter Manifest)
    const { data: dbReservations } = await supabase.from("bus_reservations_full").select("*");
    if (dbReservations) {
      this.bookings = dbReservations.map(b => ({
        id: b.id,
        bookingCode: b.booking_code || `RES-${b.chosen_seat || "PASS"}-${b.id.slice(0, 6)}`,
        studentId: b.student_id,
        tripId: b.trip_id,
        busId: b.bus_id || "",
        bookingDate: b.reservation_date || b.booking_date || (b.created_at ? b.created_at.split("T")[0] : ""),
        boardingStopId: b.boarding_stop_id,
        status: b.status || "CONFIRMED",
        waitlistPosition: b.waitlist_position,
        seatNumber: b.chosen_seat || b.seat_number,
        passengerType: b.chosen_seat ? "SEATED" : "STANDING_TILL_MERGE",
        mergeStopId: b.merge_stop_id,
        createdAt: b.created_at || new Date().toISOString(),
      }));
    }

    this.notify();
  } catch (e) {
    console.warn("syncUserData failed:", e);
  }
};

// ── Main Supabase Database Sync ──

CampusFleetStore.prototype.syncFromSupabase = async function (this: CampusFleetStore) {
  try {
    // One cached master-data call first; if signed out, don't fire the other reads at all.
    await getCachedState();
    if (isSignedOut) return;

    // Run all sync routines in parallel to minimize load time
    // Wrap in Promise.race with an 8-second timeout to prevent the app from hanging forever
    const syncPromises = Promise.all([
      this.syncMasterData(),
      this.syncLiveTransit(),
      this.syncUserData()
    ]);
    const timeoutPromise = new Promise((resolve) => setTimeout(() => {
      console.log("[Sync] Supabase initial sync exceeded 2.5 seconds - proceeding with cached state in background.");
      resolve(null);
    }, 2500));
    
    await Promise.race([syncPromises, timeoutPromise]);

    // Today's trips are created by the Vercel cron (/api/cron/daily-rollover, 00:05 IST), not by browsers.

    this.isInitialized = true;
    this.notify();
  } catch (e) {
    console.warn("Supabase initial database sync failed:", e);
    this.isInitialized = true;
    this.notify();
  }
};
