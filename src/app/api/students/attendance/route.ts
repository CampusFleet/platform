import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { isStartingSeat, getTeacherStartingSeats, generateSeatLayout, calculateDistanceKm } from "@/lib/utils";
import { cacheGet, cacheSet, cacheDel } from "@/lib/redis";
import { getLiveLocationFromMongo } from "@/lib/mongodb";
import { createTripId, createBookingId, createAttendanceId } from "@/lib/id";

export const dynamic = "force-dynamic";

/**
 * GET /api/students/reservations?studentId=xxx
 * Returns the student's active reservation for today + transport settings.
 * If no reservation exists, performs an automated AI matching to the student's
 * primary stop, route, class shifts, and available bus.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const rawStudentId = searchParams.get("studentId") || (session as any).studentId || session.userId;

    // Resolve date in IST & UTC
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const today = istDate.toISOString().split("T")[0];
    const utcToday = now.toISOString().split("T")[0];
    const allowedDates = Array.from(new Set([today, utcToday]));

    // Parallelize Phase 1: transport settings, student profile, reservations, and shifts
    const [
      { data: settings },
      { data: student },
      { data: reservations },
      { data: allShifts },
    ] = await Promise.all([
      supabaseAdmin.from("transport_settings").select("*").limit(1).maybeSingle(),
      supabaseAdmin
        .from("students")
        .select("id, user_id, primary_stop_id, primary_route_id, auto_assigned_stop_id, class_id")
        .or(`id.eq.${rawStudentId},user_id.eq.${rawStudentId}`)
        .maybeSingle(),
      supabaseAdmin
        .from("bus_reservations")
        .select("*")
        .or(`student_id.eq.${rawStudentId},student_id.eq.${session.userId}`)
        .in("reservation_date", allowedDates)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("shifts")
        .select("id, name, type, start_time, end_time, direction, booking_cutoff_minutes")
        .eq("is_active", true),
    ]);

    const currentSettings = settings || {
      seat_selection_mode: "AT_ATTENDANCE",
      max_walk_distance_km: 3.0,
      auto_assignment_enabled: true,
      min_fill_percent: 60,
    };

    const resolvedStudentId = student?.id || rawStudentId;

    const parseTimeMinutes = (timeStr?: string) => {
      if (!timeStr) return -1;
      const clean = timeStr.trim();
      const parts = clean.split(":");
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
    };

    const currentIstMinutes = istDate.getUTCHours() * 60 + istDate.getUTCMinutes();

    // 2. Fetch teacher-assigned timetable shift schedule for student's class
    const days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
    const currentDayName = days[istDate.getUTCDay()];
    let teacherSchedule: any = null;
    if (student?.class_id) {
      const { data: sched } = await supabaseAdmin
        .from("class_shift_schedules")
        .select("incoming_shift_id, outgoing_shift_id, is_today_off")
        .eq("class_id", student.class_id)
        .eq("day_of_week", currentDayName)
        .maybeSingle();
      teacherSchedule = sched;
      if (!teacherSchedule) {
        const { data: demand } = await supabaseAdmin
          .from("shift_demands")
          .select("incoming_shift_id, outgoing_shift_id, is_today_off")
          .eq("class_id", student.class_id)
          .eq("day_of_week", currentDayName)
          .maybeSingle();
        teacherSchedule = demand;
      }
    }

    // Dynamic Class Schedule Resolution (NO HARDCODED DAYS - strictly follows teacher / class schedule):
    // 1. If teacher explicitly marked is_today_off === true -> day is off for this class
    // 2. If a class schedule exists for today but neither incoming nor outgoing shift is configured -> no shift today
    const isTodayOff = Boolean(
      teacherSchedule?.is_today_off ||
      (teacherSchedule && !teacherSchedule.incoming_shift_id && !teacherSchedule.outgoing_shift_id)
    );

    const morningShift = (allShifts || []).find((s: any) => s.direction === "HOME_TO_CAMPUS" || s.type === "MORNING") || allShifts?.[0];
    const eveningShift = (allShifts || []).find((s: any) => s.direction === "CAMPUS_TO_HOME" || s.type === "EVENING") || allShifts?.[1] || allShifts?.[0];

    // If today is off for this class, do NOT fallback to default fleet shifts
    const incomingShiftId = isTodayOff ? "" : (teacherSchedule?.incoming_shift_id || (student?.class_id ? "" : morningShift?.id) || "");
    const outgoingShiftId = isTodayOff ? "" : (teacherSchedule?.outgoing_shift_id || (student?.class_id ? "" : eveningShift?.id) || "");
    const incomingShift = incomingShiftId ? (allShifts || []).find((s) => s.id === incomingShiftId) : null;
    const outgoingShift = outgoingShiftId ? (allShifts || []).find((s) => s.id === outgoingShiftId) : null;

    // Determine if the morning/incoming shift is over
    const incomingEndTime = parseTimeMinutes(incomingShift?.end_time);
    const incomingStartTime = parseTimeMinutes(incomingShift?.start_time);
    const morningReservation = incomingShiftId ? (reservations || []).find((r) => r.shift_id === incomingShiftId) : null;
    const morningBoarded = Boolean(
      morningReservation &&
      (morningReservation.status === "BOARDED" || morningReservation.boarded_at)
    );

    // A shift is over if:
    // a) Today is off, OR
    // b) Current time has passed incoming shift end time, OR
    // c) Student marked attendance/boarded AND current time has passed departure
    const isIncomingOver =
      isTodayOff ||
      (incomingEndTime > 0 && currentIstMinutes >= incomingEndTime) ||
      (morningBoarded && incomingStartTime > 0 && currentIstMinutes >= incomingStartTime + 15);

    // Determine if the outgoing/afternoon/evening shift is over
    const outgoingEndTime = parseTimeMinutes(outgoingShift?.end_time);
    const outgoingStartTime = parseTimeMinutes(outgoingShift?.start_time);
    const outgoingReservation = outgoingShiftId ? (reservations || []).find((r) => r.shift_id === outgoingShiftId) : null;
    const outgoingBoarded = Boolean(
      outgoingReservation &&
      (outgoingReservation.status === "BOARDED" || outgoingReservation.boarded_at || outgoingReservation.chosen_seat)
    );

    const isOutgoingOver = isTodayOff || (isIncomingOver && (
      (outgoingEndTime > 0 && currentIstMinutes >= outgoingEndTime) ||
      (outgoingBoarded && outgoingStartTime > 0 && currentIstMinutes >= outgoingStartTime + 15)
    ));

    // Find the latest shift end time across all fleet shifts today
    let latestFleetShiftEndMinutes = 0;
    for (const s of (allShifts || [])) {
      const endM = parseTimeMinutes(s.end_time);
      if (endM > latestFleetShiftEndMinutes) latestFleetShiftEndMinutes = endM;
    }

    // All shifts are over if past all fleet shift end times, or student completed outgoing, or today is off
    const isAllShiftsOver = Boolean(
      isTodayOff ||
      (latestFleetShiftEndMinutes > 0 && currentIstMinutes >= latestFleetShiftEndMinutes) ||
      (isIncomingOver && isOutgoingOver)
    );

    // Next shift assigned for student by the teacher
    const targetShiftId = isTodayOff ? "" : (isIncomingOver && outgoingShiftId ? outgoingShiftId : incomingShiftId);

    // Check if student already has a reservation for the target shift
    let activeReservation = (!isTodayOff && targetShiftId)
      ? ((reservations || []).find((r) => r.shift_id === targetShiftId) || null)
      : null;

    // 3. If no reservation exists for the target shift and auto-assignment is enabled, create auto-assignment
    // Strictly forbidden on days off or when all shifts are completed!
    if (!isTodayOff && !isAllShiftsOver && !activeReservation && currentSettings.auto_assignment_enabled && student && targetShiftId) {
      const targetStopId = student.auto_assigned_stop_id || student.primary_stop_id;
      let targetRouteId = student.primary_route_id;

      if (!targetRouteId && targetStopId) {
        // Resolve route serving this stop
        const { data: routeStop } = await supabaseAdmin
          .from("route_stops")
          .select("route_id")
          .eq("stop_id", targetStopId)
          .limit(1)
          .maybeSingle();
        if (routeStop) targetRouteId = routeStop.route_id;
      }

      // Fetch active trip for today on student's route for targetShiftId
      let trip: any = null;
      if (targetRouteId) {
        const { data: routeTrips } = await supabaseAdmin
          .from("trips")
          .select("id, bus_id, shift_id, route_id, status")
          .eq("route_id", targetRouteId)
          .eq("shift_id", targetShiftId)
          .in("trip_date", allowedDates)
          .neq("status", "CANCELLED")
          .order("trip_date", { ascending: false })
          .limit(1);

        if (routeTrips && routeTrips.length > 0) {
          trip = routeTrips[0];
        }
      }

      // 2.1 Auto-provision trip for route & targetShiftId if not yet scheduled today
      if (!trip && targetRouteId && targetShiftId) {
        const { data: busForRoute } = await supabaseAdmin
          .from("buses")
          .select("id, current_route_id")
          .eq("current_route_id", targetRouteId)
          .neq("status", "MAINTENANCE")
          .limit(1)
          .maybeSingle();

        const assignedBusId = busForRoute?.id || (student as any)?.bus_id || null;

        if (assignedBusId) {
          const shiftObj = (allShifts || []).find((s) => s.id === targetShiftId);
          const timeCode = shiftObj?.start_time ? shiftObj.start_time.substring(0, 5).replace(":", "") : "";
          const shiftSuffix = timeCode || (shiftObj?.id || "run").replace(/[^a-zA-Z0-9]/g, "");
          const routeClean = targetRouteId.replace(/[^a-zA-Z0-9]/g, "-");
          const autoTripId = createTripId();
          const autoTripCode = `TRIP-${routeClean.toUpperCase().replace(/[^A-Z0-9]/g, "")}-${shiftSuffix.toUpperCase()}-${today.replace(/-/g, "")}`;

          const { data: newTrip } = await supabaseAdmin
            .from("trips")
            .upsert({
              id: autoTripId,
              trip_code: autoTripCode,
              route_id: targetRouteId,
              bus_id: assignedBusId,
              shift_id: targetShiftId,
              trip_date: today,
              status: "SCHEDULED",
              delay_minutes: 0,
              manifest_locked: false,
              current_stop_index: 0,
            }, { onConflict: "id" })
            .select()
            .maybeSingle();

          if (newTrip) {
            trip = newTrip;
          }
        }
      }

      // 2.2 If still no trip, match any active trip for targetShiftId today (never cross-match different shifts)
      if (!trip && targetShiftId) {
        const { data: shiftTrips } = await supabaseAdmin
          .from("trips")
          .select("id, bus_id, shift_id, route_id, status")
          .eq("shift_id", targetShiftId)
          .in("trip_date", allowedDates)
          .neq("status", "CANCELLED");

        if (shiftTrips && shiftTrips.length > 0) {
          trip = shiftTrips.find((t) => t.route_id === targetRouteId) || shiftTrips[0];
        }
      }

      if (trip && trip.bus_id && targetStopId) {
        // For outgoing (CAMPUS_TO_HOME) shifts, boarding stop is typically campus terminus stop
        let boardingStop = targetStopId;
        if (isIncomingOver && outgoingShift?.direction === "CAMPUS_TO_HOME") {
          const { data: campusStop } = await supabaseAdmin
            .from("stops")
            .select("id")
            .ilike("name", "%campus%")
            .limit(1)
            .maybeSingle();
          if (campusStop?.id) {
            boardingStop = campusStop.id;
          }
        }

        const { data: createdRes, error: createErr } = await supabaseAdmin
          .from("bus_reservations")
          .insert({
            student_id: resolvedStudentId,
            trip_id: trip.id,
            bus_id: trip.bus_id,
            boarding_stop_id: boardingStop,
            shift_id: targetShiftId,
            reservation_date: today,
            assigned_by: "AI_AUTO",
            assignment_score: 0.985,
            status: "ASSIGNED",
          })
          .select()
          .single();

        if (createErr) {
          console.error("[api/students/reservations] auto-assign insert error:", createErr);
        }

        if (!createErr && createdRes) {
          activeReservation = createdRes;
        }
      }
    }

    // Fallback: if activeReservation is still null, take the most recent reservation
    if (!activeReservation && reservations && reservations.length > 0) {
      activeReservation = reservations[0];
    }

    // 3. If we have a reservation, enrich with bus and stop info
    let enriched = null;
    if (activeReservation) {
      // Self-healing check: verify that activeReservation.trip_id matches activeReservation.shift_id
      if (activeReservation.shift_id && activeReservation.trip_id) {
        const { data: linkedTrip } = await supabaseAdmin
          .from("trips")
          .select("id, shift_id, bus_id, route_id")
          .eq("id", activeReservation.trip_id)
          .maybeSingle();

        if (linkedTrip && linkedTrip.shift_id && linkedTrip.shift_id !== activeReservation.shift_id) {
          console.warn(`[reservations] Shift mismatch: reservation has shift ${activeReservation.shift_id} but trip has shift ${linkedTrip.shift_id}. Auto-healing...`);
          const { data: correctTrip } = await supabaseAdmin
            .from("trips")
            .select("id, bus_id, shift_id")
            .eq("shift_id", activeReservation.shift_id)
            .eq("bus_id", activeReservation.bus_id || linkedTrip.bus_id)
            .in("trip_date", allowedDates)
            .neq("status", "CANCELLED")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (correctTrip) {
            activeReservation.trip_id = correctTrip.id;
            await supabaseAdmin
              .from("bus_reservations")
              .update({ trip_id: correctTrip.id })
              .eq("id", activeReservation.id);
          }
        }
      }

      let targetShiftId = activeReservation.shift_id;
      if (!targetShiftId && activeReservation.trip_id) {
        const { data: tripRow } = await supabaseAdmin
          .from("trips")
          .select("shift_id")
          .eq("id", activeReservation.trip_id)
          .maybeSingle();
        targetShiftId = tripRow?.shift_id;
      }

      const [busRes, stopRes, shiftRes] = await Promise.all([
        supabaseAdmin
          .from("buses")
          .select("id, bus_number, registration_no, model, capacity, seat_layout, teacher_seats_count")
          .eq("id", activeReservation.bus_id)
          .maybeSingle(),
        supabaseAdmin
          .from("stops")
          .select("id, name, landmark, latitude, longitude")
          .eq("id", activeReservation.boarding_stop_id)
          .maybeSingle(),
        targetShiftId
          ? supabaseAdmin
              .from("shifts")
              .select("id, name, type, start_time, end_time, direction, booking_cutoff_minutes, is_special")
              .eq("id", targetShiftId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      enriched = {
        ...activeReservation,
        bus: busRes.data
          ? {
              ...busRes.data,
              busNumber: busRes.data.bus_number,
              registrationNo: busRes.data.registration_no,
              seatLayout: busRes.data.seat_layout,
            }
          : null,
        stop: stopRes.data || null,
        shift: shiftRes?.data
          ? {
              id: shiftRes.data.id,
              name: shiftRes.data.name,
              shiftType: shiftRes.data.type,
              startTime: shiftRes.data.start_time ? shiftRes.data.start_time.substring(0, 5) : "",
              endTime: shiftRes.data.end_time ? shiftRes.data.end_time.substring(0, 5) : "",
              direction: shiftRes.data.direction,
              bookingCutoffMins: Number(shiftRes.data.booking_cutoff_minutes || 30),
              isSpecial: Boolean(shiftRes.data.is_special),
            }
          : null,
      };
    }

    // Query seats occupied by other students on this specific trip
    let occupiedSeats: string[] = [];
    if (activeReservation?.trip_id) {
      const [tripRes, tripBks] = await Promise.all([
        supabaseAdmin
          .from("bus_reservations")
          .select("chosen_seat")
          .eq("trip_id", activeReservation.trip_id)
          .neq("id", activeReservation.id)
          .not("chosen_seat", "is", null),
        supabaseAdmin
          .from("bookings")
          .select("seat_number")
          .eq("trip_id", activeReservation.trip_id)
          .in("status", ["CONFIRMED", "BOARDED"])
          .not("seat_number", "is", null),
      ]);

      const resSeats = (tripRes.data || []).map((r: any) => r.chosen_seat).filter(Boolean);
      const bkSeats = (tripBks.data || []).map((b: any) => b.seat_number).filter(Boolean);
      occupiedSeats = Array.from(new Set([...resSeats, ...bkSeats]));
    }

    // Check if student was verified via RFID tap today or unlocked via attendance lock
    // IMPORTANT: Scope RFID verification to the CURRENT reservation's bus.
    // If the reservation's lock_status is explicitly LOCKED (e.g. after cancel rollback),
    // that is the authoritative source of truth — don't auto-unlock from stale RFID records.
    const CACHE_RFID_KEY = `attendance:rfid:${resolvedStudentId}:${today}`;
    const CACHE_LOCK_KEY = `attendance:lock:${resolvedStudentId}:${today}`;
    let isRfidVerified = false;
    const [rfidCache, lockCache] = await Promise.all([
      cacheGet<any>(CACHE_RFID_KEY),
      cacheGet<any>(CACHE_LOCK_KEY),
    ]);

    // If the reservation explicitly says LOCKED (e.g. after cancel_seat_transaction rollback),
    // respect that as authoritative and do NOT auto-unlock from cross-trip RFID records.
    const reservationExplicitlyLocked = enriched?.lock_status === "LOCKED" && enriched?.status === "ASSIGNED";

    if (!reservationExplicitlyLocked) {
      if (rfidCache && rfidCache.verified) {
        isRfidVerified = true;
      } else {
        // Fallback: query attendance_records, but scope to the CURRENT reservation's bus
        const rfidQuery = supabaseAdmin
          .from("attendance_records")
          .select("id, timestamp, bus_id, method, lock_status, unlocked_by")
          .eq("student_id", resolvedStudentId)
          .eq("method", "RFID_VERIFIED")
          .gte("timestamp", `${today}T00:00:00.000Z`)
          .order("timestamp", { ascending: false })
          .limit(1);

        // Scope to current reservation's bus if available
        if (activeReservation?.bus_id) {
          rfidQuery.eq("bus_id", activeReservation.bus_id);
        }

        const { data: rfidAtt } = await rfidQuery.maybeSingle();
        if (rfidAtt) {
          isRfidVerified = true;
        }
      }
    }

    const lockStatus = reservationExplicitlyLocked
      ? "LOCKED"
      : (enriched?.lock_status || lockCache?.lockStatus || (isRfidVerified ? "UNLOCKED" : "LOCKED"));

    return NextResponse.json({
      success: true,
      reservation: enriched,
      occupiedSeats,
      isRfidVerified,
      lockStatus,
      unlockedBy: enriched?.unlocked_by || lockCache?.unlockedBy || (isRfidVerified ? "RFID" : null),
      settings: currentSettings,
      schedule: {
        incomingShiftId,
        outgoingShiftId,
        isIncomingOver,
        isOutgoingOver,
        isAllShiftsOver,
        targetShiftId,
        isTodayOff,
        dayOfWeek: currentDayName,
        reason: teacherSchedule?.is_today_off
          ? "CLASS_DAY_OFF"
          : (!teacherSchedule?.incoming_shift_id && !teacherSchedule?.outgoing_shift_id
              ? "NO_SHIFTS_CONFIGURED"
              : "COMMUTE_CONCLUDED"),
      },
      teacherSchedule: {
        incomingShiftId,
        outgoingShiftId,
        isIncomingOver,
        isOutgoingOver,
        isAllShiftsOver,
        targetShiftId,
        isTodayOff,
        dayOfWeek: currentDayName,
        reason: teacherSchedule?.is_today_off
          ? "CLASS_DAY_OFF"
          : (!teacherSchedule?.incoming_shift_id && !teacherSchedule?.outgoing_shift_id
              ? "NO_SHIFTS_CONFIGURED"
              : "COMMUTE_CONCLUDED"),
      },
      previousReservation: morningReservation || null,
      allReservationsToday: reservations || [],
    });
  } catch (err: any) {
    console.error("[api/students/reservations] GET error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

/**
 * POST /api/students/reservations
 * Student selects seat on their assigned bus (at attendance or boarding)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { reservationId, studentId, seatNumber } = body;

    if (!seatNumber) {
      return NextResponse.json({ success: false, message: "Seat number is required." }, { status: 400 });
    }

    const rawStudentId = studentId || (session as any).studentId || session.userId;
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const today = istDate.toISOString().split("T")[0];
    const utcToday = now.toISOString().split("T")[0];
    const allowedDates = Array.from(new Set([today, utcToday]));

    // Resolve student
    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id, user_id")
      .or(`id.eq.${rawStudentId},user_id.eq.${rawStudentId}`)
      .maybeSingle();

    const resolvedStudentId = student?.id || rawStudentId;

    // Find reservation
    let query = supabaseAdmin.from("bus_reservations").select("*");
    if (reservationId) {
      query = query.eq("id", reservationId);
    } else {
      query = query
        .or(`student_id.eq.${resolvedStudentId},student_id.eq.${rawStudentId}`)
        .in("reservation_date", allowedDates);
    }

    const { data: targetRes, error: findErr } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();

    if (findErr || !targetRes) {
      return NextResponse.json({ success: false, message: "No active bus reservation found for today." }, { status: 404 });
    }

    // Verify N starting seats restriction for teachers on this bus
    const userRole = ((session as any)?.role || "").toLowerCase();
    const isFacultyUser = userRole === "teacher" || userRole === "faculty" || userRole === "staff" || userRole === "admin";

    if (!isFacultyUser) {
      let isRestricted = false;
      if (targetRes.bus_id) {
        const { data: busData } = await supabaseAdmin
          .from("buses")
          .select("capacity, seat_layout, teacher_seats_count")
          .eq("id", targetRes.bus_id)
          .maybeSingle();

        if (busData) {
          const busSeats = generateSeatLayout(busData.capacity, busData.seat_layout || "NONE");
          const nTeachers = typeof (busData as any)?.teacher_seats_count === "number"
            ? (busData as any).teacher_seats_count
            : 0;
          if (nTeachers > 0) {
            const teacherReservedSeats = getTeacherStartingSeats(busSeats, nTeachers);
            isRestricted = teacherReservedSeats.includes(seatNumber);
          }
        }
      }

      if (isRestricted) {
        return NextResponse.json(
          {
            success: false,
            message: "Starting seats on this bus are strictly reserved for Faculty and Teachers. Please select another seat.",
          },
          { status: 403 }
        );
      }
    }

    // Check Multi-Factor Security:
    // 1. Attendance Lock Status (Distance Proximity Unlock or RFID Tap)
    // 2. In-Bus Hardware RFID Verification
    // 3. Real-Time GPS Proximity
    const CACHE_LOCK_KEY = `attendance:lock:${resolvedStudentId}:${today}`;
    const CACHE_RFID_KEY = `attendance:rfid:${resolvedStudentId}:${today}`;

    const [lockCache, rfidCache] = await Promise.all([
      cacheGet<any>(CACHE_LOCK_KEY),
      cacheGet<any>(CACHE_RFID_KEY),
    ]);

    let isLockUnlocked = targetRes?.lock_status === "UNLOCKED" || lockCache?.lockStatus === "UNLOCKED";
    let isRfidVerified = Boolean(rfidCache?.verified);

    if (!isLockUnlocked && !isRfidVerified) {
      const { data: attRec } = await supabaseAdmin
        .from("attendance_records")
        .select("id, timestamp, method, lock_status, unlocked_by")
        .eq("student_id", resolvedStudentId)
        .gte("timestamp", `${today}T00:00:00.000Z`)
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (attRec) {
        if (attRec.lock_status === "UNLOCKED" || attRec.method === "LOCATION_DISTANCE_UNLOCK") {
          isLockUnlocked = true;
        }
        if (attRec.method === "RFID_VERIFIED" || attRec.unlocked_by === "RFID") {
          isRfidVerified = true;
        }
      }
    }

    const { latitude, longitude, verifyGps } = body;
    let isGpsVerified = false;
    let gpsNote = "Portal Seat Selection";

    if (isRfidVerified) {
      gpsNote = "Verified via in-bus RFID reader tap";
    } else if (isLockUnlocked) {
      gpsNote = `Verified via Attendance Security Unlock (${lockCache?.unlockedBy || targetRes?.unlocked_by || "Location Distance"})`;
    } else if (targetRes.bus_id) {
      // Must verify real-time GPS proximity against live bus telematics
      const busIdsToCheck = Array.from(new Set([
        targetRes.bus_id,
        targetRes.bus_id.toLowerCase(),
        targetRes.bus_id.toUpperCase(),
      ]));
      let liveTelematics: { latitude: number; longitude: number } | null = null;
      for (const bId of busIdsToCheck) {
        const cached = await cacheGet<{ latitude: number; longitude: number }>(`telematics:bus:${bId}`);
        if (cached && typeof cached.latitude === "number" && typeof cached.longitude === "number") {
          liveTelematics = cached;
          break;
        }
      }
      if (!liveTelematics) {
        for (const bId of busIdsToCheck) {
          const mongoDoc = await getLiveLocationFromMongo(bId);
          if (mongoDoc && typeof mongoDoc.latitude === "number" && typeof mongoDoc.longitude === "number") {
            liveTelematics = { latitude: mongoDoc.latitude, longitude: mongoDoc.longitude };
            break;
          }
        }
      }

      // If bus telematics is not yet broadcasting coordinates
      if (!liveTelematics || typeof liveTelematics.latitude !== "number" || typeof liveTelematics.longitude !== "number") {
        return NextResponse.json({
          success: false,
          status: "LOCATION_UNAVAILABLE",
          message: "Bus live GPS location is currently calibrating. Please wait a moment for bus signal, or tap your physical RFID card on the bus reader to mark attendance and choose your seat.",
        }, { status: 422 });
      }

      if (latitude === undefined || longitude === undefined) {
        return NextResponse.json({
          success: false,
          status: "STUDENT_LOCATION_REQUIRED",
          message: "Device GPS coordinates are required to verify you are physically at your bus. Please enable location permissions or tap your RFID card inside the bus.",
        }, { status: 400 });
      }

      const distKm = calculateDistanceKm(
        Number(latitude),
        Number(longitude),
        liveTelematics.latitude,
        liveTelematics.longitude
      );
      // Commercial vehicle cabin & station boarding buffer tolerance (200m vehicular geofence)
      const MAX_GEOFENCE_METERS = 200;
      const distMeters = Math.round(distKm * 1000);

      if (distMeters > MAX_GEOFENCE_METERS) {
        return NextResponse.json({
          success: false,
          status: "GPS_VERIFICATION_FAILED",
          distMeters,
          maxAllowedMeters: MAX_GEOFENCE_METERS,
          message: `SECURITY ALERT: GPS verification failed. You are ${distMeters}m away from your bus (max allowed: ${MAX_GEOFENCE_METERS}m). Attendance can only be recorded when physically boarding or inside the bus, or tap your RFID card inside the bus.`,
        }, { status: 403 });
      }

      isGpsVerified = true;
      gpsNote = `Verified inside bus via real-time GPS proximity (${distMeters}m from bus antenna)`;
    }

    const nowIso = new Date().toISOString();

    // Determine unlock method and verifier for the atomic transaction
    const unlockMethod = isRfidVerified ? "RFID_VERIFIED" : (isLockUnlocked ? (lockCache?.unlockedBy === "RFID" ? "RFID_VERIFIED" : "LOCATION_DISTANCE_UNLOCK") : (isGpsVerified ? "GPS_VERIFIED" : "MANUAL_SELECT"));
    const verifiedBy = isRfidVerified ? "ESP32 Hardware RFID Gate" : (isLockUnlocked ? "Location Distance Proximity Engine" : (isGpsVerified ? "GPS Geofence System" : "Student Commute Portal"));

    // ══════════════════════════════════════════════════════════════════════
    // ATOMIC TRANSACTION: All 3 writes (bus_reservations + attendance_records
    // + seat_attendance) succeed together or all rollback together.
    // Uses Postgres FOR UPDATE row-level locking to prevent seat double-booking.
    // ══════════════════════════════════════════════════════════════════════
    const { data: txnResult, error: txnError } = await supabaseAdmin.rpc("seat_attendance_transaction", {
      p_reservation_id: targetRes.id,
      p_student_id: resolvedStudentId,
      p_seat_number: seatNumber,
      p_unlock_method: unlockMethod,
      p_verified_by: verifiedBy,
      p_notes: gpsNote,
    });

    if (txnError) {
      console.error("[api/students/attendance] RPC seat_attendance_transaction error:", txnError);
      return NextResponse.json({ success: false, message: txnError.message }, { status: 500 });
    }

    if (txnResult && !txnResult.success) {
      return NextResponse.json({ success: false, message: txnResult.error }, { status: 409 });
    }

    // Sync Redis cache to reflect the successful atomic transaction
    const lockPayload = {
      lockStatus: "UNLOCKED",
      unlockedBy: isRfidVerified ? "RFID" : "LOCATION_DISTANCE",
      busId: targetRes.bus_id,
      tripId: targetRes.trip_id,
      timestamp: nowIso,
      method: unlockMethod,
    };
    await cacheSet(`attendance:lock:${resolvedStudentId}:${today}`, lockPayload, 86400).catch(() => {});
    if (rawStudentId !== resolvedStudentId) {
      await cacheSet(`attendance:lock:${rawStudentId}:${today}`, lockPayload, 86400).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      message: txnResult?.message || `✓ Attendance confirmed & Seat ${seatNumber} reserved on your bus.`,
      reservation: { ...targetRes, chosen_seat: seatNumber, status: "BOARDED", boarded_at: nowIso },
      isGpsVerified,
      attendanceId: txnResult?.attendanceId,
    });
  } catch (err: any) {
    console.error("[api/students/reservations] POST error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/students/attendance
 * Cancel seat selection and fully rollback attendance.
 * Blocked when trip.status = 'IN_PROGRESS' (conductor lock — bus has departed).
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { reservationId, studentId } = body;

    if (!reservationId) {
      return NextResponse.json({ success: false, message: "Reservation ID is required." }, { status: 400 });
    }

    const rawStudentId = studentId || (session as any).studentId || session.userId;

    // Resolve student
    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id, user_id")
      .or(`id.eq.${rawStudentId},user_id.eq.${rawStudentId}`)
      .maybeSingle();

    const resolvedStudentId = student?.id || rawStudentId;

    // Resolve date in IST
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const today = istDate.toISOString().split("T")[0];

    // ══════════════════════════════════════════════════════════════════════
    // ATOMIC CANCEL: Rollback reservation + delete attendance + reset bookings
    // Conductor lock: blocked if trip.status = 'IN_PROGRESS'
    // ══════════════════════════════════════════════════════════════════════
    const { data: txnResult, error: txnError } = await supabaseAdmin.rpc("cancel_seat_transaction", {
      p_reservation_id: reservationId,
      p_student_id: resolvedStudentId,
    });

    if (txnError) {
      console.error("[api/students/attendance] RPC cancel_seat_transaction error:", txnError);
      return NextResponse.json({ success: false, message: txnError.message }, { status: 500 });
    }

    if (txnResult && !txnResult.success) {
      const statusCode = txnResult.tripLocked ? 423 : 409;
      return NextResponse.json({ success: false, message: txnResult.error, tripLocked: txnResult.tripLocked || false }, { status: statusCode });
    }

    // Clear Redis cache keys on successful cancel
    const linkedIds = Array.from(new Set([resolvedStudentId, rawStudentId, session.userId]));
    await Promise.all(
      linkedIds.flatMap((lid) => [
        cacheDel(`attendance:lock:${lid}:${today}`).catch(() => {}),
        cacheDel(`attendance:rfid:${lid}:${today}`).catch(() => {}),
      ])
    );

    return NextResponse.json({
      success: true,
      message: txnResult?.message || "Seat cancelled and attendance rolled back. You can re-select a seat.",
    });
  } catch (err: any) {
    console.error("[api/students/attendance] DELETE error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/students/attendance
 * Switch to a different seat (atomic swap).
 * Allowed even when trip.status = 'IN_PROGRESS' (in-bus switching permitted).
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { reservationId, studentId, newSeatNumber } = body;

    if (!reservationId || !newSeatNumber) {
      return NextResponse.json({ success: false, message: "Reservation ID and new seat number are required." }, { status: 400 });
    }

    const rawStudentId = studentId || (session as any).studentId || session.userId;

    // Resolve student
    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id, user_id")
      .or(`id.eq.${rawStudentId},user_id.eq.${rawStudentId}`)
      .maybeSingle();

    const resolvedStudentId = student?.id || rawStudentId;

    // Verify teacher-reserved seats restriction (same logic as POST)
    const userRole = ((session as any)?.role || "").toLowerCase();
    const isFacultyUser = userRole === "teacher" || userRole === "faculty" || userRole === "staff" || userRole === "admin";

    if (!isFacultyUser) {
      // Fetch reservation to get bus_id
      const { data: resData } = await supabaseAdmin
        .from("bus_reservations")
        .select("bus_id")
        .eq("id", reservationId)
        .maybeSingle();

      if (resData?.bus_id) {
        const { data: busData } = await supabaseAdmin
          .from("buses")
          .select("capacity, seat_layout, teacher_seats_count")
          .eq("id", resData.bus_id)
          .maybeSingle();

        if (busData) {
          const busSeats = generateSeatLayout(busData.capacity, busData.seat_layout || "NONE");
          const nTeachers = typeof (busData as any)?.teacher_seats_count === "number"
            ? (busData as any).teacher_seats_count
            : 0;
          if (nTeachers > 0) {
            const teacherReservedSeats = getTeacherStartingSeats(busSeats, nTeachers);
            if (teacherReservedSeats.includes(newSeatNumber)) {
              return NextResponse.json(
                {
                  success: false,
                  message: "Starting seats on this bus are strictly reserved for Faculty and Teachers. Please select another seat.",
                },
                { status: 403 }
              );
            }
          }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // ATOMIC SWITCH: Old seat freed → new seat claimed → attendance updated
    // All in a single Postgres transaction with FOR UPDATE row locking.
    // ══════════════════════════════════════════════════════════════════════
    const { data: txnResult, error: txnError } = await supabaseAdmin.rpc("switch_seat_transaction", {
      p_reservation_id: reservationId,
      p_student_id: resolvedStudentId,
      p_new_seat_number: newSeatNumber,
    });

    if (txnError) {
      console.error("[api/students/attendance] RPC switch_seat_transaction error:", txnError);
      return NextResponse.json({ success: false, message: txnError.message }, { status: 500 });
    }

    if (txnResult && !txnResult.success) {
      return NextResponse.json({ success: false, message: txnResult.error }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      message: txnResult?.message || `✓ Seat switched to ${newSeatNumber}`,
      oldSeat: txnResult?.oldSeat,
      newSeat: txnResult?.newSeat,
    });
  } catch (err: any) {
    console.error("[api/students/attendance] PATCH error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
