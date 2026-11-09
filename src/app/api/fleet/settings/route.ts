import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

/**
 * GET /api/fleet/settings — Fetch transport settings
 * POST /api/fleet/settings — Update transport settings
 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("transport_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    // Return settings or defaults
    const settings = data
      ? {
          id: data.id,
          maxWalkDistanceKm: Number(data.max_walk_distance_km),
          autoAssignmentEnabled: data.auto_assignment_enabled,
          seatSelectionMode: data.seat_selection_mode,
          attendanceMode: data.attendance_mode || "FACE_ID",
          minFillPercent: data.min_fill_percent,
          maxRideTimeMins: data.max_ride_time_mins,
          capacityBufferPercent: data.capacity_buffer_percent,
          switchAutoApproveBelowPct: data.switch_auto_approve_below_pct,
          updatedAt: data.updated_at,
          updatedBy: data.updated_by,
        }
      : {
          id: null,
          maxWalkDistanceKm: 3.0,
          autoAssignmentEnabled: true,
          seatSelectionMode: "AT_ATTENDANCE",
          attendanceMode: "FACE_ID",
          minFillPercent: 60,
          maxRideTimeMins: 90,
          capacityBufferPercent: 10,
          switchAutoApproveBelowPct: 90,
          updatedAt: null,
          updatedBy: null,
        };

    return NextResponse.json({ success: true, settings });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch transport settings." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      maxWalkDistanceKm,
      autoAssignmentEnabled,
      seatSelectionMode,
      attendanceMode,
      minFillPercent,
      maxRideTimeMins,
      capacityBufferPercent,
      switchAutoApproveBelowPct,
      updatedBy,
    } = body;

    // Build update payload (only include fields that were sent)
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (maxWalkDistanceKm !== undefined) updates.max_walk_distance_km = Number(maxWalkDistanceKm);
    if (autoAssignmentEnabled !== undefined) updates.auto_assignment_enabled = Boolean(autoAssignmentEnabled);
    if (seatSelectionMode !== undefined) updates.seat_selection_mode = seatSelectionMode;
    if (attendanceMode !== undefined) updates.attendance_mode = attendanceMode;
    if (minFillPercent !== undefined) updates.min_fill_percent = Number(minFillPercent);
    if (maxRideTimeMins !== undefined) updates.max_ride_time_mins = Number(maxRideTimeMins);
    if (capacityBufferPercent !== undefined) updates.capacity_buffer_percent = Number(capacityBufferPercent);
    if (switchAutoApproveBelowPct !== undefined) updates.switch_auto_approve_below_pct = Number(switchAutoApproveBelowPct);
    if (updatedBy) updates.updated_by = updatedBy;

    // Upsert: update existing or insert new
    const { data: existing } = await supabaseAdmin
      .from("transport_settings")
      .select("id")
      .limit(1)
      .maybeSingle();

    let result;
    if (existing) {
      const { data, error } = await supabaseAdmin
        .from("transport_settings")
        .update(updates)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from("transport_settings")
        .insert({
          max_walk_distance_km: maxWalkDistanceKm ?? 3.0,
          auto_assignment_enabled: autoAssignmentEnabled ?? true,
          seat_selection_mode: seatSelectionMode ?? "AT_ATTENDANCE",
          attendance_mode: attendanceMode ?? "FACE_ID",
          min_fill_percent: minFillPercent ?? 60,
          max_ride_time_mins: maxRideTimeMins ?? 90,
          capacity_buffer_percent: capacityBufferPercent ?? 10,
          switch_auto_approve_below_pct: switchAutoApproveBelowPct ?? 90,
          updated_by: updatedBy,
        })
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    // Audit log
    await supabaseAdmin.from("audit_logs").insert({
      user_role: "transport_admin",
      action: "UPDATE_TRANSPORT_SETTINGS",
      entity: "TransportSettings",
      entity_id: result.id,
      reason: `Transport settings updated: max walk ${result.max_walk_distance_km}km, seat selection mode: ${result.seat_selection_mode}, attendance mode: ${result.attendance_mode}, auto-assignment: ${result.auto_assignment_enabled}`,
      new_value: result,
    });

    return NextResponse.json({
      success: true,
      settings: {
        id: result.id,
        maxWalkDistanceKm: Number(result.max_walk_distance_km),
        autoAssignmentEnabled: result.auto_assignment_enabled,
        seatSelectionMode: result.seat_selection_mode,
        attendanceMode: result.attendance_mode || "FACE_ID",
        minFillPercent: result.min_fill_percent,
        maxRideTimeMins: result.max_ride_time_mins,
        capacityBufferPercent: result.capacity_buffer_percent,
        switchAutoApproveBelowPct: result.switch_auto_approve_below_pct,
        updatedAt: result.updated_at,
        updatedBy: result.updated_by,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to update transport settings." },
      { status: 500 },
    );
  }
}
