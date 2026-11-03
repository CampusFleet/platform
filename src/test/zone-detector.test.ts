import { describe, it, expect } from "vitest";
import { detectCommuterZoneAndStop } from "@/lib/zone-detector";
import { TRANSIT_ZONES, Stop, Route } from "@/lib/types";

describe("Intelligent Zone & Route Detector", () => {
  const mockStops: Stop[] = [
    {
      id: "stop-mukhani",
      name: "Mukhani Chauraha",
      code: "MUKH",
      latitude: 29.2198,
      longitude: 79.5123,
      landmark: "Mukhani Crossing",
      geofenceRadiusMeters: 100,
      zoneCode: "ZONE_B",
    },
    {
      id: "stop-kathgodam",
      name: "Kathgodam Rly Station",
      code: "KGM",
      latitude: 29.2721,
      longitude: 79.5312,
      landmark: "Railway Circle",
      geofenceRadiusMeters: 100,
      zoneCode: "ZONE_C",
    },
    {
      id: "stop-campus",
      name: "Graphic Era Hill University",
      code: "GEHU",
      latitude: 29.375,
      longitude: 79.529,
      landmark: "Campus Main Gate",
      geofenceRadiusMeters: 150,
      zoneCode: "ZONE_D",
    },
  ];

  const mockRoutes: Route[] = [
    {
      id: "route-hld-bht",
      name: "Haldwani - Bhimtal Expressway",
      code: "HLD-BHT",
      description: "Haldwani corridor",
      direction: "HOME_TO_CAMPUS",
      color: "#2563EB",
      isActive: true,
      totalDistanceKm: 25,
      estimatedDurationMins: 45,
      stops: [
        { stopId: "stop-mukhani", stopOrder: 0, arrivalOffsetMinutes: 0, bufferTimeMinutes: 2, stop: mockStops[0] },
        { stopId: "stop-kathgodam", stopOrder: 1, arrivalOffsetMinutes: 15, bufferTimeMinutes: 2, stop: mockStops[1] },
        { stopId: "stop-campus", stopOrder: 2, arrivalOffsetMinutes: 40, bufferTimeMinutes: 2, stop: mockStops[2] },
      ],
    },
  ];

  it("should automatically detect Zone B and Mukhani stop when home pin is near Mukhani without manual selection", () => {
    // Student home near Mukhani Chauraha (e.g. 29.2205, 79.5130)
    const context = detectCommuterZoneAndStop(29.2205, 79.5130, mockStops, mockRoutes, TRANSIT_ZONES);

    expect(context).not.toBeNull();
    expect(context?.nearestStop.id).toBe("stop-mukhani");
    expect(context?.assignedZone.code).toBe("ZONE_B");
    expect(context?.assignedRoute?.id).toBe("route-hld-bht");
    expect(context?.walkingDistanceMeters).toBeLessThan(500); // Under 500m
  });

  it("should automatically detect Zone C when home pin is in Kathgodam", () => {
    // Student home in Kathgodam (29.2715, 79.5305)
    const context = detectCommuterZoneAndStop(29.2715, 79.5305, mockStops, mockRoutes, TRANSIT_ZONES);

    expect(context).not.toBeNull();
    expect(context?.nearestStop.id).toBe("stop-kathgodam");
    expect(context?.assignedZone.code).toBe("ZONE_C");
    expect(context?.semesterFee).toBe(10000);
  });
});
