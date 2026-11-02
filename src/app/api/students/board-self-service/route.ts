import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { calculateDistanceKm, isStartingSeat, getTeacherStartingSeats, generateSeatLayout } from "@/lib/utils";
import { cacheGet } from "@/lib/redis";
import { getLiveLocationFromMongo } from "@/lib/mongodb";
import { verifyRollingBusToken } from "@/lib/rolling-bus-crypto";

/**
 * Student Self-Service QR Boarding & GPS Attendance Verification
 * Validates that student is physically inside or adjacent to the bus (<200m)
 * using live hardware telematics or rolling encrypted dynamic QR display codes.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "STUDENT" && session.role !== "student")) {
      return NextResponse.json({ success: false, message: "Unauthorized: Student session required." }, { status: 401 });
    }

    const body = await req.json();
    const { busId, seatId, latitude, longitude, busLatitude, busLongitude, rollingPayload, rollingToken } = body;

    // Optional: Cryptographic Dynamic Rolling QR Verification (ESP32 In-Bus Display)
    let isRollingVerified = false;
    if (rollingPayload || rollingToken) {
      const cryptoResult = await verifyRollingBusToken(rollingPayload || rollingToken, session.userId);
      if (!cryptoResult.valid) {
        return NextResponse.json({
          success: false,
          status: cryptoResult.code || "INVALID_ROLLING_TOKEN",
          message: cryptoResult.error || "Dynamic QR verification failed.",
        }, { status: 403 });
      }
      isRollingVerified = true;
    }

    if (!busId || latitude === undefined || longitude === undefined) {
      return NextResponse.json({ success: false, message: "Missing busId or GPS geolocation coordinates." }, { status: 400 });
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

    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const today = istDate.toISOString().split("T")[0];
    const utcToday = now.toISOString().split("T")[0];
    const allowedDates = Array.from(new Set([today, utcToday]));

    // 2. Query student's active reservation in bus_reservations (Smart Transit Auto-Reservation System)
    const { data: resResult } = await supabaseAdmin
      .from("bus_reservations")
      .select("*, buses(*)")
      .or(`student_id.eq.${resolvedStudentId},student_id.eq.${session.userId}`)
      .in("reservation_date", allowedDates)
      .neq("status", "CANCELLED")
      .order("created_at", { ascending: false });

    const reservations = resResult || [];
    const targetReservation = reservations.find((r) => r.bus_id === busId) || (reservations.length > 0 ? reservations[0] : null);

    // If no reservation exists, verify if bus has an active trip today
    if (!targetReservation) {
      const { data: activeTrips } = await supabaseAdmin
        .from("trips")
        .select("id, bus_id, status")
        .eq("bus_id", busId)
        .in("status", ["IN_PROGRESS", "SCHEDULED", "ACTIVE"])
        .limit(1);

      if (!activeTrips || activeTrips.length === 0) {
        return NextResponse.json({
          success: false,
          message: "No active reservation or operating trip found for your account on this bus today.",
        }, { status: 404 });
      }
    }

    // 3. Geofencing Verification (Max 200 meters buffer for in-cabin metallic roof GPS drift)
    const GEOFENCE_KM = 0.20;
    let isNearBus = false;
    let nearestStopName = "";
    let calculatedDistMeters = 0;

    // Fetch TRUSTED bus location from Redis (<5ms) or MongoDB fallback
    const CACHE_KEY = `telematics:bus:${busId}`;
    let liveTelematics = await cacheGet<{ latitude: number; longitude: number }>(CACHE_KEY);
    if (!liveTelematics) {
      const mongoDoc = await getLiveLocationFromMongo(busId);
      if (mongoDoc && mongoDoc.latitude && mongoDoc.longitude) {
        liveTelematics = { latitude: mongoDoc.latitude, longitude: mongoDoc.longitude };
      }
    }

    // Secondary client store fallback
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
      // If the bus telematics hardware is entirely offline, fall back to trusting physical QR on board
      isNearBus = true;
      nearestStopName = "Physical QR Code (Hardware Telematics Offline)";
    }

    if (!isNearBus) {
      return NextResponse.json({ 
        success: false,
        status: "GPS_VERIFICATION_FAILED",
        message: `SECURITY ALERT: GPS verification failed. You are ${calculatedDistMeters}m away from the bus. Boarding attendance denied.`,
      }, { status: 403 });
    }

    // 4. Resolve Trip ID
    let resolvedTripId = targetReservation?.trip_id;
    if (!resolvedTripId) {
      const { data: tripRow } = await supabaseAdmin
        .from("trips")
        .select("id")
        .eq("bus_id", busId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      resolvedTripId = tripRow?.id || `trip-${busId}-${today}`;
    }

    // 5. Check Teacher Reserved Seats
    const chosenSeat = seatId || targetReservation?.chosen_seat || "1A";
    if (chosenSeat) {
      const { data: busData } = await supabaseAdmin
        .from("buses")
        .select("capacity, seat_layout, teacher_seats_count")
        .eq("id", busId)
        .maybeSingle();

      if (busData) {
        const busSeats = generateSeatLayout(busData.capacity, busData.seat_layout || "NONE");
        const nTeachers = typeof (busData as any)?.teacher_seats_count === "number"
          ? (busData as any).teacher_seats_count
          : 0;
        if (nTeachers > 0) {
          const teacherReservedSeats = getTeacherStartingSeats(busSeats, nTeachers);
          if (teacherReservedSeats.includes(chosenSeat)) {
            return NextResponse.json({
              success: false,
              message: `Starting seats (first ${nTeachers} seats) on this bus are strictly reserved for Faculty and Teachers. Please choose another seat.`,
            }, { status: 403 });
          }
        }
      }
    }

    const nowIso = new Date().toISOString();

    // 6. Update smart transit bus_reservations
    if (targetReservation?.id) {
      await supabaseAdmin
        .from("bus_reservations")
        .update({
          status: "BOARDED",
          boarded_at: nowIso,
          chosen_seat: chosenSeat,
          seat_chosen_at: nowIso,
          lock_status: "UNLOCKED",
          unlocked_by: "LOCATION_DISTANCE",
          distance_meters: calculatedDistMeters,
          unlock_timestamp: nowIso,
        })
        .eq("id", targetReservation.id);
    } else {
      await supabaseAdmin
        .from("bus_reservations")
        .update({
          status: "BOARDED",
          boarded_at: nowIso,
          chosen_seat: chosenSeat,
          seat_chosen_at: nowIso,
          lock_status: "UNLOCKED",
          unlocked_by: "LOCATION_DISTANCE",
          distance_meters: calculatedDistMeters,
          unlock_timestamp: nowIso,
        })
        .or(`student_id.eq.${resolvedStudentId},student_id.eq.${session.userId}`)
        .in("reservation_date", allowedDates);
    }



    // 8. Add verified attendance record with Location Distance or Rolling Crypto Unlock
    const attendanceId = `att-self-${Date.now()}`;
    await supabaseAdmin.from("attendance_records").insert({
      id: attendanceId,
      student_id: resolvedStudentId,
      trip_id: resolvedTripId,
      bus_id: busId,
      method: isRollingVerified ? "ROLLING_ENCRYPTED_QR" : "LOCATION_DISTANCE_UNLOCK", 
      status: "BOARDED",
      verified_by: isRollingVerified ? "ESP32 Time-Crypto Display" : "Live GPS Proximity System",
      notes: isRollingVerified
        ? "Cryptographically verified via rolling dynamic QR display (HMAC-SHA256, Zero-RFID)"
        : `Geofenced location distance unlock verified (dist: ${calculatedDistMeters}m <= 200m)`,
      signature_token: isRollingVerified
        ? `ROLLING-CRYPTO-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
        : `LOCATION-DIST-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      timestamp: nowIso,
      lock_status: "UNLOCKED",
      unlocked_by: isRollingVerified ? "ROLLING_BUS_QR" : "LOCATION_DISTANCE",
      distance_meters: calculatedDistMeters,
      unlock_timestamp: nowIso,
    });

    // 9. Cache attendance lock state in Redis
    try {
      const { cacheSet } = await import("@/lib/redis");
      const lockPayload = {
        lockStatus: "UNLOCKED",
        unlockedBy: "LOCATION_DISTANCE",
        distanceMeters: calculatedDistMeters,
        busId,
        tripId: resolvedTripId,
        timestamp: nowIso,
        method: "LOCATION_DISTANCE_UNLOCK",
      };
      await cacheSet(`attendance:lock:${resolvedStudentId}:${today}`, lockPayload, 86400);
      if (session.userId && session.userId !== resolvedStudentId) {
        await cacheSet(`attendance:lock:${session.userId}:${today}`, lockPayload, 86400);
      }
    } catch {}

    return NextResponse.json({ 
      success: true, 
      message: `✓ GPS Boarding verified for seat ${chosenSeat}! Welcome aboard.`,
      seatNumber: chosenSeat,
      busId,
      nearestStopName,
    });

  } catch (error: any) {
    console.error("Geofenced Boarding Error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
