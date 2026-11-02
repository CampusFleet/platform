import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { redis, cacheGet } from "@/lib/redis";
import type { HaltRequest, Booking } from "@/lib/types";
import { mergeReservationsIntoBookings } from "@/lib/trip-resolver";

export const dynamic = "force-dynamic";

/**
 * Conductor Live Sync API:
 * Lightweight, high-frequency synchronization endpoint for active duty conductors.
 * Returns recent attendance records, updated booking statuses (including smart transit bus reservations),
 * and pending SOS halt requests.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tripId = searchParams.get("tripId");

    if (!tripId) {
      return NextResponse.json(
        { success: false, error: "tripId is required for conductor sync" },
        { status: 400 }
      );
    }

    const todayDate = new Date().toISOString().split("T")[0];

    // Parallel fetch: Trip attendance, updated bookings, smart reservations, Redis SOS halt requests, and active Departure Alert
    const [attendanceRes, bookingsRes, reservationsRes, haltRequests, departureAlertRes] = await Promise.all([
      supabaseAdmin
        .from("attendance_records")
        .select("*")
        .eq("trip_id", tripId)
        .order("timestamp", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("bookings_full")
        .select("*")
        .eq("trip_id", tripId)
        .limit(100),
      supabaseAdmin
        .from("bus_reservations")
        .select("*")
        .eq("trip_id", tripId)
        .neq("status", "CANCELLED")
        .limit(100),
      (async () => {
        if (!redis) return [];
        try {
          const keys = await redis.keys(`halt_request:${tripId}:*`);
          if (!keys || keys.length === 0) return [];
          const data = await redis.mget(...keys);
          return (data.filter(Boolean) as HaltRequest[]).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        } catch {
          return [];
        }
      })(),
      supabaseAdmin
        .from("bus_departure_alerts")
        .select("*")
        .eq("trip_id", tripId)
        .eq("status", "ACTIVE")
        .order("triggered_at", { ascending: false })
        .limit(1),
    ]);

    const activeAlert = departureAlertRes.data && departureAlertRes.data.length > 0 ? departureAlertRes.data[0] : null;

    const attendance = (attendanceRes.data || []).map((a: any) => ({
      id: a.id,
      studentId: a.student_id,
      userId: a.user_id,
      userRole: a.user_role,
      userName: a.user_name,
      tripId: a.trip_id,
      busId: a.bus_id,
      bookingId: a.booking_id,
      method: a.method || "QR_SCAN",
      verifiedBy: a.verified_by || "Conductor",
      signatureToken: a.signature_token,
      deviceId: a.device_id,
      status: a.status || "BOARDED",
      notes: a.notes,
      timestamp: a.timestamp || new Date().toISOString(),
      lockStatus: a.lock_status,
      unlockedBy: a.unlocked_by,
      distanceMeters: a.distance_meters,
      rfidCardId: a.rfid_card_id,
      unlockTimestamp: a.unlock_timestamp,
    }));

    const baseBookings: Booking[] = (bookingsRes.data || []).map((b: any) => ({
      id: b.id,
      bookingCode: b.booking_code || "",
      studentId: b.student_id,
      tripId: b.trip_id,
      busId: b.bus_id || "",
      bookingDate: b.booking_date || todayDate,
      boardingStopId: b.boarding_stop_id || b.stop_id || "",
      status: b.status || "",
      waitlistPosition: b.waitlist_position,
      seatNumber: b.seat_number,
      passengerType: b.passenger_type || "",
      mergeStopId: b.merge_stop_id,
      createdAt: b.created_at || new Date().toISOString(),
    }));

    const bookings = mergeReservationsIntoBookings(baseBookings, reservationsRes.data || []);

    return NextResponse.json({
      success: true,
      tripId,
      attendance,
      bookings,
      haltRequests,
      activeDepartureAlert: activeAlert
        ? {
            id: activeAlert.id,
            tripId: activeAlert.trip_id,
            busId: activeAlert.bus_id,
            alertType: activeAlert.alert_type,
            message: activeAlert.message,
            triggeredAt: activeAlert.triggered_at,
            triggeredBy: activeAlert.triggered_by,
            status: activeAlert.status,
          }
        : null,
      serverTime: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to sync conductor state" },
      { status: 500 }
    );
  }
}
