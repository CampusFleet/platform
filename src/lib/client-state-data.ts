import type { SessionPayload } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getOrFetchWithCache, cacheDel } from "@/lib/redis";
import { isManageRole } from "@/lib/security/actor";
import {
  loadStaffData,
  mapBusRow,
  mapCampusRow,
  mapRouteRows,
  mapShiftRow,
  mapStaffRow,
  mapStopRows,
  mapStudentRow,
} from "@/lib/transport-admin-data";
import type {
  Booking, Bus, Campus, Route, Shift, SpecialShiftAllocation, Staff, Stop, Student,
  SubscriptionPlan, TransitZone, Trip, UserAccount,
} from "@/lib/types";

/**
 * Data behind the browser cache in src/lib/client-store (GET /api/client-state).
 *
 * - "manage" (admin, transport_admin, transport_manager): the full admin data set.
 * - "basic" (everyone else): shared master data, plus the caller's own student or staff row.
 *   No other people, no trips or bookings, no trip codes, no device ids.
 */
export interface ClientState {
  scope: "manage" | "basic";
  campuses: Campus[];
  stops: Stop[];
  routes: Route[];
  shifts: Shift[];
  transitZones: TransitZone[];
  buses: Bus[];
  students: Student[];
  staff: Staff[];
  users: UserAccount[];
  trips: Trip[];
  bookings: Booking[];
  specialShiftAllocations: SpecialShiftAllocation[];
  plans: SubscriptionPlan[];
}

export const CLIENT_STATE_MASTER_KEY = "client-state:master:v1";
const ADMIN_EXTRA_KEY = "client-state:admin-extra:v1";

const PUBLIC_BUS_COLUMNS = "id, bus_number, registration_no, model, capacity, seat_layout, total_rows, status, current_route_id";

function mapZoneRow(z: any): TransitZone {
  return {
    id: z.id,
    code: z.code,
    name: z.name,
    corridorDescription: z.corridor_description || "",
    semesterFee: Number(z.semester_fee) || 0,
    installmentsAllowed: Number(z.installments_allowed) || 3,
    campusId: z.campus_id || "",
    isActive: z.is_active ?? true,
    createdAt: z.created_at,
    updatedAt: z.updated_at,
  };
}

function mapAllocationRow(a: any): SpecialShiftAllocation {
  return {
    id: a.id,
    shiftId: a.shift_id,
    studentId: a.student_id,
    tripId: a.trip_id || undefined,
    notes: a.notes || undefined,
    allocatedBy: a.allocated_by || undefined,
    createdAt: a.created_at || undefined,
  };
}

function mapPlanRow(p: any): SubscriptionPlan {
  return {
    id: p.id,
    name: p.name || "",
    durationMonths: Number(p.duration_months) || 0,
    price: Number(p.price) || 0,
    description: p.description || "",
    features: [],
    corridorTier: p.corridor_tier || undefined,
    stoppages: p.stoppages || [],
  };
}

/** Master data every signed-in screen may read. Cached 60 s; dropped by the Supabase cache webhook. */
async function loadMasterData() {
  return getOrFetchWithCache({
    key: CLIENT_STATE_MASTER_KEY,
    ttl: 60,
    allowEmpty: true,
    fetchFn: async () => {
      const [campusesRes, stopsRes, routesRes, routeStopsRes, shiftsRes, zonesRes, busesRes] = await Promise.all([
        supabaseAdmin.from("campuses").select("*").order("is_primary", { ascending: false }).order("name", { ascending: true }),
        supabaseAdmin.from("stops").select("*"),
        supabaseAdmin.from("routes").select("*"),
        supabaseAdmin.from("route_stops").select("*").order("stop_order", { ascending: true }),
        supabaseAdmin.from("shifts").select("*"),
        supabaseAdmin.from("transit_zones").select("*").order("created_at", { ascending: true }),
        supabaseAdmin.from("buses").select(PUBLIC_BUS_COLUMNS).order("bus_number", { ascending: true }),
      ]);
      const dbCampuses = campusesRes.data || [];
      const campusNameMap = new Map<string, string>(dbCampuses.map((c: any) => [c.id, c.name]));
      const stops = mapStopRows(stopsRes.data || [], campusNameMap);
      const stopMap = new Map(stops.map((s) => [s.id, s]));
      return {
        campuses: dbCampuses.map(mapCampusRow),
        stops,
        routes: mapRouteRows(routesRes.data || [], routeStopsRes.data || [], stopMap),
        shifts: (shiftsRes.data || []).map(mapShiftRow),
        transitZones: (zonesRes.data || []).map(mapZoneRow),
        // Bus number / registration / capacity only: no GPS or RFID device ids for non-admins.
        buses: (busesRes.data || []).map((b: any) => ({ ...mapBusRow(b), gpsDeviceId: "", rfidDeviceId: "", insuranceExpiry: "", maintenanceDueDate: "" })),
      };
    },
  });
}

