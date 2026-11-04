import { CampusFleetStore } from "./_base";
import { supabase } from "../supabaseClient";
import { telematicsService } from "../telematicsService";
import { lockFinalManifest } from "../reservation-engine";
import { createTripId } from "../id";
import type {
  Bus, Route, Stop, Campus, Shift, Trip, Student, Staff,
  LiveBusLocation, VehicleIssue, NotificationItem, UserRole,
  TransitZone, SpecialShiftAllocation,
} from "../types";

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
    updateUserRole(userId: string, newRole: UserRole): Promise<void>;
    updateUserRoleLocal(userId: string, newRole: UserRole): void;
    updateStudentProfile(studentId: string, profileData: any): Promise<any>;
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
    assignTripCrew(tripId: string, driverId: string, conductorId: string): Promise<void>;
    createTrip(tripData: Omit<Trip, "id">): Promise<Trip>;
    updateTrip(tripId: string, updates: Partial<Trip>): Promise<void>;
    deleteTrip(tripId: string): Promise<void>;
    lockTripManifest(tripId: string): Trip | undefined;
    // Telematics & Vehicle Issues
    updateLiveLocation(updates: Partial<LiveBusLocation>): void;
    addVehicleIssue(issue: Omit<VehicleIssue, "id" | "reportedAt" | "status">): Promise<VehicleIssue>;
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

  if (typeof window !== "undefined") {
    try {
      await supabase.from("special_shift_allocations").insert([{
        shift_id: shiftId,
        student_id: studentId,
        trip_id: tripId || null,
        notes: notes || null,
        allocated_by: this.currentUser?.id || null,
      }]);
    } catch (err) {
      console.warn("DB special shift allocation notice:", err);
    }
  }
  return { success: true, message: "Student allocated successfully" };
};

CampusFleetStore.prototype.removeStudentFromSpecialShift = async function (this: CampusFleetStore, shiftId: string, studentId: string) {
  this.specialShiftAllocations = this.specialShiftAllocations.filter(
    a => !(a.shiftId === shiftId && a.studentId === studentId)
  );
  this.notify();

  if (typeof window !== "undefined") {
    try {
      await supabase
        .from("special_shift_allocations")
        .delete()
        .match({ shift_id: shiftId, student_id: studentId });
    } catch (err) {
      console.warn("DB special shift deallocation notice:", err);
    }
  }
  return { success: true, message: "Student allocation removed" };
};

// ── User & Student CRUD ─────────────────────────────────────────────────────

CampusFleetStore.prototype.updateUserRole = async function (this: CampusFleetStore, userId: string, newRole: UserRole) {
  this.updateUserRoleLocal(userId, newRole);
  try {
    await supabase.from("users").update({ role: newRole }).eq("id", userId);
  } catch (e) {
    console.warn("Supabase user role update error (RLS expected — API handles this):", e);
  }
};

/** Local-only role update — use when the API has already persisted to DB. */
CampusFleetStore.prototype.updateUserRoleLocal = function (this: CampusFleetStore, userId: string, newRole: UserRole) {
  this.users = this.users.map(u => (u.id === userId ? { ...u, role: newRole } : u));
  if (this.currentUser && this.currentUser.id === userId) {
    this.currentUser = { ...this.currentUser, role: newRole };
  }
  this.saveToLocalStorage();
  this.notify();
};

