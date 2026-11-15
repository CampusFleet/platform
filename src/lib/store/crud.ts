import { CampusFleetStore } from "./_base";
import { telematicsService } from "../telematicsService";
import { lockFinalManifest } from "../reservation-engine";
import { createTripId } from "../id";
import { clearClientUserData } from "../clear-user-data";
import type {
  Bus, Route, Stop, Campus, Shift, Trip, Student, Staff,
  LiveBusLocation, VehicleIssue, NotificationItem, UserRole,
  TransitZone, SpecialShiftAllocation,
} from "../types";

/**
 * Server write for the legacy store: every admin change goes through a typed server route (no
 * browser writes through /api/db). On failure the store re-syncs from the server and the error is
 * thrown so the screen can show it.
 */
async function serverWrite(method: string, url: string, body: unknown, store: CampusFleetStore): Promise<any> {
  if (typeof window === "undefined") return null;
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    void store.syncFromSupabase().catch(() => {});
    throw new Error(data.error || data.message || "Could not save the change.");
  }
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
    ...(withStops ? { stops: (r.stops || []).map((rs, i) => ({ stopId: rs.stopId, stopOrder: rs.stopOrder ?? i + 1, arrivalOffsetMinutes: rs.arrivalOffsetMinutes ?? 0, bufferTimeMinutes: rs.bufferTimeMinutes ?? 0 })) } : {}),
  };
}

// ── Module Augmentation ─────────────────────────────────────────────────────
declare module "./_base" {
  interface CampusFleetStore {
    // Shifts
    createShift(shift: Partial<Shift> & { name: string; startTime: string; endTime: string }): Promise<Shift>;
    updateShift(shiftId: string, updates: Partial<Shift>): Promise<Shift | null>;
    deleteShift(shiftId: string): Promise<boolean>;
    allocateStudentToSpecialShift(shiftId: string, studentId: string, tripId?: string, notes?: string): Promise<{ success: boolean; message: string }>;
    removeStudentFromSpecialShift(shiftId: string, studentId: string): Promise<{ success: boolean; message: string }>;
    // Users & Students
    updateUserRoleLocal(userId: string, newRole: UserRole): void;
    applyServerStudent(server: Partial<Student> & { id: string }): void;
    markStudentSubscribed(studentId: string): void;
    // Notifications
    markNotificationAsRead(id: string): void;
    createNotification(notif: Omit<NotificationItem, "id" | "timestamp">): NotificationItem;
    triggerSOS(studentId: string, locationStr: string, reason: string): NotificationItem;
    setActiveChildId(childId: string): void;
    createBus(busData: Omit<Bus, "id">): Promise<Bus>;
    updateBus(id: number, updates: Partial<Bus>): Promise<void>;
    deleteBus(id: number): Promise<void>;
    // Stops
    createStop(stopData: Omit<Stop, "id">): Promise<Stop>;
    updateStop(id: string, updates: Partial<Stop>): Promise<void>;
    deleteStop(id: string): Promise<void>;
    // Campuses
    createCampus(campusData: Omit<Campus, "id"> & { id?: string }): Promise<Campus>;
    updateCampus(id: string, updates: Partial<Campus>): Promise<Campus | null>;
    deleteCampus(id: string): Promise<boolean>;
    setPrimaryCampus(id: string): Promise<boolean>;
    // Transit Zones
    createTransitZone(zoneData: Omit<TransitZone, "id"> & { id?: string; campusId: string; assignedStopIds?: string[] }): Promise<TransitZone>;
    updateTransitZone(idOrCode: string, updates: Partial<TransitZone> & { assignedStopIds?: string[] }): Promise<TransitZone | null>;
    deleteTransitZone(idOrCode: string): Promise<boolean>;
    // Routes
    createRoute(routeData: Omit<Route, "id">): Promise<Route>;
    updateRoute(id: string, updates: Partial<Route>): Promise<void>;
    deleteRoute(id: string): Promise<void>;
    allocateBusToRoute(busId: number, routeId: string): Promise<void>;
    // Trips
    createTrip(tripData: Omit<Trip, "id">): Promise<Trip>;
    updateTrip(tripId: string, updates: Partial<Trip>): Promise<void>;
    deleteTrip(tripId: string): Promise<void>;
    // Telematics & Vehicle Issues
    updateLiveLocation(updates: Partial<LiveBusLocation>): void;
    // Utility
    resetToCleanTemplate(): void;
    wipeAllData(): void;
  }
}

