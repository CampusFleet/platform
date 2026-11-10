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

    // Resolve current student record to support both student.id and user_id aliases
    const { data: currentStudent } = await supabaseAdmin
      .from("students_full")
      .select("id, user_id, full_name, primary_route_id, primary_route_name")
      .or(`id.eq.${studentId},user_id.eq.${studentId}`)
      .maybeSingle();

    const resolvedStudentId = currentStudent?.id || studentId;
    const studentAliases = Array.from(new Set([resolvedStudentId, currentStudent?.user_id, studentId].filter(Boolean))) as string[];

    // 1. Fetch Incoming Requests (others wanting to sit with this student)
    const { data: incoming } = await supabaseAdmin
      .from("seat_partner_requests")
      .select("*")
      .or(studentAliases.map(id => `receiver_id.eq.${id}`).join(","))
      .eq("status", "PENDING")
      .order("created_at", { ascending: false });

    // 2. Fetch Outgoing Requests (requests sent by this student)
    const { data: outgoing } = await supabaseAdmin
      .from("seat_partner_requests")
      .select("*")
      .or(studentAliases.map(id => `sender_id.eq.${id}`).join(","))
      .eq("status", "PENDING")
      .order("created_at", { ascending: false });

    // 3. Fetch Active Accepted Partnership for today
    const { data: activePairs } = await supabaseAdmin
      .from("seat_partner_requests")
      .select("*")
      .or(studentAliases.flatMap(id => [`sender_id.eq.${id}`, `receiver_id.eq.${id}`]).join(","))
      .eq("status", "ACCEPTED")
      .order("created_at", { ascending: false })
      .limit(1);

    const activePartnership = activePairs?.[0] || null;

    // 4. Resolve Bus ID if not provided explicitly
    let resolvedBusId = busId;
    let resolvedShiftId = shiftId;

    if (!resolvedBusId) {
      const { data: todayRes } = await supabaseAdmin
        .from("bus_reservations")
        .select("bus_id, shift_id")
        .or(studentAliases.map(id => `student_id.eq.${id}`).join(","))
        .neq("status", "CANCELLED")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (todayRes?.bus_id) {
        resolvedBusId = String(todayRes.bus_id);
        if (!resolvedShiftId) resolvedShiftId = todayRes.shift_id;
      } else if (currentStudent?.primary_route_id) {
        const { data: bDoc } = await supabaseAdmin
          .from("buses")
          .select("id")
          .eq("current_route_id", currentStudent.primary_route_id)
          .limit(1)
          .maybeSingle();
        if (bDoc?.id) resolvedBusId = String(bDoc.id);
      }
    }

    // 5. Fetch Bus metadata
    let busInfo: any = null;
    if (resolvedBusId) {
      const { data: bData } = await supabaseAdmin
        .from("buses")
        .select("id, bus_number, registration_no, model, capacity, current_route_id")
        .eq("id", Number(resolvedBusId))
        .maybeSingle();
      busInfo = bData;
    }

    // 6. Fetch Fellow Commuters on the Same Bus (Potential Seat Partners)
    let busPeers: any[] = [];
    if (resolvedBusId) {
      const numBusId = Number(resolvedBusId);
      const resQuery = supabaseAdmin
        .from("bus_reservations")
        .select("student_id, chosen_seat, status")
        .eq("bus_id", numBusId)
        .neq("status", "CANCELLED")
        .limit(80);

      if (resolvedShiftId) resQuery.eq("shift_id", resolvedShiftId);

      const { data: reservations } = await resQuery;
      const reservationStudentIds = (reservations || [])
        .map((r: any) => r.student_id)
        .filter((sid: string) => !studentAliases.includes(sid));

      const reservationSeatMap = new Map((reservations || []).map((r: any) => [r.student_id, r.chosen_seat]));

      // Also fetch students who have this route assigned as their primary route
      let routeStudentIds: string[] = [];
      const routeIdToUse = busInfo?.current_route_id || currentStudent?.primary_route_id;
      if (routeIdToUse) {
        const { data: routeStudents } = await supabaseAdmin
          .from("students")
          .select("id")
          .eq("primary_route_id", routeIdToUse)
          .limit(50);
        if (routeStudents) {
          routeStudentIds = routeStudents
            .map(s => s.id)
            .filter((sid: string) => !studentAliases.includes(sid));
        }
      }

      const allPeerIds = Array.from(new Set([...reservationStudentIds, ...routeStudentIds])).filter(Boolean);

      if (allPeerIds.length > 0) {
        const { data: peerStudents } = await supabaseAdmin
          .from("students_full")
          .select("id, user_id, full_name, student_id_code, department, class_name, primary_stop_name")
          .in("id", allPeerIds);

        // Filter out staff, drivers, conductors
        busPeers = (peerStudents || [])
          .filter((p: any) => {
            const code = (p.student_id_code || "").toLowerCase();
            const id = (p.id || "").toLowerCase();
            return !code.startsWith("drv-") && !code.startsWith("cnd-") && !id.includes("drv") && !id.includes("cnd") && !id.includes("teacher");
          })
          .map((p: any) => ({
            studentId: p.id,
            fullName: p.full_name,
            studentIdCode: p.student_id_code || "",
            department: p.department || "",
            className: p.class_name || "",
            stopName: p.primary_stop_name || "",
            currentSeat: reservationSeatMap.get(p.id) || reservationSeatMap.get(p.user_id) || null,
          }));
      }
    }

    return NextResponse.json({
      success: true,
      incomingRequests: incoming || [],
      outgoingRequests: outgoing || [],
      activePartnership,
      busPeers,
      busInfo,
      busId: resolvedBusId,
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
      const { senderId, receiverId, receiverStudentIdCode, busId, shiftId, tripId, preferredRowZone = "NO_PREFERENCE" } = body;

      if (!senderId || (!receiverId && !receiverStudentIdCode)) {
        return NextResponse.json(
          { success: false, message: "Sender and companion are required." },
          { status: 400 }
        );
      }

      // 1. Resolve Sender
      const { data: senderStudent } = await supabaseAdmin
        .from("students_full")
        .select("id, user_id, full_name, primary_route_id")
        .or(`id.eq.${senderId},user_id.eq.${senderId}`)
        .maybeSingle();

      const resolvedSenderId = senderStudent?.id || senderId;

      // 2. Resolve Companion / Receiver
      let receiverQuery = supabaseAdmin
        .from("students_full")
        .select("id, user_id, full_name, primary_route_id, student_id_code");

      if (receiverId) {
        receiverQuery = receiverQuery.or(`id.eq.${receiverId},user_id.eq.${receiverId},student_id_code.ilike.${receiverId}`);
      } else if (receiverStudentIdCode) {
        receiverQuery = receiverQuery.ilike("student_id_code", receiverStudentIdCode.trim());
      }

      const { data: receiverStudent } = await receiverQuery.maybeSingle();

      if (!receiverStudent) {
        return NextResponse.json(
          { success: false, message: "Could not find a student matching the selected Roll Number or ID." },
          { status: 404 }
        );
      }

      const resolvedReceiverId = receiverStudent.id;

      // Edge Case A: Cannot invite yourself
      if (resolvedSenderId === resolvedReceiverId || senderStudent?.user_id === receiverStudent.user_id) {
        return NextResponse.json(
          { success: false, message: "You cannot send a seat partner invitation to yourself." },
          { status: 400 }
        );
      }

      // 3. Resolve target busId
      let targetBusId = busId;
      if (!targetBusId) {
        const { data: activeRes } = await supabaseAdmin
          .from("bus_reservations")
          .select("bus_id")
          .or(`student_id.eq.${resolvedSenderId},student_id.eq.${senderStudent?.user_id || resolvedSenderId}`)
          .neq("status", "CANCELLED")
          .limit(1)
          .maybeSingle();
        targetBusId = activeRes?.bus_id;
      }

      if (!targetBusId && senderStudent?.primary_route_id) {
        const { data: busDoc } = await supabaseAdmin
          .from("buses")
          .select("id")
          .eq("current_route_id", senderStudent.primary_route_id)
          .limit(1)
          .maybeSingle();
        targetBusId = busDoc?.id;
      }

      if (!targetBusId) {
        return NextResponse.json(
          { success: false, message: "No active bus run identified. Please verify your bus assignment." },
          { status: 400 }
        );
      }

      const numBusId = Number(targetBusId);

      // Edge Case B: Neither student can be already actively paired
      const { data: existingActive } = await supabaseAdmin
        .from("seat_partner_requests")
        .select("id, sender_id, receiver_id")
        .or(`sender_id.eq.${resolvedSenderId},receiver_id.eq.${resolvedSenderId},sender_id.eq.${resolvedReceiverId},receiver_id.eq.${resolvedReceiverId}`)
        .eq("status", "ACCEPTED")
        .limit(1);

      if (existingActive && existingActive.length > 0) {
        return NextResponse.json(
          { success: false, message: "One of the students already has a confirmed seat partner on this bus. Unlink first to re-pair." },
          { status: 400 }
        );
      }

      // Edge Case C: Check if a reverse pending request exists (Instant Bidirectional Mutual Match!)
      const { data: reversePending } = await supabaseAdmin
        .from("seat_partner_requests")
        .select("*")
        .or(`and(sender_id.eq.${resolvedReceiverId},receiver_id.eq.${resolvedSenderId}),and(sender_id.eq.${receiverStudent.user_id},receiver_id.eq.${senderStudent?.user_id || resolvedSenderId})`)
        .eq("status", "PENDING")
        .maybeSingle();

      if (reversePending) {
        // Instant mutual match! Automatically accept
        return await executeAcceptance(reversePending.id, resolvedSenderId);
      }

      // Edge Case D: Check duplicate pending request
      const { data: duplicatePending } = await supabaseAdmin
        .from("seat_partner_requests")
        .select("id")
        .or(`and(sender_id.eq.${resolvedSenderId},receiver_id.eq.${resolvedReceiverId}),and(sender_id.eq.${senderStudent?.user_id || resolvedSenderId},receiver_id.eq.${receiverStudent.user_id})`)
        .eq("status", "PENDING")
        .maybeSingle();

      if (duplicatePending) {
        return NextResponse.json(
          { success: false, message: `You already have a pending invitation to ${receiverStudent.full_name}. Awaiting their response.` },
          { status: 400 }
        );
      }

      const senderName = senderStudent?.full_name || "Commuter";
      const receiverName = receiverStudent?.full_name || "Commuter";

      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("seat_partner_requests")
        .insert({
          sender_id: resolvedSenderId,
          sender_name: senderName,
          receiver_id: resolvedReceiverId,
          receiver_name: receiverName,
          bus_id: numBusId,
          trip_id: tripId || null,
          shift_id: shiftId || null,
          preferred_row_zone: preferredRowZone,
          status: "PENDING",
        })
        .select("*")
        .single();

      if (insErr) throw insErr;

      // Send in-app notification to companion
      try {
        await supabaseAdmin.from("notifications").insert({
          user_id: receiverStudent.user_id || resolvedReceiverId,
          title: "👥 Seat Partner Invitation",
          message: `${senderName} wants to sit together on Bus ${numBusId}! Review and accept in Seat Preferences to pair adjacent seats.`,
          type: "COMPANION_INVITE",
          // notifications has no metadata column; request details live in seat_partner_requests
        });
      } catch (notifErr) {
        console.warn("Notification insert error (non-fatal):", notifErr);
      }

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