CampusFleetStore.prototype.updateStudentProfile = async function (
  this: CampusFleetStore,
  studentId: string,
  profileData: {
    fullName?: string;
    campusId?: string;
    campus?: string;
    department?: string;
    semester?: string;
    classId?: string;
    className?: string;
    zoneCode?: string;
    phone?: string;
    emergencyContact?: { name: string; relationship: string; phone: string };
    photoUrl?: string;
    performedByStaff?: boolean;
    studentIdCode?: string;
    primaryStopId?: string;
    primaryRouteId?: string;
    homeLatitude?: number;
    homeLongitude?: number;
    homeAddress?: string;
    autoAssignedStopId?: string;
  }
) {
  let student = this.students.find(s => s.id === studentId || s.userId === studentId || s.email?.toLowerCase() === this.currentUser?.email?.toLowerCase());

  const resolvedCampusId = profileData.campusId || (profileData.campus ? (this.campuses.find(c => c.name === profileData.campus || c.id === profileData.campus)?.id || profileData.campus) : undefined);
  const resolvedCampusName = profileData.campus || (resolvedCampusId ? this.campuses.find(c => c.id === resolvedCampusId)?.name : "") || this.getPrimaryCampus()?.name || "";
  const resolvedStudentIdCode = (profileData.studentIdCode || "").trim().toUpperCase() || undefined;

  if (!student) {
    const u = this.currentUser;
    const targetId = studentId || (u?.id ? `stud-${u.id}` : crypto.randomUUID());
    // Compute fee from zone — never hardcode 0 for a new student
    const zoneCode = profileData.zoneCode || "ZONE_B";
    const zoneFee = this.transitZones.find(z => z.code === zoneCode)?.semesterFee || 12000;
    student = {
      id: targetId,
      userId: u?.id || studentId,
      fullName: profileData.fullName || u?.fullName || "",
      email: u?.email || "",
      phone: profileData.phone || "",
      department: profileData.department || "",
      semester: profileData.semester || "",
      campusId: resolvedCampusId || u?.campusId || this.getPrimaryCampus()?.id || "",
      campus: resolvedCampusName || (u as any)?.campus || "",
      primaryStopId: profileData.primaryStopId || "",
      primaryRouteId: "",
      emergencyContact: profileData.emergencyContact || { name: "", relationship: "", phone: "" },
      transportAccessSuspended: false,
      hasActiveSubscription: false,
      subscriptionExpiryDate: "2026-12-31",
      zoneCode,
      paymentStatus: "UNPAID",
      totalFeeDue: zoneFee,
      totalFeePaid: 0,
      photoUrl: profileData.photoUrl || "",
      photoLocked: false,
      studentIdCode: resolvedStudentIdCode,
    };
    this.students.push(student);
  }

  // Anti-fraud guardrail: if student has active/approved subscription and photo is locked, deny overwrite unless staff
  const isApproved = student.paymentStatus === "APPROVED" || Boolean(student.hasActiveSubscription);
  let targetPhotoUrl = student.photoUrl;
  let targetPhotoLocked = Boolean(isApproved && student.photoLocked);
  if (profileData.photoUrl && profileData.photoUrl !== student.photoUrl) {
    if (targetPhotoLocked && !profileData.performedByStaff) {
      return {
        success: false,
        message: "Official identity photo is locked after payment approval. Only campus transport staff can update your verification photo.",
      };
    }
    targetPhotoUrl = profileData.photoUrl;
    targetPhotoLocked = isApproved;
  }

  // Recompute fee if zone changed, otherwise preserve existing fee/payment state
  const newZoneCode = profileData.zoneCode || student.zoneCode || "ZONE_B";
  const zoneChanged = newZoneCode !== student.zoneCode;
  const newZoneFee = this.transitZones.find(z => z.code === newZoneCode)?.semesterFee;
  const preservedFeeDue = zoneChanged && newZoneFee
    ? newZoneFee
    : (student.totalFeeDue && student.totalFeeDue > 0 ? student.totalFeeDue : (newZoneFee || 12000));

  const updatedStudent: Student = {
    ...student,
    fullName: profileData.fullName || student.fullName,
    campusId: resolvedCampusId || student.campusId || this.getPrimaryCampus()?.id || "",
    campus: resolvedCampusName || student.campus || this.getPrimaryCampus()?.name || "",
    department: profileData.department || student.department,
    semester: profileData.semester || student.semester,
    classId: profileData.classId || student.classId,
    className: profileData.className || student.className,
    zoneCode: newZoneCode,
    phone: profileData.phone || student.phone,
    primaryStopId: profileData.primaryStopId || student.primaryStopId,
    emergencyContact: profileData.emergencyContact || student.emergencyContact,
    photoUrl: targetPhotoUrl,
    photoLocked: targetPhotoLocked,
    studentIdCode: resolvedStudentIdCode || student.studentIdCode,
    // Preserve all payment & subscription fields — never overwrite with defaults
    totalFeeDue: preservedFeeDue,
    totalFeePaid: student.totalFeePaid || 0,
    paymentStatus: student.paymentStatus || "UNPAID",
    hasActiveSubscription: student.hasActiveSubscription || false,
    subscriptionExpiryDate: student.subscriptionExpiryDate,
    transportAccessSuspended: student.transportAccessSuspended || false,
  };

  this.students = this.students.map(s => s.id === student!.id ? updatedStudent : s);
  
  // Also update users table entry
  this.users = this.users.map(u => (u.id === student!.userId || u.email?.toLowerCase() === student!.email?.toLowerCase()) ? {
    ...u,
    fullName: updatedStudent.fullName,
    phone: updatedStudent.phone,
    campusId: updatedStudent.campusId,
    campus: updatedStudent.campus,
    avatarUrl: updatedStudent.photoUrl || (u as any).avatarUrl,
  } : u);

  if (this.currentUser && (this.currentUser.id === student.userId || this.currentUser.email?.toLowerCase() === student.email?.toLowerCase())) {
    this.currentUser = {
      ...this.currentUser,
      fullName: updatedStudent.fullName,
      studentId: updatedStudent.id,
      campusId: updatedStudent.campusId,
      campus: updatedStudent.campus,
      avatarUrl: (this.currentUser as any).avatarUrl,
    };
  }

  this.saveToLocalStorage();
  this.notify();

  // Persist via Server API (using supabaseAdmin for guaranteed privileges)
  try {
    if (typeof window !== "undefined") {
      const res = await fetch("/api/students/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: updatedStudent.id,
          fullName: updatedStudent.fullName,
          campusId: updatedStudent.campusId,
          campus: updatedStudent.campus,
          department: updatedStudent.department,
          semester: updatedStudent.semester,
          classId: updatedStudent.classId,
          className: updatedStudent.className,
          zoneCode: updatedStudent.zoneCode,
          phone: updatedStudent.phone,
          primaryStopId: updatedStudent.primaryStopId,
          emergencyContact: updatedStudent.emergencyContact,
          photoUrl: updatedStudent.photoUrl,
          performedByStaff: profileData.performedByStaff || false,
          studentIdCode: updatedStudent.studentIdCode,
          homeLatitude: profileData.homeLatitude,
          homeLongitude: profileData.homeLongitude,
          homeAddress: profileData.homeAddress,
          autoAssignedStopId: profileData.autoAssignedStopId,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        console.error("API /api/students/profile failed:", errJson);
        return { success: false, message: errJson?.error || "Failed to save profile to database." };
      }
    }
  } catch (apiErr: any) {
    console.warn("API /api/students/profile error:", apiErr);
  }

  // Secondary client-side fallback
  try {
    const studentPayload: Record<string, any> = {
      id: updatedStudent.id,
      user_id: updatedStudent.userId,
      full_name: updatedStudent.fullName,
      student_id_code: updatedStudent.studentIdCode || null,
      semester: updatedStudent.semester,
      class_id: updatedStudent.classId || null,
      campus_id: updatedStudent.campusId || null,
      campus: updatedStudent.campus,
      primary_stop_id: updatedStudent.primaryStopId || null,
      primary_route_id: updatedStudent.primaryRouteId || null,
      emergency_contact: updatedStudent.emergencyContact,
      photo_locked: updatedStudent.photoLocked || false,
    };
    if (updatedStudent.zoneId) {
      studentPayload.zone_id = updatedStudent.zoneId;
    }
    await supabase.from("students").upsert(studentPayload, { onConflict: "user_id" });

    if (updatedStudent.userId) {
      await supabase.from("users").update({
        full_name: updatedStudent.fullName,
        phone: updatedStudent.phone,
        campus_id: updatedStudent.campusId || null,
        photo_url: updatedStudent.photoUrl || null,
        photo_locked: updatedStudent.photoLocked || false,
      }).eq("id", updatedStudent.userId);
    }
  } catch (e) {
    console.warn("DB updateStudentProfile notice:", e);
  }

  return { success: true, message: "Profile successfully saved to institutional database." };
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
        totalFeePaid: s.totalFeeDue || s.totalFeePaid || 12000,
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
  try {
    const { data } = await supabase.from("buses").insert({
      bus_number: busData.busNumber,
      registration_no: busData.registrationNo,
      model: busData.model,
      capacity: busData.capacity,
      seat_layout: busData.seatLayout,
      total_rows: busData.totalRows,
      status: busData.status,
      gps_device_id: busData.gpsDeviceId,
      current_route_id: busData.currentRouteId,
    }).select("id").single();
    if (data?.id) dbInsertedId = Number(data.id);
  } catch (e) { console.warn("DB createBus:", e); }

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

  try {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.busNumber !== undefined) dbUpdates.bus_number = updates.busNumber;
    if (updates.registrationNo) dbUpdates.registration_no = updates.registrationNo;
    if (updates.model) dbUpdates.model = updates.model;
    if (updates.capacity !== undefined) dbUpdates.capacity = updates.capacity;
    if (updates.seatLayout) dbUpdates.seat_layout = updates.seatLayout;
    if (updates.totalRows !== undefined) dbUpdates.total_rows = updates.totalRows;
    if (updates.status) dbUpdates.status = updates.status;
    if (updates.currentRouteId !== undefined) dbUpdates.current_route_id = updates.currentRouteId;
    if (Object.keys(dbUpdates).length > 0) {
      await supabase.from("buses").update(dbUpdates).eq("id", id);
    }
  } catch (e) { console.warn("DB updateBus:", e); }
};

