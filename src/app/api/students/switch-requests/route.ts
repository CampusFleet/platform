import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { evaluateSwitchRequest } from "@/lib/switch-evaluator";
import type { Student, Bus, Stop, TransportSettings } from "@/lib/types";

/**
 * GET /api/students/switch-requests?studentId=xxx
 * Retrieves the student's switch request history
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId") || (session as any).studentId || session.userId;

    const { data: requests, error } = await supabaseAdmin
      .from("bus_switch_requests")
      .select("*")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    // Enrich with bus names
    const busIds = new Set<string>();
    (requests || []).forEach(r => {
      if (r.current_bus_id) busIds.add(r.current_bus_id);
      if (r.requested_bus_id) busIds.add(r.requested_bus_id);
    });

    const { data: buses } = await supabaseAdmin
      .from("buses")
      .select("id, bus_number, registration_no, model")
      .in("id", Array.from(busIds));

    const busMap = new Map((buses || []).map(b => [b.id, b]));

    const enriched = (requests || []).map(r => ({
      ...r,
      currentBus: busMap.get(r.current_bus_id) || null,
      requestedBus: busMap.get(r.requested_bus_id) || null,
    }));

    return NextResponse.json({ success: true, requests: enriched });
  } catch (err: any) {
    console.error("[api/students/switch-requests] GET error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

/**
 * POST /api/students/switch-requests
 * Submits a new switch request, runs AI feasibility evaluation, and returns decision
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      studentId: reqStudentId,
      currentBusId,
      currentStopId,
      requestedBusId,
      requestedStopId,
      requestType = "TEMPORARY_SWAP",
      reason = "",
      effectiveFrom = new Date().toISOString().split("T")[0],
      effectiveUntil,
    } = body;

    const studentId = reqStudentId || (session as any).studentId || session.userId;

    if (!currentBusId || !currentStopId) {
      return NextResponse.json({
        success: false,
        message: "Current bus and stop are required.",
      }, { status: 400 });
    }

    if (!requestedBusId && !requestedStopId) {
      return NextResponse.json({
        success: false,
        message: "Please specify either a requested bus or requested stop.",
      }, { status: 400 });
    }

    // 1. Fetch student full details
    const { data: studentRaw } = await supabaseAdmin
      .from("students_full")
      .select("*")
      .eq("id", studentId)
      .maybeSingle();

    if (!studentRaw) {
      return NextResponse.json({ success: false, message: "Student record not found." }, { status: 404 });
    }

    const student: Student = {
      id: studentRaw.id,
      userId: studentRaw.user_id,
      fullName: studentRaw.full_name,
      email: studentRaw.email,
      phone: studentRaw.phone,
      campus: studentRaw.campus,
      hasActiveSubscription: Boolean(studentRaw.has_active_subscription),
      transportAccessSuspended: Boolean(studentRaw.transport_access_suspended),
      homeLatitude: studentRaw.home_latitude ? Number(studentRaw.home_latitude) : undefined,
      homeLongitude: studentRaw.home_longitude ? Number(studentRaw.home_longitude) : undefined,
      homeAddress: studentRaw.home_address,
      autoAssignedStopId: studentRaw.auto_assigned_stop_id,
      department: studentRaw.department || "",
      semester: String(studentRaw.semester || ""),
      emergencyContact: studentRaw.emergency_contact || null,
      primaryStopId: studentRaw.primary_stop_id,
      primaryRouteId: studentRaw.primary_route_id,
    };

    // 2. Fetch target bus
    const targetBusId = requestedBusId || currentBusId;
    const { data: busRaw } = await supabaseAdmin
      .from("buses")
      .select("*")
      .eq("id", targetBusId)
      .maybeSingle();

    const targetBus: Bus = {
      id: busRaw?.id || targetBusId,
      busNumber: busRaw?.bus_number || "Target Bus",
      capacity: Number(busRaw?.capacity || 40),
      registrationNo: busRaw?.registration_no || "",
      model: busRaw?.model || "",
      seatLayout: "2x2",
      status: "ACTIVE",
      gpsDeviceId: busRaw?.gps_device_id || "",
      insuranceExpiry: busRaw?.insurance_expiry || "",
      maintenanceDueDate: busRaw?.maintenance_due_date || "",
    };

    // 3. Fetch stops for the target bus
    const { data: stopsRaw } = await supabaseAdmin
      .from("stops")
      .select("*")
      .order("name");

    const targetStops: Stop[] = (stopsRaw || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      latitude: Number(s.latitude),
      longitude: Number(s.longitude),
      landmark: s.landmark,
      geofenceRadiusMeters: Number(s.geofence_radius_meters || 100),
    }));

    // 4. Count current reservations on target bus for today
    const today = new Date().toISOString().split("T")[0];
    const { count: reservationCount } = await supabaseAdmin
      .from("bus_reservations")
      .select("id", { count: "exact", head: true })
      .eq("bus_id", targetBusId)
      .eq("reservation_date", today)
      .not("status", "in", '("CANCELLED","SWITCHED")');

    // 5. Fetch transport settings
    const { data: settingsRaw } = await supabaseAdmin
      .from("transport_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    const settings: TransportSettings = {
      id: settingsRaw?.id || "default",
      maxWalkDistanceKm: Number(settingsRaw?.max_walk_distance_km || 3.0),
      autoAssignmentEnabled: Boolean(settingsRaw?.auto_assignment_enabled ?? true),
      seatSelectionMode: settingsRaw?.seat_selection_mode || "AT_ATTENDANCE",
      attendanceMode: (settingsRaw?.attendance_mode as any) || "FACE_ID",
      minFillPercent: Number(settingsRaw?.min_fill_percent || 60),
      maxRideTimeMins: Number(settingsRaw?.max_ride_time_mins || 90),
      capacityBufferPercent: Number(settingsRaw?.capacity_buffer_percent || 10),
      switchAutoApproveBelowPct: Number(settingsRaw?.switch_auto_approve_below_pct || 90),
    };

    // 6. Run AI Switch Evaluator
    const homeLat = student.homeLatitude || 22.7196;
    const homeLng = student.homeLongitude || 75.8577;

    const evaluation = evaluateSwitchRequest({
      student,
      targetBus,
      targetStops,
      currentReservationCount: reservationCount || 0,
      settings,
      homeLat,
      homeLng,
    });

    const status = evaluation.overallDecision === "AUTO_APPROVED"
      ? "AUTO_APPROVED"
      : evaluation.overallDecision === "AUTO_DENIED"
      ? "AUTO_DENIED"
      : "NEEDS_REVIEW";

    // 7. Insert switch request record
    const { data: createdReq, error: insertErr } = await supabaseAdmin
      .from("bus_switch_requests")
      .insert({
        student_id: studentId,
        current_bus_id: currentBusId,
        current_stop_id: currentStopId,
        requested_bus_id: requestedBusId || null,
        requested_stop_id: requestedStopId || null,
        request_type: requestType,
        reason,
        effective_from: effectiveFrom,
        effective_until: effectiveUntil || null,
        ai_capacity_check: evaluation.capacityCheck,
        ai_distance_check: evaluation.distanceCheck,
        ai_efficiency_check: evaluation.efficiencyCheck,
        ai_compliance_check: evaluation.complianceCheck,
        ai_overall_decision: evaluation.overallDecision,
        ai_reasoning: evaluation.reasoning,
        ai_alternative_bus_id: evaluation.alternativeBusId || null,
        ai_evaluated_at: new Date().toISOString(),
        status,
      })
      .select()
      .single();

    if (insertErr) {
      return NextResponse.json({ success: false, message: insertErr.message }, { status: 500 });
    }

    // 8. If auto-approved, update or insert student's active bus_reservations
    if (status === "AUTO_APPROVED" && requestedBusId) {
      await supabaseAdmin
        .from("bus_reservations")
        .update({
          bus_id: requestedBusId,
          boarding_stop_id: requestedStopId || currentStopId,
          assigned_by: "SWITCH_APPROVED",
          status: "ASSIGNED",
          chosen_seat: null, // Reset seat so they can select seat on the new bus
          seat_chosen_at: null,
        })
        .eq("student_id", studentId)
        .eq("reservation_date", today);
    }

    return NextResponse.json({
      success: true,
      message: status === "AUTO_APPROVED"
        ? "Switch request instantly auto-approved by AI! Your bus has been updated."
        : status === "NEEDS_REVIEW"
        ? "Request submitted! Routing to Transport Admin for review."
        : "Switch request evaluated: did not meet automatic approval criteria.",
      request: createdReq,
      evaluation,
    });
  } catch (err: any) {
    console.error("[api/students/switch-requests] POST error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