/** Tables the admin screens need that the shared staff loader does not read. Cached 20 s. */
async function loadAdminExtras() {
  return getOrFetchWithCache({
    key: ADMIN_EXTRA_KEY,
    ttl: 20,
    allowEmpty: true,
    fetchFn: async () => {
      const [zonesRes, allocationsRes, plansRes] = await Promise.all([
        supabaseAdmin.from("transit_zones").select("*").order("created_at", { ascending: true }),
        supabaseAdmin.from("special_shift_allocations").select("*"),
        supabaseAdmin.from("subscription_plans").select("*"),
      ]);
      return {
        transitZones: (zonesRes.data || []).map(mapZoneRow),
        specialShiftAllocations: (allocationsRes.data || []).map(mapAllocationRow),
        plans: (plansRes.data || []).map(mapPlanRow),
      };
    },
  });
}

/** The caller's own student row (by session user id, then session email). Not cached: it holds payment status. */
async function loadOwnStudent(session: SessionPayload): Promise<Student | null> {
  const byUser = await supabaseAdmin.from("students_full").select("*").eq("user_id", session.userId).limit(1);
  let row = byUser.data?.[0];
  if (!row && session.email) {
    const byEmail = await supabaseAdmin.from("students_full").select("*").eq("email", session.email.toLowerCase()).limit(1);
    row = byEmail.data?.[0];
  }
  return row ? mapStudentRow(row) : null;
}

async function loadOwnStaff(session: SessionPayload): Promise<Staff | null> {
  const { data } = await supabaseAdmin.from("staff").select("*").eq("user_id", session.userId).limit(1);
  return data?.[0] ? mapStaffRow(data[0]) : null;
}

/**
 * Builds the client state for the signed-in user. `fresh` (MANAGE only, sent by the browser right
 * after an admin write) drops the cached admin and master copies first so the write shows up at once.
 */
export async function getClientState(session: SessionPayload, options: { fresh?: boolean } = {}): Promise<ClientState> {
  if (isManageRole(session.role)) {
    if (options.fresh) await Promise.all([cacheDel(ADMIN_EXTRA_KEY), cacheDel(CLIENT_STATE_MASTER_KEY)]);
    const [staffData, extras] = await Promise.all([loadStaffData({ fresh: options.fresh }), loadAdminExtras()]);
    return {
      scope: "manage",
      campuses: staffData.campuses,
      stops: staffData.stops,
      routes: staffData.routes,
      shifts: staffData.shifts,
      transitZones: extras.transitZones,
      buses: staffData.buses,
      students: staffData.students,
      staff: staffData.staff,
      users: staffData.users,
      trips: staffData.trips,
      bookings: staffData.bookings,
      specialShiftAllocations: extras.specialShiftAllocations,
      plans: extras.plans,
    };
  }

  const isStudent = session.role === "student";
  const [master, ownStudent, ownStaff] = await Promise.all([
    loadMasterData(),
    isStudent ? loadOwnStudent(session) : Promise.resolve(null),
    isStudent ? Promise.resolve(null) : loadOwnStaff(session),
  ]);
  return {
    scope: "basic",
    ...master,
    students: ownStudent ? [ownStudent] : [],
    staff: ownStaff ? [ownStaff] : [],
    users: [],
    trips: [],
    bookings: [],
    specialShiftAllocations: [],
    plans: [],
  };
}
