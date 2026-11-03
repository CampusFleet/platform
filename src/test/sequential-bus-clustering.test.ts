import { describe, it, expect } from "vitest";
import { clusterRouteStudentsSequentially } from "@/lib/sequential-bus-clustering";
import type { Route, Stop, Bus } from "@/lib/types";

describe("Sequential Express Zone Bus Clustering & Filling Algorithm", () => {
  const mockStops: Stop[] = [
    { id: "stop-0", name: "Stop 0 (Route Origin)", code: "ST0", latitude: 29.20, longitude: 79.50, landmark: "Origin", geofenceRadiusMeters: 100 },
    { id: "stop-1", name: "Stop 1", code: "ST1", latitude: 29.22, longitude: 79.51, landmark: "Point 1", geofenceRadiusMeters: 100 },
    { id: "stop-2", name: "Stop 2", code: "ST2", latitude: 29.24, longitude: 79.52, landmark: "Point 2", geofenceRadiusMeters: 100 },
    { id: "stop-3", name: "Stop 3", code: "ST3", latitude: 29.26, longitude: 79.53, landmark: "Point 3", geofenceRadiusMeters: 100 },
    { id: "stop-4", name: "Stop 4", code: "ST4", latitude: 29.28, longitude: 79.54, landmark: "Point 4", geofenceRadiusMeters: 100 },
    { id: "stop-5", name: "Stop 5", code: "ST5", latitude: 29.30, longitude: 79.55, landmark: "Point 5", geofenceRadiusMeters: 100 },
    { id: "stop-campus", name: "Campus Terminal", code: "CMP", latitude: 29.37, longitude: 79.56, landmark: "Terminal", geofenceRadiusMeters: 150 },
  ];

  const mockRoute: Route = {
    id: "route-corridor-1",
    name: "Main Transit Corridor",
    code: "MTC-01",
    description: "Main corridor",
    direction: "HOME_TO_CAMPUS",
    color: "#2563EB",
    isActive: true,
    totalDistanceKm: 25,
    estimatedDurationMins: 45,
    stops: mockStops.map((s, idx) => ({
      stopId: s.id,
      stopOrder: idx,
      arrivalOffsetMinutes: idx * 5,
      bufferTimeMinutes: 2,
      stop: s,
    })),
  };

  const mockBuses: Bus[] = [
    { id: 101, busNumber: 101, capacity: 50, model: "Tata Starbus", registrationNo: "UK-04-101", status: "ACTIVE", seatLayout: "2x2", gpsDeviceId: "gps-101", insuranceExpiry: "2027-01-01", maintenanceDueDate: "2027-01-01" },
    { id: 102, busNumber: 102, capacity: 50, model: "Tata Starbus", registrationNo: "UK-04-102", status: "ACTIVE", seatLayout: "2x2", gpsDeviceId: "gps-102", insuranceExpiry: "2027-01-01", maintenanceDueDate: "2027-01-01" },
    { id: 103, busNumber: 103, capacity: 50, model: "Tata Starbus", registrationNo: "UK-04-103", status: "ACTIVE", seatLayout: "2x2", gpsDeviceId: "gps-103", insuranceExpiry: "2027-01-01", maintenanceDueDate: "2027-01-01" },
  ];

  it("should sequentially fill Bus 1 from start stops until 100% capacity, then convert Bus 1 to EXPRESS", () => {
    // Generate 75 students:
    // 20 students at Stop 0
    // 20 students at Stop 1
    // 10 students at Stop 2 -> Bus 1 reaches 50/50 capacity at Stop 2!
    // 15 students at Stop 3
    // 10 students at Stop 4
    const students: any[] = [];
    for (let i = 0; i < 20; i++) students.push({ studentId: `s0-${i}`, pickupStopId: "stop-0" });
    for (let i = 0; i < 20; i++) students.push({ studentId: `s1-${i}`, pickupStopId: "stop-1" });
    for (let i = 0; i < 10; i++) students.push({ studentId: `s2-${i}`, pickupStopId: "stop-2" });
    for (let i = 0; i < 15; i++) students.push({ studentId: `s3-${i}`, pickupStopId: "stop-3" });
    for (let i = 0; i < 10; i++) students.push({ studentId: `s4-${i}`, pickupStopId: "stop-4" });

    const result = clusterRouteStudentsSequentially(mockRoute, mockStops, students, mockBuses);

    expect(result.totalStudents).toBe(75);
    expect(result.totalBusesDeployed).toBe(2);

    // Plan for Bus 1
    const bus1Plan = result.busPlans[0];
    expect(Number(bus1Plan.busNumber)).toBe(101);
    expect(bus1Plan.assignedStudentCount).toBe(50);
    expect(bus1Plan.startPickupStop.id).toBe("stop-0");
    expect(bus1Plan.lastPickupStop.id).toBe("stop-2");
    expect(bus1Plan.isExpressDirect).toBe(true);
    // Bypasses Stop 3, Stop 4, Stop 5
    expect(bus1Plan.bypassedStopsCount).toBe(3);
    expect(bus1Plan.estimatedMinutesSaved).toBeGreaterThan(0);

    // Plan for Bus 2
    const bus2Plan = result.busPlans[1];
    expect(Number(bus2Plan.busNumber)).toBe(102);
    expect(bus2Plan.assignedStudentCount).toBe(25);
    // Bus 2 starts directly from Stop 3 (where Bus 1 left off)!
    expect(bus2Plan.startPickupStop.id).toBe("stop-3");
    expect(bus2Plan.lastPickupStop.id).toBe("stop-4");
    // Fuel saved by not running through Stop 0, 1, 2
    expect(bus2Plan.estimatedFuelSavedLiters).toBeGreaterThan(0);
  });
});
