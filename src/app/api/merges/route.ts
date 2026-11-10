import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getTodayIST } from "@/lib/time-manager";
import {
  reconcileShiftAttendance,
  detectIntraCorridorDisassemblies,
  computeClarkeWrightRouteStitches,
  computeFleetOrchestrationPlan,
} from "@/lib/route-optimizer";
import { Bus, Route, Booking } from "@/lib/types";
import { getSessionFromRequest } from "@/lib/jwt";
import { isAuthorizedCron } from "@/lib/security/cron-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/merges - List merge & route-stitch suggestions, history, and reconciliation stats
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    let query = supabaseAdmin
      .from("bus_merge_suggestions")
      .select("*, bus_merge_points(*)")
      .order("created_at", { ascending: false });

    if (status && status !== "ALL") {
      query = query.eq("status", status);
    }

    const { data: suggestions, error } = await query;
    if (error) throw error;

    // Fetch buses and routes to enrich
    const { data: buses } = await supabaseAdmin
      .from("buses")
      .select("id, bus_number, registration_no, capacity, current_route_id, status");
    const { data: routes } = await supabaseAdmin.from("routes").select("id, name, code, total_distance_km");

    const busMap = new Map((buses || []).map((b) => [String(b.id), b]));
    const routeMap = new Map((routes || []).map((r) => [r.id, r]));

    const enriched = (suggestions || []).map((s) => {
      const sourceBus = busMap.get(String(s.source_bus_id));
      const targetBus = busMap.get(String(s.target_bus_id));
      const route = routeMap.get(s.route_id);
      const secRoute = s.secondary_route_id ? routeMap.get(s.secondary_route_id) : null;
      const mp = s.bus_merge_points;

      const isRouteStitch = s.orchestration_type === "ROUTE_STITCH_CONSOLIDATION";

      return {
        id: s.id,
        orchestrationType: s.orchestration_type || "INTRA_CORRIDOR_DISASSEMBLY",
        mergePointId: s.merge_point_id,
        mergePointCode: mp?.code || (isRouteStitch ? "STITCH-HUB" : "MP"),
        mergePointName: mp?.name || (isRouteStitch ? "Cross-Corridor Splice" : "Designated Merge Stop"),
        routeId: s.route_id,
        routeName: route ? route.name : s.route_id,
        secondaryRouteId: s.secondary_route_id,
        secondaryRouteName: secRoute ? secRoute.name : s.secondary_route_name || null,
        stitchedRouteName: s.stitched_route_name || (secRoute ? `${route?.name || "Route 1"} + ${secRoute.name}` : null),
        sourceBusId: s.source_bus_id,
        sourceBusName: sourceBus ? (sourceBus.bus_number ? `Bus ${sourceBus.bus_number}` : sourceBus.registration_no) : `Bus ${s.source_bus_id}`,
        sourceOccupancy: s.source_occupancy,
        targetBusId: s.target_bus_id,
        targetBusName: targetBus ? (targetBus.bus_number ? `Bus ${targetBus.bus_number}` : targetBus.registration_no) : `Bus ${s.target_bus_id}`,
        targetOccupancy: s.target_occupancy,
        targetCapacity: s.target_capacity,
        combinedOccupancy: s.combined_occupancy,
        remainingSeats: Math.max(0, s.target_capacity - s.combined_occupancy),
        activeStopIds: s.active_stop_ids || [],
        bypassedStopIds: s.bypassed_stop_ids || [],
        estimatedDetourMinutes: s.estimated_detour_minutes || 0,
        fuelSavedLiters: Number(s.estimated_fuel_saved_liters || 0),
        prunedAbsenteeCount: s.pruned_absentee_count || 0,
        status: s.status,
        rejectionReason: s.rejection_reason,
        suggestedBy: s.suggested_by,
        reviewedBy: s.reviewed_by,
        reviewedAt: s.reviewed_at,
        createdAt: s.created_at,
      };
    });

    // Query latest attendance reconciliation run stats
    const { data: latestRun } = await supabaseAdmin
      .from("attendance_reconciliation_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      suggestions: enriched,
      latestReconciliation: latestRun || null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to load merge suggestions." },
      { status: 500 }
    );
  }
}

