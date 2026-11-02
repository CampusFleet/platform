import { CampusFleetStore } from "./_base";
import { supabase } from "../supabaseClient";
import { createBooking, cancelBookingAndPromoteWaitlist } from "../reservation-engine";
import { createAttendanceId } from "../id";
import type { Booking, AttendanceRecord } from "../types";

// ── Module Augmentation ─────────────────────────────────────────────────────
declare module "./_base" {
  interface CampusFleetStore {
    recordAttendance(studentId: string, tripId: string, method: "QR_SCAN" | "BIOMETRIC_DEVICE" | "MANUAL_OVERRIDE", status?: "BOARDED" | "ABSENT" | "NO_SHOW", notes?: string): Promise<any>;
    recordUserAttendance(params: {
      userId: string;
      userName?: string;
      userRole: "driver" | "conductor" | "student" | string;
      busId: number;
      tripId?: string;
      method: "BUS_QR_SCAN" | "MANUAL_SELECT";
      notes?: string;
    }): Promise<{ success: boolean; message: string; record: AttendanceRecord }>;
    recordStaffAttendance(params: any): Promise<{ success: boolean; message: string; record: AttendanceRecord }>;
    unlockAttendance(
      studentId: string,
      tripId: string,
      method: "LOCATION_DISTANCE" | "RFID",
      meta?: { distanceMeters?: number; rfidCardId?: string; busId?: number }
    ): Promise<{ success: boolean; record?: AttendanceRecord; message: string }>;
    assignWaitlistSeat(bookingId: string, seatCode: string): Promise<any>;
    bookShift(studentId: string, tripId: string, stopId: string, requestedSeatNumber?: string, instantBoard?: boolean): Promise<any>;
    cancelBooking(bookingId: string): Promise<any>;
  }
}

// ── Attendance ──────────────────────────────────────────────────────────────

