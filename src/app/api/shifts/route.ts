import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getSession } from "@/lib/jwt";
import type { Shift, ShiftType } from "@/lib/types";

import { cacheGet, cacheSet, cacheDel } from "@/lib/redis";
import { applyShiftChangeEffects, checkShiftChange, deleteOrRetireShift, type ShiftRow } from "@/lib/shifts/changes";

export const dynamic = "force-dynamic";

/**
 * GET /api/shifts
 * Fetches all fleet dispatch shifts from PostgreSQL (Cached in Redis)
 */
export async function GET(req: NextRequest) {
  try {
    const CACHE_KEY = "api:shifts:all";
    const cachedShifts = await cacheGet<Shift[]>(CACHE_KEY);
    
    if (cachedShifts) {
      return NextResponse.json({ success: true, shifts: cachedShifts });
    }

    const { data: dbShifts, error } = await supabaseAdmin
      .from("shifts")
      .select("*")
      .order("start_time", { ascending: true });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const shifts: Shift[] = (dbShifts || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      shiftType: (s.type || "NONE") as ShiftType,
      direction: s.direction || "NONE",
      startTime: s.start_time ? s.start_time.substring(0, 5) : "",
      endTime: s.end_time ? s.end_time.substring(0, 5) : "",
      bookingCutoffMins: Number(s.booking_cutoff_minutes || 0),
      isSpecial: Boolean(
        s.is_special ||
        s.type === "CUSTOM" ||
        s.name?.toLowerCase().includes("placement") ||
        s.name?.toLowerCase().includes("conclave")
      ),
      isPlacement: Boolean(s.name?.toLowerCase().includes("placement")),
    }));

    // Cache in Redis for 5 minutes (300 seconds)
    await cacheSet(CACHE_KEY, shifts, 300);

    return NextResponse.json({ success: true, shifts });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

const ALLOWED_SHIFT_ADMIN_ROLES = ["admin", "transport_admin", "transport_manager"];

function sanitizeTimeString(timeStr?: string): string | undefined {
  if (!timeStr) return undefined;
  const clean = timeStr.trim();
  const isPM = /pm/i.test(clean);
  const isAM = /am/i.test(clean);
  const numericPart = clean.replace(/[^\d:]/g, "");
  const parts = numericPart.split(":");
  if (parts.length >= 2) {
    let h = parseInt(parts[0], 10);
    const m = parts[1].padStart(2, "0");
    const s = (parts[2] || "00").substring(0, 2).padStart(2, "0");
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${m}:${s}`;
  }
  return clean.length === 5 ? `${clean}:00` : clean;
}

/**
 * POST /api/shifts
 * Admin creates a new shift in the database
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !ALLOWED_SHIFT_ADMIN_ROLES.includes(session.role?.toLowerCase())) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Admin privileges required." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      id,
      name,
      shiftType = "MORNING",
      startTime,
      endTime,
      bookingCutoffMins = 30,
      direction = "HOME_TO_CAMPUS",
      isSpecial = false,
    } = body;

    if (!name || !startTime || !endTime) {
      return NextResponse.json(
        { success: false, error: "Name, start time, and end time are required." },
        { status: 400 }
      );
    }

    const shiftId = id || `shift-${Date.now()}`;

    const { data, error } = await supabaseAdmin
      .from("shifts")
      .insert({
        id: shiftId,
        name,
        type: shiftType,
        start_time: sanitizeTimeString(startTime),
        end_time: sanitizeTimeString(endTime),
        booking_cutoff_minutes: Number(bookingCutoffMins),
        direction: direction,
        is_special: Boolean(isSpecial),
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Invalidate cache
    await cacheDel("api:shifts:all");

    return NextResponse.json({
      success: true,
      shift: {
        id: data.id,
        name: data.name,
        shiftType: data.type,
        startTime: (data.start_time || "").substring(0, 5),
        endTime: (data.end_time || "").substring(0, 5),
        bookingCutoffMins: data.booking_cutoff_minutes,
        direction: data.direction,
        isSpecial: data.is_special,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * PUT /api/shifts
 * Admin updates an existing shift
 */
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !ALLOWED_SHIFT_ADMIN_ROLES.includes(session.role?.toLowerCase())) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Admin privileges required." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { id, name, shiftType, startTime, endTime, bookingCutoffMins, direction, isSpecial, isActive } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "Shift ID is required." }, { status: 400 });
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (shiftType !== undefined) updates.type = shiftType;
    if (startTime !== undefined) updates.start_time = sanitizeTimeString(startTime);
    if (endTime !== undefined) updates.end_time = sanitizeTimeString(endTime);
    if (bookingCutoffMins !== undefined) updates.booking_cutoff_minutes = Number(bookingCutoffMins);
    if (direction !== undefined) updates.direction = direction;
    if (isSpecial !== undefined) updates.is_special = Boolean(isSpecial);
    if (isActive !== undefined) updates.is_active = Boolean(isActive);

    // Same-day effects: some changes are refused while today's runs are under way.
    const { data: old } = await supabaseAdmin
      .from("shifts")
      .select("id, name, start_time, end_time, booking_cutoff_minutes, direction, is_active")
      .eq("id", id)
      .maybeSingle();
    if (!old) return NextResponse.json({ success: false, error: "Shift not found." }, { status: 404 });
    const blocked = await checkShiftChange(old as ShiftRow, updates);
    if (blocked) return NextResponse.json({ success: false, error: blocked }, { status: 409 });

    const { data, error } = await supabaseAdmin
      .from("shifts")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Invalidate cache
    await cacheDel("api:shifts:all");
    const effects = await applyShiftChangeEffects(old as ShiftRow, data as ShiftRow, { userId: session.userId, role: session.role }).catch((e) => {
      console.error("[shifts] same-day effects:", e?.message);
      return null;
    });

    return NextResponse.json({
      success: true,
      shift: {
        id: data.id,
        name: data.name,
        shiftType: data.type,
        startTime: (data.start_time || "").substring(0, 5),
        endTime: (data.end_time || "").substring(0, 5),
        bookingCutoffMins: data.booking_cutoff_minutes,
        isSpecial: data.is_special,
      },
      effects,
      ...(effects?.overlappingBuses.length
        ? { warning: `Bus ${effects.overlappingBuses.join(", ")} now has overlapping runs today. Re-assign on the dispatch board.` }
        : {}),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/shifts
 * Admin deletes a shift
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !ALLOWED_SHIFT_ADMIN_ROLES.includes(session.role?.toLowerCase())) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Admin privileges required." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Shift ID is required." }, { status: 400 });
    }

    // A shift used by past trips is retired, never deleted (that would blank it on their history).
    const result = await deleteOrRetireShift(id);
    if ("error" in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: 409 });
    }

    // Invalidate cache
    await cacheDel("api:shifts:all");

    return NextResponse.json({
      success: true,
      ...result,
      message: result.retired ? "This shift has past trips, so it was switched off instead of deleted." : "Shift deleted.",
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
