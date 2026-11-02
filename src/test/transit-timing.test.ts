import { describe, it, expect } from "vitest";
import {
  formatTimeWithOffset,
  formatTimeFromDateWithOffset,
  estimateRouteStopTimings,
} from "@/lib/transit-timing";
import { Stop } from "@/lib/types";

describe("Transit Timing Engine", () => {
  it("formats base time with offset accurately", () => {
    expect(formatTimeWithOffset("07:30", 0)).toBe("7:30 AM");
    expect(formatTimeWithOffset("07:30", 15)).toBe("7:45 AM");
    expect(formatTimeWithOffset("07:30", 45)).toBe("8:15 AM");
    expect(formatTimeWithOffset("11:45", 30)).toBe("12:15 PM");
    expect(formatTimeWithOffset("23:30", 45)).toBe("12:15 AM");
  });

  it("formats date with minute offset accurately", () => {
    const d = new Date("2026-11-02T07:00:00.000Z");
    const result = formatTimeFromDateWithOffset(d, 20);
    expect(result).toMatch(/\d+:\d+\s(AM|PM)/);
  });

  it("calculates realistic offsets when existing offsets are missing", () => {
    const stops: Stop[] = [
      {
        id: "stop-1",
        name: "Lamachaur",
        code: "LMC",
        latitude: 29.3500,
        longitude: 79.5000,
        landmark: "Chauraha",
        geofenceRadiusMeters: 100,
      },
      {
        id: "stop-2",
        name: "Fatehpur",
        code: "FTP",
        latitude: 29.3700,
        longitude: 79.5200,
        landmark: "Katghariya",
        geofenceRadiusMeters: 100,
      },
      {
        id: "stop-3",
        name: "Campus Terminal",
        code: "GEHU",
        latitude: 29.4000,
        longitude: 79.5500,
        landmark: "Main Gate",
        geofenceRadiusMeters: 150,
      },
    ];

    const routeStops = stops.map((stop, i) => ({
      stop,
      stopOrder: i + 1,
      // offsets missing (0)
      arrivalOffsetMinutes: 0,
    }));

    const estimates = estimateRouteStopTimings(routeStops, {
      baseDepartureTime: "07:30",
    });

    expect(estimates).toHaveLength(3);
    expect(estimates[0].arrivalOffsetMinutes).toBe(0);
    expect(estimates[0].scheduledArrival).toBe("7:30 AM");
    expect(estimates[0].isOrigin).toBe(true);

    // Stop 2 should have estimated duration > 0
    expect(estimates[1].arrivalOffsetMinutes).toBeGreaterThan(0);
    expect(estimates[1].distanceFromStartKm).toBeGreaterThan(0);
    expect(estimates[1].scheduledArrival).not.toBe("7:30 AM");

    // Stop 3 (Terminal) should be cumulative > Stop 2
    expect(estimates[2].arrivalOffsetMinutes).toBeGreaterThan(estimates[1].arrivalOffsetMinutes);
    expect(estimates[2].isTerminal).toBe(true);
  });

  it("preserves explicit scheduled offsets when present", () => {
    const stops: Stop[] = [
      { id: "s1", name: "S1", code: "S1", latitude: 29.1, longitude: 79.1, landmark: "", geofenceRadiusMeters: 50 },
      { id: "s2", name: "S2", code: "S2", latitude: 29.2, longitude: 79.2, landmark: "", geofenceRadiusMeters: 50 },
      { id: "s3", name: "S3", code: "S3", latitude: 29.3, longitude: 79.3, landmark: "", geofenceRadiusMeters: 50 },
    ];

    const routeStops = [
      { stop: stops[0], arrivalOffsetMinutes: 0 },
      { stop: stops[1], arrivalOffsetMinutes: 20 },
      { stop: stops[2], arrivalOffsetMinutes: 50 },
    ];

    const estimates = estimateRouteStopTimings(routeStops, {
      baseDepartureTime: "07:00",
    });

    expect(estimates[0].arrivalOffsetMinutes).toBe(0);
    expect(estimates[0].scheduledArrival).toBe("7:00 AM");

    expect(estimates[1].arrivalOffsetMinutes).toBe(20);
    expect(estimates[1].scheduledArrival).toBe("7:20 AM");
    expect(estimates[1].legMinutes).toBe(20);

    expect(estimates[2].arrivalOffsetMinutes).toBe(50);
    expect(estimates[2].scheduledArrival).toBe("7:50 AM");
    expect(estimates[2].legMinutes).toBe(30);
  });

  it("supports rolling live ETA mode if departing now", () => {
    const stops: Stop[] = [
      { id: "s1", name: "S1", code: "S1", latitude: 29.1, longitude: 79.1, landmark: "", geofenceRadiusMeters: 50 },
      { id: "s2", name: "S2", code: "S2", latitude: 29.2, longitude: 79.2, landmark: "", geofenceRadiusMeters: 50 },
    ];

    const estimates = estimateRouteStopTimings(
      [{ stop: stops[0], arrivalOffsetMinutes: 0 }, { stop: stops[1], arrivalOffsetMinutes: 15 }],
      { isDepartNow: true }
    );

    expect(estimates[0].rollingLiveArrival).toBeDefined();
    expect(estimates[1].rollingLiveArrival).toBeDefined();
    expect(estimates[0].displayTime).toBe(estimates[0].rollingLiveArrival);
  });
});