CampusFleetStore.prototype.recordAttendance = async function (
  this: CampusFleetStore,
  studentId: string,
  tripId: string,
  method: "QR_SCAN" | "BIOMETRIC_DEVICE" | "MANUAL_OVERRIDE",
  status: "BOARDED" | "ABSENT" | "NO_SHOW" = "BOARDED",
  notes?: string
) {
  const student = this.students.find(s => s.id === studentId || s.userId === studentId || s.email?.toLowerCase() === studentId.toLowerCase());
  const resolvedStudentId = student?.id || studentId;

  const matchedBooking = this.bookings.find(
    b => (b.studentId === resolvedStudentId || b.studentId === studentId || b.id === studentId) && (tripId ? b.tripId === tripId : true)
  );
  const bookingId = matchedBooking?.id || `bk-${resolvedStudentId}`;

  const newRecord: AttendanceRecord = {
    id: createAttendanceId(),
    studentId: resolvedStudentId,
    bookingId,
    tripId,
    method,
    verifiedBy: this.currentUser?.fullName || "University Conductor",
    signatureToken: `SIG-${Date.now().toString(36).toUpperCase()}`,
    status,
    notes: notes || "Recorded via Conductor Console",
    timestamp: new Date().toISOString(),
  };
  this.attendanceRecords = [newRecord, ...this.attendanceRecords];
  this.bookings = this.bookings.map(b => {
    const isMatch = (
      b.studentId === resolvedStudentId ||
      b.studentId === studentId ||
      (student && (b.studentId === student.userId || b.studentId === student.id)) ||
      b.id === studentId ||
      (matchedBooking && b.id === matchedBooking.id)
    ) && (tripId ? b.tripId === tripId : true);

    if (isMatch) {
      return {
        ...b,
        status,
        boardedAt: status === "BOARDED" ? new Date().toISOString() : undefined,
      };
    }
    return b;
  });
  
  // Dispatch student notification
  const trip = this.trips.find(t => t.id === tripId);
  const bus = this.buses.find(b => b.id === trip?.busId);

  if (student) {
    this.createNotification({
      userId: student.userId || student.id,
      title: status === "BOARDED" ? "Boarding Verified ✓" : `Attendance Status: ${status}`,
      message: status === "BOARDED"
        ? `Your QR boarding pass was verified by the conductor. You are marked Present on ${bus?.busNumber || "the campus shuttle"}.`
        : `Attendance updated to ${status}.`,
      type: "BOARDING",
      isRead: false,
    });
  }

  // Persist to Supabase Database (Single Source of Truth)
  try {
    const { error: attErr } = await supabase.from("attendance_records").insert({
      id: newRecord.id,
      student_id: resolvedStudentId,
      booking_id: bookingId,
      trip_id: tripId,
      bus_id: bus?.id || null,
      method,
      status,
      verified_by: newRecord.verifiedBy,
      signature_token: newRecord.signatureToken,
      notes: newRecord.notes,
      timestamp: newRecord.timestamp,
    });
    if (attErr) {
      console.error("attendance_records insert error:", attErr);
    }

    const updatePayload: any = { status };
    if (status === "BOARDED") {
      updatePayload.boarded_at = newRecord.timestamp;
    }

    if (matchedBooking?.id) {
      const { error: bkErr } = await supabase.from("bus_reservations").update(updatePayload).eq("id", matchedBooking.id);
      if (bkErr) console.error("bus_reservations update error:", bkErr);
    } else {
      const { error: bkErr } = await supabase.from("bus_reservations").update(updatePayload).eq("trip_id", tripId).eq("student_id", resolvedStudentId);
      if (bkErr) console.error("bus_reservations update error:", bkErr);
    }

    // Record audit log in PostgreSQL
    await supabase.from("audit_logs").insert({
      user_id: resolvedStudentId,
      user_role: "conductor",
      action: `ATTENDANCE_MARKED_${status}`,
      entity: "AttendanceRecord",
      entity_id: newRecord.id,
      reason: notes || `Marked ${status} via Conductor Console`,
      new_value: { status, tripId, method },
    });
  } catch (e) {
    console.warn("DB recordAttendance sync notice:", e);
  }

  this.saveToLocalStorage();
  this.notify();
  return { success: true, message: `Passenger attendance marked as ${status}`, record: newRecord };
};

CampusFleetStore.prototype.unlockAttendance = async function (
  this: CampusFleetStore,
  studentId: string,
  tripId: string,
  method: "LOCATION_DISTANCE" | "RFID",
  meta?: { distanceMeters?: number; rfidCardId?: string; busId?: number }
) {
  const student = this.students.find(
    s => s.id === studentId || s.userId === studentId || s.email?.toLowerCase() === studentId.toLowerCase()
  );
  const resolvedStudentId = student?.id || studentId;

  // Proximity validation for Location Distance: must be strictly < 2 meters
  if (method === "LOCATION_DISTANCE") {
    const dist = meta?.distanceMeters ?? Infinity;
    if (dist >= 2) {
      return {
        success: false,
        message: `Attendance Locked: You are ${dist}m away from the bus (allowed: <2m).`,
      };
    }
  }

  const matchedBooking = this.bookings.find(
    b => (b.studentId === resolvedStudentId || b.studentId === studentId) && (tripId ? b.tripId === tripId : true)
  );
  const bookingId = matchedBooking?.id || `bk-${resolvedStudentId}`;
  const nowIso = new Date().toISOString();

  const newRecord: AttendanceRecord = {
    id: createAttendanceId(),
    studentId: resolvedStudentId,
    bookingId,
    tripId,
    busId: meta?.busId !== undefined ? Number(meta.busId) : (matchedBooking?.busId !== undefined ? Number(matchedBooking.busId) : undefined),
    method: method === "RFID" ? "RFID_VERIFIED" : "LOCATION_DISTANCE_UNLOCK",
    verifiedBy: method === "RFID" ? "ESP32 Hardware RFID Gate" : "Location Distance Proximity Engine",
    signatureToken: `${method}-${Date.now().toString(36).toUpperCase()}`,
    status: "BOARDED",
    lockStatus: "UNLOCKED",
    unlockedBy: method,
    distanceMeters: meta?.distanceMeters,
    rfidCardId: meta?.rfidCardId || student?.rfidCardId,
    unlockTimestamp: nowIso,
    notes: method === "RFID"
      ? `Attendance unlocked via physical RFID card [${meta?.rfidCardId || "RFID"}]`
      : `Attendance unlocked via GPS location distance (${meta?.distanceMeters || 0}m <= 100m)`,
    timestamp: nowIso,
  };

  this.attendanceRecords = [newRecord, ...this.attendanceRecords];
  this.bookings = this.bookings.map(b => {
    if ((b.studentId === resolvedStudentId || b.id === bookingId) && (tripId ? b.tripId === tripId : true)) {
      return {
        ...b,
        status: "BOARDED",
        boardedAt: nowIso,
        unlockedBy: method,
        lockStatus: "UNLOCKED",
      };
    }
    return b;
  });

  this.saveToLocalStorage();
  this.notify();

  return {
    success: true,
    record: newRecord,
    message: method === "RFID"
      ? `✓ Attendance Unlocked via RFID Card Tap [${meta?.rfidCardId || "RFID"}]. Welcome aboard!`
      : `✓ Attendance Unlocked via Live GPS Distance (${meta?.distanceMeters || 0}m). Welcome aboard!`,
  };
};

