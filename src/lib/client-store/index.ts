/**
 * Browser cache of shared data, loaded from ONE server route: GET /api/client-state.
 * Replaces the legacy src/lib/store (whole-database sync, localStorage, cross-tab broadcast, /api/db proxy).
 *
 * - In memory only. The current user comes from src/lib/auth-service.ts.
 * - MANAGE roles get the admin data set; everyone else master data + their own row (see client-state-data.ts).
 * - Writes go through the existing server routes, then the cache re-loads (`?fresh=1`) and notifies.
 *
 * Do not grow this module: new screens fetch from a dedicated API route (see AGENTS.md here).
 */
import { authService, type AuthUser } from "../auth-service";
import { clearClientUserData } from "../clear-user-data";
import type { ClientState } from "../client-state-data";
import type { NetworkStats, RouteRecommendation, StopGraph } from "../route-optimizer";
import type {
  Booking, Bus, Campus, Guardian, MaintenanceRecord, PaymentRecord, Route, Shift, SpecialShiftAllocation,
  Staff, Stop, Student, SubscriptionPlan, TransitZone, Trip, UserAccount, UserRole,
} from "../types";
import { buildNetworkGraph, networkStats, primaryCampusOf, recommendRoutes } from "./graph";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  studentId?: string;
  campusId?: string;
  campus?: string;
  avatarUrl?: string;
  photoUrl?: string;
}

type Listener = () => void;

const EMPTY_STATE: ClientState = {
  scope: "basic",
  campuses: [],
  stops: [],
  routes: [],
  shifts: [],
  transitZones: [],
  buses: [],
  students: [],
  staff: [],
  users: [],
  trips: [],
  bookings: [],
  specialShiftAllocations: [],
  plans: [],
};

let state: ClientState = EMPTY_STATE;
let currentUser: CurrentUser | null = null;
let ready = false;
let graph: StopGraph | null = null;
let loadGeneration = 0;
let inflight: Promise<void> | null = null;
let lastLoadedAt = 0;
const listeners = new Set<Listener>();

const REFOCUS_RELOAD_MS = 60_000;

function notify() {
  listeners.forEach((cb) => cb());
}

function setState(next: ClientState) {
  state = next;
  graph = null;
}

function fromAuthUser(user: AuthUser): CurrentUser {
  return { id: user.id, email: user.email, fullName: user.fullName, role: user.role, studentId: user.studentId };
}

/** Fetch /api/client-state. Signed out (401) → empty state. Always ends with ready = true. */
function load(fresh = false): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (inflight && !fresh) return inflight;
  const generation = ++loadGeneration;
  const run = (async () => {
    try {
      const res = await fetch(`/api/client-state${fresh ? "?fresh=1" : ""}`, { credentials: "same-origin", cache: "no-store" });
      if (generation !== loadGeneration) return;
      if (res.status === 401) {
        setState(EMPTY_STATE);
      } else if (res.ok) {
        const json = await res.json().catch(() => null);
        if (generation !== loadGeneration) return;
        if (json?.success && json.data) setState({ ...EMPTY_STATE, ...json.data });
      }
      lastLoadedAt = Date.now();
    } catch (err) {
      console.warn("[client-store] /api/client-state failed:", err);
    } finally {
      if (generation === loadGeneration) {
        ready = true;
        notify();
      }
    }
  })();
  inflight = run;
  void run.finally(() => {
    if (inflight === run) inflight = null;
  });
  return run;
}

/** Drop cached data (on logout / user switch) without touching the current user. */
function clearData() {
  loadGeneration++; // discard any response still in flight
  inflight = null;
  setState(EMPTY_STATE);
  ready = true;
}

/**
 * Write through a server route. On success the cache re-loads fresh before returning, so callers
 * that read the store right after `await` see the change. On failure it re-loads and throws.
 */
async function serverWrite(method: string, url: string, body?: unknown): Promise<any> {
  if (typeof window === "undefined") return null;
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    void load(true);
    throw new Error(data.error || data.message || "Could not save the change.");
  }
  await load(true);
  return data;
}

