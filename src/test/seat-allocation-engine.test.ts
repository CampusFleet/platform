import { describe, it, expect } from "vitest";
import {
  parseSeat,
  getSeatRowZone,
  getSeatPosition,
  areSeatsAdjacent,
  calculatePartnerProximity,
  allocateSeatWithPreferences,
  allocateAdjacentPairForPartners,
} from "../lib/seat-allocation-engine";
import type { Bus } from "../lib/types";

describe("CampusFleet Railway-Inspired Seat Allocation Engine", () => {
  const mockBus: Bus = {
    id: 42,
    busNumber: 42,
    registrationNo: "UP-16-CF-4242",
    model: "Tata Starbus Ultra 40-Seater",
    capacity: 40,
    seatLayout: "2x2",
    totalRows: 10,
    status: "ACTIVE",
    gpsDeviceId: "GPS-42",
    insuranceExpiry: "2027-12-31",
    maintenanceDueDate: "2027-12-31",
    currentRouteId: "route-1",
    teacherSeatsCount: 2,
  };

  it("should parse seat codes accurately into row and column", () => {
    expect(parseSeat("4B")).toEqual({ seatCode: "4B", row: 4, col: "B" });
    expect(parseSeat("10M")).toEqual({ seatCode: "10M", row: 10, col: "M" });
    expect(parseSeat("invalid")).toBeNull();
  });

  it("should categorize row numbers into Front, Middle, and Back zones", () => {
    const totalRows = 10;
    // Front: rows 1 to 4
    expect(getSeatRowZone(1, totalRows)).toBe("FRONT");
    expect(getSeatRowZone(2, totalRows)).toBe("FRONT");
    expect(getSeatRowZone(4, totalRows)).toBe("FRONT");

    // Middle: rows 5 to 6
    expect(getSeatRowZone(5, totalRows)).toBe("MIDDLE");
    expect(getSeatRowZone(6, totalRows)).toBe("MIDDLE");

    // Back: rows 7 to 10
    expect(getSeatRowZone(7, totalRows)).toBe("BACK");
    expect(getSeatRowZone(10, totalRows)).toBe("BACK");
  });

  it("should categorize Window vs. Aisle in 2x2 layout", () => {
    // 2x2 columns: A (window), B (aisle), C (aisle), D (window)
    expect(getSeatPosition("3A", "2x2")).toBe("WINDOW");
    expect(getSeatPosition("3B", "2x2")).toBe("AISLE");
    expect(getSeatPosition("3C", "2x2")).toBe("AISLE");
    expect(getSeatPosition("3D", "2x2")).toBe("WINDOW");
    expect(getSeatPosition("10M", "2x2")).toBe("MIDDLE_BENCH");
  });

  it("should detect physical adjacency between companion seats", () => {
    // Same row, same bench side
    expect(areSeatsAdjacent("4A", "4B", "2x2")).toBe(true);
    expect(areSeatsAdjacent("4C", "4D", "2x2")).toBe(true);

    // Same row, across aisle
    expect(areSeatsAdjacent("4B", "4C", "2x2")).toBe(true);

    // Opposite window seats across aisle are NOT directly adjacent
    expect(areSeatsAdjacent("4A", "4D", "2x2")).toBe(false);

    // Different rows are not side-by-side adjacent
    expect(areSeatsAdjacent("3A", "4A", "2x2")).toBe(false);
  });

  it("should compute highest proximity score for side-by-side partner seating", () => {
    const sideBySide = calculatePartnerProximity("4B", "4A", "2x2", 10);
    expect(sideBySide.score).toBe(250);
    expect(sideBySide.isAdjacent).toBe(true);
    expect(sideBySide.relation).toBe("SIDE_BY_SIDE");

    const acrossAisle = calculatePartnerProximity("4C", "4B", "2x2", 10);
    expect(acrossAisle.score).toBe(180);
    expect(acrossAisle.isAdjacent).toBe(true);
    expect(acrossAisle.relation).toBe("ACROSS_AISLE");

    const tandem = calculatePartnerProximity("5A", "4A", "2x2", 10);
    expect(tandem.score).toBe(70);
    expect(tandem.isAdjacent).toBe(false);
  });

  it("should automatically allocate adjacent seat next to partner (Railway Companion rule)", () => {
    const partnerId = "stud-rahul";
    const result = allocateSeatWithPreferences({
      bus: mockBus,
      student: {
        id: "stud-aditya",
        fullName: "Aditya Pandey",
        preferredPartnerStudentId: partnerId,
        preferredPartnerName: "Rahul Sharma",
        seatRowPreference: "MIDDLE",
      },
      occupiedSeats: ["4A"], // Rahul is seated in 4A
      allTripReservations: [
        {
          studentId: partnerId,
          studentName: "Rahul Sharma",
          chosenSeat: "4A",
          status: "CONFIRMED",
        },
      ],
    });

    // 4B is side-by-side to Rahul (4A)
    expect(result.allocatedSeat).toBe("4B");
    expect(result.isAdjacentToPartner).toBe(true);
    expect(result.partnerSeat).toBe("4A");
    expect(result.matchReasons.some((r) => r.includes("side-by-side"))).toBe(true);
  });

  it("should allocate across the aisle if side-by-side is already occupied", () => {
    const partnerId = "stud-rahul";
    const result = allocateSeatWithPreferences({
      bus: mockBus,
      student: {
        id: "stud-aditya",
        fullName: "Aditya Pandey",
        preferredPartnerStudentId: partnerId,
        preferredPartnerName: "Rahul Sharma",
      },
      occupiedSeats: ["4B", "4A"], // 4B is taken by someone else, partner is in 4B, 4A taken
      allTripReservations: [
        {
          studentId: partnerId,
          studentName: "Rahul Sharma",
          chosenSeat: "4B",
          status: "CONFIRMED",
        },
      ],
    });

    // 4C is across the aisle from 4B
    expect(result.allocatedSeat).toBe("4C");
    expect(result.isAdjacentToPartner).toBe(true);
  });

  it("should respect Front row and Window preferences when no partner is specified", () => {
    const result = allocateSeatWithPreferences({
      bus: mockBus,
      student: {
        id: "stud-commuter",
        seatRowPreference: "FRONT",
        seatPositionPreference: "WINDOW",
      },
      occupiedSeats: [],
    });

    // Seats 1A and 1B are teacher reserved, so row 2 Window (2A or 2D) or non-reserved row 1
    const parsed = parseSeat(result.allocatedSeat);
    expect(parsed?.row).toBeLessThanOrEqual(4); // In FRONT zone
    expect(result.seatPosition).toBe("WINDOW");
    expect(result.seatRowZone).toBe("FRONT");
  });

  it("should protect teacher reserved starting seats from non-faculty auto-allocation", () => {
    const result = allocateSeatWithPreferences({
      bus: mockBus, // has 2 teacher seats (1A, 1B)
      student: {
        id: "stud-student",
        role: "student",
        seatRowPreference: "FRONT",
      },
      occupiedSeats: [],
    });

    expect(result.allocatedSeat).not.toBe("1A");
    expect(result.allocatedSeat).not.toBe("1B");
  });

  it("should allocate a contiguous adjacent pair for two accepting partners", () => {
    const pairResult = allocateAdjacentPairForPartners(
      mockBus,
      {
        id: "stud-1",
        seatRowPreference: "MIDDLE",
        seatPositionPreference: "WINDOW",
      },
      {
        id: "stud-2",
        seatRowPreference: "MIDDLE",
        seatPositionPreference: "AISLE",
      },
      ["5A", "5B", "5C", "5D"] // Row 5 is fully taken
    );

    expect(pairResult.isAdjacent).toBe(true);
    expect(pairResult.relation).toBe("SIDE_BY_SIDE");
    expect(areSeatsAdjacent(pairResult.seatA, pairResult.seatB, "2x2")).toBe(true);
    // Student 1 wanted Window, Student 2 wanted Aisle
    expect(getSeatPosition(pairResult.seatA, "2x2")).toBe("WINDOW");
    expect(getSeatPosition(pairResult.seatB, "2x2")).toBe("AISLE");
  });
});