// ── User / Crew Duty Attendance ─────────────────────────────────────────────

CampusFleetStore.prototype.recordUserAttendance = async function (
  this: CampusFleetStore,
  params: {
    userId: string;
    userName?: string;
    userRole: "driver" | "conductor" | "student" | string;
    busId: number;
    tripId?: string;
    method: "BUS_QR_SCAN" | "MANUAL_SELECT";
    notes?: string;
  }
) {
  const { userId, userName, userRole, busId, tripId, method, notes } = params;
  const bus = this.buses.find(b => b.id === busId);
  const resolvedTrip = tripId
    ? this.trips.find(t => t.id === tripId)
    : this.trips.find(t => t.busId === busId && t.status !== "COMPLETED");
  const finalTripId = resolvedTrip?.id || tripId || "";
  const resolvedUserName =
    userName ||
    this.currentUser?.fullName ||
    (userRole === "driver" ? "Bus Driver" : userRole === "conductor" ? "Bus Conductor" : "Passenger");

  // Create attendance record
  const newRecord: AttendanceRecord = {
    id: createAttendanceId(),
    studentId: userId,
    userId,
    userRole,
    userName: resolvedUserName,
    tripId: finalTripId,
    busId,
    method: method as any,
    verifiedBy: `${userRole.toUpperCase()}: ${resolvedUserName}`,
    signatureToken: `DUTY-${Date.now().toString(36).toUpperCase()}`,
    status: "BOARDED",
    notes: notes || `Duty attendance marked via ${method === "BUS_QR_SCAN" ? "Physical Bus QR Code" : "Bus Selection Card"}`,
    timestamp: new Date().toISOString(),
  };

  this.attendanceRecords = [newRecord, ...this.attendanceRecords];

  // If trip exists and role is driver/conductor, update trip crew
  if (resolvedTrip) {
    if (userRole === "driver") {
      resolvedTrip.driverId = userId;
    } else if (userRole === "conductor") {
      resolvedTrip.conductorId = userId;
    }
  }

  // Audit log to PostgreSQL
  try {
    await supabase.from("audit_logs").insert({
      user_id: userId,
      user_role: userRole,
      action: `USER_DUTY_CHECKIN_${method}`,
      entity: "UserAttendance",
      entity_id: newRecord.id,
      reason: notes || `Duty check-in for bus ${bus?.busNumber || busId}`,
      new_value: {
        userRole,
        userName: resolvedUserName,
        busId,
        tripId: finalTripId,
        method,
        timestamp: newRecord.timestamp,
      },
    });
  } catch (e) {
    console.warn("DB recordUserAttendance notice:", e);
  }

  this.saveToLocalStorage();
  this.notify();
  return {
    success: true,
    message: `✓ Attendance verified for ${bus?.busNumber || "Bus"}! Duty active.`,
    record: newRecord,
  };
};