/** Route → body for PUT /api/transport-admin/routes. */
function routePayload(r: Route, withStops = true) {
  return {
    id: r.id,
    code: r.code ?? null,
    name: r.name,
    description: r.description ?? null,
    direction: (r as any).direction ?? null,
    color: r.color ?? null,
    totalDistanceKm: r.totalDistanceKm ?? null,
    estimatedDurationMins: r.estimatedDurationMins ?? null,
    isActive: r.isActive,
    campusId: (r as any).campusId ?? null,
    ...(withStops
      ? {
          stops: (r.stops || []).map((rs, i) => ({
            stopId: rs.stopId,
            stopOrder: rs.stopOrder ?? i + 1,
            arrivalOffsetMinutes: rs.arrivalOffsetMinutes ?? 0,
            bufferTimeMinutes: rs.bufferTimeMinutes ?? 0,
          })),
        }
      : {}),
  };
}

function getGraph(): StopGraph {
  if (!graph) graph = buildNetworkGraph(state);
  return graph;
}

function findCampus(idOrName: string | undefined): Campus | undefined {
  if (!idOrName) return undefined;
  const key = idOrName.toLowerCase();
  return state.campuses.find((c) => c.id === idOrName || c.name.toLowerCase() === key || c.code.toLowerCase() === key);
}

// ── Public API ──────────────────────────────────────────────────────────────

