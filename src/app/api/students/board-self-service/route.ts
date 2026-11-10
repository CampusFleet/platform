import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { calculateDistanceKm, isStartingSeat, getTeacherStartingSeats, generateSeatLayout } from "@/lib/utils";
import { cacheGet, cacheSet } from "@/lib/redis";
import { getLiveLocationFromMongo } from "@/lib/mongodb";
import { verifyRollingBusToken } from "@/lib/rolling-bus-crypto";
import { createBookingId } from "@/lib/id";
import crypto from "crypto";

/**
 * Student Self-Service QR Boarding & Attendance Verification
 * Validates rolling encrypted dynamic QR display codes (ESP32) or live GPS proximity.
 * When a bus QR is scanned, this marks attendance and transitions the student to BOARDED.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "STUDENT" && session.role !== "student")) {
      return NextResponse.json({ success: false, message: "Unauthorized: Student session required." }, { status: 401 });
    }

    const body = await req.json();
    const { busId, seatId, latitude, longitude, busLatitude, busLongitude, rollingPayload, rollingToken } = body;

    if (!busId) {
      return NextResponse.json({ success: false, message: "Missing bus identifier." }, { status: 400 });
    }

    // 1. Resolve the student profile owned by this session (students has no email column)
    const { data: studentRecord } = await supabaseAdmin
      .from("students")
      .select("id, user_id, full_name, primary_route_id, primary_stop_id, transport_access_suspended")
      .eq("user_id", session.userId)
      .maybeSingle();

    if (!studentRecord?.id) {
      return NextResponse.json({ success: false, message: "No student profile found for this account." }, { status: 404 });
    }
    if (studentRecord.transport_access_suspended) {
      return NextResponse.json({ success: false, message: "Your transport access is suspended." }, { status: 403 });
    }
    const resolvedStudentId: string = studentRecord.id;

    // 2. Resolve bus asset (must exist — no hardcoded fallback buses)
    const rawBusId = String(busId).trim();
    const numericBusId = parseInt(rawBusId.replace(/\D/g, ""), 10);

    let dbBus: any = null;
    if (!isNaN(numericBusId)) {
      const { data: foundBuses } = await supabaseAdmin
        .from("buses")
        .select("id, bus_number, capacity, seat_layout, teacher_seats_count, current_route_id")
        .or(`id.eq.${numericBusId},bus_number.eq.${numericBusId}`)
        .limit(1);
      dbBus = foundBuses?.[0];
    }

    if (!dbBus) {
      return NextResponse.json({ success: false, message: "Unknown bus in scanned QR code." }, { status: 404 });
    }

    const resolvedBusId: number = dbBus.id;
    const resolvedBusNumber: string = String(dbBus.bus_number);

    // 3. Cryptographic Dynamic Rolling QR Verification (ESP32 In-Bus Display)
    let isRollingVerified = false;
    if (rollingPayload || rollingToken) {
      let cryptoResult;
      try {
        cryptoResult = await verifyRollingBusToken(rollingPayload || rollingToken, resolvedStudentId);
      } catch (cfgErr: any) {
        console.error("[board-self-service] rolling QR misconfigured:", cfgErr?.message);
        return NextResponse.json({ success: false, message: "Dynamic QR boarding is not configured." }, { status: 503 });
      }

      if (!cryptoResult.valid) {
        return NextResponse.json({
          success: false,
          status: cryptoResult.code || "INVALID_ROLLING_TOKEN",
          message: cryptoResult.error || "Dynamic QR verification failed.",
        }, { status: 403 });
      }
      // The signed token names the bus whose screen was scanned; it must match the claimed bus.
      if (String(cryptoResult.busId) !== String(resolvedBusId)) {
        return NextResponse.json({
          success: false,
          status: "BUS_MISMATCH",
          message: "This dynamic QR belongs to a different bus.",
        }, { status: 403 });
      }
      isRollingVerified = true;
    }

    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const today = istDate.toISOString().split("T")[0];
    const utcToday = now.toISOString().split("T")[0];
    const allowedDates = Array.from(new Set([today, utcToday]));

    // 4. Geofencing Verification
    const GEOFENCE_KM = 0.25; // 250m buffer
    let isNearBus = false;
    let nearestStopName = "";
    let calculatedDistMeters = 0;

    if (isRollingVerified) {
      // Physical presence is cryptographically proven by the 2-second HMAC rolling screen!
      isNearBus = true;
      nearestStopName = `Bus ${resolvedBusNumber} Dynamic QR Display`;
      if (latitude !== undefined && longitude !== undefined) {
        calculatedDistMeters = 5; // Near physical display
      }
    } else {
      // Static QR scan requires GPS proximity verification
      if (latitude === undefined || longitude === undefined) {
        return NextResponse.json({ 
          success: false, 
          message: "GPS coordinates required for verification. Please allow location access." 
        }, { status: 400 });
      }

      // Fetch bus telematics from Redis / MongoDB fallback
      const CACHE_KEY = `telematics:bus:${resolvedBusId || resolvedBusNumber}`;
      let liveTelematics = await cacheGet<{ latitude: number; longitude: number }>(CACHE_KEY);
      if (!liveTelematics && resolvedBusId) {
        const mongoDoc = await getLiveLocationFromMongo(String(resolvedBusId));
        if (mongoDoc && mongoDoc.latitude && mongoDoc.longitude) {
          liveTelematics = { latitude: mongoDoc.latitude, longitude: mongoDoc.longitude };
        }
      }

      // NOTE: client-supplied busLatitude/busLongitude are ignored — the bus position
      // must come from the bus GPS unit, otherwise the geofence can be spoofed.
      void busLatitude;
      void busLongitude;

      if (liveTelematics && typeof liveTelematics.latitude === "number" && typeof liveTelematics.longitude === "number") {
        const distToBusKm = calculateDistanceKm(
          Number(latitude),
          Number(longitude),
          liveTelematics.latitude,
          liveTelematics.longitude
        );
        calculatedDistMeters = Math.round(distToBusKm * 1000);

        if (distToBusKm <= GEOFENCE_KM) {
          isNearBus = true;
          nearestStopName = `Live Bus Location (dist: ${calculatedDistMeters}m)`;
        } else {
          isNearBus = false;
        }
      } else {
        // Fail closed: without live bus GPS a static poster scan cannot prove presence.
        return NextResponse.json({
          success: false,
          status: "BUS_GPS_UNAVAILABLE",
          message: `Bus ${resolvedBusNumber} GPS is offline, so a static QR scan cannot be verified. Please ask the conductor to scan your pass.`,
        }, { status: 409 });
      }

      if (!isNearBus) {
        return NextResponse.json({ 
          success: false,
          status: "GPS_VERIFICATION_FAILED",
          message: `SECURITY ALERT: GPS verification failed. You are ${calculatedDistMeters}m away from the bus. Boarding attendance denied.`,
        }, { status: 403 });
      }
    }

    // 5. Query student's active reservation in bus_reservations
    const { data: resResult } = await supabaseAdmin
      .from("bus_reservations")
      .select("*, buses(*)")
      .eq("student_id", resolvedStudentId)
      .in("reservation_date", allowedDates)
      .neq("status", "CANCELLED")
      .order("created_at", { ascending: false });

    const reservations = resResult || [];
    const targetReservation = reservations.find((r) => String(r.bus_id) === String(resolvedBusId)) || null;

    // Self-service boarding is only for the bus the student is assigned to today.
    // Boarding a different bus (roaming) must go through the conductor scanner.
    if (!targetReservation && reservations.length > 0) {
      return NextResponse.json({
        success: false,
        status: "WRONG_BUS",
        message: `You are not assigned to Bus ${resolvedBusNumber} today. Please ask the conductor to approve roaming boarding.`,
      }, { status: 403 });
    }

    // 6. Resolve Trip ID (ensuring FK compliance: must exist in trips or be NULL)
    // Only today's trips on this bus qualify (never attach to an old completed trip).
    let resolvedTripId: string | null = targetReservation?.trip_id || null;
    let resolvedShiftId: string | null = targetReservation?.shift_id || null;
    if (!resolvedTripId) {
      const { data: todaysTrip } = await supabaseAdmin
        .from("trips")
        .select("id, shift_id, status")
        .eq("bus_id", resolvedBusId)
        .in("trip_date", allowedDates)
        .neq("status", "CANCELLED")
        .order("started_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      resolvedTripId = todaysTrip?.id || null;
      resolvedShiftId = resolvedShiftId || todaysTrip?.shift_id || null;
    }

    // 7. Check Teacher Reserved Seats
    // No invented default seat: an unseated rider stays unseated until they pick one.
    const chosenSeat: string | null = (typeof seatId === "string" && seatId.trim()) || targetReservation?.chosen_seat || null;

    // A seat already held by another rider on this bus today cannot be claimed.
    if (chosenSeat && chosenSeat !== targetReservation?.chosen_seat) {
      const { data: seatHolder } = await supabaseAdmin
        .from("bus_reservations")
        .select("id")
        .eq("bus_id", resolvedBusId)
        .in("reservation_date", allowedDates)
        .eq("chosen_seat", chosenSeat)
        .neq("status", "CANCELLED")
        .neq("student_id", resolvedStudentId)
        .limit(1)
        .maybeSingle();
      if (seatHolder) {
        return NextResponse.json({ success: false, message: `Seat ${chosenSeat} is already taken. Please choose another seat.` }, { status: 409 });
      }
    }

    if (chosenSeat && dbBus) {
      const busSeats = generateSeatLayout(dbBus.capacity, dbBus.seat_layout || "NONE");
      const nTeachers = typeof dbBus.teacher_seats_count === "number" ? dbBus.teacher_seats_count : 0;
      if (nTeachers > 0) {
        const teacherReservedSeats = getTeacherStartingSeats(busSeats, nTeachers);
        if (teacherReservedSeats.includes(chosenSeat)) {
          return NextResponse.json({
            success: false,
            message: `Starting seats (first ${nTeachers} seats) on Bus ${resolvedBusNumber} are strictly reserved for Faculty. Please choose another seat.`,
          }, { status: 403 });
        }
      }
    }

    const nowIso = new Date().toISOString();

    // 8. Update or Insert bus_reservations (Guarantees the Student Portal shows BOARDED)
    let reservationId: string | null = targetReservation?.id || null;
    if (targetReservation?.id) {
      const { error: resUpdErr } = await supabaseAdmin
        .from("bus_reservations")
        .update({
          status: "BOARDED",
          boarded_at: nowIso,
          chosen_seat: chosenSeat,
          seat_chosen_at: nowIso,
          lock_status: "UNLOCKED",
          unlocked_by: isRollingVerified ? "ROLLING_BUS_QR" : "LOCATION_DISTANCE",
          distance_meters: calculatedDistMeters,
          unlock_timestamp: nowIso,
        })
        .eq("id", targetReservation.id);
      if (resUpdErr) {
        console.error("[board-self-service] reservation update failed:", resUpdErr.message);
        return NextResponse.json({ success: false, message: "Could not update your reservation. Please retry." }, { status: 500 });
      }
    } else {
      // Auto-create today's reservation on this bus. Requires a real stop and today's shift
      // (no hardcoded stop/shift fallbacks).
      const boardingStop = studentRecord.primary_stop_id;
      if (!boardingStop || !resolvedShiftId) {
        return NextResponse.json({
          success: false,
          status: "NO_ACTIVE_TRIP",
          message: `No trip is scheduled for Bus ${resolvedBusNumber} right now. Please ask the conductor to board you.`,
        }, { status: 409 });
      }
      const newResId = crypto.randomUUID();
      reservationId = newResId;
      const { error: resInsErr } = await supabaseAdmin
        .from("bus_reservations")
        .insert({
          id: newResId,
          student_id: resolvedStudentId,
          trip_id: resolvedTripId,
          bus_id: resolvedBusId,
          boarding_stop_id: boardingStop,
          shift_id: resolvedShiftId,
          reservation_date: today,
          assigned_by: "AI_AUTO",
          status: "BOARDED",
          chosen_seat: chosenSeat,
          seat_chosen_at: nowIso,
          boarded_at: nowIso,
          lock_status: "UNLOCKED",
          unlocked_by: isRollingVerified ? "ROLLING_BUS_QR" : "LOCATION_DISTANCE",
          distance_meters: calculatedDistMeters,
          unlock_timestamp: nowIso,
        });
      if (resInsErr) {
        console.error("[board-self-service] reservation insert failed:", resInsErr.message);
        return NextResponse.json({ success: false, message: "Could not create your reservation. Please ask the conductor." }, { status: 500 });
      }
    }

    // 9. Add verified attendance record to attendance_records
    const attendanceId = `att-self-${Date.now()}`;
    const { error: attInsErr } = await supabaseAdmin.from("attendance_records").insert({
      id: attendanceId,
      student_id: resolvedStudentId,
      reservation_id: reservationId,
      trip_id: resolvedTripId,
      bus_id: resolvedBusId,
      method: isRollingVerified ? "ROLLING_ENCRYPTED_QR" : "QR_SCAN", 
      status: "BOARDED",
      verified_by: isRollingVerified ? `ESP32 Rolling Display (Bus ${resolvedBusNumber})` : "Self-Service QR Scanner",
      notes: isRollingVerified
        ? `Cryptographically verified via Bus ${resolvedBusNumber} rolling dynamic QR display (HMAC-SHA256, Zero-RFID)`
        : `Verified via Bus ${resolvedBusNumber} QR scan (dist: ${calculatedDistMeters}m)`,
      signature_token: isRollingVerified
        ? `ROLLING-CRYPTO-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
        : `QR-ATT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      timestamp: nowIso,
      lock_status: "UNLOCKED",
      unlocked_by: isRollingVerified ? "ROLLING_BUS_QR" : "LOCATION_DISTANCE",
      distance_meters: calculatedDistMeters,
      unlock_timestamp: nowIso,
    });
    if (attInsErr) {
      console.error("[board-self-service] attendance insert failed:", attInsErr.message);
      return NextResponse.json({ success: false, message: "Could not record attendance. Please retry." }, { status: 500 });
    }

    // 10. Cache attendance unlock state in Redis
    try {
      const lockPayload = {
        lockStatus: "UNLOCKED",
        unlockedBy: isRollingVerified ? "ROLLING_BUS_QR" : "LOCATION_DISTANCE",
        distanceMeters: calculatedDistMeters,
        busId: resolvedBusId,
        busNumber: resolvedBusNumber,
        tripId: resolvedTripId,
        timestamp: nowIso,
        method: isRollingVerified ? "ROLLING_ENCRYPTED_QR" : "QR_SCAN",
      };
      await cacheSet(`attendance:lock:${resolvedStudentId}:${today}`, lockPayload, 86400);
      if (session.userId && session.userId !== resolvedStudentId) {
        await cacheSet(`attendance:lock:${session.userId}:${today}`, lockPayload, 86400);
      }
    } catch (e) {
      console.warn("Redis cache warning:", e);
    }

    return NextResponse.json({ 
      success: true, 
      message: isRollingVerified
        ? `✓ Verified by Bus ${resolvedBusNumber} dynamic display! Attendance marked.`
        : `✓ Bus ${resolvedBusNumber} attendance marked! Welcome aboard.`,
      seatNumber: chosenSeat,
      busId: resolvedBusId,
      busNumber: resolvedBusNumber,
      nearestStopName,
    });

  } catch (error: any) {
    console.error("Self-Service Boarding Error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