// POST /api/merges - Reconcile Attendance & Detect, Approve, or Reject
// Live bus_reservations statuses (CHECK constraint): ASSIGNED, SEAT_SELECTED, BOARDED, ALIGHTED, ABSENT, CANCELLED, SWITCHED.
// Riders who still need a seat on an outgoing run:
const ACTIVE_RESERVATION_STATUSES = ["ASSIGNED", "SEAT_SELECTED", "BOARDED"];
// Riders who have not boarded yet (safe to cancel when pruned as absentees):
const PRE_BOARDING_STATUSES = ["ASSIGNED", "SEAT_SELECTED"];
// attendance_records statuses that prove the student actually travelled in the morning:
const PRESENT_ATTENDANCE_STATUSES = ["BOARDED", "PRESENT", "WRONG_BUS_TAP"];

/** Live occupancy of a bus for one date: active reservations on that bus. */
async function countActiveRiders(busId: number | string, date: string, shiftIds: string[]): Promise<number> {
  let q = supabaseAdmin
    .from("bus_reservations")
    .select("id", { count: "exact", head: true })
    .eq("bus_id", busId)
    .eq("reservation_date", date)
    .in("status", ACTIVE_RESERVATION_STATUSES);
  if (shiftIds.length > 0) q = q.in("shift_id", shiftIds);
  const { count } = await q;
  return count || 0;
}

/**
 * Moves the source bus's riders for (date, outgoing shifts) onto the target bus.
 * Seats are cleared because seat codes from one bus are not valid/free on another;
 * SEAT_SELECTED riders go back to ASSIGNED so they pick a new seat on boarding.
 */
async function reassignRiders(sourceBusId: number | string, targetBusId: number | string, date: string, shiftIds: string[]) {
  const scope = (q: any) => {
    q = q.eq("bus_id", sourceBusId).eq("reservation_date", date);
    return shiftIds.length > 0 ? q.in("shift_id", shiftIds) : q;
  };
  const { error: e1 } = await scope(
    supabaseAdmin.from("bus_reservations").update({ bus_id: targetBusId, chosen_seat: null, status: "ASSIGNED" })
  ).eq("status", "SEAT_SELECTED");
  const { error: e2 } = await scope(
    supabaseAdmin.from("bus_reservations").update({ bus_id: targetBusId, chosen_seat: null })
  ).in("status", ["ASSIGNED", "BOARDED"]);
  const err = e1 || e2;
  if (err) throw new Error(`Failed to reassign riders: ${err.message}`);
}

