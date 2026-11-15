import { CampusFleetStore } from "./_base";
import { createBooking, cancelBookingAndPromoteWaitlist } from "../reservation-engine";
import { createAttendanceId, createBookingId } from "../id";
import type { Booking, AttendanceRecord } from "../types";

// ── Module Augmentation ─────────────────────────────────────────────────────
declare module "./_base" {
  interface CampusFleetStore {
    cancelBooking(bookingId: string): Promise<any>;
  }
}

// ── Attendance ──────────────────────────────────────────────────────────────

// ── User / Crew Duty Attendance ─────────────────────────────────────────────

// ── Waitlist Seat Assignment ────────────────────────────────────────────────

// ── Shift Booking ───────────────────────────────────────────────────────────

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
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) return { success: false, message: data.error || "Could not cancel the reservation." };
    } catch {
      return { success: false, message: "Network error. The reservation was not cancelled." };
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


  this.saveToLocalStorage();
  this.notify();
  return {
    success: true,
    message: "Seat reservation cancelled successfully. The seat has been released back to available fleet inventory.",
  };
};
