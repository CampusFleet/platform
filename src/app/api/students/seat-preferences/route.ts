import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getSessionFromRequest } from "@/lib/jwt";
import { resolveStudentScope } from "@/lib/security/student-scope";

export const dynamic = "force-dynamic";

/**
 * Commuter Seat Preferences & Auto-Allocation Engine API
 * 
 * Supports:
 * - Row Zone: FRONT, MIDDLE, BACK, NO_PREFERENCE
 * - Position: WINDOW, AISLE, NO_PREFERENCE
 * - Companion / Partner binding
 * Preferences are used by the boarding chart (lib/students/seating.ts); seats already assigned are not moved.
 */

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    const scope = await resolveStudentScope(session, req.nextUrl.searchParams.get("studentId"));
    if (!scope.ok) {
      return NextResponse.json({ success: false, message: scope.error }, { status: scope.status });
    }

    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id, seat_row_preference, seat_position_preference, preferred_partner_student_id, preferred_partner_name")
      .eq("id", scope.studentId)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      preferences: {
        rowPreference: student?.seat_row_preference || "NO_PREFERENCE",
        positionPreference: student?.seat_position_preference || "NO_PREFERENCE",
        partnerStudentId: student?.preferred_partner_student_id || null,
        partnerName: student?.preferred_partner_name || null,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message || "Failed to fetch seat preferences." },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    const body = await req.json();
    const scope = await resolveStudentScope(session, body.studentId);
    if (!scope.ok) {
      return NextResponse.json({ success: false, message: scope.error }, { status: scope.status });
    }
    const studentId = scope.studentId;

    const {
      rowPreference = "NO_PREFERENCE",
      positionPreference = "NO_PREFERENCE",
    } = body;

    // 1. Update preferences in students table
    await supabaseAdmin
      .from("students")
      .update({
        seat_row_preference: rowPreference,
        seat_position_preference: positionPreference,
      })
      .eq("id", studentId);

    return NextResponse.json({
      success: true,
      message: "Saved. The boarding chart uses these when it assigns your next seat.",
      preferences: {
        rowPreference,
        positionPreference,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message || "Failed to update seat preferences." },
      { status: 500 }
    );
  }
}

