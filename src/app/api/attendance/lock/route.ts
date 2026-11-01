import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { calculateDistanceKm, calculateExactDistanceMeters, calculateProximityToBus } from "@/lib/utils";
import { cacheGet, cacheSet } from "@/lib/redis";
import { getLiveLocationFromMongo } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

// Proximity threshold for location distance unlock: strictly less than 2 meters
const DISTANCE_UNLOCK_THRESHOLD_METERS = 2;

function getTodayIST(): { today: string; utcToday: string; allowedDates: string[]; nowIso: string } {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);
  const today = istDate.toISOString().split("T")[0];
  const utcToday = now.toISOString().split("T")[0];
  return {
    today,
    utcToday,
    allowedDates: Array.from(new Set([today, utcToday])),
    nowIso: now.toISOString(),
  };
}

async function getLiveBusCoordinates(
  busId: string | number,
  gpsDeviceId?: string | null,
  busNumber?: string | number | null
): Promise<{ latitude: number; longitude: number } | null> {
  if (!busId) return null;

  const strBusId = String(busId).trim();
  const strGpsDeviceId = gpsDeviceId ? String(gpsDeviceId).trim() : null;
  const strBusNumber = busNumber !== undefined && busNumber !== null ? String(busNumber).trim() : null;

  // Build all candidate keys to check in Redis safely
  const busIdsToCheck = Array.from(new Set([
    strBusId,
    strBusId.toLowerCase(),
    strBusId.toUpperCase(),
    `bus-${strBusId}`,
    `Bus ${strBusId}`,
    ...(strGpsDeviceId ? [strGpsDeviceId, strGpsDeviceId.toLowerCase(), strGpsDeviceId.toUpperCase()] : []),
    ...(strBusNumber ? [strBusNumber, strBusNumber.toLowerCase(), strBusNumber.replace(/[^0-9]/g, "")] : []),
  ].filter(Boolean)));

  // 1. Query Redis in parallel (20-40ms total)
  const redisResults = await Promise.all(
    busIdsToCheck.map((bId) =>
      cacheGet<{ latitude: number; longitude: number }>(`telematics:bus:${bId}`).catch(() => null)
    )
  );

  for (const cached of redisResults) {
    if (cached && typeof cached.latitude === "number" && typeof cached.longitude === "number") {
      return cached;
    }
  }

  // 2. Fallback to MongoDB ONLY IF Redis completely misses — single call with strict 800ms race timeout
  try {
    const mongoPromise = getLiveLocationFromMongo(strBusId);
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 800));
    const mongoLoc = await Promise.race([mongoPromise, timeoutPromise]);
    if (mongoLoc && typeof mongoLoc.latitude === "number" && typeof mongoLoc.longitude === "number") {
      const loc = { latitude: mongoLoc.latitude, longitude: mongoLoc.longitude };
      cacheSet(`telematics:bus:${strBusId}`, loc, 60).catch(() => {});
      return loc;
    }
  } catch {
    // MongoDB timed out or unavailable — return null cleanly
  }

  return null;
}

