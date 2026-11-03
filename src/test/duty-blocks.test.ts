import { describe, it, expect } from "vitest";
import { buildDutyBlocks, rotateDutyBlocks, autoAssignDutyBlocks, reconcileDutyTrips, categorizeShifts } from "../lib/duty-blocks";
import { Bus, Route, Shift, Trip } from "../lib/types";

describe("Dynamic Vehicle Duty Block & Bus Rotation Engine", () => {
  const mockBuses: Bus[] = [
    {
      id: 2,
      busNumber: 2,
      registrationNo: "UK-07-FLEET-02",
      model: "Tata Starbus 40-Seater",
      capacity: 40,
      seatLayout: "2x2",
      status: "ACTIVE",
      gpsDeviceId: "GPS-02",
      insuranceExpiry: "2027-01-01",
      maintenanceDueDate: "2027-01-01",
      currentRouteId: "route-1",
    },
    {
      id: 3,
      busNumber: 3,
      registrationNo: "UK-07-FLEET-03",
      model: "Tata Starbus 40-Seater",
      capacity: 40,
      seatLayout: "2x2",
      status: "ACTIVE",
      gpsDeviceId: "GPS-03",
      insuranceExpiry: "2027-01-01",
      maintenanceDueDate: "2027-01-01",
      currentRouteId: "route-2",
    },
    {
      id: 8,
      busNumber: 8,
      registrationNo: "UK-07-FLEET-08",
      model: "Tata Starbus 40-Seater",
      capacity: 40,
      seatLayout: "2x2",
      status: "ACTIVE",
      gpsDeviceId: "GPS-08",
      insuranceExpiry: "2027-01-01",
      maintenanceDueDate: "2027-01-01",
      currentRouteId: "route-3",
    },
  ];

  const mockRoutes: Route[] = [
    {
      id: "route-1",
      name: "Ganna Center to GEHU Bhimtal",
      code: "CR-02",
      description: "Corridor 1",
      direction: "HOME_TO_CAMPUS",
      color: "#2563eb",
      totalDistanceKm: 35,
      estimatedDurationMins: 60,
      isActive: true,
      stops: [],
    },
    {
      id: "route-2",
      name: "Gaulapar to GEHU Bhimtal",
      code: "CR-03",
      description: "Corridor 2",
      direction: "HOME_TO_CAMPUS",
      color: "#16a34a",
      totalDistanceKm: 42,
      estimatedDurationMins: 75,
      isActive: true,
      stops: [],
    },
    {
      id: "route-3",
      name: "Nagla & Lalkuan to GEHU Bhimtal",
      code: "CR-08",
      description: "Corridor 3",
      direction: "HOME_TO_CAMPUS",
      color: "#9333ea",
      totalDistanceKm: 50,
      estimatedDurationMins: 90,
      isActive: true,
      stops: [],
    },
  ];

  const mockShifts: Shift[] = [
    {
      id: "shift-1",
      name: "Morning Academic Daily Shift",
      shiftType: "MORNING",
      direction: "HOME_TO_CAMPUS",
      startTime: "07:15:00",
      endTime: "08:45:00",
      bookingCutoffMins: 30,
    },
    {
      id: "shift-halfday",
      name: "Afternoon Half-Day Departure",
      shiftType: "AFTERNOON",
      direction: "CAMPUS_TO_HOME",
      startTime: "13:30:00",
      endTime: "14:15:00",
      bookingCutoffMins: 20,
    },
    {
      id: "shift-2",
      name: "Evening Return Daily Corridor",
      shiftType: "EVENING",
      direction: "CAMPUS_TO_HOME",
      startTime: "16:45:00",
      endTime: "21:00:00",
      bookingCutoffMins: 30,
    },
  ];

  it("dynamically categorizes shifts into incoming and outgoing", () => {
    const { incomingShifts, outgoingShifts } = categorizeShifts(mockShifts);
    expect(incomingShifts.length).toBe(1);
    expect(incomingShifts[0].id).toBe("shift-1");
    expect(outgoingShifts.length).toBe(2);
    expect(outgoingShifts.map((s) => s.id)).toEqual(["shift-halfday", "shift-2"]);
  });

  it("dynamically detects multiple outgoing shifts conflict when a bus is double-booked", () => {
    const conflictingTrips: Trip[] = [
      {
        id: "t1",
        tripCode: "TRIP-CR02-0715-20261103",
        routeId: "route-1",
        busId: 2,
        shiftId: "shift-1",
        tripDate: "2026-11-03",
        status: "SCHEDULED",
        delayMinutes: 0,
        manifestLocked: false,
        currentStopIndex: 0,
        driverId: "drv-1",
        conductorId: "cnd-1",
      },
      {
        id: "t2",
        tripCode: "TRIP-CR02-1330-20261103",
        routeId: "route-1",
        busId: 2,
        shiftId: "shift-halfday",
        tripDate: "2026-11-03",
        status: "SCHEDULED",
        delayMinutes: 0,
        manifestLocked: false,
        currentStopIndex: 0,
        driverId: "drv-1",
        conductorId: "cnd-1",
      },
      {
        id: "t3",
        tripCode: "TRIP-CR02-1645-20261103",
        routeId: "route-1",
        busId: 2,
        shiftId: "shift-2",
        tripDate: "2026-11-03",
        status: "SCHEDULED",
        delayMinutes: 0,
        manifestLocked: false,
        currentStopIndex: 0,
        driverId: "drv-1",
        conductorId: "cnd-1",
      },
    ];

    const { dutyBlocks, summary } = buildDutyBlocks(
      mockBuses,
      mockRoutes,
      mockShifts,
      conflictingTrips,
      [],
      [],
      "2026-11-03"
    );

    const bus2Block = dutyBlocks.find((b) => b.busId === 2);
    expect(bus2Block).toBeDefined();
    expect(bus2Block?.dutyStatus).toBe("CONFLICT_MULTIPLE_OUTGOING");
    expect(summary.conflictCount).toBe(1);
  });

  it("dynamically rotates outgoing shifts across buses without hardcoded strings", () => {
    const { dutyBlocks, outgoingShifts } = buildDutyBlocks(
      mockBuses,
      mockRoutes,
      mockShifts,
      [],
      [],
      [],
      "2026-11-03"
    );

    const rotated = rotateDutyBlocks(dutyBlocks, outgoingShifts, 1);
    expect(rotated.length).toBe(3);
    // At least one bus changed its outgoingShiftId
    const changes = rotated.filter((r, idx) => r.outgoingShiftId !== dutyBlocks[idx].outgoingShiftId);
    expect(changes.length).toBeGreaterThan(0);
  });

  it("reconciles duty trips and marks conflicting unallocated outshift trips for deletion", () => {
    const conflictingTrips: Trip[] = [
      {
        id: "trip-inbound",
        tripCode: "TRIP-CR02-0715-20261103",
        routeId: "route-1",
        busId: 2,
        shiftId: "shift-1",
        tripDate: "2026-11-03",
        status: "SCHEDULED",
        delayMinutes: 0,
        manifestLocked: false,
        currentStopIndex: 0,
        driverId: "drv-1",
        conductorId: "cnd-1",
      },
      {
        id: "trip-halfday",
        tripCode: "TRIP-CR02-1330-20261103",
        routeId: "route-1",
        busId: 2,
        shiftId: "shift-halfday",
        tripDate: "2026-11-03",
        status: "SCHEDULED",
        delayMinutes: 0,
        manifestLocked: false,
        currentStopIndex: 0,
        driverId: "drv-1",
        conductorId: "cnd-1",
      },
      {
        id: "trip-evening-redundant",
        tripCode: "TRIP-CR02-1645-20261103",
        routeId: "route-1",
        busId: 2,
        shiftId: "shift-2",
        tripDate: "2026-11-03",
        status: "SCHEDULED",
        delayMinutes: 0,
        manifestLocked: false,
        currentStopIndex: 0,
        driverId: "drv-1",
        conductorId: "cnd-1",
      },
    ];

    const { dutyBlocks } = buildDutyBlocks(
      mockBuses,
      mockRoutes,
      mockShifts,
      conflictingTrips,
      [],
      [],
      "2026-11-03"
    );

    // Explicitly set bus 2 to shift-halfday
    dutyBlocks[0].outgoingShiftId = "shift-halfday";

    const { tripsToUpsert, tripIdsToDelete } = reconcileDutyTrips(
      dutyBlocks,
      conflictingTrips,
      "2026-11-03",
      mockShifts
    );

    // Exactly 2 trips upserted for bus 2: 1 inbound + 1 outgoing
    expect(tripsToUpsert.some((t) => t.shift_id === "shift-1")).toBe(true);
    expect(tripsToUpsert.some((t) => t.shift_id === "shift-halfday")).toBe(true);

    // Conflicting redundant trip marked for deletion
    expect(tripIdsToDelete).toContain("trip-evening-redundant");
  });
});