export async function POST(req: NextRequest) {
  try {
    const userSession = await getSessionFromRequest(req);
    const isCron = !userSession && isAuthorizedCron(req);
    if (!isCron && (!userSession || !["admin", "transport_admin", "transport_manager"].includes(userSession.role))) {
      return NextResponse.json({ success: false, message: "Forbidden." }, { status: userSession ? 403 : 401 });
    }
    const session = userSession || {
      userId: null as unknown as string,
      email: null as unknown as string,
      role: "system_cron",
    };
    // reviewed_by / reconciled_by are FKs to users(id): the session user, or NULL for the scheduled job.
    const reviewerId: string | null = userSession?.userId || null;

    const body = await req.json();
    const { action, suggestionId, rejectionReason, maxDetourMinutes = 15 } = body;
    const today = getTodayIST();

    // =========================================================================
    // ACTION 1: RECONCILE ATTENDANCE & DETECT ORCHESTRATION OPPORTUNITIES
    // (Approach C: Full Dynamic Attendance-Reconciled Hybrid Pipeline)
    // =========================================================================
    if (action === "RECONCILE_AND_DETECT" || action === "DETECT") {
      // 0. Outgoing shifts (campus → home)
      const { data: outgoingShifts } = await supabaseAdmin
        .from("shifts")
        .select("id")
        .eq("direction", "CAMPUS_TO_HOME")
        .neq("is_active", false);

      // 1. Fetch all operational buses
      const { data: rawBuses, error: busErr } = await supabaseAdmin
        .from("buses")
        .select("*")
        .not("status", "in", '("MAINTENANCE","OUT_OF_SERVICE","INACTIVE")');
      if (busErr) throw busErr;

      // 2. Fetch routes with stops
      const { data: rawRoutes, error: routeErr } = await supabaseAdmin
        .from("routes")
        .select("*, route_stops(*, stops(*))")
        .eq("is_active", true);
      if (routeErr) throw routeErr;

      // 3. Fetch all active merge points
      const { data: rawMergePoints } = await supabaseAdmin
        .from("bus_merge_points")
        .select("*")
        .eq("is_active", true);

      // 4. Verified morning attendance for TODAY (IST day, as UTC instant range)
      const dayStartIso = new Date(`${today}T00:00:00+05:30`).toISOString();
      const dayEndIso = new Date(new Date(dayStartIso).getTime() + 24 * 3600 * 1000).toISOString();
      const { data: morningAttendance, error: attErr } = await supabaseAdmin
        .from("attendance_records")
        .select("student_id, status")
        .gte("timestamp", dayStartIso)
        .lt("timestamp", dayEndIso)
        .in("status", PRESENT_ATTENDANCE_STATUSES);
      if (attErr) throw attErr;

      const todayAttendees = new Set<string>();
      for (const rec of morningAttendance || []) {
        if (rec.student_id) todayAttendees.add(rec.student_id);
      }

      // 5. Today's OUTGOING (campus → home) reservations only
      const outgoingShiftIds = (outgoingShifts || []).map((s) => s.id);
      const { data: rawBookings, error: bookErr } = outgoingShiftIds.length
        ? await supabaseAdmin
            .from("bus_reservations_full")
            .select("*")
            .eq("reservation_date", today)
            .in("shift_id", outgoingShiftIds)
            .in("status", ACTIVE_RESERVATION_STATUSES)
        : { data: [] as any[], error: null };
      if (bookErr) throw bookErr;

      // The optimizer's Booking model uses CONFIRMED for "holds a place"; map live statuses onto it.
      const outgoingBookings = (rawBookings || []).map((b) => ({
        id: b.id,
        bookingCode: b.booking_code,
        studentId: b.student_id,
        tripId: b.trip_id,
        busId: b.bus_id,
        bookingDate: b.reservation_date || b.booking_date,
        boardingStopId: b.boarding_stop_id,
        status: b.status === "BOARDED" ? "BOARDED" : "CONFIRMED",
        createdAt: b.created_at,
      })) as Booking[];

      // Formula: active outgoing riders = registered − VERIFIED morning absentees.
      // If no attendance has been recorded yet today we cannot verify anyone as absent,
      // so nobody is pruned (no guessed/simulated attendance).
      const attendanceAvailable = todayAttendees.size > 0;
      const effectiveAttendees = attendanceAvailable
        ? todayAttendees
        : new Set(outgoingBookings.map((b) => b.studentId));

      // 6. Map routes into domain structure
      const domainRoutes: Route[] = (rawRoutes || []).map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description || "",
        direction: r.direction || "CAMPUS_TO_HOME",
        color: r.color || "#3b82f6",
        isActive: r.is_active,
        totalDistanceKm: Number(r.total_distance_km) || 24,
        estimatedDurationMins: Number(r.estimated_duration_mins) || 45,
        stops: (r.route_stops || []).map((rs: any) => ({
          stopId: rs.stop_id,
          stopOrder: rs.stop_order,
          arrivalOffsetMinutes: rs.arrival_offset_minutes || 0,
          bufferTimeMinutes: rs.buffer_time_minutes || 2,
          stop: rs.stops
            ? {
                id: rs.stops.id,
                name: rs.stops.name,
                code: rs.stops.code,
                latitude: Number(rs.stops.latitude),
                longitude: Number(rs.stops.longitude),
                landmark: rs.stops.landmark || "",
                geofenceRadiusMeters: Number(rs.stops.geofence_radius_meters) || 80,
                isBusMergeStop: Boolean(rs.stops.is_bus_merge_stop),
              }
            : null,
        })),
      }));

      // 7. Map buses into domain structure
      const domainBuses: Bus[] = (rawBuses || []).map((b) => ({
        id: b.id,
        busNumber: b.bus_number,
        registrationNo: b.registration_no,
        model: b.model || "Standard Campus Bus",
        capacity: Number(b.capacity) || 50,
        seatLayout: b.seat_layout || "2x2",
        status: b.status,
        gpsDeviceId: b.gps_device_id,
        insuranceExpiry: b.insurance_expiry || "",
        maintenanceDueDate: b.maintenance_due_date || "",
        currentRouteId: b.current_route_id,
      }));

      // 8. Run master Attendance-Reconciled Orchestration Engine (Approach C)
      const orchestrationPlan = computeFleetOrchestrationPlan(
        effectiveAttendees,
        outgoingBookings,
        domainBuses,
        domainRoutes,
        rawMergePoints || [],
        Number(maxDetourMinutes) || 15
      );

      // 9. Prune absentee students from outgoing reservations if actual attendees were found
      // Only today's not-yet-boarded outgoing reservations are cancelled — never other days or shifts.
      if (attendanceAvailable && orchestrationPlan.summary.prunedStudentIds.length > 0) {
        const { error: pruneErr } = await supabaseAdmin
          .from("bus_reservations")
          .update({
            status: "ABSENT",
            cancelled_at: new Date().toISOString(),
          })
          .in("student_id", orchestrationPlan.summary.prunedStudentIds)
          .eq("reservation_date", today)
          .in("shift_id", outgoingShiftIds)
          .in("status", PRE_BOARDING_STATUSES);
        if (pruneErr) throw pruneErr;
      }

      // 10. Persist detected opportunities into bus_merge_suggestions
      const insertedSuggestions: any[] = [];

      // A. Intra-Corridor Disassemblies
      for (const d of orchestrationPlan.disassemblyOpportunities) {
        const { data: existing } = await supabaseAdmin
          .from("bus_merge_suggestions")
          .select("id")
          .eq("source_bus_id", String(d.sourceBusId))
          .eq("target_bus_id", String(d.targetBusId))
          .eq("status", "PENDING")
          .maybeSingle();

        if (!existing) {
          const { data: newSug } = await supabaseAdmin
            .from("bus_merge_suggestions")
            .insert({
              orchestration_type: "INTRA_CORRIDOR_DISASSEMBLY",
              trip_date: today,
              merge_point_id: d.mergePointId.startsWith("AUTO") ? null : d.mergePointId,
              route_id: d.routeId,
              source_bus_id: String(d.sourceBusId),
              target_bus_id: String(d.targetBusId),
              source_occupancy: d.sourceOccupancy,
              target_occupancy: d.targetOccupancy,
              target_capacity: d.targetCapacity,
              combined_occupancy: d.combinedOccupancy,
              estimated_fuel_saved_liters: d.fuelSavedLiters,
              pruned_absentee_count: orchestrationPlan.summary.totalAbsentPruned,
              status: "PENDING",
              suggested_by: "ATTENDANCE_RECONCILED_OPTIMIZER",
            })
            .select()
            .single();

          if (newSug) insertedSuggestions.push(newSug);
        }
      }

      // B. Inter-Corridor Route Stitches (Clarke-Wright)
      for (const s of orchestrationPlan.routeStitchOpportunities) {
        const { data: existing } = await supabaseAdmin
          .from("bus_merge_suggestions")
          .select("id")
          .eq("source_bus_id", String(s.sourceBusId))
          .eq("target_bus_id", String(s.targetBusId))
          .eq("status", "PENDING")
          .maybeSingle();

        if (!existing) {
          const { data: newSug } = await supabaseAdmin
            .from("bus_merge_suggestions")
            .insert({
              orchestration_type: "ROUTE_STITCH_CONSOLIDATION",
              trip_date: today,
              merge_point_id: null,
              route_id: s.primaryRouteId,
              secondary_route_id: s.secondaryRouteId,
              secondary_route_name: s.secondaryRouteName,
              stitched_route_name: `${s.primaryRouteName} + ${s.secondaryRouteName}`,
              source_bus_id: String(s.sourceBusId),
              target_bus_id: String(s.targetBusId),
              source_occupancy: s.sourceOccupancy,
              target_occupancy: s.targetOccupancy,
              target_capacity: s.targetCapacity,
              combined_occupancy: s.combinedOccupancy,
              active_stop_ids: s.activeStops.map((st) => st.id),
              estimated_detour_minutes: s.estimatedDetourMinutes,
              estimated_fuel_saved_liters: s.fuelSavedLiters,
              pruned_absentee_count: orchestrationPlan.summary.totalAbsentPruned,
              status: "PENDING",
              suggested_by: "CLARKE_WRIGHT_ROUTE_STITCHER",
            })
            .select()
            .single();

          if (newSug) insertedSuggestions.push(newSug);
        }
      }

      // 11. Record run in attendance_reconciliation_runs
      await supabaseAdmin.from("attendance_reconciliation_runs").insert({
        reconciled_date: today,
        total_incoming_attendees: orchestrationPlan.summary.totalIncomingAttendees,
        total_absentees_pruned: orchestrationPlan.summary.totalAbsentPruned,
        initial_outgoing_passengers: orchestrationPlan.summary.initialOutgoingPassengers,
        reconciled_outgoing_passengers: orchestrationPlan.summary.reconciledOutgoingPassengers,
        opportunities_detected: insertedSuggestions.length,
        fuel_saved_liters: orchestrationPlan.totalFuelSavedLiters,
        outgoing_shift_id: outgoingShiftIds.length === 1 ? outgoingShiftIds[0] : null,
        reconciled_by: reviewerId,
      });

      return NextResponse.json({
        success: true,
        detectedCount: insertedSuggestions.length,
        plan: orchestrationPlan,
        suggestions: insertedSuggestions,
      });
    }

    // =========================================================================
    // ACTION 2: APPROVE SUGGESTION (EXECUTE DISASSEMBLY OR ROUTE STITCH)
    // =========================================================================
    if (action === "APPROVE") {
      if (!suggestionId) {
        return NextResponse.json({ success: false, message: "suggestionId is required." }, { status: 400 });
      }

      // 1. Fetch suggestion
      const { data: suggestion, error: sugErr } = await supabaseAdmin
        .from("bus_merge_suggestions")
        .select("*, bus_merge_points(*)")
        .eq("id", suggestionId)
        .single();

      if (sugErr || !suggestion) {
        return NextResponse.json({ success: false, message: "Merge suggestion not found." }, { status: 404 });
      }

      if (suggestion.status !== "PENDING") {
        return NextResponse.json(
          { success: false, message: `Suggestion is already ${suggestion.status}.` },
          { status: 400 }
        );
      }

      // Verify buses and capacities
      const { data: targetBus } = await supabaseAdmin.from("buses").select("*").eq("id", suggestion.target_bus_id).single();
      const { data: sourceBus } = await supabaseAdmin.from("buses").select("*").eq("id", suggestion.source_bus_id).single();

      if (!targetBus || !sourceBus) {
        return NextResponse.json({ success: false, message: "One or both buses not found." }, { status: 404 });
      }

      // Live occupancy from today's reservations (buses.occupancy is a stale cached column)
      const mergeDate: string = suggestion.trip_date || today;
      const { data: outShiftsForApprove } = await supabaseAdmin
        .from("shifts")
        .select("id")
        .eq("direction", "CAMPUS_TO_HOME");
      const approveShiftIds = (outShiftsForApprove || []).map((s) => s.id);
      const sourceRiders = await countActiveRiders(sourceBus.id, mergeDate, approveShiftIds);
      const targetRiders = await countActiveRiders(targetBus.id, mergeDate, approveShiftIds);
      const combined = sourceRiders + targetRiders;
      if (combined > (targetBus.capacity || 50)) {
        return NextResponse.json(
          {
            success: false,
            message: `Execution Denied: Combined occupancy (${combined}) exceeds receiving bus capacity (${targetBus.capacity}).`,
          },
          { status: 400 }
        );
      }

      // 1. Reassign today's outgoing riders from source bus to target bus (fails loudly)
      await reassignRiders(sourceBus.id, targetBus.id, mergeDate, approveShiftIds);

      // 2. Mark suggestion as APPROVED
      const { error: approveErr } = await supabaseAdmin
        .from("bus_merge_suggestions")
        .update({
          status: "APPROVED",
          reviewed_by: reviewerId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", suggestionId);
      if (approveErr) throw approveErr;

      // 3. Mark source bus as STANDBY_DISASSEMBLED and zero out its occupancy
      await supabaseAdmin
        .from("buses")
        .update({
          occupancy: 0,
          status: "STANDBY_DISASSEMBLED",
        })
        .eq("id", sourceBus.id);

      // 4. Update target bus occupancy to combined
      await supabaseAdmin
        .from("buses")
        .update({ occupancy: combined })
        .eq("id", targetBus.id);

      // 5. Audit Log (Never expose raw trip_id to public per domain rules)
      const actionName =
        suggestion.orchestration_type === "ROUTE_STITCH_CONSOLIDATION"
          ? "EXECUTE_ROUTE_STITCH_CONSOLIDATION"
          : "EXECUTE_INTRA_CORRIDOR_DISASSEMBLY";

      await supabaseAdmin.from("audit_logs").insert({
        user_id: session.userId,
        user_email: session.email,
        user_role: session.role,
        action: actionName,
        entity: "BusMergeSuggestion",
        entity_id: suggestionId,
        reason: `Executed ${suggestion.orchestration_type}: Bus ${sourceBus.bus_number || sourceBus.id} stood down. Passengers re-assigned to Bus ${targetBus.bus_number || targetBus.id}. Saved ~${suggestion.estimated_fuel_saved_liters || 0}L fuel.`,
        previous_value: {
          sourceOccupancy: sourceRiders,
          targetOccupancy: targetRiders,
        },
        new_value: {
          targetOccupancy: combined,
          sourceStatus: "STANDBY_DISASSEMBLED",
        },
      });

      return NextResponse.json({
        success: true,
        message: `Execution successful! Bus ${sourceBus.bus_number || sourceBus.id} stood down. Passengers consolidated into Bus ${targetBus.bus_number || targetBus.id}.`,
      });
    }

    // =========================================================================
    // ACTION 3: EXECUTE ALL RECOMMENDED DISASSEMBLIES & STITCHES (1-CLICK AUTO-PILOT)
    // =========================================================================
    if (action === "EXECUTE_ALL_RECOMMENDED") {
      const { data: pendingSuggestions } = await supabaseAdmin
        .from("bus_merge_suggestions")
        .select("*")
        .eq("status", "PENDING");

      let executedCount = 0;
      let totalFuelSaved = 0;

      const { data: outShiftsForAll } = await supabaseAdmin
        .from("shifts")
        .select("id")
        .eq("direction", "CAMPUS_TO_HOME");
      const allShiftIds = (outShiftsForAll || []).map((s) => s.id);

      for (const sug of pendingSuggestions || []) {
        // Only act on suggestions for today (stale suggestions from earlier days are skipped)
        const sugDate: string = sug.trip_date || today;
        if (sugDate !== today) continue;

        // Fetch buses
        const { data: tBus } = await supabaseAdmin.from("buses").select("*").eq("id", sug.target_bus_id).single();
        const { data: sBus } = await supabaseAdmin.from("buses").select("*").eq("id", sug.source_bus_id).single();

        if (tBus && sBus && sBus.status !== "STANDBY_DISASSEMBLED" && sBus.status !== "MAINTENANCE" && tBus.status !== "STANDBY_DISASSEMBLED") {
          const combined =
            (await countActiveRiders(sBus.id, sugDate, allShiftIds)) +
            (await countActiveRiders(tBus.id, sugDate, allShiftIds));
          if (combined <= (tBus.capacity || 50)) {
            // Reassign reservations
            await reassignRiders(sBus.id, tBus.id, sugDate, allShiftIds);

            // Stand down source bus
            await supabaseAdmin
              .from("buses")
              .update({ occupancy: 0, status: "STANDBY_DISASSEMBLED" })
              .eq("id", sBus.id);

            // Update carrier bus
            await supabaseAdmin
              .from("buses")
              .update({ occupancy: combined })
              .eq("id", tBus.id);

            // Mark suggestion APPROVED
            await supabaseAdmin
              .from("bus_merge_suggestions")
              .update({
                status: "APPROVED",
                reviewed_by: reviewerId,
                reviewed_at: new Date().toISOString(),
              })
              .eq("id", sug.id);

            executedCount++;
            totalFuelSaved += Number(sug.estimated_fuel_saved_liters || 0);
          }
        }
      }

      return NextResponse.json({
        success: true,
        message: `Auto-Pilot executed: ${executedCount} buses stood down. Passengers consolidated. Estimated ${totalFuelSaved.toFixed(1)}L fuel saved.`,
        executedCount,
        totalFuelSaved,
      });
    }

    // =========================================================================
    // ACTION 4: REJECT SUGGESTION
    // =========================================================================
    if (action === "REJECT") {
      if (!suggestionId) {
        return NextResponse.json({ success: false, message: "suggestionId is required." }, { status: 400 });
      }

      await supabaseAdmin
        .from("bus_merge_suggestions")
        .update({
          status: "REJECTED",
          rejection_reason: rejectionReason || "Operational decision by transport manager.",
          reviewed_by: reviewerId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", suggestionId);

      await supabaseAdmin.from("audit_logs").insert({
        user_id: session.userId,
        user_email: session.email,
        user_role: session.role,
        action: "REJECT_BUS_MERGE",
        entity: "BusMergeSuggestion",
        entity_id: suggestionId,
        reason: `Rejected suggestion: ${rejectionReason || "Operational override"}`,
      });

      return NextResponse.json({
        success: true,
        message: "Suggestion rejected.",
      });
    }

    return NextResponse.json({ success: false, message: "Invalid action specified." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to process orchestration action." },
      { status: 500 }
    );
  }
}