CampusFleetStore.prototype.recordStaffAttendance = async function (this: CampusFleetStore, params: any) {
  return this.recordUserAttendance({
    userId: params.userId || params.staffId,
    userName: params.userName || params.staffName,
    userRole: params.userRole || params.staffRole,
    busId: params.busId,
    tripId: params.tripId,
    method: params.method,
    notes: params.notes,
  });
};

// ── Waitlist Seat Assignment ────────────────────────────────────────────────

CampusFleetStore.prototype.assignWaitlistSeat = async function (this: CampusFleetStore, bookingId: string, seatCode: string) {
  const booking = this.bookings.find(b => b.id === bookingId);
  if (!booking) return { success: false, message: "Booking not found" };

  booking.status = "CONFIRMED";
  booking.seatNumber = seatCode;
  booking.waitlistPosition = undefined;

  this.bookings = this.bookings.map(b => (b.id === bookingId ? { ...b, status: "CONFIRMED", seatNumber: seatCode, waitlistPosition: undefined } : b));
  this.notify();

  // Persist to PostgreSQL database (Single Source of Truth)
  try {
    await supabase.from("bus_reservations").update({
      status: "CONFIRMED",
      chosen_seat: seatCode,
    }).eq("id", bookingId);

    await supabase.from("audit_logs").insert({
      user_role: "conductor",
      action: "CONDUCTOR_SEAT_ALLOCATION",
      entity: "Booking",
      entity_id: bookingId,
      reason: `Allocated available seat ${seatCode} to waitlisted passenger`,
      new_value: { status: "CONFIRMED", seatNumber: seatCode },
    });
  } catch (err) {
    console.warn("DB assignWaitlistSeat notice:", err);
  }

  return { success: true, message: `Seat ${seatCode} assigned successfully!` };
};

// ── Shift Booking ───────────────────────────────────────────────────────────

