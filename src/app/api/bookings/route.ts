import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getSessionFromRequest } from "@/lib/jwt";
import { isStudentSubscriptionActive } from "@/lib/subscription-utils";
import { isTripCutoffPassed, getTodayIST } from "@/lib/time-manager";
import { generateSeatLayout, isStartingSeat, getTeacherStartingSeats } from "@/lib/utils";
import { createBookingId } from "@/lib/id";

// GET /api/bookings?tripId=...&shiftId=...&studentId=...&date=...
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tripId = searchParams.get("tripId");
    const shiftId = searchParams.get("shiftId");
    const studentId = searchParams.get("studentId");
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

    // 1. Fetch trip-specific bookings
    let tripBookings: any[] = [];
    if (tripId) {
      const { data: dbTripBookings, error: tripErr } = await supabaseAdmin
        .from("bookings_full")
        .select("*")
        .eq("trip_id", tripId)
        .in("status", ["CONFIRMED", "BOARDED", "WAITLISTED"]);

      if (!tripErr && dbTripBookings) {
        tripBookings = dbTripBookings;
      }
    }

    // 2. Fetch shift-level existing active booking for this student (Shift Lock Check)
    let userShiftBooking: any = null;
    if (studentId && shiftId) {
      // Find trips belonging to this shift on the specified date
      const { data: shiftTrips } = await supabaseAdmin
        .from("trips")
        .select("id, trip_code, bus_id, buses(bus_number, model)")
        .eq("shift_id", shiftId);

      const shiftTripIds = (shiftTrips || []).map((t) => t.id);

      if (shiftTripIds.length > 0) {
        const { data: activeBookings } = await supabaseAdmin
          .from("bookings_full")
          .select("*")
          .in("trip_id", shiftTripIds)
          .or(`student_id.eq.${studentId},student_id.eq.stud-${studentId}`)
          .in("status", ["CONFIRMED", "BOARDED", "WAITLISTED"])
          .limit(1);

        if (activeBookings && activeBookings.length > 0) {
          const matched = activeBookings[0];
          const matchedTrip = (shiftTrips || []).find((t) => t.id === matched.trip_id);
          userShiftBooking = {
            ...matched,
            busNumber: (matchedTrip as any)?.buses?.bus_number || matched.bus_id || "Campus Bus",
            tripCode: (matchedTrip as any)?.trip_code || matched.trip_code,
          };
        }
      }
    }

    const occupiedSeats = tripBookings
      .filter((b) => b.status === "CONFIRMED" || b.status === "BOARDED")
      .map((b) => b.seat_number)
      .filter(Boolean);

    return NextResponse.json(
      {
        success: true,
        tripBookings,
        occupiedSeats,
        userShiftBooking,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST /api/bookings
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Authentication required to reserve seat." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { studentId, tripId, boardingStopId, requestedSeatNumber, instantBoard } = body;

    if (!studentId || !tripId || !boardingStopId) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (studentId, tripId, boardingStopId)." },
        { status: 400 }
      );
    }

    // 1. Fetch Student from Database (students_full view has payment_status and has_active_subscription)
    const { data: studentsList, error: studErr } = await supabaseAdmin
      .from("students_full")
      .select("*")
      .or(`id.eq.${studentId},user_id.eq.${studentId}`)
      .limit(1);

    const student = studentsList?.[0];

    if (studErr || !student) {
      return NextResponse.json(
        { success: false, error: "Student profile not found." },
        { status: 404 }
      );
    }

    // 1b. Cloudflare Security Audit: Strict IDOR Guard
    const isStaffOrAdmin = ["admin", "transport_admin", "transport_manager"].includes(session.role);
    if (!isStaffOrAdmin) {
      const matchesSession =
        student.user_id === session.userId ||
        student.id === session.userId ||
        (session.studentId && student.id === session.studentId) ||
        student.email?.toLowerCase() === session.email?.toLowerCase();
      if (!matchesSession) {
        return NextResponse.json(
          { success: false, error: "Unauthorized: You cannot book seats on behalf of other students (IDOR violation)." },
          { status: 403 }
        );
      }
    }

    // 2. Subscription Verification
    const studentModel: any = {
      id: student.id,
      paymentStatus: student.payment_status,
      hasActiveSubscription: student.has_active_subscription,
      subscriptionExpiryDate: student.subscription_expiry_date,
      transportAccessSuspended: student.transport_access_suspended,
    };

    if (!isStudentSubscriptionActive(studentModel)) {
      return NextResponse.json(
        {
          success: false,
          code: "SUBSCRIPTION_REQUIRED",
          message: "Transit pass inactive or payment required. Please settle your fee to unlock seat booking.",
        },
        { status: 403 }
      );
    }

    // 3. Fetch Trip, Shift, and Bus details
    const { data: rawTrip, error: tripErr } = await supabaseAdmin
      .from("trips")
      .select("*, shifts(*), buses(*)")
      .eq("id", tripId)
      .single();

    if (tripErr || !rawTrip) {
      return NextResponse.json({ success: false, error: "Trip not found." }, { status: 404 });
    }

    const todayIST = getTodayIST();
    let trip = rawTrip;

    // If client provided a historical trip from a past day, auto-resolve to today's scheduled trip for this bus & shift
    if (trip.trip_date && trip.trip_date < todayIST) {
      const { data: todayTrips } = await supabaseAdmin
        .from("trips")
        .select("*, shifts(*), buses(*)")
        .eq("bus_id", trip.bus_id)
        .eq("shift_id", trip.shift_id)
        .eq("trip_date", todayIST)
        .eq("status", "SCHEDULED")
        .limit(1);

      if (todayTrips && todayTrips.length > 0) {
        trip = todayTrips[0];
      } else {
        return NextResponse.json(
          {
            success: false,
            message: `Booking closed. Trip schedule (${trip.trip_code}) was for a past date (${trip.trip_date}). Please select today's departure.`,
          },
          { status: 400 }
        );
      }
    }

    const bus = trip.buses;
    const shift = trip.shifts;

    if (!bus) {
      return NextResponse.json({ success: false, error: "Bus vehicle not allocated for this trip." }, { status: 400 });
    }

    // Special Trip & Shift Allocation Security Check
    const isSpecialTrip = Boolean(
      trip.is_special ||
      trip.facility_type === "PLACEMENT_DRIVE" ||
      trip.facility_type === "EVENT" ||
      shift?.is_special ||
      shift?.name?.toLowerCase().includes("special")
    );

    if (isSpecialTrip) {
      const { data: specialAlloc } = await supabaseAdmin
        .from("special_shift_allocations")
        .select("id")
        .or(`student_id.eq.${student.id},student_id.eq.stud-${student.id}`)
        .or(`shift_id.eq.${trip.shift_id},trip_id.eq.${trip.id}`)
        .limit(1);

      if (!specialAlloc || specialAlloc.length === 0) {
        return NextResponse.json(
          {
            success: false,
            code: "SPECIAL_SHIFT_RESTRICTED",
            message: "Access Restricted: This special placement/event transit run is reserved exclusively for allocated students.",
          },
          { status: 403 }
        );
      }
    }

    // 4. Booking Cutoff & Manifest Lock Check
    if (trip.manifest_locked) {
      return NextResponse.json(
        { success: false, message: "Booking is locked. The departure manifest for this trip has already been finalized." },
        { status: 400 }
      );
    }

    const shiftStartTime = shift?.start_time ? shift.start_time.substring(0, 5) : "";
    const shiftEndTime = shift?.end_time ? shift.end_time.substring(0, 5) : "";

    const isCutoff = isTripCutoffPassed(
      {
        ...trip,
        manifestLocked: Boolean(trip.manifest_locked),
        departureTime: trip.departure_time || shiftStartTime,
        arrivalTime: trip.arrival_time || shiftEndTime,
      } as any,
      {
        id: shift?.id || trip.shift_id,
        name: shift?.name,
        shiftType: shift?.type,
        startTime: shiftStartTime,
        endTime: shiftEndTime,
        bookingCutoffMins: Number(shift?.booking_cutoff_minutes || 0),
      } as any
    );

    if (isCutoff) {
      return NextResponse.json(
        { success: false, message: "Booking closed. The cutoff window prior to shift departure has passed." },
        { status: 400 }
      );
    }

    // 5. CRITICAL: SHIFT-LEVEL MUTUAL EXCLUSION LOCK (One Active Booking Per Shift Rule)
    // Find all trips belonging to this shift
    const { data: siblingTrips } = await supabaseAdmin
      .from("trips")
      .select("id, trip_code, bus_id, buses(bus_number)")
      .eq("shift_id", trip.shift_id);

    const siblingTripIds = (siblingTrips || []).map((t) => t.id);

    const { data: existingShiftBookings } = await supabaseAdmin
      .from("bookings")
      .select("id, booking_code, trip_id, seat_number, status")
      .in("trip_id", siblingTripIds)
      .eq("student_id", student.id)
      .in("status", ["CONFIRMED", "WAITLISTED", "BOARDED"]);

    if (existingShiftBookings && existingShiftBookings.length > 0) {
      const conflicting = existingShiftBookings[0];
      const conflictTrip = (siblingTrips || []).find((t) => t.id === conflicting.trip_id);
      const conflictBusName = (conflictTrip as any)?.buses?.bus_number || "Campus Bus";

      return NextResponse.json(
        {
          success: false,
          code: "SHIFT_BOOKING_LOCKED",
          message: `Booking Locked: You already hold a confirmed reservation on ${conflictBusName} (Seat ${conflicting.seat_number || "Reserved"}) for this shift (${shift?.name || "Shift"}). Please cancel your existing seat if you wish to switch buses.`,
          existingBooking: conflicting,
        },
        { status: 409 }
      );
    }

    // 6. ATOMIC SEAT CAPACITY & CONCURRENCY LOCK
    // Fetch all active seated reservations on this trip
    const { data: activeTripBookings, error: bkFetchErr } = await supabaseAdmin
      .from("bookings")
      .select("seat_number, status")
      .eq("trip_id", tripId)
      .in("status", ["CONFIRMED", "BOARDED"]);

    if (bkFetchErr) {
      return NextResponse.json({ success: false, error: bkFetchErr.message }, { status: 500 });
    }

    const occupiedSeatSet = new Set(
      (activeTripBookings || []).map((b) => b.seat_number).filter(Boolean)
    );

    const allSeats = generateSeatLayout(bus.capacity, bus.seat_layout || "NONE");
    const availableSeats = allSeats.filter((s) => !occupiedSeatSet.has(s));

    if (availableSeats.length === 0) {
      return NextResponse.json(
        { success: false, message: `Bus ${bus.bus_number} has reached full seated capacity (${bus.capacity}/${bus.capacity}).` },
        { status: 400 }
      );
    }

    const userRole = ((session as any)?.role || "").toLowerCase();
    const isFacultyUser = userRole === "teacher" || userRole === "faculty" || userRole === "staff" || userRole === "admin";

    // Determine N number of teachers for this bus/trip
    const busTeacherQuota = Number((bus as any)?.teacher_seats_count ?? (bus as any)?.teacherSeatsCount ?? 0);
    const { count: teacherBookingsCount } = await supabaseAdmin
      .from("bookings_full")
      .select("*", { count: "exact", head: true })
      .eq("trip_id", tripId)
      .in("passenger_type", ["FACULTY", "TEACHER", "STAFF"]);

    const nTeachers = Math.max(busTeacherQuota, teacherBookingsCount || 0);
    const teacherReservedSeats = nTeachers > 0 ? getTeacherStartingSeats(allSeats, nTeachers) : [];

    let allocatedSeat = availableSeats[0];
    if (requestedSeatNumber) {
      if (teacherReservedSeats.includes(requestedSeatNumber) && !isFacultyUser) {
        return NextResponse.json(
          {
            success: false,
            code: "SEAT_RESTRICTED_FOR_FACULTY",
            message: `Starting seats (first ${nTeachers} seats) on this bus are strictly reserved for Faculty and Teachers. Please select another seat.`,
            availableSeats: availableSeats.filter((s) => !teacherReservedSeats.includes(s)),
          },
          { status: 403 }
        );
      }

      if (occupiedSeatSet.has(requestedSeatNumber)) {
        return NextResponse.json(
          {
            success: false,
            code: "SEAT_ALREADY_TAKEN",
            message: `Seat ${requestedSeatNumber} was just reserved by another commuter. Please pick another seat.`,
            availableSeats,
          },
          { status: 409 }
        );
      }
      allocatedSeat = requestedSeatNumber;
    } else {
      // Non-faculty students should not be automatically allocated starting teacher seats if other seats exist
      let candidateSeats = availableSeats;
      if (!isFacultyUser) {
        const studentEligibleSeats = availableSeats.filter((s) => !teacherReservedSeats.includes(s));
        if (studentEligibleSeats.length > 0) {
          candidateSeats = studentEligibleSeats;
        }
      } else {
        // Faculty commuters get starting seats prioritized
        const facultyPreferredSeats = availableSeats.filter((s) => teacherReservedSeats.includes(s));
        if (facultyPreferredSeats.length > 0) {
          candidateSeats = facultyPreferredSeats;
        }
      }
      allocatedSeat = candidateSeats[0] || availableSeats[0];
    }

    // 7. Atomic Insert into public.bookings
    const now = new Date().toISOString();
    const todayDate = trip.trip_date || now.split("T")[0];
    const bookingCode = `BS-${trip.trip_code || "BUS"}-${Math.floor(1000 + Math.random() * 9000)}`;

    const { data: newBooking, error: insertError } = await supabaseAdmin
      .from("bookings")
      .insert({
        id: createBookingId(),
        booking_code: bookingCode,
        student_id: student.id,
        trip_id: tripId,
        bus_id: bus.id,
        boarding_stop_id: boardingStopId,
        status: instantBoard ? "BOARDED" : "CONFIRMED",
        seat_number: allocatedSeat,
        passenger_type: "SEATED",
        booking_date: todayDate,
        created_at: now,
        boarded_at: instantBoard ? now : null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Booking insert error:", insertError);
      // Catch trigger or unique constraint violations
      if (insertError.message?.includes("uq_active_trip_seat") || insertError.code === "23505") {
        return NextResponse.json(
          {
            success: false,
            code: "SEAT_ALREADY_TAKEN",
            message: `Seat ${allocatedSeat} was just claimed. Please pick another seat.`,
          },
          { status: 409 }
        );
      }
      if (insertError.message?.includes("SHIFT_BOOKING_LOCKED")) {
        return NextResponse.json(
          {
            success: false,
            code: "SHIFT_BOOKING_LOCKED",
            message: "You already hold an active reservation for this shift.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
    }

    // 8. Log audit trail (AWAITED — security-critical, must persist for compliance)
    try {
      await supabaseAdmin.from("audit_logs").insert({
        user_id: student.id,
        user_email: student.email,
        user_role: "student",
        action: "BOOKING_CONFIRMED",
        entity: "Booking",
        entity_id: newBooking.id,
        details: {
          bookingCode,
          busNumber: bus.bus_number,
          seatNumber: allocatedSeat,
          shiftId: trip.shift_id,
        },
      });
    } catch (auditErr) {
      console.error("[AUDIT_FAIL] BOOKING_CONFIRMED audit log failed:", auditErr);
    }

    // 9. Dispatch notification (fire-and-forget — UX only, not security-critical)
    supabaseAdmin.from("notifications").insert({
      user_id: student.id,
      title: "Seat Confirmed! 🎉",
      message: `Your seat ${allocatedSeat} is confirmed on ${bus.bus_number} (${shift?.name || "Shift"}).`,
      type: "CONFIRMATION",
      is_read: false,
    });

    return NextResponse.json({
      success: true,
      message: `Seat ${allocatedSeat} Confirmed on ${bus.bus_number}!`,
      booking: {
        id: newBooking.id,
        bookingCode: newBooking.booking_code,
        studentId: newBooking.student_id,
        tripId: newBooking.trip_id,
        busId: newBooking.bus_id,
        boardingStopId: newBooking.boarding_stop_id,
        status: newBooking.status,
        seatNumber: newBooking.seat_number,
        bookingDate: newBooking.booking_date,
        createdAt: newBooking.created_at,
      },
    });
  } catch (err: any) {
    console.error("Booking API error:", err);
    return NextResponse.json({ success: false, error: err?.message || "Internal server error" }, { status: 500 });
  }
}
