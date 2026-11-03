import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { buildDutyBlocks, rotateDutyBlocks, autoAssignDutyBlocks, reconcileDutyTrips } from "@/lib/duty-blocks";
import { getTodayIST } from "@/lib/time-manager";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date") || getTodayIST();

    const [busesRes, routesRes, shiftsRes, tripsRes, staffRes, usersRes] = await Promise.all([
      supabaseAdmin.from("buses").select("*"),
      supabaseAdmin.from("routes").select("*"),
      supabaseAdmin.from("shifts").select("*"),
      supabaseAdmin.from("trips").select("*").eq("trip_date", dateParam),
      supabaseAdmin.from("staff").select("*"),
      supabaseAdmin.from("users").select("*"),
    ]);

    const buses = (busesRes.data || []).map((b) => ({
      ...b,
      busNumber: Number(b.bus_number),
      registrationNo: b.registration_no,
      currentRouteId: b.current_route_id,
      gpsDeviceId: b.gps_device_id,
      seatLayout: b.seat_layout,
      insuranceExpiry: b.insurance_expiry,
      maintenanceDueDate: b.maintenance_due_date,
    }));

    const routes = (routesRes.data || []).map((r) => ({
      ...r,
      isActive: r.is_active,
      totalDistanceKm: r.total_distance_km,
      estimatedDurationMins: r.estimated_duration_mins,
    }));

    const shifts = (shiftsRes.data || []).map((s) => ({
      id: s.id,
      name: s.name,
      shiftType: s.type,
      direction: s.direction,
      startTime: s.start_time,
      endTime: s.end_time,
      bookingCutoffMins: s.booking_cutoff_minutes,
      isSpecial: s.is_special,
    }));

    const trips = (tripsRes.data || []).map((t) => ({
      id: t.id,
      tripCode: t.trip_code,
      routeId: t.route_id,
      busId: t.bus_id,
      shiftId: t.shift_id,
      driverId: t.driver_id,
      conductorId: t.conductor_id,
      tripDate: t.trip_date,
      status: t.status,
      delayMinutes: t.delay_minutes,
      manifestLocked: t.manifest_locked,
      currentStopIndex: t.current_stop_index,
    }));

    const staff = (staffRes.data || []).map((s) => ({
      id: s.id,
      employeeCode: s.employee_code,
      fullName: s.full_name,
      role: s.role,
      phone: s.phone,
      licenseNo: s.license_no,
    }));

    const users = (usersRes.data || []).map((u) => ({
      id: u.id,
      fullName: u.full_name,
      email: u.email,
      phone: u.phone,
      role: u.role,
    }));

    const { dutyBlocks, incomingShifts, outgoingShifts, summary } = buildDutyBlocks(
      buses as any,
      routes as any,
      shifts as any,
      trips as any,
      staff as any,
      users as any,
      dateParam
    );

    return NextResponse.json({
      success: true,
      targetDate: dateParam,
      dutyBlocks,
      incomingShifts,
      outgoingShifts,
      summary,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load vehicle duty blocks." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action = "CONFIRM_ALLOCATIONS", targetDate = getTodayIST(), dutyBlocks = [], rotationOffset = 1 } = body;

    const { data: rawShifts } = await supabaseAdmin.from("shifts").select("*");
    const shifts = (rawShifts || []).map((s) => ({
      id: s.id,
      name: s.name,
      shiftType: s.type,
      direction: s.direction,
      startTime: s.start_time,
      endTime: s.end_time,
      bookingCutoffMins: s.booking_cutoff_minutes,
      isSpecial: s.is_special,
    }));

    // 1. Action: ROTATE_PREVIEW
    if (action === "ROTATE_PREVIEW") {
      const { outgoingShifts } = buildDutyBlocks([], [], shifts as any, [], [], [], targetDate);
      const rotated = rotateDutyBlocks(dutyBlocks, outgoingShifts, rotationOffset);
      return NextResponse.json({
        success: true,
        dutyBlocks: rotated,
        outgoingShifts,
        message: `Fleet duty rotated dynamically with step +${rotationOffset}.`,
      });
    }

    // 2. Action: AUTO_ASSIGN
    if (action === "AUTO_ASSIGN") {
      const { outgoingShifts } = buildDutyBlocks([], [], shifts as any, [], [], [], targetDate);
      const assigned = autoAssignDutyBlocks(dutyBlocks, outgoingShifts, rotationOffset);
      return NextResponse.json({
        success: true,
        dutyBlocks: assigned,
        outgoingShifts,
        message: "Dynamic duty blocks auto-assigned across available outgoing shifts.",
      });
    }

    // 3. Action: CONFIRM_ALLOCATIONS
    if (action === "CONFIRM_ALLOCATIONS") {
      if (!Array.isArray(dutyBlocks) || dutyBlocks.length === 0) {
        return NextResponse.json(
          { success: false, error: "No duty blocks provided to confirm." },
          { status: 400 }
        );
      }

      // Fetch existing trips on targetDate
      const { data: existingTrips } = await supabaseAdmin
        .from("trips")
        .select("*")
        .eq("trip_date", targetDate);

      const formattedExisting = (existingTrips || []).map((t) => ({
        id: t.id,
        tripCode: t.trip_code,
        routeId: t.route_id,
        busId: t.bus_id,
        shiftId: t.shift_id,
        driverId: t.driver_id,
        conductorId: t.conductor_id,
        tripDate: t.trip_date,
        status: t.status,
        delayMinutes: t.delay_minutes,
        manifestLocked: t.manifest_locked,
        currentStopIndex: t.current_stop_index,
      }));

      const { tripsToUpsert, tripIdsToDelete } = reconcileDutyTrips(
        dutyBlocks,
        formattedExisting as any,
        targetDate,
        shifts as any
      );

      // A. Delete conflicting or duplicate outshift trips (prevent double-booking)
      if (tripIdsToDelete.length > 0) {
        const { error: delErr } = await supabaseAdmin
          .from("trips")
          .delete()
          .in("id", tripIdsToDelete);

        if (delErr) {
          console.error("[DutyBlocks] Failed to delete conflicting trips:", delErr);
        }
      }

      // B. Upsert confirmed trips (1 inbound + 1 outbound per bus)
      let upsertedCount = 0;
      if (tripsToUpsert.length > 0) {
        const { data: upserted, error: upsertErr } = await supabaseAdmin
          .from("trips")
          .upsert(tripsToUpsert, { onConflict: "id" })
          .select("id");

        if (upsertErr) {
          console.error("[DutyBlocks] Upsert error:", upsertErr);
          throw upsertErr;
        }
        upsertedCount = upserted ? upserted.length : tripsToUpsert.length;
      }

      // C. Record immutable audit log
      await supabaseAdmin.from("audit_logs").insert({
        user_role: "transport_manager",
        action: "DUTY_BLOCKS_CONFIRMED",
        entity: "FleetDispatchRoster",
        entity_id: targetDate,
        reason: `Transport Manager published dynamic duty blocks for ${targetDate}. Active runs: ${upsertedCount}. Removed conflicting duplicate outshifts: ${tripIdsToDelete.length}.`,
        new_value: {
          targetDate,
          upsertedCount,
          removedDuplicatesCount: tripIdsToDelete.length,
          dutyBlocksCount: dutyBlocks.length,
        },
        created_at: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        message: `Successfully confirmed and published fleet allocations for ${targetDate}! (${upsertedCount} active runs, ${tripIdsToDelete.length} conflicts resolved).`,
        upsertedCount,
        removedDuplicatesCount: tripIdsToDelete.length,
      });
    }

    return NextResponse.json({ success: false, error: "Unknown action." }, { status: 400 });
  } catch (error: any) {
    console.error("[DutyBlocks] POST error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process duty blocks request." },
      { status: 500 }
    );
  }
}
