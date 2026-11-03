import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getSessionFromRequest } from "@/lib/jwt";
import { allocateSeatWithPreferences } from "@/lib/seat-allocation-engine";
import type { Bus } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Commuter Seat Preferences & Auto-Allocation Engine API
 * 
 * Supports:
 * - Row Zone: FRONT, MIDDLE, BACK, NO_PREFERENCE
 * - Position: WINDOW, AISLE, NO_PREFERENCE
 * - Companion / Partner binding
 * - Instant recalculation & auto-assignment for today's active bus run
 */

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    const studentId = req.nextUrl.searchParams.get("studentId") || session?.userId;

    if (!studentId) {
      return NextResponse.json({ success: false, message: "studentId required." }, { status: 400 });
    }

    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id, seat_row_preference, seat_position_preference, preferred_partner_student_id, preferred_partner_name")
      .or(`id.eq.${studentId},user_id.eq.${studentId}`)
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
    const studentId = body.studentId || session?.userId;

    if (!studentId) {
      return NextResponse.json({ success: false, message: "studentId required." }, { status: 400 });
    }

    const {
      rowPreference = "NO_PREFERENCE",
      positionPreference = "NO_PREFERENCE",
      partnerStudentId = null,
      partnerName = null,
    } = body;

    // 1. Update preferences in students table
    await supabaseAdmin
      .from("students")
      .update({
        seat_row_preference: rowPreference,
        seat_position_preference: positionPreference,
        preferred_partner_student_id: partnerStudentId,
        preferred_partner_name: partnerName,
      })
      .or(`id.eq.${studentId},user_id.eq.${studentId}`);

    // 2. Check if student has an active reservation for today to auto-assign seat
    const today = new Date().toISOString().split("T")[0];
    const { data: reservation } = await supabaseAdmin
      .from("bus_reservations")
      .select("*")
      .eq("student_id", studentId)
      .neq("status", "CANCELLED")
      .neq("status", "BOARDED")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let allocationResult = null;

    if (reservation?.bus_id) {
      const [busRes, occRes, allRes] = await Promise.all([
        supabaseAdmin.from("buses").select("*").eq("id", reservation.bus_id).maybeSingle(),
        supabaseAdmin.from("bus_reservations").select("chosen_seat").eq("bus_id", reservation.bus_id).neq("id", reservation.id).neq("status", "CANCELLED"),
        supabaseAdmin.from("bus_reservations").select("student_id, chosen_seat, status").eq("bus_id", reservation.bus_id).neq("status", "CANCELLED"),
      ]);

      if (busRes.data) {
        const bus: Bus = busRes.data;
        const occupiedSeats = (occRes.data || []).map((r: any) => r.chosen_seat).filter(Boolean);

        allocationResult = allocateSeatWithPreferences({
          bus,
          student: {
            id: studentId,
            seatRowPreference: rowPreference,
            seatPositionPreference: positionPreference,
            preferredPartnerStudentId: partnerStudentId,
            preferredPartnerName: partnerName,
          },
          occupiedSeats,
          allTripReservations: allRes.data || [],
        });

        // Update reservation with auto-assigned seat
        if (allocationResult?.allocatedSeat) {
          await supabaseAdmin
            .from("bus_reservations")
            .update({
              auto_assigned_seat: allocationResult.allocatedSeat,
              // If student hadn't locked a custom chosen seat, update chosen_seat directly
              chosen_seat: reservation.chosen_seat || allocationResult.allocatedSeat,
              seat_preference_applied: true,
            })
            .eq("id", reservation.id);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Seat preferences saved successfully!",
      preferences: {
        rowPreference,
        positionPreference,
        partnerStudentId,
        partnerName,
      },
      allocationResult,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message || "Failed to update seat preferences." },
      { status: 500 }
    );
  }
}

