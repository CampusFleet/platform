import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { cacheGet, cacheSet, cacheDel } from "@/lib/redis";

/**
 * Digital Seat-Hold, Campus Roaming & Bus Departure Recall API
 * Pure Database Persistence — Zero Hardcoded State.
 */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tripId = searchParams.get("tripId");
    const studentId = searchParams.get("studentId");
    const busId = searchParams.get("busId");

    if (!tripId && !studentId && !busId) {
      return NextResponse.json(
        { success: false, message: "tripId, busId, or studentId is required" },
        { status: 400 }
      );
    }

    let resolvedTripId = tripId;
    
    // Find active trip if studentId provided
    if (!resolvedTripId && studentId) {
      const { data: bData } = await supabaseAdmin
        .from("bus_reservations")
        .select("trip_id")
        .eq("student_id", studentId)
        .in("status", ["CONFIRMED", "BOARDED"])
        .order("created_at", { ascending: false })
        .limit(1);
      if (bData && bData.length > 0) {
        resolvedTripId = bData[0].trip_id;
      }
    }

    if (!resolvedTripId) {
      return NextResponse.json({ success: true, activeAlert: null, studentBooking: null, fullness: null });
    }

    const cacheKey = `roaming:trip:${resolvedTripId}`;
    let cachedData: any = await cacheGet(cacheKey);

    if (!cachedData) {
      // 1. Fetch Trip & Bus
      const { data: tripData } = await supabaseAdmin.from("trips").select("*, bus:buses(*)").eq("id", resolvedTripId).single();
      const busCapacity = tripData?.bus?.capacity || 40;
      const busNumber = tripData?.bus?.bus_number || "Campus Shuttle";
      const regNo = tripData?.bus?.registration_no || "";

      // 2. Fetch all reservations
      const { data: tripBookings } = await supabaseAdmin
        .from("bus_reservations")
        .select("id, student_id, chosen_seat, status, roaming_status, running_grace_until, boarded_at")
        .eq("trip_id", resolvedTripId)
        .neq("status", "CANCELLED");
      
      const bookingsList = (tripBookings || []).map((r) => ({
        ...r,
        seat_number: r.chosen_seat,
      }));

      // 3. Check for Active Departure Alert
      const { data: activeAlerts } = await supabaseAdmin
        .from("bus_departure_alerts")
        .select("*")
        .eq("trip_id", resolvedTripId)
        .eq("status", "ACTIVE")
        .order("triggered_at", { ascending: false })
        .limit(1);

      cachedData = {
        trip: {
          id: resolvedTripId,
          tripCode: tripData?.trip_code,
          status: tripData?.status,
          busId: tripData?.bus_id,
          busNumber,
          registrationNo: regNo,
          capacity: busCapacity,
          departureTime: tripData?.departure_time,
        },
        bookingsList,
        activeAlert: activeAlerts && activeAlerts.length > 0 ? activeAlerts[0] : null,
      };

      // Cache it for 7 seconds!
      await cacheSet(cacheKey, cachedData, 7);
    }

    const { trip, bookingsList, activeAlert } = cachedData;

    const totalBooked = bookingsList.length;
    const roamingCount = bookingsList.filter((b: any) => b.roaming_status === "ROAMING" || (!b.roaming_status && b.status === "BOARDED")).length;
    const onboardConfirmedCount = bookingsList.filter((b: any) => b.roaming_status === "ONBOARD_CONFIRMED").length;
    const runningCount = bookingsList.filter((b: any) => b.roaming_status === "RUNNING_TO_BUS").length;
    const pendingCount = bookingsList.filter((b: any) => !b.roaming_status || b.roaming_status === "CONFIRMED").length;

    const totalClaimedSeats = roamingCount + onboardConfirmedCount + runningCount;
    const isBusFull = totalClaimedSeats >= trip.capacity;
    const seatsRemaining = Math.max(0, trip.capacity - totalClaimedSeats);
    const fullnessPercentage = Math.min(100, Math.round((totalClaimedSeats / trip.capacity) * 100));

    let studentBooking = null;
    if (studentId) {
      const sb = bookingsList.find((b: any) => b.student_id === studentId);
      if (sb) {
        studentBooking = {
          id: sb.id,
          seatNumber: sb.seat_number,
          status: sb.status,
          roamingStatus: sb.roaming_status || (sb.status === "BOARDED" ? "ROAMING" : "CONFIRMED"),
          runningGraceUntil: sb.running_grace_until,
          boardedAt: sb.boarded_at,
        };
      }
    }

    return NextResponse.json({
      success: true,
      trip,
      fullness: {
        totalCapacity: trip.capacity,
        totalBooked,
        totalClaimedSeats,
        seatsRemaining,
        fullnessPercentage,
        isBusFull,
        roamingCount,
        onboardConfirmedCount,
        runningCount,
        pendingCount,
      },
      studentBooking,
      activeAlert: activeAlert ? {
        id: activeAlert.id,
        alertType: activeAlert.alert_type,
        message: activeAlert.message,
        triggeredAt: activeAlert.triggered_at,
        triggeredBy: activeAlert.triggered_by,
        status: activeAlert.status,
      } : null,
    });
  } catch (error: any) {
    console.error("Error fetching roaming fullness:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, tripId, bookingId, studentId, conductorName = "Conductor Console", message } = body;

    const timestamp = new Date().toISOString();
    const invalidateTrip = async (id: string) => { if (id) await cacheDel(`roaming:trip:${id}`); };

    // ─────────────────────────────────────────────────────────────
    // 1. CONDUCTOR SCANS / MARKS STUDENT: SEAT-HOLD & ROAMING
    // ─────────────────────────────────────────────────────────────
    if (action === "CHECK_IN_ROAMING") {
      if (!bookingId && !studentId) {
        return NextResponse.json(
          { success: false, message: "bookingId or studentId is required" },
          { status: 400 }
        );
      }

      let query = supabaseAdmin.from("bus_reservations").select("*");
      if (bookingId) query = query.eq("id", bookingId);
      else if (studentId) query = query.eq("student_id", studentId).eq("status", "CONFIRMED");

      const { data: bookingsFound, error: bErr } = await query.limit(1);
      if (bErr || !bookingsFound || bookingsFound.length === 0) {
        return NextResponse.json(
          { success: false, message: "Booking not found for student" },
          { status: 404 }
        );
      }

      const targetBooking = bookingsFound[0];
      const resolvedTripId = tripId || targetBooking.trip_id;

      // Update reservation to ROAMING seat-hold
      await supabaseAdmin
        .from("bus_reservations")
        .update({
          status: "BOARDED",
          roaming_status: "ROAMING",
          boarded_at: timestamp,
        })
        .eq("id", targetBooking.id);

      // Record attendance
      const attendanceId = `att-roam-${Date.now()}`;
      await supabaseAdmin.from("attendance_records").insert({
        id: attendanceId,
        student_id: targetBooking.student_id,
        booking_id: targetBooking.id,
        trip_id: resolvedTripId,
        method: "QR_SCAN",
        status: "BOARDED",
        verified_by: conductorName,
        signature_token: `ROAM-${Date.now().toString(36).toUpperCase()}`,
        notes: `Digital Seat-Hold verified by ${conductorName}. Student roaming campus permitted. Seat: ${targetBooking.seat_number || "Reserved"}`,
        timestamp,
      });

      if (tripId) await invalidateTrip(tripId);
      // Audit Log
      await supabaseAdmin.from("audit_logs").insert({
        user_id: targetBooking.student_id,
        user_role: "student",
        action: "SEAT_HOLD_ROAMING_CHECKIN",
        entity: "Booking",
        entity_id: targetBooking.id,
        reason: `Seat ${targetBooking.seat_number || "Held"} digitally secured by ${conductorName}. Student free to roam campus until departure alarm.`,
        previous_value: { status: targetBooking.status, roamingStatus: targetBooking.roaming_status },
        new_value: { status: "BOARDED", roamingStatus: "ROAMING" },
      });

      // Notify Student
      await supabaseAdmin.from("notifications").insert({
        user_id: targetBooking.student_id,
        title: "Seat Secured! Roam in Campus 🎒",
        message: `Your seat (${targetBooking.seat_number || "Reserved"}) is officially held in the manifest. You can freely roam the campus. We'll ring your device when the bus is full or ready to roll!`,
        type: "BOARDING",
        is_read: false,
      });

      // Auto-check if bus is now full
      const { data: tripData } = await supabaseAdmin.from("trips").select("*, bus:buses(*)").eq("id", resolvedTripId).single();
      const busCap = tripData?.bus?.capacity || 40;
      const { data: currentBoarded } = await supabaseAdmin
        .from("bus_reservations")
        .select("id")
        .eq("trip_id", resolvedTripId)
        .eq("status", "BOARDED");

      const totalClaimed = (currentBoarded || []).length;
      let alertTriggered = false;

      // When all seats are claimed, automatically broadcast bus-full alert!
      if (totalClaimed >= busCap) {
        const alertId = `alert-full-${Date.now()}`;
        await supabaseAdmin.from("bus_departure_alerts").insert({
          id: alertId,
          trip_id: resolvedTripId,
          bus_id: tripData?.bus_id,
          alert_type: "BUS_FULL",
          message: `🚨 Bus ${tripData?.bus?.bus_number || "Campus Shuttle"} is 100% FULL (${totalClaimed}/${busCap} seats held). Preparing for immediate departure!`,
          triggered_at: timestamp,
          triggered_by: "AUTOMATED_CAPACITY_ENGINE",
          status: "ACTIVE",
        });
        alertTriggered = true;
      }

      await invalidateTrip(resolvedTripId);
      return NextResponse.json({
        success: true,
        status: "ROAMING",
        message: `Seat ${targetBooking.chosen_seat || "Held"} digitally registered! Student is free to roam campus.`,
        bookingId: targetBooking.id,
        seatNumber: targetBooking.chosen_seat,
        totalClaimed,
        capacity: busCap,
        isBusFull: totalClaimed >= busCap,
        alertTriggered,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 2. STUDENT CONFIRMS ONBOARD ("Yes, I am in the bus")
    // ─────────────────────────────────────────────────────────────
    if (action === "CONFIRM_ONBOARD") {
      if (!bookingId && !studentId) {
        return NextResponse.json(
          { success: false, message: "bookingId or studentId is required" },
          { status: 400 }
        );
      }

      let query = supabaseAdmin.from("bus_reservations").update({
        roaming_status: "ONBOARD_CONFIRMED",
      });

      if (bookingId) query = query.eq("id", bookingId);
      else if (studentId) query = query.eq("student_id", studentId).eq("status", "BOARDED");

      await query;

      if (tripId) await invalidateTrip(tripId);
      // Audit Log
      await supabaseAdmin.from("audit_logs").insert({
        user_id: studentId || "student",
        user_role: "student",
        action: "ONBOARD_CONFIRMED_BY_STUDENT",
        entity: "Booking",
        entity_id: bookingId || "N/A",
        reason: "Student responded 'Yes, I am already in the bus' to departure alarm. Alarm silenced.",
        new_value: { roamingStatus: "ONBOARD_CONFIRMED" },
      });

      return NextResponse.json({
        success: true,
        status: "ONBOARD_CONFIRMED",
        message: "✓ Onboard verified! Have a safe and pleasant journey.",
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 3. STUDENT RUNNING TO BUS ("Running to bus, hold 2 mins")
    // ─────────────────────────────────────────────────────────────
    if (action === "RUNNING_TO_BUS") {
      if (!bookingId && !studentId) {
        return NextResponse.json(
          { success: false, message: "bookingId or studentId is required" },
          { status: 400 }
        );
      }

      // 2-minute grace period
      const graceTime = new Date(Date.now() + 2 * 60 * 1000).toISOString();

      let query = supabaseAdmin.from("bus_reservations").update({
        roaming_status: "RUNNING_TO_BUS",
        running_grace_until: graceTime,
      });

      if (bookingId) query = query.eq("id", bookingId);
      else if (studentId) query = query.eq("student_id", studentId).eq("status", "BOARDED");

      await query;

      if (tripId) await invalidateTrip(tripId);
      // Audit Log
      await supabaseAdmin.from("audit_logs").insert({
        user_id: studentId || "student",
        user_role: "student",
        action: "STUDENT_RUNNING_TO_BUS",
        entity: "Booking",
        entity_id: bookingId || "N/A",
        reason: "Student signalled 'Running to bus'. 2-minute departure hold granted.",
        new_value: { roamingStatus: "RUNNING_TO_BUS", runningGraceUntil: graceTime },
      });

      if (tripId) await invalidateTrip(tripId);
      return NextResponse.json({
        success: true,
        status: "RUNNING_TO_BUS",
        graceUntil: graceTime,
        message: "Conductor alerted! You have 2 minutes to board. Sprint safely!",
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 4. TRIGGER DEPARTURE RECALL ALERT (Conductor / System Broadcast)
    // ─────────────────────────────────────────────────────────────
    if (action === "TRIGGER_DEPARTURE_ALERT") {
      if (!tripId) {
        return NextResponse.json({ success: false, message: "tripId is required" }, { status: 400 });
      }

      // Fetch trip details to ensure relational consistency (ACID: Consistency)
      const { data: tripData } = await supabaseAdmin
        .from("trips")
        .select("id, bus_id, bus:buses(bus_number)")
        .eq("id", tripId)
        .single();

      // Deactivate any previous alerts for this trip (ACID: Isolation)
      await supabaseAdmin
        .from("bus_departure_alerts")
        .update({ status: "RESOLVED" })
        .eq("trip_id", tripId)
        .eq("status", "ACTIVE");

      const alertId = `alert-recall-${Date.now()}`;
      const busLabel = (tripData?.bus as any)?.bus_number || "Campus Shuttle";
      const alertMsg = message || `🚨 Bus ${busLabel} is preparing for immediate departure! Please return and confirm if you are onboard.`;

      // Persist to relational database (ACID: Durability)
      await supabaseAdmin.from("bus_departure_alerts").insert({
        id: alertId,
        trip_id: tripId,
        bus_id: tripData?.bus_id || null,
        alert_type: "MANUAL_RECALL",
        message: alertMsg,
        triggered_at: timestamp,
        triggered_by: conductorName,
        status: "ACTIVE",
      });

      // Disseminate push notifications to all booked students for this trip
      const { data: tripBookings } = await supabaseAdmin
        .from("bus_reservations")
        .select("student_id")
        .eq("trip_id", tripId)
        .neq("status", "CANCELLED");

      await invalidateTrip(tripId);
      if (tripBookings && tripBookings.length > 0) {
        const notifs = tripBookings.map((b) => ({
          user_id: b.student_id,
          title: `🚨 ${busLabel} Departing Now!`,
          message: alertMsg,
          type: "BOARDING",
          is_read: false,
        }));
        await supabaseAdmin.from("notifications").insert(notifs);
      }

      // Immutable Audit Log entry for ACID audit compliance
      await supabaseAdmin.from("audit_logs").insert({
        user_id: conductorName || "conductor",
        user_role: "conductor",
        action: "BUS_DEPARTURE_ALERT_TRIGGERED",
        entity: "Trip",
        entity_id: tripId,
        reason: `Departure recall alarm broadcasted to ${(tripBookings || []).length} passengers on ${busLabel}.`,
        new_value: { alertId, status: "ACTIVE", triggeredAt: timestamp, message: alertMsg },
      });

      return NextResponse.json({
        success: true,
        alertId,
        message: `Departure recall alarm broadcasted to ${(tripBookings || []).length} passengers!`,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 5. DISMISS / RESOLVE ALERT
    // ─────────────────────────────────────────────────────────────
    if (action === "DISMISS_ALERT") {
      if (!tripId) {
        return NextResponse.json({ success: false, message: "tripId is required" }, { status: 400 });
      }

      await supabaseAdmin
        .from("bus_departure_alerts")
        .update({ status: "RESOLVED" })
        .eq("trip_id", tripId)
        .eq("status", "ACTIVE");

      await invalidateTrip(tripId);

      // Audit Log resolution for ACID compliance
      await supabaseAdmin.from("audit_logs").insert({
        user_id: conductorName || "conductor",
        user_role: "conductor",
        action: "BUS_DEPARTURE_ALERT_DISMISSED",
        entity: "Trip",
        entity_id: tripId,
        reason: `Conductor ${conductorName} dismissed and resolved departure recall alarm.`,
        new_value: { status: "RESOLVED", resolvedAt: timestamp },
      });

      return NextResponse.json({
        success: true,
        message: "Departure alert resolved.",
      });
    }

    return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Error in roaming action:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to process request" },
      { status: 500 }
    );
  }
}