CampusFleetStore.prototype.bookShift = async function (this: CampusFleetStore, studentId: string, tripId: string, stopId: string, requestedSeatNumber?: string, instantBoard?: boolean) {
  const trip = this.trips.find(t => t.id === tripId);
  const bus = this.buses.find(b => b.id === trip?.busId);
  const student = this.students.find(s => s.id === studentId) || {
    id: studentId,
    userId: this.currentUser?.id || "u-guest",
    fullName: this.currentUser?.fullName || "Student",
    email: this.currentUser?.email || "student@campus.edu",
    phone: null,
    department: "Campus Transit",
    semester: "1st",
    primaryStopId: stopId,
    primaryRouteId: trip?.routeId || "",
    emergencyContact: { name: null, relationship: null, phone: null },
    transportAccessSuspended: false,
    hasActiveSubscription: Boolean(this.currentUser?.role === "admin"),
    subscriptionExpiryDate: "2027-12-31",
  };

  if (!trip || !bus) {
    return { success: false, message: "Trip or bus allocation not found" };
  }

  // 1. Authoritative Server Booking Call (Client Browser)
  if (typeof window !== "undefined") {
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          tripId,
          boardingStopId: stopId,
          requestedSeatNumber,
          instantBoard,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        return {
          success: false,
          message: data.message || data.error || "Booking rejected by transit server.",
          code: data.code,
          existingBooking: data.existingBooking,
        };
      }

      if (data.booking) {
        this.bookings = [
          ...this.bookings.filter(b => b.id !== data.booking.id),
          data.booking,
        ];
        this.saveToLocalStorage();
        this.notify();
      }

      return {
        success: true,
        message: data.message || `Seat ${data.booking?.seatNumber || "Confirmed"} reserved successfully!`,
        booking: data.booking,
      };
    } catch (err: any) {
      console.warn("Server booking API network failure, falling back to local engine:", err);
    }
  }

  // 2. Local / Offline Engine Fallback with Shift-Wide Mutual Exclusion
  const tripBookings = this.bookings.filter(b => b.tripId === tripId);
  const res = createBooking(
    student,
    trip,
    bus,
    stopId,
    tripBookings,
    this.currentUser?.id || "u-guest",
    requestedSeatNumber,
    this.bookings,
    this.trips
  );

  if (res.success && res.booking) {
    this.bookings = [...this.bookings, res.booking];

    // Dispatch confirmed notification and email alert
    this.createNotification({
      userId: student.userId || student.id,
      title: "Seat Reservation Confirmed! 🎉",
      message: `Your seat ${res.booking.seatNumber || `WL-${res.booking.waitlistPosition}`} is confirmed on ${bus.busNumber}. Confirmation email sent to ${student.email}.`,
      type: "CONFIRMATION",
      isRead: false,
    });

    // Persist to Supabase
    try {
      supabase.from("bus_reservations").insert({
        id: res.booking.id,
        booking_code: res.booking.bookingCode,
        student_id: res.booking.studentId,
        trip_id: res.booking.tripId,
        bus_id: bus.id,
        boarding_stop_id: res.booking.boardingStopId,
        status: res.booking.status,
        chosen_seat: res.booking.seatNumber,
        reservation_date: new Date().toISOString().split("T")[0],
        created_at: res.booking.createdAt,
      }).then(() => {});
    } catch (e) {
      console.warn("DB bookShift sync notice:", e);
    }

    if (this.currentUser) {
      this.currentUser = {
        ...this.currentUser,
        studentId: student.id,
      };
    }

    this.saveToLocalStorage();
    this.notify();
  }

  return res;
};

// ── Booking Cancellation ────────────────────────────────────────────────────

CampusFleetStore.prototype.cancelBooking = async function (this: CampusFleetStore, bookingId: string) {
  // 1. Authoritative Server Cancellation Call (Client Browser)
  if (typeof window !== "undefined") {
    try {
      const response = await fetch("/api/bookings/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          studentId: this.currentUser?.studentId || this.currentUser?.id,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        console.warn("Server cancel booking notice:", data.error);
      }
    } catch (err) {
      console.warn("Server cancel booking API network notice:", err);
    }
  }

  const booking = this.bookings.find(b => b.id === bookingId);
  if (!booking) return { success: false, message: "Booking not found" };

  const trip = this.trips.find(t => t.id === booking.tripId);
  const bus = this.buses.find(b => b.id === trip?.busId);
  if (!trip || !bus) return { success: false, message: "Trip details not found" };

  const tripBookings = this.bookings.filter(b => b.tripId === booking.tripId);
  const { cancelledBooking, promotedBooking, updatedWaitlistBookings } = cancelBookingAndPromoteWaitlist(
    booking,
    trip,
    bus,
    tripBookings,
    this.currentUser?.id || "u-guest"
  );

  this.bookings = this.bookings.map(b => {
    if (b.id === cancelledBooking.id) return cancelledBooking;
    return b;
  });

  // Update Supabase cancellation
  try {
    supabase.from("bus_reservations").update({
      status: "CANCELLED",
      cancelled_at: new Date().toISOString(),
    }).eq("id", cancelledBooking.id).then(() => {});
  } catch (e) {
    console.warn("DB cancelBooking sync notice:", e);
  }

  this.saveToLocalStorage();
  this.notify();
  return {
    success: true,
    message: "Seat reservation cancelled successfully. The seat has been released back to available fleet inventory.",
  };
};