CampusFleetStore.prototype.deleteBus = async function (this: CampusFleetStore, id: number) {
  this.buses = this.buses.filter(b => b.id !== id);
  this.notify();
  try { await supabase.from("buses").delete().eq("id", id); } catch (e) { console.warn("DB deleteBus:", e); }
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

  try {
    await supabase.from("stops").upsert({
      id: newStop.id,
      name: newStop.name,
      code: newStop.code,
      latitude: newStop.latitude,
      longitude: newStop.longitude,
      landmark: newStop.landmark,
      geofence_radius: newStop.geofenceRadiusMeters,
      campus_id: newStop.campusId || null,
      is_bus_merge_stop: Boolean(newStop.isBusMergeStop),
    });
  } catch (e) {
    console.warn("DB createStop:", e);
  }
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

  try {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name) dbUpdates.name = updates.name;
    if (updates.code) dbUpdates.code = updates.code;
    if (updates.latitude !== undefined) dbUpdates.latitude = updates.latitude;
    if (updates.longitude !== undefined) dbUpdates.longitude = updates.longitude;
    if (updates.landmark !== undefined) dbUpdates.landmark = updates.landmark;
    if (updates.geofenceRadiusMeters !== undefined) dbUpdates.geofence_radius = updates.geofenceRadiusMeters;
    if (updates.campusId !== undefined) dbUpdates.campus_id = updates.campusId;
    if (updates.isBusMergeStop !== undefined) dbUpdates.is_bus_merge_stop = Boolean(updates.isBusMergeStop);

    if (Object.keys(dbUpdates).length > 0) {
      await supabase.from("stops").update(dbUpdates).eq("id", id);
    }
  } catch (e) {
    console.warn("DB updateStop:", e);
  }
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

  try {
    await supabase.from("stops").delete().eq("id", id);
    await supabase.from("route_stops").delete().eq("stop_id", id);
  } catch (e) {
    console.warn("DB deleteStop:", e);
  }
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

  try {
    if (newCampus.isPrimary) {
      await supabase.from("campuses").update({ is_primary: false }).neq("id", id);
    }
    await supabase.from("campuses").upsert({
      id: newCampus.id,
      name: newCampus.name,
      code: newCampus.code,
      address: newCampus.address,
      landmark: newCampus.landmark,
      latitude: newCampus.latitude,
      longitude: newCampus.longitude,
      geofence_radius: newCampus.geofenceRadiusMeters,
      fleet_capacity: newCampus.fleetCapacity,
      parking_bays: newCampus.parkingBays,
      contact_phone: newCampus.contactPhone,
      contact_email: newCampus.contactEmail,
      is_primary: newCampus.isPrimary,
      is_active: newCampus.isActive,
    });
  } catch (e) {
    console.warn("DB createCampus:", e);
  }
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

  try {
    if (updates.isPrimary) {
      await supabase.from("campuses").update({ is_primary: false }).neq("id", id);
    }

    const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.code !== undefined) dbUpdates.code = updates.code;
    if (updates.address !== undefined) dbUpdates.address = updates.address;
    if (updates.landmark !== undefined) dbUpdates.landmark = updates.landmark;
    if (updates.latitude !== undefined) dbUpdates.latitude = updates.latitude;
    if (updates.longitude !== undefined) dbUpdates.longitude = updates.longitude;
    if (updates.geofenceRadiusMeters !== undefined) dbUpdates.geofence_radius = updates.geofenceRadiusMeters;
    if (updates.fleetCapacity !== undefined) dbUpdates.fleet_capacity = updates.fleetCapacity;
    if (updates.parkingBays !== undefined) dbUpdates.parking_bays = updates.parkingBays;
    if (updates.contactPhone !== undefined) dbUpdates.contact_phone = updates.contactPhone;
    if (updates.contactEmail !== undefined) dbUpdates.contact_email = updates.contactEmail;
    if (updates.isPrimary !== undefined) dbUpdates.is_primary = updates.isPrimary;
    if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

    if (Object.keys(dbUpdates).length > 0) {
      await supabase.from("campuses").update(dbUpdates).eq("id", id);
    }

    const updated = this.campuses.find(c => c.id === id);
    if (updated && (updated.isPrimary || updated.code === "GEHU-BHT")) {
      await supabase.from("stops").update({
        name: `${updated.name} Terminal`,
        latitude: updated.latitude,
        longitude: updated.longitude,
        landmark: updated.landmark || updated.address,
        geofence_radius: updated.geofenceRadiusMeters,
      }).or(`id.eq.stop-bhimtal-campus,code.eq.${updated.code}`);
    }
  } catch (e) {
    console.warn("DB updateCampus:", e);
  }
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

  try {
    await supabase.from("campuses").delete().eq("id", id);
    if (target.isPrimary && this.campuses.length > 0) {
      await supabase.from("campuses").update({ is_primary: true }).eq("id", this.campuses[0].id);
    }
    return true;
  } catch (e) {
    console.warn("DB deleteCampus:", e);
    return false;
  }
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

  try {
    // 1. Insert into routes table with stops_data JSONB
    await supabase.from("routes").upsert({
      id: newRoute.id,
      code: newRoute.code,
      name: newRoute.name,
      description: newRoute.description,
      direction: newRoute.direction,
      color: newRoute.color,
      total_distance_km: newRoute.totalDistanceKm,
      estimated_duration_mins: newRoute.estimatedDurationMins,
      is_active: newRoute.isActive,
    });

    // 2. Insert into route_stops
    if (newRoute.stops && newRoute.stops.length > 0) {
      const routeStopsEntries = newRoute.stops.map(rs => ({
        route_id: newRoute.id,
        stop_id: rs.stopId,
        stop_order: rs.stopOrder,
        arrival_offset_minutes: rs.arrivalOffsetMinutes,
        buffer_time_minutes: rs.bufferTimeMinutes,
      }));
      await supabase.from("route_stops").insert(routeStopsEntries);
    }
  } catch (e) {
    console.warn("DB createRoute:", e);
  }
  return newRoute;
};

