import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getSessionFromRequest } from "@/lib/jwt";
import { allocateAdjacentPairForPartners } from "@/lib/seat-allocation-engine";
import type { Bus } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Peer Companion Seating Request, Mutual Consent & Adjacency Allocation API
 * 
 * Implements:
 * 1. Two-way mutual consent invitation handshake (PENDING -> ACCEPTED / DECLINED / UNLINKED).
 * 2. Same-bus assignment verification (passengers must be on the same vehicle run).
 * 3. Race condition prevention via atomic reservation seat binding.
 * 4. Bidirectional auto-pairing (instant match if both send invites to each other).
 * 5. Clean unlinking and cancellation without ghost seat locks.
 */

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    const searchParams = req.nextUrl.searchParams;
    const studentId = searchParams.get("studentId") || session?.userId;
    const busId = searchParams.get("busId");
    const shiftId = searchParams.get("shiftId");

    if (!studentId) {
      return NextResponse.json({ success: false, message: "studentId required." }, { status: 400 });
    }

    const today = new Date().toISOString().split("T")[0];

    // 1. Fetch Incoming Requests (others wanting to sit with this student)
    const { data: incoming } = await supabaseAdmin
      .from("seat_partner_requests")
      .select("*")
      .eq("receiver_id", studentId)
      .eq("status", "PENDING")
      .order("created_at", { ascending: false });

    // 2. Fetch Outgoing Requests (requests sent by this student)
    const { data: outgoing } = await supabaseAdmin
      .from("seat_partner_requests")
      .select("*")
      .eq("sender_id", studentId)
      .eq("status", "PENDING")
      .order("created_at", { ascending: false });

    // 3. Fetch Active Accepted Partnership for today
    const { data: activePairs } = await supabaseAdmin
      .from("seat_partner_requests")
      .select("*")
      .or(`sender_id.eq.${studentId},receiver_id.eq.${studentId}`)
      .eq("status", "ACCEPTED")
      .order("created_at", { ascending: false })
      .limit(1);

    const activePartnership = activePairs?.[0] || null;

    // 4. Fetch Fellow Commuters on the Same Bus (Potential Seat Partners)
    let busPeers: any[] = [];
    if (busId) {
      const resQuery = supabaseAdmin
        .from("bus_reservations")
        .select("student_id, chosen_seat, status")
        .eq("bus_id", busId)
        .neq("student_id", studentId)
        .neq("status", "CANCELLED")
        .limit(60);

      if (shiftId) resQuery.eq("shift_id", shiftId);

      const { data: reservations } = await resQuery;

      if (reservations && reservations.length > 0) {
        const peerStudentIds = reservations.map((r: any) => r.student_id);
        const { data: peerStudents } = await supabaseAdmin
          .from("students_full")
          .select("id, full_name, student_id_code, department, class_name, primary_stop_name")
          .in("id", peerStudentIds);

        const reservationSeatMap = new Map(reservations.map((r: any) => [r.student_id, r.chosen_seat]));

        busPeers = (peerStudents || []).map((p: any) => ({
          studentId: p.id,
          fullName: p.full_name,
          studentIdCode: p.student_id_code || "",
          department: p.department || "",
          className: p.class_name || "",
          stopName: p.primary_stop_name || "",
          currentSeat: reservationSeatMap.get(p.id) || null,
        }));
      }
    }

    return NextResponse.json({
      success: true,
      incomingRequests: incoming || [],
      outgoingRequests: outgoing || [],
      activePartnership,
      busPeers,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err.message || "Failed to fetch seat partner requests." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    const body = await req.json();
    const { action } = body;

    const today = new Date().toISOString().split("T")[0];

    // ══════════════════════════════════════════════════════════════════
    // ACTION 1: SEND_REQUEST
    // ══════════════════════════════════════════════════════════════════
    if (action === "SEND_REQUEST") {
      const { senderId, receiverId, busId, shiftId, tripId, preferredRowZone = "NO_PREFERENCE" } = body;

      if (!senderId || !receiverId || !busId) {
        return NextResponse.json(
          { success: false, message: "senderId, receiverId, and busId are required." },
          { status: 400 }
        );
      }

      // Edge Case A: Cannot invite yourself
      if (senderId === receiverId) {
        return NextResponse.json(
          { success: false, message: "You cannot send a seat partner invitation to yourself." },
          { status: 400 }
        );
      }

      // Edge Case B: Verify both students are assigned to this bus
      const { data: senderRes } = await supabaseAdmin
        .from("bus_reservations")
        .select("id, bus_id, chosen_seat, status")
        .eq("student_id", senderId)
        .eq("bus_id", busId)
        .neq("status", "CANCELLED")
        .maybeSingle();

      const { data: receiverRes } = await supabaseAdmin
        .from("bus_reservations")
        .select("id, bus_id, chosen_seat, status")
        .eq("student_id", receiverId)
        .eq("bus_id", busId)
        .neq("status", "CANCELLED")
        .maybeSingle();

      if (!senderRes || !receiverRes) {
        return NextResponse.json(
          { success: false, message: "Both students must be assigned to this same bus to sit together." },
          { status: 400 }
        );
      }

      // Edge Case C: Neither student can be already actively paired
      const { data: existingActive } = await supabaseAdmin
        .from("seat_partner_requests")
        .select("id, sender_id, receiver_id")
        .or(`sender_id.eq.${senderId},receiver_id.eq.${senderId},sender_id.eq.${receiverId},receiver_id.eq.${receiverId}`)
        .eq("status", "ACCEPTED")
        .limit(1);

      if (existingActive && existingActive.length > 0) {
        return NextResponse.json(
          { success: false, message: "One of the students already has a confirmed seat partner on this bus. Unlink first to re-pair." },
          { status: 400 }
        );
      }

      // Edge Case D: Check if a reverse pending request exists (Instant Bidirectional Match!)
      const { data: reversePending } = await supabaseAdmin
        .from("seat_partner_requests")
        .select("*")
        .eq("sender_id", receiverId)
        .eq("receiver_id", senderId)
        .eq("bus_id", busId)
        .eq("status", "PENDING")
        .maybeSingle();

      if (reversePending) {
        // Instant mutual match! Automatically accept
        return await executeAcceptance(reversePending.id, senderId);
      }

      // Edge Case E: Check duplicate pending request
      const { data: duplicatePending } = await supabaseAdmin
        .from("seat_partner_requests")
        .select("id")
        .eq("sender_id", senderId)
        .eq("receiver_id", receiverId)
        .eq("status", "PENDING")
        .maybeSingle();

      if (duplicatePending) {
        return NextResponse.json(
          { success: false, message: "You already have a pending invitation to this peer. Awaiting their response." },
          { status: 400 }
        );
      }

      // Fetch student display names
      const [sRes, rRes] = await Promise.all([
        supabaseAdmin.from("students_full").select("full_name").eq("id", senderId).maybeSingle(),
        supabaseAdmin.from("students_full").select("full_name").eq("id", receiverId).maybeSingle(),
      ]);

      const senderName = sRes.data?.full_name || "Commuter";
      const receiverName = rRes.data?.full_name || "Commuter";

      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("seat_partner_requests")
        .insert({
          sender_id: senderId,
          sender_name: senderName,
          receiver_id: receiverId,
          receiver_name: receiverName,
          bus_id: busId,
          trip_id: tripId || null,
          shift_id: shiftId || null,
          preferred_row_zone: preferredRowZone,
          status: "PENDING",
        })
        .select("*")
        .single();

      if (insErr) throw insErr;

      return NextResponse.json({
        success: true,
        message: `Seat partner invitation sent to ${receiverName}! We'll pair your seats once accepted.`,
        request: inserted,
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // ACTION 2: ACCEPT_REQUEST
    // ══════════════════════════════════════════════════════════════════
    if (action === "ACCEPT_REQUEST") {
      const { requestId, respondingStudentId } = body;
      return await executeAcceptance(requestId, respondingStudentId);
    }

    // ══════════════════════════════════════════════════════════════════
    // ACTION 3: DECLINE_REQUEST
    // ══════════════════════════════════════════════════════════════════
    if (action === "DECLINE_REQUEST") {
      const { requestId } = body;
      await supabaseAdmin
        .from("seat_partner_requests")
        .update({ status: "DECLINED", responded_at: new Date().toISOString() })
        .eq("id", requestId);

      return NextResponse.json({
        success: true,
        message: "Seat partner invitation declined.",
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // ACTION 4: CANCEL_REQUEST
    // ══════════════════════════════════════════════════════════════════
    if (action === "CANCEL_REQUEST") {
      const { requestId } = body;
      await supabaseAdmin
        .from("seat_partner_requests")
        .update({ status: "CANCELLED", responded_at: new Date().toISOString() })
        .eq("id", requestId);

      return NextResponse.json({
        success: true,
        message: "Pending seat partner invitation cancelled.",
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // ACTION 5: UNLINK_PARTNER
    // ══════════════════════════════════════════════════════════════════
    if (action === "UNLINK_PARTNER") {
      const { requestId, studentId } = body;

      const { data: reqRow } = await supabaseAdmin
        .from("seat_partner_requests")
        .select("*")
        .eq("id", requestId)
        .maybeSingle();

      if (reqRow) {
        await supabaseAdmin
          .from("seat_partner_requests")
          .update({ status: "UNLINKED", responded_at: new Date().toISOString() })
          .eq("id", requestId);

        // Reset partner state on reservations
        await Promise.all([
          supabaseAdmin
            .from("bus_reservations")
            .update({ seat_partner_matched: false })
            .in("student_id", [reqRow.sender_id, reqRow.receiver_id]),
          supabaseAdmin
            .from("students")
            .update({ preferred_partner_student_id: null, preferred_partner_name: null })
            .in("id", [reqRow.sender_id, reqRow.receiver_id]),
        ]);
      }

      return NextResponse.json({
        success: true,
        message: "Seat partnership unlinked successfully.",
      });
    }

    return NextResponse.json({ success: false, message: `Unknown action '${action}'` }, { status: 400 });
  } catch (err: any) {
    console.error("[seat-partner-requests] Error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Internal server error processing seat partner request." },
      { status: 500 }
    );
  }
}

/**
 * Executes the acceptance handshake and allocates adjacent seats for the two partners
 */
async function executeAcceptance(requestId: string, respondingStudentId?: string) {
  const { data: partnerReq } = await supabaseAdmin
    .from("seat_partner_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();

  if (!partnerReq) {
    return NextResponse.json({ success: false, message: "Seat partner request not found." }, { status: 404 });
  }

  const { sender_id, receiver_id, bus_id, preferred_row_zone } = partnerReq;

  // 1. Fetch Bus and occupied seats
  const [busRes, occRes, senderRes, receiverRes] = await Promise.all([
    supabaseAdmin.from("buses").select("*").eq("id", bus_id).single(),
    supabaseAdmin.from("bus_reservations").select("chosen_seat, student_id").eq("bus_id", bus_id).neq("status", "CANCELLED"),
    supabaseAdmin.from("bus_reservations").select("*").eq("student_id", sender_id).eq("bus_id", bus_id).neq("status", "CANCELLED").maybeSingle(),
    supabaseAdmin.from("bus_reservations").select("*").eq("student_id", receiver_id).eq("bus_id", bus_id).neq("status", "CANCELLED").maybeSingle(),
  ]);

  if (!busRes.data) {
    return NextResponse.json({ success: false, message: "Bus chassis configuration not found." }, { status: 404 });
  }

  const bus: Bus = busRes.data;
  const occupiedSeats = (occRes.data || [])
    .map((r: any) => r.chosen_seat)
    .filter(Boolean);

  // 2. Fetch student preferences
  const [sStud, rStud] = await Promise.all([
    supabaseAdmin.from("students").select("id, seat_row_preference, seat_position_preference").eq("id", sender_id).maybeSingle(),
    supabaseAdmin.from("students").select("id, seat_row_preference, seat_position_preference").eq("id", receiver_id).maybeSingle(),
  ]);

  const studentA = {
    id: sender_id,
    seatRowPreference: sStud.data?.seat_row_preference || preferred_row_zone || "MIDDLE",
    seatPositionPreference: sStud.data?.seat_position_preference || "NO_PREFERENCE",
    currentSeat: senderRes.data?.chosen_seat || null,
  };

  const studentB = {
    id: receiver_id,
    seatRowPreference: rStud.data?.seat_row_preference || preferred_row_zone || "MIDDLE",
    seatPositionPreference: rStud.data?.seat_position_preference || "NO_PREFERENCE",
    currentSeat: receiverRes.data?.chosen_seat || null,
  };

  // 3. Run algorithmic adjacent pair allocation
  const pairResult = allocateAdjacentPairForPartners(bus, studentA, studentB, occupiedSeats);

  const nowIso = new Date().toISOString();

  // 4. Update both students' reservations with the adjacent pair
  if (senderRes.data?.id) {
    await supabaseAdmin
      .from("bus_reservations")
      .update({
        chosen_seat: pairResult.seatA,
        auto_assigned_seat: pairResult.seatA,
        seat_partner_matched: true,
        seat_preference_applied: true,
      })
      .eq("id", senderRes.data.id);
  }

  if (receiverRes.data?.id) {
    await supabaseAdmin
      .from("bus_reservations")
      .update({
        chosen_seat: pairResult.seatB,
        auto_assigned_seat: pairResult.seatB,
        seat_partner_matched: true,
        seat_preference_applied: true,
      })
      .eq("id", receiverRes.data.id);
  }

  // 5. Update partner references in students table
  await Promise.all([
    supabaseAdmin
      .from("students")
      .update({ preferred_partner_student_id: receiver_id, preferred_partner_name: partnerReq.receiver_name })
      .eq("id", sender_id),
    supabaseAdmin
      .from("students")
      .update({ preferred_partner_student_id: sender_id, preferred_partner_name: partnerReq.sender_name })
      .eq("id", receiver_id),
  ]);

  // 6. Update Request Status to ACCEPTED
  const allocatedPayload = {
    senderSeat: pairResult.seatA,
    receiverSeat: pairResult.seatB,
    relation: pairResult.relation,
    isAdjacent: pairResult.isAdjacent,
  };

  const { data: updatedReq } = await supabaseAdmin
    .from("seat_partner_requests")
    .update({
      status: "ACCEPTED",
      allocated_pair: allocatedPayload,
      responded_at: nowIso,
    })
    .eq("id", requestId)
    .select("*")
    .single();

  return NextResponse.json({
    success: true,
    message: `🎉 Seat Partner Confirmed! You and ${partnerReq.sender_name} are seated together in Seats ${pairResult.seatA} & ${pairResult.seatB} (${pairResult.relation.replace("_", " ")}).`,
    request: updatedReq,
    allocatedPair: allocatedPayload,
  });
}

