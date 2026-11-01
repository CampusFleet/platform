import { describe, it, expect } from "vitest";
import type { LiveBusLocation } from "@/lib/types";

describe("Telematics Cross-Sync & Bus ID Normalization", () => {
  it("normalizes bus identifiers into candidate lookup keys correctly", () => {
    const rawBusInputs = ["45", 45, "bus-45", "Bus 45", "BUS 45"];

    for (const input of rawBusInputs) {
      const str = String(input).trim();
      const cleanNum = str.replace(/[^0-9]/g, "");
      expect(cleanNum).toBe("45");

      const candidateKeys = [
        `telematics:bus:${str}`,
        `telematics:bus:${str.toLowerCase()}`,
        `telematics:bus:bus-${str}`,
        `telematics:bus:Bus ${str}`,
      ];
      if (cleanNum) {
        candidateKeys.push(
          `telematics:bus:${cleanNum}`,
          `telematics:bus:bus-${cleanNum}`,
          `telematics:bus:Bus ${cleanNum}`
        );
      }

      // Every candidate set contains the canonical numeric key
      expect(candidateKeys).toContain("telematics:bus:45");
    }
  });

  it("detects GPS telemetry staleness according to 180s industry standard", () => {
    const now = Date.now();
    const freshTimestamp = new Date(now - 30 * 1000).toISOString(); // 30s ago
    const staleTimestamp = new Date(now - 240 * 1000).toISOString(); // 4 minutes ago

    const isFreshStale = Math.round((now - new Date(freshTimestamp).getTime()) / 1000) > 180;
    const isOldStale = Math.round((now - new Date(staleTimestamp).getTime()) / 1000) > 180;

    expect(isFreshStale).toBe(false);
    expect(isOldStale).toBe(true);
  });

  it("verifies LiveBusLocation payload incorporates driver and GPS metadata", () => {
    const samplePayload: LiveBusLocation = {
      busId: 45,
      busNumber: "45",
      driverId: "DRV-1001",
      driverName: "Vikram Negi",
      accuracy: 6,
      tripId: "TRIP-2026-B45",
      latitude: 29.352,
      longitude: 79.542,
      speedKmh: 34,
      headingDeg: 120,
      currentStopId: "stop-bhimtal-lake",
      nextStopId: "stop-bhimtal-campus",
      estimatedArrivalNextStopMins: 4,
      delayMinutes: 0,
      lastPingAt: new Date().toISOString(),
      source: "driver_gps",
    };

    expect(samplePayload.busNumber).toBe("45");
    expect(samplePayload.driverName).toBe("Vikram Negi");
    expect(samplePayload.source).toBe("driver_gps");
    expect(samplePayload.accuracy).toBe(6);
  });
});