CampusFleetStore.prototype.updateRoute = async function (this: CampusFleetStore, id: string, updates: Partial<Route>) {
  this.routes = this.routes.map(r => (r.id === id ? { ...r, ...updates } : r));
  this.invalidateGraphCache();
  this.saveToLocalStorage();
  this.notify();

  try {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name) dbUpdates.name = updates.name;
    if (updates.code) dbUpdates.code = updates.code;
    if (updates.description) dbUpdates.description = updates.description;
    if (updates.direction) dbUpdates.direction = updates.direction;
    if (updates.color) dbUpdates.color = updates.color;
    if (updates.totalDistanceKm !== undefined) dbUpdates.total_distance_km = updates.totalDistanceKm;
    if (updates.estimatedDurationMins !== undefined) dbUpdates.estimated_duration_mins = updates.estimatedDurationMins;
    if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

    if (Object.keys(dbUpdates).length > 0) {
      await supabase.from("routes").update(dbUpdates).eq("id", id);
    }

    // Re-sync relational route_stops if stops were updated
    if (updates.stops && updates.stops.length > 0) {
      await supabase.from("route_stops").delete().eq("route_id", id);
      const routeStopsEntries = updates.stops.map(rs => ({
        route_id: id,
        stop_id: rs.stopId,
        stop_order: rs.stopOrder,
        arrival_offset_minutes: rs.arrivalOffsetMinutes,
        buffer_time_minutes: rs.bufferTimeMinutes,
      }));
      await supabase.from("route_stops").insert(routeStopsEntries);
    }
  } catch (e) {
    console.warn("DB updateRoute:", e);
  }
};

