import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { isStartingSeat, getTeacherStartingSeats, generateSeatLayout, calculateDistanceKm } from "@/lib/utils";
import { allocateSeatWithPreferences } from "@/lib/seat-allocation-engine";
import { cacheGet, cacheSet, cacheDel } from "@/lib/redis";
import { getLiveLocationFromMongo } from "@/lib/mongodb";
import { createTripId, createBookingId, createAttendanceId } from "@/lib/id";

import { getOwnStudentId, isStaffRole } from "@/lib/security/actor";
import { isSafeId } from "@/lib/security/safe-id";

/**
 * The student this request acts on, from the session only (AGENTS.md rule). Staff may name a student;
 * students and teachers always act on themselves (their students row id, else their user id).
 */
async function actingStudentRef(session: { userId: string; role: string }, requested: unknown): Promise<string> {
  if (isStaffRole(session.role) && isSafeId(requested)) return requested as string;
  return (await getOwnStudentId(session.userId)) || session.userId;
}

async function ownsReservation(session: { role: string }, reservationId: unknown, ids: string[]): Promise<boolean> {
  if (isStaffRole(session.role)) return true;
  if (!isSafeId(reservationId)) return false;
  const { data } = await supabaseAdmin.from("bus_reservations").select("student_id").eq("id", reservationId as string).maybeSingle();
  return Boolean(data && ids.includes(data.student_id as string));
}


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
    const rawStudentId = await actingStudentRef(session, searchParams.get("studentId"));

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
        .neq("status", "CANCELLED")
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

    // All shifts are over if past all fleet shift end times, or student completed outgoing (strictly only on active transit days)
    const isAllShiftsOver = !isTodayOff && Boolean(
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
          .upsert({
            student_id: resolvedStudentId,
            trip_id: trip.id,
            bus_id: trip.bus_id,
            boarding_stop_id: boardingStop,
            shift_id: targetShiftId,
            reservation_date: today,
            assigned_by: "AI_AUTO",
            assignment_score: 0.985,
            status: "ASSIGNED",
          }, { onConflict: "student_id,shift_id,reservation_date", ignoreDuplicates: true })
          .select()
          .maybeSingle();

        if (createErr) {
          console.error("[api/students/reservations] auto-assign insert error:", createErr);
        }

        if (!createErr && createdRes) {
          activeReservation = createdRes;
        }
      }
    }

    // Fallback: if activeReservation is still null, take the most recent reservation ONLY if today is not off and shifts are not over
    if (!isTodayOff && !isAllShiftsOver && !activeReservation && reservations && reservations.length > 0) {
      activeReservation = reservations.find((r) => r.status !== "CANCELLED") || null;
    }

    // If today is off for this class, activeReservation is strictly null; auto-cancel any unboarded AI_AUTO reservation
    if (isTodayOff) {
      activeReservation = null;
      if (reservations && reservations.length > 0) {
        const phantomAutoRes = reservations.filter(
          (r: any) => r.assigned_by === "AI_AUTO" && r.status !== "CANCELLED" && !r.boarded_at && !r.chosen_seat
        );
        if (phantomAutoRes.length > 0) {
          const idsToCancel = phantomAutoRes.map((r: any) => r.id);
          await supabaseAdmin
            .from("bus_reservations")
            .update({ status: "CANCELLED", cancelled_at: new Date().toISOString() })
            .in("id", idsToCancel);
        }
      }
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
      const { data: tripRes } = await supabaseAdmin
        .from("bus_reservations")
        .select("chosen_seat")
        .eq("trip_id", activeReservation.trip_id)
        .neq("id", activeReservation.id)
        .in("status", ["CONFIRMED", "BOARDED"])
        .not("chosen_seat", "is", null);

      occupiedSeats = (tripRes || []).map((r: any) => r.chosen_seat).filter(Boolean);
    }

    // ── Algorithmic Auto-Seat Allocation with Railway-Style Preferences ──
    if (activeReservation && !activeReservation.chosen_seat && enriched?.bus) {
      try {
        const { data: studPref } = await supabaseAdmin
          .from("students")
          .select("seat_row_preference, seat_position_preference, preferred_partner_student_id, preferred_partner_name")
          .eq("id", resolvedStudentId)
          .maybeSingle();

        const { data: allTripRes } = await supabaseAdmin
          .from("bus_reservations")
          .select("student_id, chosen_seat, status")
          .eq("bus_id", activeReservation.bus_id)
          .neq("id", activeReservation.id)
          .neq("status", "CANCELLED");

        const alloc = allocateSeatWithPreferences({
          bus: enriched.bus,
          student: {
            id: resolvedStudentId,
            seatRowPreference: studPref?.seat_row_preference,
            seatPositionPreference: studPref?.seat_position_preference,
            preferredPartnerStudentId: studPref?.preferred_partner_student_id,
            preferredPartnerName: studPref?.preferred_partner_name,
          },
          occupiedSeats,
          allTripReservations: allTripRes || [],
        });

        if (alloc?.allocatedSeat) {
          activeReservation.chosen_seat = alloc.allocatedSeat;
          activeReservation.auto_assigned_seat = alloc.allocatedSeat;
          activeReservation.seat_allocation_meta = {
            reasons: alloc.matchReasons,
            rowZone: alloc.seatRowZone,
            position: alloc.seatPosition,
            isAdjacentToPartner: alloc.isAdjacentToPartner,
            partnerSeat: alloc.partnerSeat,
            partnerName: alloc.partnerName,
          };
          if (enriched) {
            enriched.chosen_seat = alloc.allocatedSeat;
            enriched.auto_assigned_seat = alloc.allocatedSeat;
            enriched.seat_allocation_meta = activeReservation.seat_allocation_meta;
          }

          // Persist auto-assigned seat
          await supabaseAdmin
            .from("bus_reservations")
            .update({
              chosen_seat: alloc.allocatedSeat,
              auto_assigned_seat: alloc.allocatedSeat,
              seat_preference_applied: true,
            })
            .eq("id", activeReservation.id);
        }
      } catch (allocErr) {
        console.warn("[attendance/reservations] Seat auto-allocation warning:", allocErr);
      }
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

// Seats come from the boarding chart (src/lib/students/seating.ts) and are final for students.
// Seat picking, switching and cancelling by students (POST/PATCH/DELETE) were removed; the conductor
// moves a passenger on the seat map (/api/crew/attendance).
