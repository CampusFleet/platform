import { describe, it, expect } from "vitest";
import { Stop, Student, TransitZone, EnrichedPickupStop } from "../lib/types";

// Standard Haversine distance in km
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

// Walking time estimate at average pedestrian speed (4.8 km/h = 80 m/min)
export function calculateWalkTimeMinutes(distanceKm: number): number {
  return Math.max(1, Math.round((distanceKm / 4.8) * 60));
}

// Rank stops by proximity to student's home coordinates and enrich with zone & route metadata
export function rankNearestStops(
  homeLat: number,
  homeLng: number,
  stops: (Stop & { zone_fee?: number; route_name?: string })[],
  primaryStopId?: string
): EnrichedPickupStop[] {
  return stops
    .map((stop) => {
      const distanceKm = calculateHaversineDistanceKm(
        homeLat,
        homeLng,
        stop.latitude,
        stop.longitude
      );
      const walkTimeMins = calculateWalkTimeMinutes(distanceKm);
      return {
        id: stop.id,
        stopId: stop.id,
        name: stop.name,
        code: stop.code || stop.id,
        latitude: stop.latitude,
        longitude: stop.longitude,
        landmark: stop.landmark || "",
        distanceKm,
        walkTimeMins,
        zoneCode: stop.zoneCode || "ZONE_B",
        zoneName: `Zone ${stop.zoneCode?.replace("ZONE_", "") || "B"}`,
        semesterFee: stop.zone_fee || 12000,
        routeName: stop.route_name || "Campus Main Line",
        isPrimary: stop.id === primaryStopId,
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

// Pickup stop selection engine with zone & fee synchronization
export function selectStudentPickupStop(
  student: Student,
  selectedStop: EnrichedPickupStop,
  zones: TransitZone[]
): {
  success: boolean;
  message: string;
  updatedStudent?: Student;
  feeUpdated?: boolean;
} {
  const isPaid = student.paymentStatus === "APPROVED";
  const currentZoneCode = student.zoneCode || "ZONE_B";
  const targetZoneCode = selectedStop.zoneCode || "ZONE_B";

  // Zone Lock Guardrail: Paid commuter cannot switch to another zone tier without admin clearance
  if (isPaid && currentZoneCode !== targetZoneCode) {
    return {
      success: false,
      message: `Your transit pass is approved for ${currentZoneCode}. Switching to a stop in ${targetZoneCode} requires transport office fee adjustment.`,
    };
  }

  const matchedZone = zones.find((z) => z.code === targetZoneCode);
  const newFeeDue = !isPaid && matchedZone ? matchedZone.semesterFee : student.totalFeeDue;

  const updatedStudent: Student = {
    ...student,
    primaryStopId: selectedStop.id,
    zoneCode: targetZoneCode,
    totalFeeDue: newFeeDue,
  };

  return {
    success: true,
    message: `Pickup stop successfully set to ${selectedStop.name}`,
    updatedStudent,
    feeUpdated: !isPaid && matchedZone?.semesterFee !== student.totalFeeDue,
  };
}

// Transit Domain Presentation Guardrail: commuters must never see internal trip IDs
export function formatCommuterTransitBadge(payload: {
  busNumber: string;
  routeName: string;
  shiftName: string;
  stopName: string;
  tripId?: string;
  tripCode?: string;
}): {
  displayTitle: string;
  stopDescription: string;
  hasExposedInternalTripId: boolean;
} {
  const busLabel = payload.busNumber.toLowerCase().startsWith("bus")
    ? payload.busNumber
    : `Bus ${payload.busNumber}`;
  const displayTitle = `${busLabel} • ${payload.shiftName}`;
  const stopDescription = `Boarding at ${payload.stopName} (${payload.routeName})`;
  const serialized = JSON.stringify({ displayTitle, stopDescription });

  const hasExposedInternalTripId =
    (!!payload.tripId && serialized.includes(payload.tripId)) ||
    (!!payload.tripCode && serialized.includes(payload.tripCode));

  return {
    displayTitle,
    stopDescription,
    hasExposedInternalTripId,
  };
}

describe("Student Home Location & Pickup Stop Selection System", () => {
  const MUKHANI_HOME = { lat: 29.220936, lng: 79.514496 };

  const testZones: TransitZone[] = [
    {
      id: "zone-a",
      code: "ZONE_A",
      name: "Zone A (City Center / Within 5km)",
      semesterFee: 8000,
      installmentsAllowed: 2,
      corridorDescription: "Kathgodam & Sheesh Mahal",
    },
    {
      id: "zone-b",
      code: "ZONE_B",
      name: "Zone B (Suburban / 5-15km)",
      semesterFee: 12000,
      installmentsAllowed: 2,
      corridorDescription: "Mukhani & Kaladhungi Road",
    },
    {
      id: "zone-c",
      code: "ZONE_C",
      name: "Zone C (Extended / 15-25km)",
      semesterFee: 15000,
      installmentsAllowed: 2,
      corridorDescription: "Lalkuan, Rampur Road & Outskirts",
    },
  ];

  const catalogStops: (Stop & { zone_fee?: number; route_name?: string })[] = [
    {
      id: "stop-mukhani",
      name: "Mukhani Chauraha",
      code: "MKH-01",
      latitude: 29.2225,
      longitude: 79.516,
      landmark: "Opposite City Hospital",
      geofenceRadiusMeters: 50,
      zoneCode: "ZONE_B",
      zone_fee: 12000,
      route_name: "Ganna Center Corridor",
    },
    {
      id: "stop-heera-nagar",
      name: "Heera Nagar Colony Gate",
      code: "HRA-02",
      latitude: 29.215,
      longitude: 79.508,
      landmark: "Near Police Post",
      geofenceRadiusMeters: 50,
      zoneCode: "ZONE_B",
      zone_fee: 12000,
      route_name: "Ganna Center Corridor",
    },
    {
      id: "stop-sheesh-mahal",
      name: "Sheesh Mahal Kathgodam",
      code: "SHM-03",
      latitude: 29.265,
      longitude: 79.54,
      landmark: "Kathgodam Toll Plaza",
      geofenceRadiusMeters: 50,
      zoneCode: "ZONE_A",
      zone_fee: 8000,
      route_name: "Northern Mountain Express",
    },
    {
      id: "stop-lalkuan",
      name: "Lalkuan Railway Junction",
      code: "LKU-04",
      latitude: 29.075,
      longitude: 79.515,
      landmark: "Station Gate 1",
      geofenceRadiusMeters: 50,
      zoneCode: "ZONE_C",
      zone_fee: 15000,
      route_name: "Southern Highway Express",
    },
  ];

  it("calculates accurate Haversine distance and pedestrian walking time", () => {
    const distMukhani = calculateHaversineDistanceKm(
      MUKHANI_HOME.lat,
      MUKHANI_HOME.lng,
      catalogStops[0].latitude,
      catalogStops[0].longitude
    );
    // Mukhani Chauraha is approximately 0.2 - 0.5 km away from home
    expect(distMukhani).toBeGreaterThan(0.1);
    expect(distMukhani).toBeLessThan(1.0);

    const walkTime = calculateWalkTimeMinutes(distMukhani);
    // Walk time should be within 2 - 8 minutes
    expect(walkTime).toBeGreaterThanOrEqual(2);
    expect(walkTime).toBeLessThanOrEqual(10);
  });

  it("ranks nearest stops correctly by proximity to home coordinates", () => {
    const ranked = rankNearestStops(
      MUKHANI_HOME.lat,
      MUKHANI_HOME.lng,
      catalogStops,
      "stop-mukhani"
    );

    expect(ranked.length).toBe(4);
    // #1 closest stop must be Mukhani Chauraha
    expect(ranked[0].id).toBe("stop-mukhani");
    expect(ranked[0].isPrimary).toBe(true);

    // #2 stop should be Heera Nagar
    expect(ranked[1].id).toBe("stop-heera-nagar");

    // Lalkuan (~16 km) and Kathgodam (~6 km) should be further down
    expect(ranked[ranked.length - 1].id).toBe("stop-lalkuan");
    expect(ranked[ranked.length - 1].distanceKm).toBeGreaterThan(10);
  });

  it("couples pickup stop selection with transit zone fee for unpaid student", () => {
    const unpaidStudent: Student = {
      id: "stud-101",
      userId: "u-101",
      fullName: "Aditya Dev",
      email: "aditya@campus.edu",
      phone: "+91 9876543210",
      department: "CSE",
      semester: "4th",
      primaryRouteId: "route-1",
      emergencyContact: { name: "Guardian", relationship: "Parent", phone: "+91 9876543210" },
      transportAccessSuspended: false,
      hasActiveSubscription: false,
      paymentStatus: "UNPAID",
      zoneCode: "ZONE_B",
      totalFeeDue: 12000,
      primaryStopId: "stop-mukhani",
    };

    const nearest = rankNearestStops(
      MUKHANI_HOME.lat,
      MUKHANI_HOME.lng,
      catalogStops
    );

    // Student decides to board at Sheesh Mahal (Zone A: ₹8,000)
    const zoneAStop = nearest.find((s) => s.id === "stop-sheesh-mahal")!;
    const res = selectStudentPickupStop(unpaidStudent, zoneAStop, testZones);

    expect(res.success).toBe(true);
    expect(res.updatedStudent?.primaryStopId).toBe("stop-sheesh-mahal");
    expect(res.updatedStudent?.zoneCode).toBe("ZONE_A");
    expect(res.updatedStudent?.totalFeeDue).toBe(8000);
    expect(res.feeUpdated).toBe(true);
  });

  it("locks zone change when student payment is already APPROVED but allows stop change within same zone", () => {
    const approvedStudent: Student = {
      id: "stud-202",
      userId: "u-202",
      fullName: "Ananya Sharma",
      email: "ananya@campus.edu",
      phone: "+91 9876543211",
      department: "ECE",
      semester: "6th",
      primaryRouteId: "route-1",
      emergencyContact: { name: "Guardian", relationship: "Parent", phone: "+91 9876543210" },
      transportAccessSuspended: false,
      paymentStatus: "APPROVED",
      hasActiveSubscription: true,
      zoneCode: "ZONE_B",
      totalFeeDue: 12000,
      primaryStopId: "stop-mukhani",
    };

    const nearest = rankNearestStops(
      MUKHANI_HOME.lat,
      MUKHANI_HOME.lng,
      catalogStops
    );

    // 1. Changing to another stop in the SAME Zone B (Heera Nagar) is ALLOWED
    const sameZoneStop = nearest.find((s) => s.id === "stop-heera-nagar")!;
    const sameZoneRes = selectStudentPickupStop(approvedStudent, sameZoneStop, testZones);

    expect(sameZoneRes.success).toBe(true);
    expect(sameZoneRes.updatedStudent?.primaryStopId).toBe("stop-heera-nagar");
    expect(sameZoneRes.updatedStudent?.zoneCode).toBe("ZONE_B");

    // 2. Changing to a stop in a DIFFERENT Zone C (Lalkuan) is BLOCKED
    const diffZoneStop = nearest.find((s) => s.id === "stop-lalkuan")!;
    const diffZoneRes = selectStudentPickupStop(approvedStudent, diffZoneStop, testZones);

    expect(diffZoneRes.success).toBe(false);
    expect(diffZoneRes.message).toContain("requires transport office fee adjustment");
    expect(diffZoneRes.updatedStudent).toBeUndefined();
  });

  it("complies with Transit Domain Rule: commuters never see internal trip IDs", () => {
    const commuterBadge = formatCommuterTransitBadge({
      busNumber: "Bus 12",
      routeName: "Ganna Center Corridor",
      shiftName: "Morning Pick-Up",
      stopName: "Mukhani Chauraha",
      tripId: "dispatch_run_9918237",
      tripCode: "TRIP-20261101-0800",
    });

    expect(commuterBadge.displayTitle).toBe("Bus 12 • Morning Pick-Up");
    expect(commuterBadge.stopDescription).toBe(
      "Boarding at Mukhani Chauraha (Ganna Center Corridor)"
    );
    expect(commuterBadge.hasExposedInternalTripId).toBe(false);
  });
});