CampusFleetStore.prototype.deleteRoute = async function (this: CampusFleetStore, id: string) {
  this.routes = this.routes.filter(r => r.id !== id);
  this.invalidateGraphCache();
  this.saveToLocalStorage();
  this.notify();
  try {
    await supabase.from("routes").delete().eq("id", id);
    await supabase.from("route_stops").delete().eq("route_id", id);
  } catch (e) {
    console.warn("DB deleteRoute:", e);
  }
};

CampusFleetStore.prototype.allocateBusToRoute = async function (this: CampusFleetStore, busId: number, routeId: string) {
  this.buses = this.buses.map(b => (b.id === busId ? { ...b, currentRouteId: routeId } : b));
  this.notify();
  try { await supabase.from("buses").update({ current_route_id: routeId }).eq("id", busId); } catch (e) { console.warn("DB allocate:", e); }
};

// ── Trip CRUD ───────────────────────────────────────────────────────────────

CampusFleetStore.prototype.assignTripCrew = async function (this: CampusFleetStore, tripId: string, driverId: string, conductorId: string) {
  this.trips = this.trips.map(t => (t.id === tripId ? { ...t, driverId, conductorId } : t));
  this.notify();
  try {
    await supabase.from("trips").update({
      driver_id: driverId,
      conductor_id: conductorId,
    }).eq("id", tripId);
  } catch (e) {
    console.warn("DB assignTripCrew error:", e);
  }
};

