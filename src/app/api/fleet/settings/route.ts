import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getSessionFromRequest } from "@/lib/jwt";
import { invalidateAttendancePolicy } from "@/lib/attendance/server-policy";

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
    const defaultLocks = {
      faceId: true,
      dynamicQr: true,
      rfid: true,
      staticQr: true,
    };

    const resolvedLocks = data?.validation_locks && typeof data.validation_locks === "object"
      ? {
          faceId: Boolean(data.validation_locks.faceId),
          dynamicQr: Boolean(data.validation_locks.dynamicQr),
          rfid: Boolean(data.validation_locks.rfid),
          staticQr: Boolean(data.validation_locks.staticQr),
        }
      : defaultLocks;

    const settings = data
      ? {
          id: data.id,
          maxWalkDistanceKm: Number(data.max_walk_distance_km),
          autoAssignmentEnabled: data.auto_assignment_enabled,
          seatSelectionMode: data.seat_selection_mode,
          attendanceMode: data.attendance_mode || "ALL",
          validationLocks: resolvedLocks,
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
          attendanceMode: "ALL",
          validationLocks: defaultLocks,
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
      validationLocks,
      minFillPercent,
      maxRideTimeMins,
      capacityBufferPercent,
      switchAutoApproveBelowPct,
    } = body;

    // 1. Resolve and validate updater user ID against public.users
    let validUserId: string | null = null;
    const session = await getSessionFromRequest(req);
    // Actor comes from the session only (never from the request body).
    const candidateUserId = session?.userId || null;

    if (candidateUserId) {
      const { data: userExists } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("id", candidateUserId)
        .maybeSingle();
      if (userExists?.id) {
        validUserId = userExists.id;
      }
    }

    // Build update payload (only include fields that were sent)
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (maxWalkDistanceKm !== undefined) updates.max_walk_distance_km = Number(maxWalkDistanceKm);
    if (autoAssignmentEnabled !== undefined) updates.auto_assignment_enabled = Boolean(autoAssignmentEnabled);
    if (seatSelectionMode !== undefined) updates.seat_selection_mode = seatSelectionMode;
    
    // Process validation locks
    if (validationLocks && typeof validationLocks === "object") {
      const activeLocksCount = [
        Boolean(validationLocks.faceId),
        Boolean(validationLocks.dynamicQr),
        Boolean(validationLocks.rfid),
        Boolean(validationLocks.staticQr),
      ].filter(Boolean).length;

      if (activeLocksCount === 0) {
        return NextResponse.json(
          { success: false, message: "At least one gate validation lock must remain active." },
          { status: 400 },
        );
      }

      const cleanLocks = {
        faceId: Boolean(validationLocks.faceId),
        dynamicQr: Boolean(validationLocks.dynamicQr),
        rfid: Boolean(validationLocks.rfid),
        staticQr: Boolean(validationLocks.staticQr),
      };

      updates.validation_locks = cleanLocks;

      // Compute attendance_mode compatible with DB CHECK constraint:
      // ('FACE_ID', 'DYNAMIC_QR', 'RFID', 'STATIC_QR', 'ALL')
      if (activeLocksCount > 1) {
        updates.attendance_mode = "ALL";
      } else if (cleanLocks.faceId) {
        updates.attendance_mode = "FACE_ID";
      } else if (cleanLocks.dynamicQr) {
        updates.attendance_mode = "DYNAMIC_QR";
      } else if (cleanLocks.rfid) {
        updates.attendance_mode = "RFID";
      } else if (cleanLocks.staticQr) {
        updates.attendance_mode = "STATIC_QR";
      }
    } else if (attendanceMode !== undefined) {
      updates.attendance_mode = attendanceMode;
      // Derive locks from legacy mode
      if (attendanceMode === "ALL") {
        updates.validation_locks = { faceId: true, dynamicQr: true, rfid: true, staticQr: true };
      } else {
        updates.validation_locks = {
          faceId: attendanceMode === "FACE_ID",
          dynamicQr: attendanceMode === "DYNAMIC_QR",
          rfid: attendanceMode === "RFID",
          staticQr: attendanceMode === "STATIC_QR",
        };
      }
    }

    if (minFillPercent !== undefined) updates.min_fill_percent = Number(minFillPercent);
    if (maxRideTimeMins !== undefined) updates.max_ride_time_mins = Number(maxRideTimeMins);
    if (capacityBufferPercent !== undefined) updates.capacity_buffer_percent = Number(capacityBufferPercent);
    if (switchAutoApproveBelowPct !== undefined) updates.switch_auto_approve_below_pct = Number(switchAutoApproveBelowPct);
    if (validUserId !== null) {
      updates.updated_by = validUserId;
    }

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
          attendance_mode: updates.attendance_mode ?? "ALL",
          validation_locks: updates.validation_locks ?? { faceId: true, dynamicQr: true, rfid: true, staticQr: true },
          min_fill_percent: minFillPercent ?? 60,
          max_ride_time_mins: maxRideTimeMins ?? 90,
          capacity_buffer_percent: capacityBufferPercent ?? 10,
          switch_auto_approve_below_pct: switchAutoApproveBelowPct ?? 90,
          updated_by: validUserId,
        })
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    await invalidateAttendancePolicy();

    // Audit log
    await supabaseAdmin.from("audit_logs").insert({
      user_id: validUserId,
      user_role: session?.role || "transport_admin",
      action: "UPDATE_TRANSPORT_SETTINGS",
      entity: "TransportSettings",
      entity_id: result.id,
      reason: `Transport settings updated: validation locks: ${JSON.stringify(result.validation_locks)}, max walk ${result.max_walk_distance_km}km, seat selection: ${result.seat_selection_mode}, attendance mode: ${result.attendance_mode}`,
      new_value: result,
    });

    return NextResponse.json({
      success: true,
      settings: {
        id: result.id,
        maxWalkDistanceKm: Number(result.max_walk_distance_km),
        autoAssignmentEnabled: result.auto_assignment_enabled,
        seatSelectionMode: result.seat_selection_mode,
        attendanceMode: result.attendance_mode || "ALL",
        validationLocks: result.validation_locks || { faceId: true, dynamicQr: true, rfid: true, staticQr: true },
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
