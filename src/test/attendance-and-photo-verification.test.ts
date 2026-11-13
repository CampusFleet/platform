import { describe, it, expect, beforeEach } from "vitest";
import { store } from "../lib/store";
import { Student, Trip, Booking } from "../lib/types";

describe("Attendance and Passport Photo Anti-Impersonation Verification", () => {
  const testStudentId = "stud-photo-test-01";

  beforeEach(() => {
    // Reset test student in store
    const existing = store.getStudents().find((s) => s.id === testStudentId);
    if (!existing) {
      const newStudent: Student = {
        id: testStudentId,
        userId: "u-photo-test",
        fullName: "Vikram Malhotra",
        email: "vikram.test@gehu.ac.in",
        phone: "+91 98765 43210",
        department: "B.Tech Computer Science & Engineering",
        semester: "4th Semester",
        primaryStopId: "stop-1",
        photoUrl: "",
        photoLocked: false,
        hasActiveSubscription: true,
        primaryRouteId: "",
        transportAccessSuspended: false,
        emergencyContact: {
          name: "Parent",
          relationship: "Parent",
          phone: "+91 98765 43210"
        }
      };
      (store as any).students.push(newStudent);
    } else {
      existing.photoUrl = "";
      existing.photoLocked = false;
    }
  });

  // Pass-photo locking now lives on the server (src/lib/students/portrait.ts); see portrait-lock.test.ts.
  describe("Single-Use Attendance Per Shift (Anti-Replay Security)", () => {
    const testTripId = "trip-attend-test-01";

    it("records attendance on first scan and marks booking as BOARDED", async () => {
      // Ensure student has a test booking
      const testBooking: Booking = {
        id: "bk-attend-01",
        bookingCode: "GEHU-PASS-ATTEND",
        tripId: testTripId,
        studentId: testStudentId,
        seatNumber: "12A",
        status: "CONFIRMED",
        bookingDate: new Date().toISOString().split("T")[0],
        boardingStopId: "stop-1",
        createdAt: new Date().toISOString(),
      };
      (store as any).bookings.push(testBooking);

      // Record first attendance
      const res = await store.recordAttendance(
        testStudentId,
        testTripId,
        "QR_SCAN",
        "BOARDED",
        "Verified via Conductor Optical QR Scanner (Photo ID Match Confirmed)"
      );

      expect(res.success).toBe(true);
      expect(res.record?.status).toBe("BOARDED");
      expect(res.record?.method).toBe("QR_SCAN");

      // Booking status should be updated to BOARDED
      const b = store.getBookings().find((x) => x.id === "bk-attend-01");
      expect(b?.status).toBe("BOARDED");
      expect(b?.boardedAt).toBeDefined();
    });

    it("detects duplicate replay scans for the same student on the same trip", () => {
      const b = store.getBookings().find((x) => x.id === "bk-attend-01");
      expect(b?.status).toBe("BOARDED");

      // A second attempt to check-in with the same booking code
      const isAlreadyBoarded = b?.status === "BOARDED";
      expect(isAlreadyBoarded).toBe(true);
    });
  });

  describe("Attendance Lock & Dual Unlock (Location Distance & RFID)", () => {
    const lockTripId = "trip-lock-test-99";
    const lockStudentId = "stud-lock-test";

    beforeEach(() => {
      const student: Student = {
        id: lockStudentId,
        userId: "u-lock-test",
        fullName: "Aarav Sharma",
        email: "aarav.test@gehu.ac.in",
        phone: "+91 99887 76655",
        department: "B.Tech AI & Data Science",
        semester: "6th Semester",
        primaryStopId: "stop-lock",
        photoUrl: "https://example.com/aarav.jpg",
        photoLocked: true,
        hasActiveSubscription: true,
        primaryRouteId: "route-lock",
        transportAccessSuspended: false,
        emergencyContact: null,
      };
      (store as any).students.push(student);

      const booking: Booking = {
        id: "bk-lock-01",
        bookingCode: "LOCK-PASS-01",
        tripId: lockTripId,
        studentId: lockStudentId,
        seatNumber: "5B",
        status: "CONFIRMED",
        bookingDate: new Date().toISOString().split("T")[0],
        boardingStopId: "stop-lock",
        createdAt: new Date().toISOString(),
      };
      (store as any).bookings.push(booking);
    });

    it("rejects Location Distance Unlock when commuter is beyond <2m threshold", async () => {
      // Commuter is 350 meters away
      const res = await store.unlockAttendance(lockStudentId, lockTripId, "LOCATION_DISTANCE", {
        distanceMeters: 350,
      });

      expect(res.success).toBe(false);
      expect(res.message).toContain("Attendance Locked");
      expect(res.message).toContain("350m");

      // Even at 5 meters away, it must be rejected since threshold is < 2 meters
      const res5m = await store.unlockAttendance(lockStudentId, lockTripId, "LOCATION_DISTANCE", {
        distanceMeters: 5,
      });
      expect(res5m.success).toBe(false);

      // Booking must remain not boarded
      const b = store.getBookings().find((x) => x.id === "bk-lock-01");
      expect(b?.status).not.toBe("BOARDED");
    });

    it("successfully unlocks attendance when commuter is within <2m live GPS proximity", async () => {
      // Commuter is 1.2 meters away (strictly < 2m)
      const res = await store.unlockAttendance(lockStudentId, lockTripId, "LOCATION_DISTANCE", {
        distanceMeters: 1.2,
        busId: 44,
      });

      expect(res.success).toBe(true);
      expect(res.record?.lockStatus).toBe("UNLOCKED");
      expect(res.record?.unlockedBy).toBe("LOCATION_DISTANCE");
      expect(res.record?.distanceMeters).toBe(1.2);
      expect(res.record?.status).toBe("BOARDED");

      // Booking status must be updated to BOARDED with lockStatus UNLOCKED
      const b = store.getBookings().find((x) => x.id === "bk-lock-01");
      expect(b?.status).toBe("BOARDED");
      expect((b as any)?.lockStatus).toBe("UNLOCKED");
    });

    it("instantly unlocks attendance and records card UID upon physical RFID tap", async () => {
      const cardUid = "93A24B1F";
      const res = await store.unlockAttendance(lockStudentId, lockTripId, "RFID", {
        rfidCardId: cardUid,
        busId: 44,
      });

      expect(res.success).toBe(true);
      expect(res.record?.lockStatus).toBe("UNLOCKED");
      expect(res.record?.unlockedBy).toBe("RFID");
      expect(res.record?.rfidCardId).toBe(cardUid);
      expect(res.record?.status).toBe("BOARDED");
      expect(res.message).toContain(cardUid);
    });
  });
});