CampusFleetStore.prototype.createTrip = async function (this: CampusFleetStore, tripData: Omit<Trip, "id">) {
  const newTrip: Trip = {
    ...tripData,
    id: createTripId(),
  };
  this.trips = [...this.trips, newTrip];
  this.notify();

  try {
    const payload: any = {
      id: newTrip.id,
      trip_code: newTrip.tripCode,
      route_id: newTrip.routeId,
      bus_id: newTrip.busId,
      shift_id: newTrip.shiftId,
      driver_id: newTrip.driverId,
      conductor_id: newTrip.conductorId,
      trip_date: newTrip.tripDate,
      status: newTrip.status,
      current_stop_index: newTrip.currentStopIndex ?? 0,
    };
    if (newTrip.isSpecial !== undefined) payload.is_special = newTrip.isSpecial;
    if (newTrip.facilityType) payload.facility_type = newTrip.facilityType;

    await supabase.from("trips").insert(payload);
  } catch (e) { console.warn("DB createTrip:", e); }
  return newTrip;
};

CampusFleetStore.prototype.deleteTrip = async function (this: CampusFleetStore, tripId: string) {
  this.trips = this.trips.filter(t => t.id !== tripId);
  this.notify();
  try {
    await supabase.from("trips").delete().eq("id", tripId);
  } catch (e) { console.warn("DB deleteTrip:", e); }
};

CampusFleetStore.prototype.lockTripManifest = function (this: CampusFleetStore, tripId: string) {
  const trip = this.trips.find(t => t.id === tripId);
  if (!trip) return;
  const updatedTrip = lockFinalManifest(trip);
  this.trips = this.trips.map(t => (t.id === tripId ? updatedTrip : t));
  this.notify();
  return updatedTrip;
};

