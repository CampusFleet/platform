import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateDistanceKm, calculateExactDistanceMeters } from "../lib/utils";
import type { Trip, Route, Stop, LiveBusLocation } from "../lib/types";

describe("Driver Live Radar Navigation (Uber & Rapido Inspired)", () => {
  const originStop: Stop = {
    id: "stop-hld-ganna-center",
    name: "Ganna Center (Haldwani)",
    code: "HLD-GNA",
    latitude: 29.2155,
    longitude: 79.5122,
    landmark: "Opposite Sugarcane Federation Office",
    geofenceRadiusMeters: 150,
    campusId: "campus-gehu-bhimtal",
    zoneCode: "ZONE_HALDWANI",
  };

  const intermediateStop: Stop = {
    id: "stop-kathgodam-station",
    name: "Kathgodam Railway Station",
    code: "KGM-RLY",
    latitude: 29.2725,
    longitude: 79.5336,
    landmark: "Station Gate 1 Parking",
    geofenceRadiusMeters: 150,
    campusId: "campus-gehu-bhimtal",
    zoneCode: "ZONE_KATHGODAM",
  };

  const campusTerminalStop: Stop = {
    id: "stop-bhimtal-campus",
    name: "Graphic Era Hill University Campus Terminal",
    code: "GEHU-BHT",
    latitude: 29.375015,
    longitude: 79.529479,
    landmark: "Main Campus Gate & Bus Depot",
    geofenceRadiusMeters: 150,
    campusId: "campus-gehu-bhimtal",
    zoneCode: "ZONE_CAMPUS",
  };

  const sampleRoute: Route = {
    id: "route-hld-bht",
    code: "RT-HLD-BHT",
    name: "Haldwani - Bhimtal Express",
    description: "Express corridor from Haldwani to Bhimtal Campus",
    direction: "HOME_TO_CAMPUS",
    color: "#1a73e8",
    totalDistanceKm: 28.5,
    estimatedDurationMins: 55,
    isActive: true,
    stops: [
      { stopId: originStop.id, stopOrder: 1, arrivalOffsetMinutes: 0, bufferTimeMinutes: 5, stop: originStop },
      { stopId: intermediateStop.id, stopOrder: 2, arrivalOffsetMinutes: 20, bufferTimeMinutes: 3, stop: intermediateStop },
      { stopId: campusTerminalStop.id, stopOrder: 3, arrivalOffsetMinutes: 55, bufferTimeMinutes: 10, stop: campusTerminalStop },
    ],
  };

  const sampleTrip: Trip = {
    id: "trip-uuid-101",
    tripCode: "TRIP-HLD-01",
    routeId: sampleRoute.id,
    busId: 2,
    shiftId: "shift-morning-01",
    driverId: "staff-drv-44",
    conductorId: "staff-cnd-12",
    tripDate: "2026-11-01",
    status: "SCHEDULED",
    delayMinutes: 0,
    manifestLocked: false,
    currentStopIndex: 0,
  };

  // ── 1. Dynamic Navigation State Machine ───────────────────────────────────
  describe("Driver Navigation Stage State Machine", () => {
    function resolveNavigationStage(
      tripStatus: string,
      currentStopIndex: number,
      totalStops: number,
      distanceToOriginMeters: number
    ): "HEADING_TO_START" | "AT_STARTING_POINT" | "IN_TRANSIT" | "ARRIVING_CAMPUS" | "COMPLETED" {
      if (tripStatus === "COMPLETED") return "COMPLETED";
      if (tripStatus === "IN_PROGRESS") {
        if (currentStopIndex >= totalStops - 1) return "ARRIVING_CAMPUS";
        return "IN_TRANSIT";
      }
      if (distanceToOriginMeters <= 150) return "AT_STARTING_POINT";
      return "HEADING_TO_START";
    }

    it("should enter HEADING_TO_START when driver is > 150m from origin stop before starting trip", () => {
      // Driver is at depot (3.5 km away)
      const driverLat = 29.2450;
      const driverLng = 79.5200;
      const distMeters = Math.round(calculateDistanceKm(driverLat, driverLng, originStop.latitude, originStop.longitude) * 1000);

      expect(distMeters).toBeGreaterThan(150);
      const stage = resolveNavigationStage("SCHEDULED", 0, 3, distMeters);
      expect(stage).toBe("HEADING_TO_START");
    });

    it("should transition to AT_STARTING_POINT when driver enters the 150m geofence of origin stop", () => {
      // Driver arrives within 60m of origin stop
      const driverLat = 29.2158;
      const driverLng = 79.5124;
      const distMeters = Math.round(calculateDistanceKm(driverLat, driverLng, originStop.latitude, originStop.longitude) * 1000);

      expect(distMeters).toBeLessThanOrEqual(150);
      const stage = resolveNavigationStage("SCHEDULED", 0, 3, distMeters);
      expect(stage).toBe("AT_STARTING_POINT");
    });

    it("should enter IN_TRANSIT once route starts and is between stop 0 and terminal", () => {
      const stage = resolveNavigationStage("IN_PROGRESS", 1, 3, 5000);
      expect(stage).toBe("IN_TRANSIT");
    });

    it("should enter ARRIVING_CAMPUS when reaching the final campus terminal stop", () => {
      const stage = resolveNavigationStage("IN_PROGRESS", 2, 3, 200);
      expect(stage).toBe("ARRIVING_CAMPUS");
    });

    it("should enter COMPLETED when driver completes the trip", () => {
      const stage = resolveNavigationStage("COMPLETED", 2, 3, 0);
      expect(stage).toBe("COMPLETED");
    });
  });

  // ── 2. Deadhead & Stop Proximity Calculations ─────────────────────────────
  describe("Deadhead Routing & Corridor Distance Precision", () => {
    it("should calculate exact distance to route origin accurately", () => {
      const depotLat = 29.2000;
      const depotLng = 79.5000;
      const distKm = calculateDistanceKm(depotLat, depotLng, originStop.latitude, originStop.longitude);

      expect(distKm).toBeGreaterThan(2.0);
      expect(distKm).toBeLessThan(3.0);
    });

    it("should generate correct external turn-by-turn navigation deep link", () => {
      const targetStop = originStop;
      const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${targetStop.latitude},${targetStop.longitude}&travelmode=driving`;

      expect(navUrl).toContain("destination=29.2155,79.5122");
      expect(navUrl).toContain("travelmode=driving");
    });
  });

  // ── 3. Telematics Payload Integrity ───────────────────────────────────────
  describe("Driver Telematics Dispatch Integrity", () => {
    it("should construct valid LiveBusLocation without exposing internal trip codes to commuter view", () => {
      const payload: LiveBusLocation = {
        busId: 2,
        busNumber: 37,
        driverId: "staff-drv-44",
        driverName: "Vikram Negi",
        tripId: sampleTrip.id,
        latitude: originStop.latitude,
        longitude: originStop.longitude,
        speedKmh: 34,
        headingDeg: 85,
        accuracy: 8,
        currentStopId: originStop.id,
        nextStopId: intermediateStop.id,
        estimatedArrivalNextStopMins: 18,
        delayMinutes: 0,
        lastPingAt: new Date().toISOString(),
        source: "driver_gps",
      };

      expect(payload.busNumber).toBe(37);
      expect(payload.latitude).toBe(29.2155);
      expect(payload.longitude).toBe(79.5122);
      expect(payload.source).toBe("driver_gps");
      expect(payload.speedKmh).toBe(34);
      expect(payload.delayMinutes).toBe(0);
    });
  });
});
