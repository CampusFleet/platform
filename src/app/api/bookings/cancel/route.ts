import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getSessionFromRequest } from "@/lib/jwt";

// POST /api/bookings/cancel
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Authentication required to cancel booking." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { bookingId, studentId, reason = "Commuter voluntary cancellation" } = body;

    if (!bookingId) {
      return NextResponse.json({ success: false, error: "bookingId is required." }, { status: 400 });
    }

    // 1. Fetch the target booking
    const { data: booking, error: fetchErr } = await supabaseAdmin
      .from("bus_reservations")
      .select("*, trips(*, buses(*))")
      .eq("id", bookingId)
      .single();

    if (fetchErr || !booking) {
      return NextResponse.json({ success: false, error: "Booking not found." }, { status: 404 });
    }

    // 1b. Cloudflare Security Audit: Booking Ownership Check
    const isStaffOrAdmin = ["admin", "transport_admin", "transport_manager"].includes(session.role);
    if (!isStaffOrAdmin) {
      const isDirectMatch =
        booking.student_id === session.userId ||
        booking.student_id === session.studentId ||
        booking.student_id === `stud-${session.userId}`;

      if (!isDirectMatch) {
        const { data: studentCheck } = await supabaseAdmin
          .from("students")
          .select("id, user_id")
          .eq("id", booking.student_id)
          .maybeSingle();

        if (!studentCheck || studentCheck.user_id !== session.userId) {
          return NextResponse.json(
            { success: false, error: "Unauthorized: You can only cancel your own bookings." },
            { status: 403 }
          );
        }
      }
    }

    if (booking.status === "CANCELLED") {
      return NextResponse.json({ success: true, message: "Booking was already cancelled." });
    }

    const now = new Date().toISOString();

    // 2. Mark as CANCELLED
    const { error: cancelErr } = await supabaseAdmin
      .from("bus_reservations")
      .update({
        status: "CANCELLED",
        cancelled_at: now,
      })
      .eq("id", bookingId);

    if (cancelErr) {
      return NextResponse.json({ success: false, error: cancelErr.message }, { status: 500 });
    }

    // 3. Promote standby / waitlisted passenger if any
    let promotedPassenger: any = null;
    const seatToFree = booking.chosen_seat || booking.seat_number;
    if (seatToFree) {
      const { data: waitlist } = await supabaseAdmin
        .from("bus_reservations")
        .select("*")
        .eq("trip_id", booking.trip_id)
        .eq("status", "WAITLISTED")
        .order("created_at", { ascending: true })
        .limit(1);

      if (waitlist && waitlist.length > 0) {
        const topStandby = waitlist[0];
        await supabaseAdmin
          .from("bus_reservations")
          .update({
            status: "CONFIRMED",
            chosen_seat: seatToFree,
          })
          .eq("id", topStandby.id);

        promotedPassenger = topStandby;

        // Notify promoted passenger
        try {
          await supabaseAdmin.from("notifications").insert({
            user_id: topStandby.student_id,
            title: "Standby Promoted to Confirmed Seat! 🎉",
            message: `A seat opened up on your trip! Seat ${booking.seat_number} has been assigned to you.`,
            type: "CONFIRMATION",
            is_read: false,
          });
        } catch {}
      }
    }

    // 4. Log audit entry
    try {
      await supabaseAdmin.from("audit_logs").insert({
        user_id: studentId || booking.student_id,
        user_role: "student",
        action: "BOOKING_CANCELLED",
        entity: "Booking",
        entity_id: bookingId,
        details: {
          bookingCode: booking.booking_code,
          seatNumber: booking.seat_number,
          reason,
          promotedBookingId: promotedPassenger?.id || null,
        },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: "Seat reservation cancelled successfully. The seat has been released back to available inventory.",
      cancelledBookingId: bookingId,
      promotedBookingId: promotedPassenger?.id || null,
    });
  } catch (err: any) {
    console.error("Cancel booking API error:", err);
    return NextResponse.json({ success: false, error: err?.message || "Internal server error" }, { status: 500 });
  }
}