// ── Shift CRUD ──────────────────────────────────────────────────────────────

CampusFleetStore.prototype.createShift = async function (this: CampusFleetStore, shift: Partial<Shift> & { name: string; startTime: string; endTime: string }): Promise<Shift> {
  const shiftId = shift.id || `shift-${Date.now()}`;
  const newShift: Shift = {
    id: shiftId,
    name: shift.name,
    shiftType: shift.shiftType || "MORNING",
    startTime: shift.startTime,
    endTime: shift.endTime,
    bookingCutoffMins: shift.bookingCutoffMins || 30,
    direction: shift.direction || "HOME_TO_CAMPUS",
    isSpecial: Boolean(shift.isSpecial),
  };

  try {
    const res = await fetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newShift),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
  } catch (e: any) {
    console.warn("Could not save shift to /api/shifts:", e);
    throw e;
  }

  const idx = this.shifts.findIndex(s => s.id === shiftId);
  if (idx >= 0) {
    this.shifts[idx] = newShift;
  } else {
    this.shifts.push(newShift);
  }
  this.notify();
  return newShift;
};

CampusFleetStore.prototype.updateShift = async function (this: CampusFleetStore, shiftId: string, updates: Partial<Shift>): Promise<Shift | null> {
  const shift = this.shifts.find(s => s.id === shiftId);
  if (!shift) return null;

  try {
    const res = await fetch("/api/shifts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: shiftId, ...updates }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
  } catch (e: any) {
    console.warn("Could not sync shift update to /api/shifts:", e);
    throw e;
  }

  Object.assign(shift, updates);
  this.notify();
  return shift;
};

CampusFleetStore.prototype.deleteShift = async function (this: CampusFleetStore, shiftId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/shifts?id=${encodeURIComponent(shiftId)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
  } catch (e: any) {
    console.warn("Could not sync shift deletion to /api/shifts:", e);
    throw e;
  }

  this.shifts = this.shifts.filter(s => s.id !== shiftId);
  this.notify();
  return true;
};

CampusFleetStore.prototype.allocateStudentToSpecialShift = async function (this: CampusFleetStore, shiftId: string, studentId: string, tripId?: string, notes?: string) {
  const existing = this.specialShiftAllocations.find(a => a.shiftId === shiftId && a.studentId === studentId);
  if (existing) {
    return { success: true, message: "Student already allocated to this facility" };
  }

  const newAlloc: SpecialShiftAllocation = {
    id: `alloc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    shiftId,
    studentId,
    tripId,
    notes,
    allocatedBy: this.currentUser?.id,
    createdAt: new Date().toISOString(),
  };

  this.specialShiftAllocations.push(newAlloc);
  this.notify();

  await serverWrite("POST", "/api/transport-admin/special-allocations", { shiftId, studentId, tripId: tripId || null, notes: notes || null }, this);
  return { success: true, message: "Student allocated successfully" };
};

CampusFleetStore.prototype.removeStudentFromSpecialShift = async function (this: CampusFleetStore, shiftId: string, studentId: string) {
  this.specialShiftAllocations = this.specialShiftAllocations.filter(
    a => !(a.shiftId === shiftId && a.studentId === studentId)
  );
  this.notify();

  await serverWrite("DELETE", "/api/transport-admin/special-allocations", { shiftId, studentId }, this);
  return { success: true, message: "Student allocation removed" };
};

// ── User & Student CRUD ─────────────────────────────────────────────────────

CampusFleetStore.prototype.updateUserRoleLocal = function (this: CampusFleetStore, userId: string, newRole: UserRole) {
  this.users = this.users.map(u => (u.id === userId ? { ...u, role: newRole } : u));
  if (this.currentUser && this.currentUser.id === userId) {
    this.currentUser = { ...this.currentUser, role: newRole };
  }
  this.saveToLocalStorage();
  this.notify();
};

/**
 * Local-only merge of a student row the server just returned (e.g. from /api/users/update-profile).
 * Never writes to the database: profile writes go through server routes only, so this cache can't
 * overwrite real data with stale copies or defaults.
 */
CampusFleetStore.prototype.applyServerStudent = function (this: CampusFleetStore, server: Partial<Student> & { id: string }) {
  const idx = this.students.findIndex((s) => s.id === server.id || (server.userId && s.userId === server.userId));
  if (idx >= 0) this.students[idx] = { ...this.students[idx], ...server };
  else this.students.push(server as Student);
  if (this.currentUser && server.userId && this.currentUser.id === server.userId) {
    this.currentUser = {
      ...this.currentUser,
      fullName: server.fullName || this.currentUser.fullName,
      studentId: server.id,
      campusId: server.campusId || this.currentUser.campusId,
      campus: server.campus || (this.currentUser as any).campus,
    };
  }
  this.saveToLocalStorage();
  this.notify();
};
CampusFleetStore.prototype.markStudentSubscribed = function (
  this: CampusFleetStore,
  studentId: string
) {
  this.students = this.students.map(s => {
    if (s.id === studentId || s.userId === studentId) {
      return {
        ...s,
        hasActiveSubscription: true,
        paymentStatus: "APPROVED",
        totalFeePaid: s.totalFeeDue || s.totalFeePaid || 0,
      };
    }
    return s;
  });
  this.saveToLocalStorage();
  this.notify();
};

// ── Notification CRUD ───────────────────────────────────────────────────────

CampusFleetStore.prototype.markNotificationAsRead = function (this: CampusFleetStore, id: string) {
  this.notifications = this.notifications.map(n => n.id === id ? { ...n, isRead: true } : n);
  this.notify();
};

CampusFleetStore.prototype.createNotification = function (this: CampusFleetStore, notif: Omit<NotificationItem, "id" | "timestamp">): NotificationItem {
  const newNotif: NotificationItem = {
    ...notif,
    id: `notif-${Date.now()}`,
    timestamp: new Date().toISOString(),
  };
  this.notifications = [newNotif, ...this.notifications];
  this.notify();
  return newNotif;
};

CampusFleetStore.prototype.triggerSOS = function (this: CampusFleetStore, studentId: string, locationStr: string, reason: string) {
  const newNotif: NotificationItem = {
    id: `sos-${Date.now()}`,
    userId: studentId,
    title: "🚨 EMERGENCY SOS DISPATCHED",
    message: `Emergency signal from ${studentId} at ${locationStr}. Reason: ${reason}`,
    type: "SOS",
    isRead: false,
    timestamp: new Date().toISOString(),
  };
  this.notifications = [newNotif, ...this.notifications];
  this.notify();
  return newNotif;
};

CampusFleetStore.prototype.setActiveChildId = function (this: CampusFleetStore, childId: string) {
  this.activeChildId = childId;
  this.notify();
};

// ── Bus CRUD ────────────────────────────────────────────────────────────────

CampusFleetStore.prototype.createBus = async function (this: CampusFleetStore, busData: Omit<Bus, "id">) {
  let dbInsertedId: number = Date.now();
  const r = await serverWrite("POST", "/api/transport-admin/buses", busData, this);
  if (r?.id) {
    dbInsertedId = r.id;
  }

  const newBus: Bus = {
    ...busData,
    id: dbInsertedId,
  };
  this.buses = [...this.buses, newBus];
  this.notify();
  return newBus;
};

CampusFleetStore.prototype.updateBus = async function (this: CampusFleetStore, id: number, updates: Partial<Bus>) {
  this.buses = this.buses.map(b => b.id === id ? { ...b, ...updates } : b);
  this.notify();

  await serverWrite("PATCH", `/api/transport-admin/buses?id=${id}`, updates, this);
};

CampusFleetStore.prototype.deleteBus = async function (this: CampusFleetStore, id: number) {
  this.buses = this.buses.filter(b => b.id !== id);
  this.notify();
  await serverWrite("DELETE", `/api/transport-admin/buses?id=${id}`, undefined, this);
};

// ── Stop CRUD ───────────────────────────────────────────────────────────────

CampusFleetStore.prototype.createStop = async function (this: CampusFleetStore, stopData: Omit<Stop, "id">) {
  const newStop: Stop = {
    ...stopData,
    id: `stop-${Date.now()}`,
  };
  this.stops = [...this.stops, newStop];
  this.invalidateGraphCache();
  this.saveToLocalStorage();
  this.notify();

  await serverWrite("POST", "/api/stops", newStop, this);
  return newStop;
};

CampusFleetStore.prototype.updateStop = async function (this: CampusFleetStore, id: string, updates: Partial<Stop>) {
  this.stops = this.stops.map(s => (s.id === id ? { ...s, ...updates } : s));
  // Also update in-memory and database routes containing this stop
  this.routes = this.routes.map(r => ({
    ...r,
    stops: r.stops.map(rs => (rs.stopId === id ? { ...rs, stop: { ...rs.stop, ...updates } } : rs)),
  }));
  this.invalidateGraphCache();
  this.saveToLocalStorage();
  this.notify();

  await serverWrite("PATCH", `/api/stops/${encodeURIComponent(id)}`, updates, this);
};

CampusFleetStore.prototype.deleteStop = async function (this: CampusFleetStore, id: string) {
  this.stops = this.stops.filter(s => s.id !== id);
  // Also remove from any routes
  this.routes = this.routes.map(r => ({
    ...r,
    stops: r.stops.filter(rs => rs.stopId !== id).map((rs, idx) => ({ ...rs, stopOrder: idx + 1 })),
  }));
  this.invalidateGraphCache();
  this.saveToLocalStorage();
  this.notify();

  await serverWrite("DELETE", `/api/stops/${encodeURIComponent(id)}`, undefined, this);
};

// ── Campus CRUD ─────────────────────────────────────────────────────────────

CampusFleetStore.prototype.createCampus = async function (this: CampusFleetStore, campusData: Omit<Campus, "id"> & { id?: string }): Promise<Campus> {
  const id = campusData.id || `campus-${campusData.code.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now().toString(36)}`;
  const newCampus: Campus = {
    ...campusData,
    id,
    geofenceRadiusMeters: campusData.geofenceRadiusMeters ?? 100,
    fleetCapacity: campusData.fleetCapacity ?? 50,
    parkingBays: campusData.parkingBays ?? 20,
    isActive: campusData.isActive ?? true,
    isPrimary: Boolean(campusData.isPrimary),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (newCampus.isPrimary) {
    this.campuses = this.campuses.map(c => ({ ...c, isPrimary: false }));
  }

  this.campuses = [...this.campuses, newCampus];
  this.saveToLocalStorage();
  this.notify();

  await serverWrite("POST", "/api/campus", newCampus, this);
  return newCampus;
};

CampusFleetStore.prototype.updateCampus = async function (this: CampusFleetStore, id: string, updates: Partial<Campus>): Promise<Campus | null> {
  if (updates.isPrimary) {
    this.campuses = this.campuses.map(c => (c.id === id ? { ...c, ...updates, isPrimary: true } : { ...c, isPrimary: false }));
  } else {
    this.campuses = this.campuses.map(c => (c.id === id ? { ...c, ...updates } : c));
  }
  this.saveToLocalStorage();
  this.notify();

  await serverWrite("PATCH", "/api/campus", { id, ...updates }, this);
  return this.campuses.find(c => c.id === id) || null;
};

CampusFleetStore.prototype.deleteCampus = async function (this: CampusFleetStore, id: string): Promise<boolean> {
  const target = this.campuses.find(c => c.id === id);
  if (!target) return false;
  if (this.campuses.length <= 1) {
    throw new Error("Cannot delete the sole campus location.");
  }

  this.campuses = this.campuses.filter(c => c.id !== id);
  if (target.isPrimary && this.campuses.length > 0) {
    this.campuses[0].isPrimary = true;
  }
  this.saveToLocalStorage();
  this.notify();

  await serverWrite("DELETE", `/api/campus?id=${encodeURIComponent(id)}`, undefined, this);
  return true;
};

CampusFleetStore.prototype.setPrimaryCampus = async function (this: CampusFleetStore, id: string): Promise<boolean> {
  return !!(await this.updateCampus(id, { isPrimary: true }));
};

// ── Transit Zone CRUD ───────────────────────────────────────────────────────

CampusFleetStore.prototype.createTransitZone = async function (this: CampusFleetStore, zoneData: Omit<TransitZone, "id"> & { id?: string; campusId: string; assignedStopIds?: string[] }): Promise<TransitZone> {
  const code = zoneData.code.trim().toUpperCase();
  const id = zoneData.id || `zone-${zoneData.campusId.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${code.toLowerCase()}-${Date.now().toString(36)}`;
  
  // Auto build description if empty and stops provided
  let corridorDescription = zoneData.corridorDescription || "";
  if (!corridorDescription && zoneData.assignedStopIds && zoneData.assignedStopIds.length > 0) {
    corridorDescription = this.stops
      .filter(s => zoneData.assignedStopIds!.includes(s.id))
      .map(s => s.name)
      .join(", ");
  }

  const newZone: TransitZone = {
    ...zoneData,
    id,
    code,
    corridorDescription,
    semesterFee: Number(zoneData.semesterFee) || 0,
    installmentsAllowed: Number(zoneData.installmentsAllowed) || 3,
    isActive: zoneData.isActive ?? true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  this.transitZones = [
    ...this.transitZones.filter(z => !(z.campusId === newZone.campusId && z.code === newZone.code)),
    newZone,
  ];

  // Assign stops in local state
  if (zoneData.assignedStopIds && zoneData.assignedStopIds.length > 0) {
    this.stops = this.stops.map(s =>
      zoneData.assignedStopIds!.includes(s.id)
        ? { ...s, zoneCode: code, campusId: zoneData.campusId }
        : s
    );
  }

  this.saveToLocalStorage();
  this.notify();

  try {
    await fetch("/api/zones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newZone,
        assignedStopIds: zoneData.assignedStopIds,
      }),
    });
  } catch (e) {
    console.warn("DB createTransitZone:", e);
  }
  return newZone;
};

CampusFleetStore.prototype.updateTransitZone = async function (this: CampusFleetStore, idOrCode: string, updates: Partial<TransitZone> & { assignedStopIds?: string[] }): Promise<TransitZone | null> {
  const targetZone = this.transitZones.find(z => z.id === idOrCode || z.code === idOrCode);
  const targetCode = updates.code ? updates.code.trim().toUpperCase() : (targetZone?.code || "");
  const targetCampusId = updates.campusId || targetZone?.campusId;

  this.transitZones = this.transitZones.map(z => {
    if (z.id === idOrCode || z.code === idOrCode) {
      return {
        ...z,
        ...updates,
        code: targetCode,
        semesterFee: updates.semesterFee !== undefined ? Number(updates.semesterFee) : z.semesterFee,
        installmentsAllowed: updates.installmentsAllowed !== undefined ? Number(updates.installmentsAllowed) : z.installmentsAllowed,
        updatedAt: new Date().toISOString(),
      };
    }
    return z;
  });

  // Update stops in memory if assignedStopIds array provided
  if (updates.assignedStopIds !== undefined) {
    this.stops = this.stops.map(s => {
      if (s.campusId === targetCampusId && s.zoneCode === targetCode && !updates.assignedStopIds!.includes(s.id)) {
        return { ...s, zoneCode: undefined };
      }
      if (updates.assignedStopIds!.includes(s.id)) {
        return { ...s, zoneCode: targetCode, campusId: targetCampusId };
      }
      return s;
    });
  }

  this.saveToLocalStorage();
  this.notify();

  try {
    await fetch(`/api/zones/${targetZone?.id || idOrCode}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
  } catch (e) {
    console.warn("DB updateTransitZone:", e);
  }

  return this.transitZones.find(z => z.id === idOrCode || z.code === idOrCode) || null;
};

CampusFleetStore.prototype.deleteTransitZone = async function (this: CampusFleetStore, idOrCode: string): Promise<boolean> {
  const target = this.transitZones.find(z => z.id === idOrCode || z.code === idOrCode);
  if (!target) return false;

  this.transitZones = this.transitZones.filter(z => z.id !== idOrCode && z.code !== idOrCode);

  // Unassign stops from deleted zone
  this.stops = this.stops.map(s =>
    (s.zoneCode === target.code && (!target.campusId || s.campusId === target.campusId))
      ? { ...s, zoneCode: undefined }
      : s
  );

  this.saveToLocalStorage();
  this.notify();

  try {
    await fetch(`/api/zones/${target.id || idOrCode}`, {
      method: "DELETE",
    });
  } catch (e) {
    console.warn("DB deleteTransitZone:", e);
  }
  return true;
};

// ── Route CRUD ──────────────────────────────────────────────────────────────

CampusFleetStore.prototype.createRoute = async function (this: CampusFleetStore, routeData: Omit<Route, "id">) {
  const newRoute: Route = {
    ...routeData,
    id: `route-${Date.now()}`,
  };
  this.routes = [...this.routes, newRoute];
  this.invalidateGraphCache();
  this.saveToLocalStorage();
  this.notify();

  await serverWrite("PUT", "/api/transport-admin/routes", routePayload(newRoute), this);
  return newRoute;
};

CampusFleetStore.prototype.updateRoute = async function (this: CampusFleetStore, id: string, updates: Partial<Route>) {
  this.routes = this.routes.map(r => (r.id === id ? { ...r, ...updates } : r));
  this.invalidateGraphCache();
  this.saveToLocalStorage();
  this.notify();

  const merged = this.routes.find(r => r.id === id);
  if (merged) await serverWrite("PUT", "/api/transport-admin/routes", routePayload(merged, Boolean(updates.stops)), this);
};

CampusFleetStore.prototype.deleteRoute = async function (this: CampusFleetStore, id: string) {
  this.routes = this.routes.filter(r => r.id !== id);
  this.invalidateGraphCache();
  this.saveToLocalStorage();
  this.notify();
  await serverWrite("DELETE", `/api/transport-admin/routes?id=${encodeURIComponent(id)}`, undefined, this);
};

CampusFleetStore.prototype.allocateBusToRoute = async function (this: CampusFleetStore, busId: number, routeId: string) {
  this.buses = this.buses.map(b => (b.id === busId ? { ...b, currentRouteId: routeId } : b));
  this.notify();
  await serverWrite("PATCH", `/api/transport-admin/buses?id=${busId}`, { currentRouteId: routeId }, this);
};
// ── Trip CRUD ───────────────────────────────────────────────────────────────

CampusFleetStore.prototype.createTrip = async function (this: CampusFleetStore, tripData: Omit<Trip, "id">) {
  // Runs are created on the server (dispatch: overlap checks, audit log); the store re-syncs after.
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
  }, this);
  const newTrip: Trip = { ...tripData, id: r?.tripId || createTripId() };
  this.trips = [...this.trips, newTrip];
  this.notify();
  return newTrip;
};
CampusFleetStore.prototype.deleteTrip = async function (this: CampusFleetStore, tripId: string) {
  // Runs are cancelled, never deleted: riders' history and the audit log stay.
  await serverWrite("POST", "/api/transport-manager/dispatch", { action: "CANCEL", tripId }, this);
  this.trips = this.trips.filter(t => t.id !== tripId);
  this.notify();
};
CampusFleetStore.prototype.updateTrip = async function (this: CampusFleetStore, tripId: string, updates: Partial<Trip>) {
  this.trips = this.trips.map(t => (t.id === tripId ? { ...t, ...updates } : t));
  this.notify();

  // Local only. Trip state is written by /api/crew/trip (driver) and the dispatch board (manager).

};

// ── Telematics & Vehicle Issues ─────────────────────────────────────────────

CampusFleetStore.prototype.updateLiveLocation = function (this: CampusFleetStore, updates: Partial<LiveBusLocation>) {
  this.liveLocation = { ...this.liveLocation, ...updates, lastPingAt: new Date().toISOString() };
  // Broadcast live telemetry via Supabase Realtime WebSockets & local in-memory BroadcastChannel
  // Zero database disk writes, zero localStorage writes!
  telematicsService.broadcastLiveLocation(this.liveLocation);
  this.listeners.forEach((cb) => cb());
};

// ── Utility ─────────────────────────────────────────────────────────────────

CampusFleetStore.prototype.resetToCleanTemplate = function (this: CampusFleetStore) {
  this.syncFromSupabase();
};

CampusFleetStore.prototype.wipeAllData = function (this: CampusFleetStore) {
  this.stops = [];
  this.routes = [];
  this.buses = [];
  this.shifts = [];
  this.trips = [];
  this.students = [];
  this.staff = [];
  this.bookings = [];
  this.currentUser = null;
  this.activeChildId = "";
  void clearClientUserData();
  this.notify();
};
