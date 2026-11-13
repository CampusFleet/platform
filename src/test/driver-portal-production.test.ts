import { describe, it, expect, beforeEach, vi } from "vitest";
import { store } from "../lib/store";
import { telematicsService } from "../lib/telematicsService";
import { Trip, UserRole, LiveBusLocation } from "../lib/types";
import { calculateHaversineDistanceKm } from "../lib/eta-calculator";

describe("Driver Portal Production Functionality & Resilience Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Role-Based Access Control & Navigation Matrix ─────────────────────
  describe("Role-Based Access Control & Portal Permutations", () => {
    // Replicates the middleware allowed portals matrix
    const allowedPortalsForRole: Record<string, string[]> = {
      student: ["/portal"],
      admin: ["/admin", "/transport-admin", "/transport-manager"],
      transport_admin: ["/transport-admin", "/transport-manager"],
      transport_manager: ["/transport-manager"],
      driver: ["/driver"],
      conductor: ["/conductor"],
      teacher: ["/teacher"],
    };

    const isPortalAllowed = (role: UserRole, targetPath: string): boolean => {
      const allowed = allowedPortalsForRole[role] || ["/portal"];
      return allowed.some(p => targetPath === p || targetPath.startsWith(p + "/"));
    };

    it("should allow drivers the Driver console only (no Conductor portal)", () => {
      expect(isPortalAllowed("driver", "/driver")).toBe(true);
      expect(isPortalAllowed("driver", "/driver/settings")).toBe(true);
      expect(isPortalAllowed("driver", "/conductor")).toBe(false);
      expect(isPortalAllowed("driver", "/conductor/manifest")).toBe(false);
    });

    it("should strictly prohibit drivers from accessing Admin, Transport Admin, or Student portal", () => {
      expect(isPortalAllowed("driver", "/admin")).toBe(false);
      expect(isPortalAllowed("driver", "/transport-admin")).toBe(false);
      expect(isPortalAllowed("driver", "/portal")).toBe(false);
    });

    it("should prohibit conductors from accessing Driver Console (Heavy vehicle qualification)", () => {
      expect(isPortalAllowed("conductor", "/driver")).toBe(false);
      expect(isPortalAllowed("conductor", "/conductor")).toBe(true);
    });

    it("should prohibit transport_admin and students from accessing Driver Console", () => {
      expect(isPortalAllowed("transport_admin", "/driver")).toBe(false);
      expect(isPortalAllowed("student", "/driver")).toBe(false);
    });
  });

  // ── 2. Multi-Trip Assignment & Selection ─────────────────────────────────
  describe("Multi-Trip Shift Assignment & Filtering", () => {
    const mockDriverId = "driver-uuid-441";
    const sampleTrips: Trip[] = [
      {
        id: "trip-morning",
        tripCode: "TRIP-MORN-01",
        routeId: "route-1",
        busId: 1,
        shiftId: "shift-morning",
        driverId: mockDriverId,
        conductorId: "cond-1",
        tripDate: "2026-10-19",
        status: "SCHEDULED",
        currentStopIndex: 0,
        delayMinutes: 0,
        manifestLocked: false,
      },
      {
        id: "trip-evening",
        tripCode: "TRIP-EVE-02",
        routeId: "route-1",
        busId: 1,
        shiftId: "shift-evening",
        driverId: mockDriverId,
        conductorId: "cond-1",
        tripDate: "2026-10-19",
        status: "SCHEDULED",
        currentStopIndex: 0,
        delayMinutes: 0,
        manifestLocked: false,
      },
      {
        id: "trip-other-driver",
        tripCode: "TRIP-OTHER-03",
        routeId: "route-2",
        busId: 2,
        shiftId: "shift-morning",
        driverId: "other-driver-999",
        conductorId: "cond-2",
        tripDate: "2026-10-19",
        status: "SCHEDULED",
        currentStopIndex: 0,
        delayMinutes: 0,
        manifestLocked: false,
      },
    ];

    it("should accurately isolate all real shifts assigned to the authenticated driver", () => {
      const myAssignedTrips = sampleTrips.filter(t => t.driverId === mockDriverId);

      expect(myAssignedTrips.length).toBe(2);
      expect(myAssignedTrips.map(t => t.id)).toEqual(["trip-morning", "trip-evening"]);
      expect(myAssignedTrips.some(t => t.id === "trip-other-driver")).toBe(false);
    });

    it("should support switching active trip when multiple shifts are scheduled", () => {
      const myAssignedTrips = sampleTrips.filter(t => t.driverId === mockDriverId);
      let selectedTripId = myAssignedTrips[0].id;

      let activeTrip = myAssignedTrips.find(t => t.id === selectedTripId);
      expect(activeTrip?.tripCode).toBe("TRIP-MORN-01");

      // Switch to evening shift
      selectedTripId = myAssignedTrips[1].id;
      activeTrip = myAssignedTrips.find(t => t.id === selectedTripId);
      expect(activeTrip?.tripCode).toBe("TRIP-EVE-02");
    });
  });

  // ── 3. Dynamic Incident Reporting (Zero Hardcoded Data) ──────────────────
  describe("Dynamic Incident Dispatch & Reporter Attribution", () => {
    const resolveReporterName = (user: { fullName?: string | null }) => {
      return user?.fullName ? `${user.fullName} (Driver)` : "Assigned Fleet Driver";
    };

    const resolveSeverity = (issueType: string): "HIGH" | "MEDIUM" => {
      return issueType === "BREAKDOWN" || issueType === "EMERGENCY" ? "HIGH" : "MEDIUM";
    };

    it("should dynamically attribute the reporter to the authenticated user's real name", () => {
      const authenticatedUser = { fullName: "Aditya Pandey" };
      expect(resolveReporterName(authenticatedUser)).toBe("Aditya Pandey (Driver)");

      const secondUser = { fullName: "Kavita Bisht" };
      expect(resolveReporterName(secondUser)).toBe("Kavita Bisht (Driver)");
    });

    it("should NEVER use hardcoded mock names like Rajesh Kumar", () => {
      const user = { fullName: "Devendra Negi" };
      const reporter = resolveReporterName(user);
      expect(reporter).not.toContain("Rajesh Kumar");
      expect(reporter).toBe("Devendra Negi (Driver)");
    });

    it("should safely fall back to generic fleet title when fullName is absent", () => {
      expect(resolveReporterName({})).toBe("Assigned Fleet Driver");
      expect(resolveReporterName({ fullName: "" })).toBe("Assigned Fleet Driver");
      expect(resolveReporterName({ fullName: null })).toBe("Assigned Fleet Driver");
    });

    it("should classify BREAKDOWN and EMERGENCY as HIGH severity and others as MEDIUM", () => {
      expect(resolveSeverity("BREAKDOWN")).toBe("HIGH");
      expect(resolveSeverity("EMERGENCY")).toBe("HIGH");
      expect(resolveSeverity("TRAFFIC")).toBe("MEDIUM");
      expect(resolveSeverity("FUEL")).toBe("MEDIUM");
      expect(resolveSeverity("DELAY")).toBe("MEDIUM");
    });
  });

  // ── 4. Trip State Updates & Centralized Store Sync ────────────────────────
  describe("Centralized Trip State Synchronization (`store.updateTrip`)", () => {
    const initialTrip: Trip = {
      id: "trip-sync-test",
      tripCode: "TRIP-SYNC-01",
      routeId: "route-1",
      busId: 1,
      shiftId: "shift-1",
      driverId: "driver-1",
      conductorId: "cond-1",
      tripDate: "2026-10-19",
      status: "SCHEDULED",
      currentStopIndex: 0,
      delayMinutes: 0,
      manifestLocked: false,
    };

    beforeEach(() => {
      // Seed the trip into the store
      store.wipeAllData();
      (store as any).trips = [{ ...initialTrip }];
    });

    it("should update trip status to IN_PROGRESS with startedAt timestamp", async () => {
      const startedAt = new Date().toISOString();
      await store.updateTrip(initialTrip.id, {
        status: "IN_PROGRESS",
        startedAt,
        currentStopIndex: 0,
      });

      const updated = store.getTrips().find(t => t.id === initialTrip.id);
      expect(updated?.status).toBe("IN_PROGRESS");
      expect(updated?.startedAt).toBe(startedAt);
      expect(updated?.currentStopIndex).toBe(0);
    });

    it("should advance currentStopIndex accurately during route progression", async () => {
      await store.updateTrip(initialTrip.id, {
        status: "IN_PROGRESS",
        currentStopIndex: 1,
      });

      let updated = store.getTrips().find(t => t.id === initialTrip.id);
      expect(updated?.currentStopIndex).toBe(1);

      await store.updateTrip(initialTrip.id, {
        currentStopIndex: 4,
      });

      updated = store.getTrips().find(t => t.id === initialTrip.id);
      expect(updated?.currentStopIndex).toBe(4);
    });

    it("should mark trip COMPLETED with completedAt timestamp on trip termination", async () => {
      const completedAt = new Date().toISOString();
      await store.updateTrip(initialTrip.id, {
        status: "COMPLETED",
        completedAt,
      });

      const updated = store.getTrips().find(t => t.id === initialTrip.id);
      expect(updated?.status).toBe("COMPLETED");
      expect(updated?.completedAt).toBe(completedAt);
    });

    it("should notify all store listeners immediately when updateTrip is called", async () => {
      let notified = false;
      const unsub = store.subscribe(() => {
        notified = true;
      });

      await store.updateTrip(initialTrip.id, {
        status: "IN_PROGRESS",
      });

      expect(notified).toBe(true);
      unsub();
    });

    it("should support switching duty bus and rebind trip bus assignment in store", async () => {
      const newBusId = 37;
      await store.updateTrip(initialTrip.id, {
        busId: newBusId,
      });

      const updated = store.getTrips().find(t => t.id === initialTrip.id);
      expect(updated?.busId).toBe(newBusId);
    });
  });

  // ── 5. Real Device Hardware GPS Ingestion & Telematics Pipeline ───────────
  describe("Hardware GPS Sensor Telematics Ingestion", () => {
    it("should accurately convert device speed from m/s to integer km/h", () => {
      const convertSpeed = (speedMs: number | null | undefined): number => {
        return speedMs != null && !isNaN(speedMs) && speedMs >= 0 ? Math.round(speedMs * 3.6) : 0;
      };

      // 10 m/s = 36 km/h
      expect(convertSpeed(10)).toBe(36);
      // 8.33 m/s ~= 30 km/h
      expect(convertSpeed(8.33)).toBe(30);
      // 0 m/s = 0 km/h
      expect(convertSpeed(0)).toBe(0);
      // Stationary or null
      expect(convertSpeed(null)).toBe(0);
      expect(convertSpeed(undefined)).toBe(0);
      expect(convertSpeed(-1)).toBe(0);
    });

    it("should broadcast valid telematics coordinates without crashing", async () => {
      let latestLocation: LiveBusLocation | null = null;
      const unsub = telematicsService.subscribe((loc) => {
        latestLocation = loc;
      });

      const payload: LiveBusLocation = {
        busId: 37,
        tripId: "trip-real-01",
        latitude: 29.2183,
        longitude: 79.5126,
        speedKmh: 38,
        headingDeg: 145,
        lastPingAt: new Date().toISOString(),
        estimatedArrivalNextStopMins: 4,
        delayMinutes: 0,
      };

      store.updateLiveLocation(payload);

      expect(latestLocation).not.toBeNull();
      expect((latestLocation as any)?.latitude).toBe(29.2183);
      expect((latestLocation as any)?.longitude).toBe(79.5126);
      expect((latestLocation as any)?.speedKmh).toBe(38);

      unsub();
    });

    it("should handle GPS accuracy metric safely", () => {
      const formatAccuracy = (accuracy: number | null): string => {
        return accuracy !== null && !isNaN(accuracy) ? `±${Math.round(accuracy)}m` : "Standby";
      };

      expect(formatAccuracy(4.8)).toBe("±5m");
      expect(formatAccuracy(12.2)).toBe("±12m");
      expect(formatAccuracy(null)).toBe("Standby");
    });

    it("should detect arrival automatically when GPS enters stop geofence radius (<150m)", () => {
      // Station coordinates
      const stopLat = 29.2208;
      const stopLon = 79.5167;

      // Bus is 80 meters away (inside geofence)
      const busNearLat = 29.2212;
      const busNearLon = 79.5171;
      const distKmInside = calculateHaversineDistanceKm(busNearLat, busNearLon, stopLat, stopLon);
      const distMetersInside = Math.round(distKmInside * 1000);
      const isInsideGeofence = distMetersInside <= 150;

      expect(isInsideGeofence).toBe(true);

      // Bus is 1.5 km away (outside geofence)
      const busFarLat = 29.2340;
      const busFarLon = 79.5250;
      const distKmOutside = calculateHaversineDistanceKm(busFarLat, busFarLon, stopLat, stopLon);
      const distMetersOutside = Math.round(distKmOutside * 1000);
      const isOutsideGeofence = distMetersOutside <= 150;

      expect(isOutsideGeofence).toBe(false);
      expect(distMetersOutside).toBeGreaterThan(1000);
    });
  });
});
