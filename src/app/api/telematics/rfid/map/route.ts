import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getSessionFromRequest } from "@/lib/jwt";
import { cacheDel, cacheGet, cacheSet } from "@/lib/redis";

export const dynamic = "force-dynamic";

/**
 * POST /api/telematics/rfid/map
 * Administrative endpoint to map, reassign, or unlink a physical RFID smart card to a student.
 * 
 * Body:
 * {
 *   "studentId": "uuid-of-student",
 *   "rfidCardId": "23BDEB2C",       // null or empty string to unlink
 *   "studentIdCode": "220101",      // optional Student ID
 *   "forceReassign": false           // if true, transfers card if previously mapped to another student
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const isAuthorized = ["admin", "transport_admin", "transport_manager"].includes(session.role);
    if (!isAuthorized) {
      return NextResponse.json({ success: false, error: "Unauthorized access" }, { status: 403 });
    }

    const body = await req.json();
    const { studentId, rfidCardId, studentIdCode, forceReassign } = body;

    if (!studentId) {
      return NextResponse.json({ success: false, error: "studentId is required" }, { status: 400 });
    }

    const cleanRfid = rfidCardId ? String(rfidCardId).trim().toUpperCase() : null;
    const rawCode = studentIdCode || body.student_id_code;
    const cleanStudentIdCode = rawCode ? String(rawCode).trim().toUpperCase() : undefined;

    // 1. Fetch target student
    const { data: targetStudents, error: fetchErr } = await supabaseAdmin
      .from("students_full")
      .select("id, user_id, full_name, student_id_code, rfid_card_id")
      .or(`id.eq.${studentId},user_id.eq.${studentId}`)
      .limit(1);

    if (fetchErr || !targetStudents || targetStudents.length === 0) {
      return NextResponse.json({ success: false, error: "Student not found in institutional database" }, { status: 404 });
    }

    const student = targetStudents[0];

    // 2. If mapping a card, check for duplicate assignment across other students
    if (cleanRfid) {
      let holderQuery = supabaseAdmin
        .from("students_full")
        .select("id, user_id, full_name, student_id_code")
        .eq("rfid_card_id", cleanRfid)
        .neq("id", student.id);

      if (student.user_id) {
        holderQuery = holderQuery.neq("user_id", student.user_id);
      }

      const { data: existingHolder } = await holderQuery.limit(1);

      if (existingHolder && existingHolder.length > 0) {
        const holder = existingHolder[0];
        if (!forceReassign) {
          return NextResponse.json(
            {
              success: false,
              conflict: true,
              message: `Card [${cleanRfid}] is already assigned to student ${holder.full_name} (${holder.student_id_code || "No Student ID"}). Do you want to transfer this card to ${student.full_name}?`,
              existingHolder: {
                id: holder.id,
                fullName: holder.full_name,
                studentIdCode: holder.student_id_code,
              },
            },
            { status: 409 }
          );
        } else {
          // Unassign from old holder (all profiles under that user)
          if (holder.user_id) {
            await supabaseAdmin
              .from("students")
              .update({ rfid_card_id: null })
              .eq("user_id", holder.user_id);
          } else {
            await supabaseAdmin
              .from("students")
              .update({ rfid_card_id: null })
              .eq("id", holder.id);
          }
        }
      }
    }

    // 3. Update student table (update all records belonging to this user)
    const updates: Record<string, any> = {
      rfid_card_id: cleanRfid,
    };
    if (cleanStudentIdCode !== undefined && cleanStudentIdCode !== "") {
      updates.student_id_code = cleanStudentIdCode;
    }

    if (student.user_id) {
      await supabaseAdmin
        .from("students")
        .update(updates)
        .eq("user_id", student.user_id);
    }

    const { data: updatedStudent, error: updateErr } = await supabaseAdmin
      .from("students")
      .update(updates)
      .eq("id", student.id)
      .select("id, user_id, full_name, student_id_code, rfid_card_id")
      .single();

    if (updateErr) {
      console.error("[api/telematics/rfid/map] Update error:", updateErr);
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }

    // 4. Audit Log
    try {
      await supabaseAdmin.from("audit_logs").insert({
        user_role: session.role,
        action: cleanRfid ? "MAP_RFID_CARD" : "UNMAP_RFID_CARD",
        new_value: {
          adminUserId: session.userId,
          adminEmail: session.email,
          studentId: student.id,
          studentName: student.full_name,
          studentIdCode: cleanStudentIdCode || student.student_id_code,
          rfidCardId: cleanRfid,
          previousRfid: student.rfid_card_id,
        },
      });
    } catch (_) {}

    // 5. If this card was recently in the unmapped cache, clear it
    try {
      await cacheDel("telematics:unmapped_rfid_last");
      const unmappedList = (await cacheGet<any[]>("telematics:unmapped_rfid_list")) || [];
      const updatedList = unmappedList.filter((item: any) => item.rfidCardId !== cleanRfid);
      await cacheSet("telematics:unmapped_rfid_list", updatedList, 86400);
      await cacheDel("telematics:hardware_desk_server_data");
    } catch (_) {}

    return NextResponse.json({
      success: true,
      message: cleanRfid
        ? `✓ Physical RFID card [${cleanRfid}] successfully paired to ${student.full_name}.`
        : `✓ RFID card unlinked from ${student.full_name}.`,
      student: updatedStudent,
    });
  } catch (err: any) {
    console.error("[api/telematics/rfid/map] Unexpected error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