CampusFleetStore.prototype.updateTrip = async function (this: CampusFleetStore, tripId: string, updates: Partial<Trip>) {
  this.trips = this.trips.map(t => (t.id === tripId ? { ...t, ...updates } : t));
  this.notify();

  try {
    const dbUpdates: Record<string, any> = {};
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.startedAt !== undefined) dbUpdates.started_at = updates.startedAt;
    if (updates.completedAt !== undefined) dbUpdates.completed_at = updates.completedAt;
    if (updates.currentStopIndex !== undefined) dbUpdates.current_stop_index = updates.currentStopIndex;
    if (updates.delayMinutes !== undefined) dbUpdates.delay_minutes = updates.delayMinutes;
    if (updates.driverId !== undefined) dbUpdates.driver_id = updates.driverId;
    if (updates.conductorId !== undefined) dbUpdates.conductor_id = updates.conductorId;
    if (updates.busId !== undefined) dbUpdates.bus_id = updates.busId;

    if (Object.keys(dbUpdates).length > 0) {
      await supabase.from("trips").update(dbUpdates).eq("id", tripId);
    }
  } catch (e) {
    console.warn("DB updateTrip error:", e);
  }
};

// ── Telematics & Vehicle Issues ─────────────────────────────────────────────

CampusFleetStore.prototype.updateLiveLocation = function (this: CampusFleetStore, updates: Partial<LiveBusLocation>) {
  this.liveLocation = { ...this.liveLocation, ...updates, lastPingAt: new Date().toISOString() };
  // Broadcast live telemetry via Supabase Realtime WebSockets & local in-memory BroadcastChannel
  // Zero database disk writes, zero localStorage writes!
  telematicsService.broadcastLiveLocation(this.liveLocation);
  this.listeners.forEach((cb) => cb());
};

CampusFleetStore.prototype.addVehicleIssue = async function (this: CampusFleetStore, issue: Omit<VehicleIssue, "id" | "reportedAt" | "status">) {
  const newIssue: VehicleIssue = {
    ...issue,
    id: `issue-${Date.now()}`,
    reportedAt: new Date().toISOString(),
    status: "OPEN",
  };
  this.issues = [newIssue, ...this.issues];
  this.notify();

  // Persist to PostgreSQL database (Single Source of Truth)
  try {
    await supabase.from("vehicle_issues").insert({
      id: newIssue.id,
      bus_id: newIssue.busId,
      reported_by: newIssue.reportedBy,
      issue_type: newIssue.issueType,
      severity: newIssue.severity,
      description: newIssue.description,
      status: newIssue.status,
      latitude: newIssue.location?.latitude || null,
      longitude: newIssue.location?.longitude || null,
      reported_at: newIssue.reportedAt,
    });

    // If severe breakdown or emergency, set vehicle to MAINTENANCE and record maintenance log
    if (newIssue.issueType === "BREAKDOWN" || newIssue.severity === "HIGH" || newIssue.severity === "CRITICAL") {
      await supabase.from("buses").update({ status: "MAINTENANCE" }).eq("id", newIssue.busId);
      await supabase.from("maintenance_logs").insert({
        bus_id: newIssue.busId,
        maintenance_type: `EMERGENCY_REPAIR_${newIssue.issueType}`,
        service_date: new Date().toISOString().split("T")[0],
        status: "Under Maintenance",
        notes: `Driver incident report: ${newIssue.description}`,
        cost: 0,
        created_by: newIssue.reportedBy,
      });
    }

    // Log institutional audit trail
    await supabase.from("audit_logs").insert({
      user_role: "driver",
      action: "DRIVER_REPORT_VEHICLE_ISSUE",
      entity: "Bus",
      entity_id: newIssue.busId,
      reason: `${newIssue.issueType} (${newIssue.severity}): ${newIssue.description}`,
      new_value: newIssue,
    });
  } catch (err) {
    console.warn("Error persisting vehicle issue to PostgreSQL:", err);
  }

  return newIssue;
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
  if (typeof window !== "undefined") {
    localStorage.clear();
  }
  this.notify();
};