export const store = {
  // Lifecycle
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** True once the first /api/client-state answer (or failure) has arrived. */
  isReady(): boolean {
    return ready;
  },
  /** Re-load from the server (name kept from the legacy store). */
  syncFromSupabase(): Promise<void> {
    return load(state.scope === "manage");
  },

  // Auth
  getCurrentUser(): CurrentUser | null {
    return currentUser;
  },
  setCurrentUser(user: CurrentUser | null): void {
    const previousId = currentUser?.id;
    currentUser = user;
    if (!user) clearData();
    notify();
    if (user && user.id !== previousId) void load();
  },
  async logout(): Promise<void> {
    await authService.logout();
    store.wipeAllData();
  },
  /** Clear every cached row and the current user (logout, account deletion). */
  wipeAllData(): void {
    currentUser = null;
    clearData();
    void clearClientUserData();
    notify();
  },
  updateUserRoleLocal(userId: string, newRole: UserRole): void {
    setState({ ...state, users: state.users.map((u) => (u.id === userId ? { ...u, role: newRole } : u)) });
    if (currentUser && currentUser.id === userId) currentUser = { ...currentUser, role: newRole };
    notify();
  },
  /** Merge a student row a server route just returned (e.g. /api/users/update-profile). Local only. */
  applyServerStudent(server: Partial<Student> & { id: string }): void {
    const idx = state.students.findIndex((s) => s.id === server.id || (server.userId && s.userId === server.userId));
    const students = [...state.students];
    if (idx >= 0) students[idx] = { ...students[idx], ...server };
    else students.push(server as Student);
    setState({ ...state, students });
    if (currentUser && server.userId && currentUser.id === server.userId) {
      currentUser = {
        ...currentUser,
        fullName: server.fullName || currentUser.fullName,
        studentId: server.id,
        campusId: server.campusId || currentUser.campusId,
        campus: server.campus || currentUser.campus,
      };
    }
    notify();
  },

  // Reads
  getCampuses: (): Campus[] => state.campuses,
  getPrimaryCampus: (): Campus | undefined => primaryCampusOf(state.campuses),
  /** The student's own campus, or undefined when it is not set (never a fallback campus). */
  getStudentPrimaryCampus(student?: Student | null): Campus | undefined {
    return findCampus(student?.campusId || student?.campus || currentUser?.campusId || currentUser?.campus);
  },
  getStops: (): Stop[] => state.stops,
  getRoutes: (): Route[] => state.routes,
  getShifts: (): Shift[] => state.shifts,
  getBuses: (): Bus[] => state.buses,
  getStudents: (): Student[] => state.students,
  getStaff: (): Staff[] => state.staff,
  getUsers: (): UserAccount[] => state.users,
  getTrips: (): Trip[] => state.trips,
  getBookings: (): Booking[] => state.bookings,
  getSpecialShiftAllocations: (): SpecialShiftAllocation[] => state.specialShiftAllocations,
  getPlans: (): SubscriptionPlan[] => state.plans,
  /** No source table: the legacy `payments` table was dropped. Pages pass payment_submissions instead. */
  getPayments: (): PaymentRecord[] => [],
  /** No guardians table exists. */
  getGuardians: (): Guardian[] => [],
  /** Not loaded (the legacy store never loaded it either); pages pass their own maintenance rows. */
  getMaintenance: (): MaintenanceRecord[] => [],
  /**
   * Zones for a campus (default: the user's campus, then the primary campus). When that campus has
   * none, every zone deduplicated by code. Inactive zones only with `includeInactive`.
   */
  getTransitZones(campusId?: string, includeInactive = false): TransitZone[] {
    const zones = includeInactive ? state.transitZones : state.transitZones.filter((z) => z.isActive !== false);
    const targetCampusId = campusId || currentUser?.campusId || primaryCampusOf(state.campuses)?.id;
    if (targetCampusId) {
      const matching = zones.filter((z) => z.campusId === targetCampusId);
      if (matching.length > 0) return matching;
    }
    const seen = new Set<string>();
    return zones.filter((z) => (seen.has(z.code) ? false : (seen.add(z.code), true)));
  },

  // Stop network
  recommendRoute(homeLat: number, homeLng: number, campusStopId?: string): RouteRecommendation[] {
    const campusId = campusStopId || currentUser?.campusId || primaryCampusOf(state.campuses)?.id;
    return recommendRoutes(state, getGraph(), homeLat, homeLng, campusId);
  },
  getNetworkStats(): NetworkStats {
    return networkStats(getGraph());
  },

  // Buses
  async createBus(busData: Omit<Bus, "id">): Promise<Bus> {
    const r = await serverWrite("POST", "/api/transport-admin/buses", busData);
    const id = Number(r?.id);
    return state.buses.find((b) => b.id === id) || { ...busData, id };
  },
  async updateBus(id: number, updates: Partial<Bus>): Promise<void> {
    await serverWrite("PATCH", `/api/transport-admin/buses?id=${id}`, updates);
  },
  async deleteBus(id: number): Promise<void> {
    await serverWrite("DELETE", `/api/transport-admin/buses?id=${id}`);
  },
  async allocateBusToRoute(busId: number, routeId: string): Promise<void> {
    await serverWrite("PATCH", `/api/transport-admin/buses?id=${busId}`, { currentRouteId: routeId });
  },

  // Stops
  async createStop(stopData: Omit<Stop, "id">): Promise<Stop> {
    const newStop: Stop = { ...stopData, id: `stop-${Date.now()}` };
    await serverWrite("POST", "/api/stops", newStop);
    return state.stops.find((s) => s.id === newStop.id) || newStop;
  },
  async updateStop(id: string, updates: Partial<Stop>): Promise<void> {
    await serverWrite("PATCH", `/api/stops/${encodeURIComponent(id)}`, updates);
  },
  async deleteStop(id: string): Promise<void> {
    await serverWrite("DELETE", `/api/stops/${encodeURIComponent(id)}`);
  },

  // Campuses
  async createCampus(campusData: Omit<Campus, "id"> & { id?: string }): Promise<Campus> {
    const id = campusData.id || `campus-${campusData.code.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const newCampus: Campus = {
      ...campusData,
      id,
      geofenceRadiusMeters: campusData.geofenceRadiusMeters ?? 100,
      fleetCapacity: campusData.fleetCapacity ?? 50,
      parkingBays: campusData.parkingBays ?? 20,
      isActive: campusData.isActive ?? true,
      isPrimary: Boolean(campusData.isPrimary),
      createdAt: now,
      updatedAt: now,
    };
    await serverWrite("POST", "/api/campus", newCampus);
    return state.campuses.find((c) => c.id === id) || newCampus;
  },
  async updateCampus(id: string, updates: Partial<Campus>): Promise<Campus | null> {
    await serverWrite("PATCH", "/api/campus", { id, ...updates });
    return state.campuses.find((c) => c.id === id) || null;
  },
  async deleteCampus(id: string): Promise<boolean> {
    if (!state.campuses.some((c) => c.id === id)) return false;
    if (state.campuses.length <= 1) throw new Error("Cannot delete the sole campus location.");
    await serverWrite("DELETE", `/api/campus?id=${encodeURIComponent(id)}`);
    return true;
  },
  async setPrimaryCampus(id: string): Promise<boolean> {
    return Boolean(await store.updateCampus(id, { isPrimary: true }));
  },

  // Transit zones
  async createTransitZone(
    zoneData: Omit<TransitZone, "id"> & { id?: string; campusId: string; assignedStopIds?: string[] }
  ): Promise<TransitZone> {
    const code = zoneData.code.trim().toUpperCase();
    const id = zoneData.id || `zone-${zoneData.campusId.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${code.toLowerCase()}-${Date.now().toString(36)}`;
    const corridorDescription =
      zoneData.corridorDescription ||
      state.stops.filter((s) => zoneData.assignedStopIds?.includes(s.id)).map((s) => s.name).join(", ");
    const now = new Date().toISOString();
    const newZone: TransitZone = {
      ...zoneData,
      id,
      code,
      corridorDescription,
      semesterFee: Number(zoneData.semesterFee) || 0,
      installmentsAllowed: Number(zoneData.installmentsAllowed) || 3,
      isActive: zoneData.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    await serverWrite("POST", "/api/zones", { ...newZone, assignedStopIds: zoneData.assignedStopIds });
    return state.transitZones.find((z) => z.id === id) || newZone;
  },
  async updateTransitZone(idOrCode: string, updates: Partial<TransitZone> & { assignedStopIds?: string[] }): Promise<TransitZone | null> {
    const target = state.transitZones.find((z) => z.id === idOrCode || z.code === idOrCode);
    const id = target?.id || idOrCode;
    await serverWrite("PATCH", `/api/zones/${encodeURIComponent(id)}`, updates);
    return state.transitZones.find((z) => z.id === id || z.code === idOrCode) || null;
  },
  async deleteTransitZone(idOrCode: string): Promise<boolean> {
    const target = state.transitZones.find((z) => z.id === idOrCode || z.code === idOrCode);
    if (!target) return false;
    await serverWrite("DELETE", `/api/zones/${encodeURIComponent(target.id || idOrCode)}`);
    return true;
  },

  // Routes
  async createRoute(routeData: Omit<Route, "id">): Promise<Route> {
    const newRoute: Route = { ...routeData, id: `route-${Date.now()}` };
    await serverWrite("PUT", "/api/transport-admin/routes", routePayload(newRoute));
    return state.routes.find((r) => r.id === newRoute.id) || newRoute;
  },
  async updateRoute(id: string, updates: Partial<Route>): Promise<void> {
    const existing = state.routes.find((r) => r.id === id);
    if (!existing) return;
    await serverWrite("PUT", "/api/transport-admin/routes", routePayload({ ...existing, ...updates }, Boolean(updates.stops)));
  },
  async deleteRoute(id: string): Promise<void> {
    await serverWrite("DELETE", `/api/transport-admin/routes?id=${encodeURIComponent(id)}`);
  },

  // Shifts
  async createShift(shift: Partial<Shift> & { name: string; startTime: string; endTime: string }): Promise<Shift> {
    const newShift: Shift = {
      id: shift.id || `shift-${Date.now()}`,
      name: shift.name,
      shiftType: shift.shiftType || "MORNING",
      startTime: shift.startTime,
      endTime: shift.endTime,
      bookingCutoffMins: shift.bookingCutoffMins || 30,
      direction: shift.direction || "HOME_TO_CAMPUS",
      isSpecial: Boolean(shift.isSpecial),
    };
    await serverWrite("POST", "/api/shifts", newShift);
    return state.shifts.find((s) => s.id === newShift.id) || newShift;
  },
  async updateShift(shiftId: string, updates: Partial<Shift>): Promise<Shift | null> {
    if (!state.shifts.some((s) => s.id === shiftId)) return null;
    await serverWrite("PUT", "/api/shifts", { id: shiftId, ...updates });
    return state.shifts.find((s) => s.id === shiftId) || null;
  },
  async deleteShift(shiftId: string): Promise<boolean> {
    await serverWrite("DELETE", `/api/shifts?id=${encodeURIComponent(shiftId)}`);
    return true;
  },
  async allocateStudentToSpecialShift(shiftId: string, studentId: string, tripId?: string, notes?: string): Promise<{ success: boolean; message: string }> {
    if (state.specialShiftAllocations.some((a) => a.shiftId === shiftId && a.studentId === studentId)) {
      return { success: true, message: "Student already allocated to this facility" };
    }
    await serverWrite("POST", "/api/transport-admin/special-allocations", { shiftId, studentId, tripId: tripId || null, notes: notes || null });
    return { success: true, message: "Student allocated successfully" };
  },
  async removeStudentFromSpecialShift(shiftId: string, studentId: string): Promise<{ success: boolean; message: string }> {
    await serverWrite("DELETE", "/api/transport-admin/special-allocations", { shiftId, studentId });
    return { success: true, message: "Student allocation removed" };
  },

  // Trips (runs are created and cancelled by the dispatch route: overlap checks + audit log)
  async createTrip(tripData: Omit<Trip, "id">): Promise<Trip> {
    const r = await serverWrite("POST", "/api/transport-manager/dispatch", {
      action: "ADD",
      date: tripData.tripDate,
      routeId: tripData.routeId,
      shiftId: tripData.shiftId,
      busId: tripData.busId ? Number(tripData.busId) : null,
      driverId: tripData.driverId || null,
      conductorId: tripData.conductorId || null,
      isSpecial: Boolean(tripData.isSpecial),
      facilityType: tripData.facilityType,
    });
    return state.trips.find((t) => t.id === r?.tripId) || { ...tripData, id: r?.tripId || "" };
  },
  /** Cancels the run (never deleted: riders' history and the audit log stay). */
  async deleteTrip(tripId: string): Promise<void> {
    await serverWrite("POST", "/api/transport-manager/dispatch", { action: "CANCEL", tripId });
  },

  // Bookings
  async cancelBooking(bookingId: string): Promise<{ success: boolean; message: string }> {
    try {
      await serverWrite("POST", "/api/bookings/cancel", { bookingId });
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : "Could not cancel the reservation." };
    }
    return {
      success: true,
      message: "Seat reservation cancelled successfully. The seat has been released back to available fleet inventory.",
    };
  },
};

// ── Browser start-up ────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  const authUser = authService.getCurrentUser();
  if (authUser) currentUser = fromAuthUser(authUser);

  authService.subscribe((user) => {
    const previousId = currentUser?.id;
    currentUser = user ? fromAuthUser(user) : null;
    if (!user) clearData();
    notify();
    if (user && user.id !== previousId) void load();
  });

  void load();

  // Pick up server-side changes (e.g. an approved payment) when the tab comes back.
  const reloadIfStale = () => {
    if (currentUser && document.visibilityState === "visible" && Date.now() - lastLoadedAt > REFOCUS_RELOAD_MS) void load();
  };
  document.addEventListener("visibilitychange", reloadIfStale);
  window.addEventListener("focus", reloadIfStale);
}
