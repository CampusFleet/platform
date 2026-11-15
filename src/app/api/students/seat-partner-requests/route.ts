import { NextRequest, NextResponse } from "next/server";
import { resolveActingStudentId } from "@/lib/security/actor";
import { isSafeId } from "@/lib/security/safe-id";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getSessionFromRequest } from "@/lib/jwt";

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
    if (!session) return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    const searchParams = req.nextUrl.searchParams;
    // Identity from the session only; staff may name a student.
    const studentId = (await resolveActingStudentId(session, searchParams.get("studentId"))).studentId || session.userId;
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

    // Other students on the bus are not listed (privacy); partners are invited by university ID.
    const busPeers: never[] = [];
    // Classmates who can be chosen as seat partner: paying students on the same route (same bus).
    const myRoute = await routeOfStudent(resolvedStudentId);
    let classmates: { id: string; name: string; className: string | null }[] = [];
    if (myRoute) {
      const { data: rows } = await supabaseAdmin
        .from("students_full")
        .select("id, full_name, class_name, has_active_subscription, payment_status, transport_access_suspended")
        .eq("primary_route_id", myRoute)
        .neq("id", resolvedStudentId)
        .order("full_name")
        .limit(300);
      classmates = (rows || [])
        .filter((r: any) => !r.transport_access_suspended && (r.has_active_subscription || r.payment_status === "APPROVED" || r.payment_status === "COMPLETED"))
        .map((r: any) => ({ id: r.id, name: r.full_name || "Student", className: r.class_name || null }));
    }
    return NextResponse.json({
      success: true,
      incomingRequests: incoming || [],
      outgoingRequests: outgoing || [],
      activePartnership,
      busPeers,
      classmates,
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
    if (!session) return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    const body = await req.json();
    const { action } = body;
    const acting = await resolveActingStudentId(session, body.senderId || body.studentId || body.respondingStudentId);
    const me = acting.studentId;
    if (!me) return NextResponse.json({ success: false, message: "No student profile for this account." }, { status: 404 });
    // Request-id actions: the caller must be the right side of the request (staff may act on any).
    const requestFor = async (requestId: unknown, side: "sender" | "receiver" | "either") => {
      if (!isSafeId(requestId)) return null;
      const { data } = await supabaseAdmin.from("seat_partner_requests").select("sender_id, receiver_id").eq("id", requestId as string).maybeSingle();
      if (!data) return null;
      if (acting.isStaff) return data;
      const ok = side === "sender" ? data.sender_id === me : side === "receiver" ? data.receiver_id === me : data.sender_id === me || data.receiver_id === me;
      return ok ? data : null;
    };
    const notYours = () => NextResponse.json({ success: false, message: "This request is not yours." }, { status: 403 });

    const today = new Date().toISOString().split("T")[0];

    // ══════════════════════════════════════════════════════════════════
    // ACTION 1: SEND_REQUEST
    // ══════════════════════════════════════════════════════════════════
    if (action === "SEND_REQUEST") {
      const { receiverId, receiverStudentIdCode, busId, shiftId, tripId, preferredRowZone = "NO_PREFERENCE" } = body;
      const senderId = me;

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

      if (receiverId && !isSafeId(receiverId)) {
        return NextResponse.json({ success: false, message: "Invalid student." }, { status: 400 });
      }
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
      // Partners must ride the same bus (same route).
      if (!acting.isStaff) {
        const [a, b] = await Promise.all([routeOfStudent(me), routeOfStudent(resolvedReceiverId)]);
        if (!a || a !== b) {
          return NextResponse.json({ success: false, message: "You can only choose a classmate who rides your bus." }, { status: 400 });
        }
      }

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
          message: `${senderName} wants to sit next to you on the bus. Accept in Settings → Seat preferences.`,
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
      const { requestId } = body;
      const pair = await requestFor(requestId, "receiver");
      if (!pair) return notYours();
      const [ra, rb] = await Promise.all([routeOfStudent(pair.sender_id as string), routeOfStudent(pair.receiver_id as string)]);
      if (!ra || ra !== rb) return NextResponse.json({ success: false, message: "You no longer ride the same bus, so you cannot be seat partners." }, { status: 400 });
      return await executeAcceptance(requestId, me);
    }

    // ══════════════════════════════════════════════════════════════════
    // ACTION 3: DECLINE_REQUEST
    // ══════════════════════════════════════════════════════════════════
    if (action === "DECLINE_REQUEST") {
      const { requestId } = body;
      if (!(await requestFor(requestId, "receiver"))) return notYours();
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
      if (!(await requestFor(requestId, "sender"))) return notYours();
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
      const { requestId } = body;
      if (!(await requestFor(requestId, "either"))) return notYours();
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
 * Accepts a partner request: both students store each other as seat partner. The boarding chart
 * then seats them side by side when it assigns seats (lib/students/seating.ts). Seats already
 * assigned on today's chart are not moved here.
 */
async function executeAcceptance(requestId: string, _respondingStudentId?: string) {
  const { data: partnerReq } = await supabaseAdmin.from("seat_partner_requests").select("*").eq("id", requestId).maybeSingle();
  if (!partnerReq) return NextResponse.json({ success: false, message: "Seat partner request not found." }, { status: 404 });
  const { sender_id, receiver_id } = partnerReq;
  await Promise.all([
    supabaseAdmin.from("students").update({ preferred_partner_student_id: receiver_id, preferred_partner_name: partnerReq.receiver_name }).eq("id", sender_id),
    supabaseAdmin.from("students").update({ preferred_partner_student_id: sender_id, preferred_partner_name: partnerReq.sender_name }).eq("id", receiver_id),
  ]);
  const { data: updatedReq } = await supabaseAdmin
    .from("seat_partner_requests")
    .update({ status: "ACCEPTED", responded_at: new Date().toISOString() })
    .eq("id", requestId)
    .select("*")
    .single();
  return NextResponse.json({
    success: true,
    message: "Seat partner confirmed. You will be seated together from the next boarding chart.",
    request: updatedReq,
  });
}

/** The route a student rides: their primary route, else the route of their pickup stop. */
async function routeOfStudent(studentId: string | null | undefined): Promise<string | null> {
  if (!studentId) return null;
  const { data } = await supabaseAdmin
    .from("students_full")
    .select("primary_route_id, primary_stop_id, auto_assigned_stop_id")
    .eq("id", studentId)
    .maybeSingle();
  if (!data) return null;
  if (data.primary_route_id) return data.primary_route_id;
  const stop = data.auto_assigned_stop_id || data.primary_stop_id;
  if (!stop) return null;
  const { data: rs } = await supabaseAdmin.from("route_stops").select("route_id").eq("stop_id", stop).limit(1).maybeSingle();
  return rs?.route_id ?? null;
}