/**
 * GET /api/attendance/lock
 * Returns live attendance lock status for the authenticated student or queried student.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const targetStudentId = searchParams.get("studentId") || session.userId;
    const queryBusId = searchParams.get("busId") || null;
    const queryBusNumber = searchParams.get("busNumber") || null;
    const queryGpsDeviceId = searchParams.get("gpsDeviceId") || null;
    const clientLat = searchParams.get("latitude") ? Number(searchParams.get("latitude")) : null;
    const clientLng = searchParams.get("longitude") ? Number(searchParams.get("longitude")) : null;
    const clientAcc = searchParams.get("accuracy") ? Number(searchParams.get("accuracy")) : null;

    const { today, allowedDates } = getTodayIST();

    // ── Phase 1: Student Profile Lookup ──────────────────────────────────────────
    const { data: dbStudents } = await supabaseAdmin
      .from("students_full")
      .select("id, user_id, full_name, student_id_code, rfid_card_id, primary_route_id, primary_stop_id, primary_stop_name, email")
      .or(`id.eq.${targetStudentId},user_id.eq.${targetStudentId},id.eq.${session.userId},user_id.eq.${session.userId}`);

    const linkedIds = new Set<string>([targetStudentId, session.userId]);
    let student = dbStudents?.find((s: any) => s.id === targetStudentId || s.user_id === targetStudentId) || dbStudents?.[0];

    if (dbStudents) {
      for (const s of dbStudents) {
        if (s.id) linkedIds.add(s.id);
        if (s.user_id) linkedIds.add(s.user_id);
      }
    }

    const studentUserId = student?.user_id || session.userId;
    if (studentUserId) linkedIds.add(studentUserId);
    const studentEmail = student?.email || session.email;
    const resolvedStudentId = student?.id || targetStudentId;

    // ── Phase 2: Parallel Queries (Email siblings + Bus reservations) ─────────────
    const [emailSiblingsRes, reservationsRes] = await Promise.all([
      studentEmail
        ? supabaseAdmin.from("students_full").select("id, user_id, rfid_card_id").eq("email", studentEmail)
        : Promise.resolve({ data: [] }),
      supabaseAdmin
        .from("bus_reservations")
        .select("*, buses(*)")
        .in("student_id", Array.from(linkedIds))
        .in("reservation_date", allowedDates)
        .neq("status", "CANCELLED")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    if (emailSiblingsRes.data) {
      for (const s of emailSiblingsRes.data) {
        if (s.id) linkedIds.add(s.id);
        if (s.user_id) linkedIds.add(s.user_id);
      }
    }
    const linkedIdsArray = Array.from(linkedIds);
    const activeRes = reservationsRes.data?.[0];

    const targetBusId = queryBusId || activeRes?.bus_id || null;
    const targetBusNumber = queryBusNumber || activeRes?.buses?.bus_number || null;
    const targetGpsDeviceId = queryGpsDeviceId || activeRes?.buses?.gps_device_id || null;

    // ── Phase 3: Parallel Execution (Live Bus GPS + Redis RFID checks) ────────────
    const [busCoordinates, ...rfidCaches] = await Promise.all([
      targetBusId ? getLiveBusCoordinates(targetBusId, targetGpsDeviceId, targetBusNumber) : Promise.resolve(null),
      ...linkedIdsArray.map((lid) => cacheGet<any>(`attendance:rfid:${lid}:${today}`).catch(() => null)),
    ]);

    const isBusGpsLive = busCoordinates !== null;

    // 3. Check if active bus reservation is already UNLOCKED (via RFID or Location Distance)
    if (activeRes?.lock_status === "UNLOCKED") {
      const unlockedBy = activeRes.unlocked_by || "RFID";
      return NextResponse.json({
        success: true,
        lockStatus: "UNLOCKED",
        unlockedBy,
        rfidCardId: student?.rfid_card_id || null,
        distanceMeters: activeRes.distance_meters ? Number(activeRes.distance_meters) : null,
        busId: targetBusId,
        isBusGpsLive,
        driverActive: isBusGpsLive,
        allowedThresholdMeters: DISTANCE_UNLOCK_THRESHOLD_METERS,
        message: unlockedBy === "LOCATION_DISTANCE"
          ? "Attendance unlocked via verified GPS location proximity."
          : "Attendance unlocked via physical RFID card tap on the bus reader.",
      });
    }

    // 4. Check if verified RFID card tap occurred TODAY for the CORRECT bus
    let isRfidUnlocked = false;
    let rfidCardId: string | null = student?.rfid_card_id || null;

    for (const rfidCache of rfidCaches) {
      if (rfidCache?.verified || rfidCache?.lockStatus === "UNLOCKED") {
        if (!targetBusId || rfidCache.busId === targetBusId) {
          isRfidUnlocked = true;
          rfidCardId = rfidCache.rfidCardId || rfidCardId;
          break;
        }
      }
    }

    // Fallback: check attendance_records in database if not cached
    if (!isRfidUnlocked) {
      let rfidDbQuery = supabaseAdmin
        .from("attendance_records")
        .select("*")
        .in("student_id", linkedIdsArray)
        .eq("method", "RFID_VERIFIED")
        .gte("timestamp", `${today}T00:00:00.000Z`)
        .order("timestamp", { ascending: false })
        .limit(1);

      if (targetBusId) {
        rfidDbQuery = rfidDbQuery.eq("bus_id", targetBusId);
      }

      const { data: rfidAtt } = await rfidDbQuery.maybeSingle();

      if (rfidAtt) {
        isRfidUnlocked = true;
        rfidCardId = rfidAtt.rfid_card_id || rfidCardId;
      }
    }

    if (isRfidUnlocked) {
      return NextResponse.json({
        success: true,
        lockStatus: "UNLOCKED",
        unlockedBy: "RFID",
        rfidCardId,
        busId: targetBusId,
        isBusGpsLive,
        driverActive: isBusGpsLive,
        allowedThresholdMeters: DISTANCE_UNLOCK_THRESHOLD_METERS,
        message: "Attendance unlocked via physical RFID card tap on the bus reader.",
      });
    }

    // 5. Check if Location Distance Unlock is valid for TODAY
    // Location Distance Unlock is ONLY valid if:
    // a) Bus GPS telematics is actively broadcasting (isBusGpsLive === true)
    // b) A valid unlock event was recorded TODAY
    let isLocationUnlocked = false;
    let unlockedDistMeters: number | null = null;

    if (isBusGpsLive) {
      for (const lid of linkedIdsArray) {
        const cachedLock = await cacheGet<any>(`attendance:lock:${lid}:${today}`);
        if (cachedLock?.lockStatus === "UNLOCKED" && cachedLock?.unlockedBy === "LOCATION_DISTANCE") {
          isLocationUnlocked = true;
          unlockedDistMeters = cachedLock.distanceMeters ?? null;
          break;
        }
      }
      if (!isLocationUnlocked && activeRes?.lock_status === "UNLOCKED" && activeRes?.unlocked_by === "LOCATION_DISTANCE") {
        isLocationUnlocked = true;
        unlockedDistMeters = activeRes.distance_meters ? Number(activeRes.distance_meters) : null;
      }
    }

    if (isLocationUnlocked) {
      return NextResponse.json({
        success: true,
        lockStatus: "UNLOCKED",
        unlockedBy: "LOCATION_DISTANCE",
        distanceMeters: unlockedDistMeters,
        busId: targetBusId,
        isBusGpsLive,
        driverActive: isBusGpsLive,
        allowedThresholdMeters: DISTANCE_UNLOCK_THRESHOLD_METERS,
        message: "Attendance unlocked via verified GPS location proximity.",
      });
    }

    // 5. ATTENDANCE IS LOCKED
    let distanceMeters: number | null = null;
    let canUnlockByLocation = false;
    const hasValidClientGps = clientLat !== null && clientLng !== null && !isNaN(clientLat) && !isNaN(clientLng) && (clientLat !== 0 || clientLng !== 0);

    if (hasValidClientGps && busCoordinates) {
      const { effectiveDistMeters } = calculateProximityToBus(
        clientLat!,
        clientLng!,
        busCoordinates.latitude,
        busCoordinates.longitude,
        clientAcc,
        (busCoordinates as any)?.accuracy
      );
      if (isFinite(effectiveDistMeters)) {
        distanceMeters = effectiveDistMeters;
        canUnlockByLocation = distanceMeters < DISTANCE_UNLOCK_THRESHOLD_METERS;
      }
    }

    return NextResponse.json({
      success: true,
      lockStatus: "LOCKED",
      studentId: resolvedStudentId,
      studentName: student?.full_name,
      rfidCardId: student?.rfid_card_id || null,
      busId: targetBusId,
      busNumber: activeRes?.buses?.bus_number || `Bus (${targetBusId})`,
      currentDistanceMeters: distanceMeters,
      allowedThresholdMeters: DISTANCE_UNLOCK_THRESHOLD_METERS,
      canUnlockByLocation,
      isBusGpsLive,
      driverActive: isBusGpsLive,
      deviceGpsAvailable: hasValidClientGps,
      message: !isBusGpsLive
        ? `Bus live GPS is offline: The driver has not started the trip or vehicle telematics are not broadcasting for ${targetBusId}. Location Distance Unlock is unavailable until the bus GPS is active. You can tap your physical RFID card on the bus reader instead.`
        : !hasValidClientGps
        ? `Device GPS is turned off. Turn on Location services on your device to detect proximity to ${targetBusId}.`
        : canUnlockByLocation
        ? `You are within ${distanceMeters}m of ${targetBusId}. Location Distance Unlock (<2m) is available!`
        : `Attendance is locked. You are ${distanceMeters}m from ${targetBusId} (max allowed: <${DISTANCE_UNLOCK_THRESHOLD_METERS}m). Unlock requires proximity <2m, or tap physical RFID card on bus reader.`,
    });
  } catch (err: any) {
    console.error("GET /api/attendance/lock error:", err);
    return NextResponse.json({ success: false, message: err?.message || "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/attendance/lock
 * Unlocks student attendance via Location Distance or RFID card tap.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const body = await req.json();
    const { method = "LOCATION_DISTANCE", latitude, longitude, accuracy, busId, rfidCardId } = body;

    const { today, allowedDates, nowIso } = getTodayIST();

    // 1. Resolve authentic student record across all linked records
    const { data: dbStudents } = await supabaseAdmin
      .from("students_full")
      .select("id, user_id, full_name, student_id_code, rfid_card_id, primary_route_id, primary_stop_id, email")
      .or(`id.eq.${session.userId},user_id.eq.${session.userId}`);

    const linkedIds = new Set<string>([session.userId]);
    let student = dbStudents?.[0];
    if (dbStudents) {
      for (const s of dbStudents) {
        if (s.id) linkedIds.add(s.id);
        if (s.user_id) linkedIds.add(s.user_id);
      }
    }
    const studentEmail = student?.email || session.email;
    if (studentEmail) {
      const { data: emailSiblings } = await supabaseAdmin
        .from("students_full")
        .select("id, user_id, rfid_card_id")
        .eq("email", studentEmail);
      if (emailSiblings) {
        for (const s of emailSiblings) {
          if (s.id) linkedIds.add(s.id);
          if (s.user_id) linkedIds.add(s.user_id);
        }
      }
    }
    const linkedIdsArray = Array.from(linkedIds);
    const resolvedStudentId = student?.id || session.userId;

    // 2. Query student's active reservation for today
    const { data: reservations } = await supabaseAdmin
      .from("bus_reservations")
      .select("*")
      .in("student_id", linkedIdsArray)
      .in("reservation_date", allowedDates)
      .neq("status", "CANCELLED")
      .order("created_at", { ascending: false })
      .limit(1);

    const reservation = reservations?.[0];
    const effectiveBusId = busId || reservation?.bus_id || null;

    if (!effectiveBusId) {
      return NextResponse.json(
        { success: false, error: "No active bus reservation or bus ID provided." },
        { status: 400 }
      );
    }

    // 3. Resolve active trip for this bus today
    const { data: activeTrips } = await supabaseAdmin
      .from("trips")
      .select("id, trip_code, shift_id, route_id, status")
      .eq("bus_id", effectiveBusId)
      .in("trip_date", allowedDates)
      .neq("status", "CANCELLED")
      .order("created_at", { ascending: false })
      .limit(1);

    const resolvedTripId = activeTrips?.[0]?.id || reservation?.trip_id || `trip-${effectiveBusId}-${today}`;

    // ── METHOD A: LOCATION DISTANCE UNLOCK ──────────────────────────────────────
    if (method === "LOCATION_DISTANCE") {
      if (
        latitude === undefined || longitude === undefined ||
        latitude === null || longitude === null ||
        isNaN(Number(latitude)) || isNaN(Number(longitude)) ||
        (Number(latitude) === 0 && Number(longitude) === 0)
      ) {
        return NextResponse.json({
          success: false,
          lockStatus: "LOCKED",
          message: "Live device GPS coordinates (latitude, longitude) are required for Location Distance Unlock. Device location appears disabled or unavailable.",
        }, { status: 400 });
      }

      // Resolve bus asset details (e.g. gps_device_id and bus_number) for multi-key Redis search
      const isNumBus = /^\d+$/.test(String(effectiveBusId));
      const { data: dbBus } = isNumBus
        ? await supabaseAdmin.from("buses").select("id, bus_number, gps_device_id").eq("id", Number(effectiveBusId)).maybeSingle()
        : await supabaseAdmin.from("buses").select("id, bus_number, gps_device_id").or(`rfid_device_id.eq.${effectiveBusId},gps_device_id.eq.${effectiveBusId}`).maybeSingle();

      const targetGpsId = dbBus?.gps_device_id || null;
      const targetBusNum = dbBus?.bus_number ? String(dbBus.bus_number) : null;

      // Query live bus GPS telematics
      const busCoordinates = await getLiveBusCoordinates(effectiveBusId, targetGpsId, targetBusNum);

      // SECURITY GUARDRAIL: Reject immediately if driver is offline or GPS is not broadcasting
      if (!busCoordinates) {
        return NextResponse.json({
          success: false,
          lockStatus: "LOCKED",
          isBusGpsLive: false,
          driverActive: false,
          message: `Bus live GPS is offline: Driver has not started the trip or vehicle telematics are not broadcasting for ${effectiveBusId}. Location Distance Unlock cannot verify proximity without active bus GPS. Please wait for the driver to begin the route or tap your physical RFID card on the bus reader.`,
        }, { status: 422 });
      }

      const { effectiveDistMeters } = calculateProximityToBus(
        Number(latitude),
        Number(longitude),
        busCoordinates.latitude,
        busCoordinates.longitude,
        accuracy != null ? Number(accuracy) : null,
        (busCoordinates as any)?.accuracy
      );
      const isWithinThreshold = effectiveDistMeters < DISTANCE_UNLOCK_THRESHOLD_METERS;

      if (!isWithinThreshold) {
        return NextResponse.json({
          success: false,
          lockStatus: "LOCKED",
          distanceMeters: effectiveDistMeters,
          thresholdMeters: DISTANCE_UNLOCK_THRESHOLD_METERS,
          message: `❌ Location Distance Unlock Failed: You are ${effectiveDistMeters}m away from ${effectiveBusId}. Proximity security requires you to be within <2m (less than 2 meters) of the bus, or tap your physical RFID card on the bus reader.`,
        }, { status: 403 });
      }

      // PROXIMITY CONFIRMED (<2m) with ACTIVE BUS GPS!
      // Update lock_status on reservation WITHOUT prematurely setting status = "BOARDED"
      if (reservation) {
        await supabaseAdmin
          .from("bus_reservations")
          .update({
            lock_status: "UNLOCKED",
            unlocked_by: "LOCATION_DISTANCE",
            distance_meters: effectiveDistMeters,
            unlock_timestamp: nowIso,
          })
          .eq("id", reservation.id);
      }

      const lockPayload = {
        lockStatus: "UNLOCKED",
        unlockedBy: "LOCATION_DISTANCE",
        distanceMeters: effectiveDistMeters,
        busId: effectiveBusId,
        tripId: resolvedTripId,
        timestamp: nowIso,
        method: "LOCATION_DISTANCE_UNLOCK",
      };

      await Promise.all(
        linkedIdsArray.map((lid) => cacheSet(`attendance:lock:${lid}:${today}`, lockPayload, 7200))
      );

      return NextResponse.json({
        success: true,
        lockStatus: "UNLOCKED",
        unlockedBy: "LOCATION_DISTANCE",
        distanceMeters: effectiveDistMeters,
        thresholdMeters: DISTANCE_UNLOCK_THRESHOLD_METERS,
        busId: effectiveBusId,
        timestamp: nowIso,
        message: `✓ Attendance Unlocked! Verified within ${effectiveDistMeters}m of ${effectiveBusId}. Please select your seat on the bus grid.`,
      });
    }

    // ── METHOD B: RFID UNLOCK ──────────────────────────────────────────────────
    if (method === "RFID") {
      const effectiveRfid = (rfidCardId || student?.rfid_card_id || "").trim();
      if (!effectiveRfid) {
        return NextResponse.json({
          success: false,
          lockStatus: "LOCKED",
          message: "RFID card UID is required for RFID attendance unlock. Please tap your card on the bus reader.",
        }, { status: 400 });
      }

      const attendanceId = `att-rfid-${Date.now()}`;
      await supabaseAdmin.from("attendance_records").insert({
        id: attendanceId,
        student_id: reservation?.student_id || resolvedStudentId,
        reservation_id: reservation?.id || null,
        trip_id: resolvedTripId,
        bus_id: effectiveBusId,
        method: "RFID_VERIFIED",
        status: "CHECKED_IN",
        verified_by: "ESP32 Hardware RFID Gate",
        notes: `Attendance unlocked via physical RFID card tap [${effectiveRfid}]`,
        signature_token: `RFID-${effectiveRfid}`,
        timestamp: nowIso,
        lock_status: "UNLOCKED",
        unlocked_by: "RFID",
        rfid_card_id: effectiveRfid,
        unlock_timestamp: nowIso,
      });

      if (reservation) {
        await supabaseAdmin
          .from("bus_reservations")
          .update({
            lock_status: "UNLOCKED",
            unlocked_by: "RFID",
            unlock_timestamp: nowIso,
          })
          .eq("id", reservation.id);
      }

      const lockPayload = {
        lockStatus: "UNLOCKED",
        unlockedBy: "RFID",
        rfidCardId: effectiveRfid,
        busId: effectiveBusId,
        tripId: resolvedTripId,
        timestamp: nowIso,
        method: "RFID_VERIFIED",
      };

      await Promise.all(
        linkedIdsArray.flatMap((lid) => [
          cacheSet(`attendance:lock:${lid}:${today}`, lockPayload, 86400),
          cacheSet(`attendance:rfid:${lid}:${today}`, lockPayload, 86400),
        ])
      );

      return NextResponse.json({
        success: true,
        lockStatus: "UNLOCKED",
        unlockedBy: "RFID",
        rfidCardId: effectiveRfid,
        busId: effectiveBusId,
        timestamp: nowIso,
        message: `✓ Attendance Unlocked via RFID Card Tap [${effectiveRfid}]. Welcome aboard!`,
      });
    }

    return NextResponse.json({
      success: false,
      message: `Invalid unlock method '${method}'. Supported methods: 'LOCATION_DISTANCE', 'RFID'.`,
    }, { status: 400 });
  } catch (err: any) {
    console.error("POST /api/attendance/lock error:", err);
    return NextResponse.json({ success: false, message: err?.message || "Internal Server Error" }, { status: 500 });
  }
}
