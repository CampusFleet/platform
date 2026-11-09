import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { calculateDistanceKm, isStartingSeat, getTeacherStartingSeats, generateSeatLayout } from "@/lib/utils";
import { cacheGet, cacheSet } from "@/lib/redis";
import { getLiveLocationFromMongo } from "@/lib/mongodb";
import { verifyRollingBusToken } from "@/lib/rolling-bus-crypto";
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

    // 1. Resolve authentic student ID (from students table)
    const studentOrFilter = [
      `user_id.eq.${session.userId}`,
      `id.eq.${session.userId}`,
      session.email ? `email.eq.${session.email}` : null,
    ].filter(Boolean).join(",");

    const { data: dbStudents } = await supabaseAdmin
      .from("students")
      .select("id, user_id, full_name, primary_route_id, primary_stop_id")
      .or(studentOrFilter)
      .limit(1);

    const studentRecord = dbStudents?.[0];
    const resolvedStudentId = studentRecord?.id || session.userId;

    // 2. Resolve bus asset and foreign key ID
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

    if (!dbBus && rawBusId) {
      const { data: foundBuses } = await supabaseAdmin
        .from("buses")
        .select("id, bus_number, capacity, seat_layout, teacher_seats_count, current_route_id")
        .eq("id", rawBusId)
        .limit(1);
      dbBus = foundBuses?.[0];
    }

    const resolvedBusId: number | null = dbBus ? dbBus.id : (!isNaN(numericBusId) ? numericBusId : null);
    const resolvedBusNumber: string = dbBus ? String(dbBus.bus_number) : (rawBusId || "42");

    // 3. Cryptographic Dynamic Rolling QR Verification (ESP32 In-Bus Display)
    let isRollingVerified = false;
    if (rollingPayload || rollingToken) {
      const cryptoResult = await verifyRollingBusToken(
        rollingPayload || rollingToken,
        resolvedStudentId,
        10 // toleranceSteps = 10 (+/- 20s window for smooth camera scan)
      );

      if (!cryptoResult.valid) {
        return NextResponse.json({
          success: false,
          status: cryptoResult.code || "INVALID_ROLLING_TOKEN",
          message: cryptoResult.error || "Dynamic QR verification failed.",
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

      if (!liveTelematics && busLatitude && busLongitude) {
        liveTelematics = { latitude: Number(busLatitude), longitude: Number(busLongitude) };
      }

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
        // Fall back to trusting physical scan if telematics device is offline
        isNearBus = true;
        nearestStopName = "Physical Bus Scan (Telematics Offline)";
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
      .or(`student_id.eq.${resolvedStudentId},student_id.eq.${session.userId}`)
      .in("reservation_date", allowedDates)
      .neq("status", "CANCELLED")
      .order("created_at", { ascending: false });

    const reservations = resResult || [];
    const targetReservation = reservations.find((r) => 
      String(r.bus_id) === String(resolvedBusId) || 
      String(r.bus_id) === String(resolvedBusNumber) ||
      String(r.bus_id) === String(rawBusId)
    ) || (reservations.length > 0 ? reservations[0] : null);

    // 6. Resolve Trip ID (ensuring FK compliance: must exist in trips or be NULL)
    let resolvedTripId: string | null = targetReservation?.trip_id || null;
    if (!resolvedTripId && resolvedBusId) {
      const { data: activeTrip } = await supabaseAdmin
        .from("trips")
        .select("id")
        .eq("bus_id", resolvedBusId)
        .in("status", ["IN_PROGRESS", "ACTIVE", "SCHEDULED"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeTrip?.id) {
        resolvedTripId = activeTrip.id;
      } else {
        const { data: anyTrip } = await supabaseAdmin
          .from("trips")
          .select("id")
          .eq("bus_id", resolvedBusId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        resolvedTripId = anyTrip?.id || null;
      }
    }

    // 7. Check Teacher Reserved Seats
    const chosenSeat = seatId || targetReservation?.chosen_seat || "12A";
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
    if (targetReservation?.id) {
      await supabaseAdmin
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
    } else {
      // Auto-create reservation so attendance is recorded on the student's dashboard
      const newResId = crypto.randomUUID();
      const boardingStop = studentRecord?.primary_stop_id || "stop-lamachaur";
      await supabaseAdmin
        .from("bus_reservations")
        .insert({
          id: newResId,
          student_id: resolvedStudentId,
          trip_id: resolvedTripId,
          bus_id: resolvedBusId || 52,
          boarding_stop_id: boardingStop,
          shift_id: "shift-1",
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
    }

    // 9. Add verified attendance record to attendance_records
    const attendanceId = `att-self-${Date.now()}`;
    await supabaseAdmin.from("attendance_records").insert({
      id: attendanceId,
      student_id: resolvedStudentId,
      trip_id: resolvedTripId,
      bus_id: resolvedBusId || 52,
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

    // 10. Cache attendance unlock state in Redis
    try {
      const lockPayload = {
        lockStatus: "UNLOCKED",
        unlockedBy: isRollingVerified ? "ROLLING_BUS_QR" : "LOCATION_DISTANCE",
        distanceMeters: calculatedDistMeters,
        busId: resolvedBusId || 52,
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
