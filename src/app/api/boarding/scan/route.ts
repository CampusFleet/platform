import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getDayOfWeekIST, getCurrentTimeIST } from "@/lib/time-manager";
import { createAttendanceId } from "@/lib/id";

/**
 * QR-Based Bus Boarding (Attendance Architecture)
 * Business Rule: If a student has a class scheduled at the boarding time,
 * boarding MUST be rejected immediately with explicit lecture details.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rawCode, qrData, tripId, busId, conductorName = "Conductor Command Terminal", action = "CONFIRM_BOARDING" } = body;
    const scanPayload = rawCode || qrData;

    if (!scanPayload) {
      return NextResponse.json(
        { success: false, status: "INVALID_INPUT", message: "Scan payload or QR code is missing." },
        { status: 400 }
      );
    }

    // 1. Parse payload (supports JSON dynamic token, Universal Verification URL, or plain ID)
    let parsedPayload: any = null;
    let urlStudentId: string | null = null;

    if (typeof scanPayload === "string") {
      try {
        parsedPayload = JSON.parse(scanPayload);
      } catch {
        // Check if scanned code is a verification URL (e.g., /verify/student?id=...)
        if (scanPayload.includes("http://") || scanPayload.includes("https://") || scanPayload.includes("/verify/student")) {
          try {
            const urlObj = new URL(scanPayload, "https://campusfleet.vercel.app");
            urlStudentId = urlObj.searchParams.get("id") || urlObj.searchParams.get("studentId") || urlObj.searchParams.get("sid");
          } catch {
            // Not a valid URL
          }
        }
      }
    }

    // Dynamic 1-Minute Anti-Screenshot Security Validation
    if (parsedPayload?.window) {
      const currentWindow = Math.floor(Date.now() / 60000);
      const windowDiff = Math.abs(currentWindow - Number(parsedPayload.window));
      // Allow 2 windows of skew (120s buffer) to tolerate client clock drift or slight latency
      if (windowDiff > 2) {
        return NextResponse.json(
          {
            success: false,
            status: "EXPIRED_QR",
            code: "EXPIRED_DYNAMIC_PASS",
            message: "SECURITY ALERT: Expired dynamic pass (>1 min old screenshot). Please ask student to show their live dynamic pass.",
            studentName: parsedPayload.studentName || undefined,
          },
          { status: 400 }
        );
      }
    }

    const studentIdPayload = parsedPayload?.studentId || urlStudentId || (typeof scanPayload === "string" && !scanPayload.startsWith("{") && !scanPayload.includes("http") ? scanPayload.trim() : "");
    // Fallback if old QR uses bookingId, we just assume the ID is the studentId or query it later.
    const fallbackId = parsedPayload?.bookingId || parsedPayload?.id;
    const searchId = studentIdPayload || fallbackId;

    if (!searchId) {
      return NextResponse.json(
        { success: false, status: "INVALID_INPUT", message: "Student ID missing from QR code." },
        { status: 400 }
      );
    }

    // 2. Query Student from Database view (with verified official photo and college student ID)
    let { data: studentsFound, error: studentErr } = await supabaseAdmin
      .from("students_full")
      .select("id, full_name, email, phone, class_id, class_name, transport_access_suspended, photo_url, department, semester, payment_status, primary_route_id, primary_stop_id, student_id_code")
      .or(`id.eq.${searchId},user_id.eq.${searchId}`)
      .limit(1);

    let student = studentsFound?.[0];

    if (studentErr || !student) {
      // Check auto-reservations by booking code or reservation ID
      const { data: oldBooking } = await supabaseAdmin.from("bus_reservations").select("student_id").or(`booking_code.eq.${searchId},id.eq.${searchId}`).limit(1);
      if (oldBooking && oldBooking.length > 0) {
          const { data: st } = await supabaseAdmin.from("students_full").select("id, full_name, email, phone, class_id, class_name, transport_access_suspended, photo_url, department, semester, payment_status, primary_route_id, primary_stop_id, student_id_code").eq("id", oldBooking[0].student_id).limit(1);
          if (st && st[0]) {
              student = st[0];
          }
      }
      
      if (!student || !student.id) {
          return NextResponse.json(
            { success: false, status: "REJECTED", message: `UNVERIFIED PASS: No active student found for "${searchId}".` },
            { status: 404 }
          );
      }
    }

    const resolvedStudentId = student.id;
    const officialPhotoUrl = student.photo_url || null;

    // 3. Query Trip and Bus Capacity
    if (!tripId) {
        return NextResponse.json({ success: false, status: "INVALID_INPUT", message: "tripId is required for attendance." }, { status: 400 });
    }

    const { data: trip } = await supabaseAdmin
      .from("trips")
      .select("*, buses(*), routes(id, name, direction)")
      .eq("id", tripId)
      .single();
      
    const bus = trip?.buses;
    const resolvedBusId = bus?.id || busId || null;
    const routeDirection = (trip as any)?.routes?.direction || "HOME_TO_CAMPUS";
    
    // Check roaming
    const isRoaming = student.primary_route_id !== trip?.route_id;

    // 4. Prevent duplicate check-in (Single-Use Attendance Per Shift)
    const { data: existingAttendance } = await supabaseAdmin
        .from("attendance_records")
        .select("id, status, timestamp, method")
        .eq("student_id", resolvedStudentId)
        .eq("trip_id", tripId)
        .limit(1);

    if (existingAttendance && existingAttendance.length > 0 && existingAttendance[0].status === "BOARDED") {
      const boardedTime = existingAttendance[0].timestamp ? new Date(existingAttendance[0].timestamp).toLocaleTimeString() : "earlier today";
      return NextResponse.json(
        {
          success: false,
          status: "DUPLICATE",
          code: "ALREADY_BOARDED",
          message: `DUPLICATE REPLAY: Pass belongs to ${student.full_name}, who was ALREADY checked in at ${boardedTime}. Duplicate scan blocked.`,
          student: {
            id: student.id,
            fullName: student.full_name,
            photoUrl: officialPhotoUrl,
            department: student.department,
            semester: student.semester,
            className: student.class_name,
          },
          studentName: student.full_name,
          photoUrl: officialPhotoUrl,
          boardedAt: existingAttendance[0].timestamp,
        },
        { status: 409 }
      );
    }

    if (student.transport_access_suspended) {
      return NextResponse.json(
        { success: false, status: "REJECTED", message: `ACCESS SUSPENDED: Transport access for ${student.full_name} is suspended.` },
        { status: 403 }
      );
    }

    if (bus && (bus.status === "MAINTENANCE" || bus.status === "INACTIVE")) {
      return NextResponse.json(
        { success: false, status: "VEHICLE_UNAVAILABLE", message: `VEHICLE UNDER MAINTENANCE: Bus ${bus.bus_number} is currently marked ${bus.status}.` },
        { status: 400 }
      );
    }

    // Check bus occupancy vs capacity
    const { count: currentBoardedCount } = await supabaseAdmin
      .from("attendance_records")
      .select("*", { count: "exact", head: true })
      .eq("trip_id", tripId)
      .eq("status", "BOARDED");

    if (bus && (currentBoardedCount || 0) >= bus.capacity) {
      // In the future, we could prompt the conductor to override and issue a standing pass.
      return NextResponse.json(
        { success: false, status: "CAPACITY_FULL", message: `SEAT CAPACITY REACHED: Bus ${bus.bus_number} is full (${bus.capacity}/${bus.capacity}).` },
        { status: 400 }
      );
    }

    // ─────────────────────────────────────────────────────────────
    // 5. CRITICAL BUSINESS RULE: CLASS-TIME BUS ENTRY RESTRICTION
    // ─────────────────────────────────────────────────────────────
    const isLeavingCampus = routeDirection === "CAMPUS_TO_HOME";

    if (isLeavingCampus && student.class_id) {
      const currentDay = getDayOfWeekIST().toUpperCase();
      const currentTimeStr = getCurrentTimeIST(true);

      const { data: schedule } = await supabaseAdmin
        .from("class_shift_schedules")
        .select("*, outgoing_shift:shifts!outgoing_shift_id(*)")
        .eq("class_id", student.class_id)
        .eq("day_of_week", currentDay)
        .maybeSingle();

      if (schedule && !schedule.is_today_off && schedule.outgoing_shift) {
        const shiftStart = schedule.outgoing_shift.start_time;

        if (currentTimeStr < shiftStart) {
          // Check if an approved early departure request exists
          const { data: approvedEarlyDeparture } = await supabaseAdmin
            .from("early_departure_requests")
            .select("id")
            .eq("student_id", student.id)
            .eq("status", "APPROVED")
            .gte("created_at", new Date().toISOString().split("T")[0])
            .limit(1);

          if (!approvedEarlyDeparture || approvedEarlyDeparture.length === 0) {
            // Audit log
            try {
              await supabaseAdmin.from("audit_logs").insert({
                user_id: student.id,
                user_email: student.email,
                user_role: "student",
                action: "BOARDING_DENIED_SCHEDULED_CLASS",
                entity: "BoardingScan",
                entity_id: tripId,
                reason: `Departure before scheduled outgoing shift (${shiftStart.substring(0, 5)}) without approved early departure pass.`,
                previous_value: { status: "PENDING" },
                new_value: { status: "DENIED", class: student.class_name },
              });
            } catch (auditErr) {
              console.error("[AUDIT_FAIL] BOARDING_DENIED audit log failed:", auditErr);
            }

            supabaseAdmin.from("notifications").insert({
              user_id: student.id,
              title: "❌ Bus Boarding Denied",
              message: `You cannot board the campus bus right now because your scheduled outgoing shift starts at ${shiftStart.substring(0, 5)}. Early departure requires teacher approval.`,
              type: "BOARDING",
              is_read: false,
            });

            return NextResponse.json(
              {
                success: false,
                status: "CLASS_RESTRICTION",
                code: "ACTIVE_CLASS_RESTRICTION",
                message: `❌ BOARDING DENIED: Your class outgoing departure shift starts at ${shiftStart.substring(0, 5)}. Early departure requires teacher approval.`,
                reason: `Departure before scheduled outgoing shift (${shiftStart.substring(0, 5)}) without approved early departure pass.`,
                studentName: student.full_name,
                className: student.class_name,
              },
              { status: 403 }
            );
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 6. PREVIEW VERIFY vs CONFIRM BOARDING
    // ─────────────────────────────────────────────────────────────
    if (action === "PREVIEW_VERIFY") {
      return NextResponse.json({
        success: true,
        status: "READY_FOR_CONFIRMATION",
        message: `Pass verified for ${student.full_name}. Confirm identity against official passport photo.`,
        student: {
          id: student.id,
          fullName: student.full_name,
          studentIdCode: student.student_id_code || "",
          photoUrl: officialPhotoUrl,
          department: student.department,
          semester: student.semester,
          className: student.class_name,
          paymentStatus: student.payment_status,
        },
        booking: {
          bookingCode: isRoaming ? "ROAMING_PASS" : "ROUTE_PASS",
          passengerType: isRoaming ? "ROAMING" : "SEATED",
        },
        bus: {
          busNumber: bus?.bus_number || "Campus Shuttle",
          capacity: bus?.capacity || 32,
          currentOccupancy: currentBoardedCount || 0,
        },
      });
    }

    const timestamp = new Date().toISOString();

    // 7a. Create verified attendance record with UNLOCKED status
    const attendanceId = createAttendanceId();
    await supabaseAdmin.from("attendance_records").insert({
      id: attendanceId,
      student_id: student.id,
      trip_id: tripId,
      bus_id: resolvedBusId,
      method: "QR_SCAN",
      status: "BOARDED",
      verified_by: conductorName,
      signature_token: `SIG-${Date.now().toString(36).toUpperCase()}`,
      notes: `Verified by ${conductorName} at ${new Date().toLocaleTimeString()} ${isRoaming ? '(Roaming)' : ''}`,
      timestamp,
      lock_status: "UNLOCKED",
      unlocked_by: "MANUAL_OVERRIDE",
      unlock_timestamp: timestamp,
      // HACK: for backwards compatibility if booking_id was required in DB schema
      booking_id: attendanceId 
    });

    // Update Smart Transit bus_reservations status to BOARDED and UNLOCKED
    try {
      const today = new Date().toISOString().split("T")[0];
      await supabaseAdmin
        .from("bus_reservations")
        .update({
          status: "BOARDED",
          boarded_at: timestamp,
          lock_status: "UNLOCKED",
          unlocked_by: "MANUAL_OVERRIDE",
          unlock_timestamp: timestamp,
        })
        .eq("student_id", student.id)
        .eq("reservation_date", today);

      const { cacheSet } = await import("@/lib/redis");
      await cacheSet(`attendance:lock:${student.id}:${today}`, {
        lockStatus: "UNLOCKED",
        unlockedBy: "MANUAL_OVERRIDE",
        busId: resolvedBusId,
        tripId,
        timestamp,
        method: "QR_SCAN",
      }, 86400);
    } catch (e) {
      console.warn("[QR_ATTENDANCE] Could not update bus_reservations:", e);
    }

    // 7b. Record Audit Log (AWAITED — security-critical attendance verification)
    try {
      await supabaseAdmin.from("audit_logs").insert({
        user_id: student.id,
        user_email: student.email,
        user_role: "student",
        action: "PASSENGER_BOARDED_SUCCESS",
        entity: "AttendanceRecord",
        entity_id: attendanceId,
        reason: `QR scan verified by conductor ${conductorName}.`,
        previous_value: { status: "PENDING" },
        new_value: { status: "BOARDED", tripId: tripId, isRoaming },
      });
    } catch (auditErr) {
      console.error("[AUDIT_FAIL] PASSENGER_BOARDED_SUCCESS audit log failed:", auditErr);
    }

    // 7c. Push notification (fire-and-forget — UX only)
    supabaseAdmin.from("notifications").insert({
      user_id: student.id,
      title: "Boarding Verified ✓",
      message: `Your bus pass was scanned. Welcome aboard ${bus?.bus_number || "Campus Shuttle"}!`,
      type: "BOARDING",
      is_read: false,
    });

    const newOccupancy = (currentBoardedCount || 0) + 1;

    return NextResponse.json(
      {
        success: true,
        status: "APPROVED",
        message: isRoaming 
          ? `⚠️ ROAMING APPROVED: ${student.full_name} is not assigned to this route but has been boarded.`
          : `✓ BOARDING APPROVED: ${student.full_name} checked in successfully!`,
        student: {
          id: student.id,
          fullName: student.full_name,
          studentIdCode: student.student_id_code || "",
          photoUrl: officialPhotoUrl,
          className: student.class_name,
        },
        booking: {
          bookingCode: isRoaming ? "ROAMING_PASS" : "ROUTE_PASS",
          passengerType: isRoaming ? "ROAMING" : "SEATED",
        },
        occupancy: {
          current: newOccupancy,
          capacity: bus?.capacity || 32,
          occupancyRatePercent: Math.round((newOccupancy / (bus?.capacity || 32)) * 100),
        },
        timestamp,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error: any) {
    console.error("Boarding Scan API Exception:", error);
    return NextResponse.json(
      { success: false, status: "SERVER_ERROR", message: error.message || "Internal server error." },
      { status: 500 }
    );
  }
}
