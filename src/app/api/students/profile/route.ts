import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getSessionFromRequest } from "@/lib/jwt";
import { cacheSet, invalidateCachedStudentProfile } from "@/lib/redis";
import { createStudentId } from "@/lib/id";

export const dynamic = "force-dynamic";

/**
 * POST /api/students/profile
 * Creates or updates a student profile in the institutional database.
 * Uses supabaseAdmin (service role) to bypass RLS and guarantee atomic updates.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      studentId,
      fullName,
      campusId,
      campus,
      department,
      semester,
      classId,
      className,
      zoneCode,
      phone,
      primaryStopId,
      emergencyContact,
    } = body;

    const cleanEmail = (session.email || "").toLowerCase().trim();
    const userId = session.userId;
    // Cloudflare Security Audit: Only verified session role can perform administrative updates
    const isStaffOrAdmin = ["admin", "transport_admin", "transport_manager"].includes(session.role);

    // 1. Check if student already exists by user_id or email and inspect photo/campus lock status
    let existingStudentId: string | null = null;
    let existingPhotoUrl: string | null = null;
    let existingCampusId: string | null = null;
    let existingCampus: string | null = null;
    let existingPaymentStatus: string | null = null;
    let existingStudentIdCode: string | null = null;

    const { data: existingStudents } = await supabaseAdmin
      .from("students_full")
      .select("id, photo_url, photo_locked, campus_id, campus, payment_status, student_id_code")
      .or(`user_id.eq.${userId},id.eq.stud-${userId}`)
      .limit(1);

    const existingStudent = existingStudents?.[0];
    if (existingStudent?.id) {
      existingStudentId = existingStudent.id;
      existingPhotoUrl = existingStudent.photo_url;
      existingCampusId = existingStudent.campus_id;
      existingCampus = existingStudent.campus;
      existingPaymentStatus = existingStudent.payment_status;
      existingStudentIdCode = existingStudent.student_id_code || null;
    }

    // Subscription is considered active if payment has been approved
    const hasActiveSubscription = existingPaymentStatus === "APPROVED";


    // Campus Lock Guardrail: Only lock campus AFTER payment is approved
    const effectiveCampusId = (!isStaffOrAdmin && hasActiveSubscription && existingCampusId) ? existingCampusId : (campusId || existingCampusId || null);
    const effectiveCampus = (!isStaffOrAdmin && hasActiveSubscription && existingCampus) ? existingCampus : (campus || existingCampus || session.campus || "").trim() || null;

    const finalStudentId =
      existingStudentId ||
      studentId ||
      createStudentId();

    // 2. Validate classId as UUID if provided
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validClassId = classId && uuidRegex.test(classId) ? classId : null;

    // 3. Resolve transit zone and prepare student row for upsert
    let resolvedZoneId: string | null = null;
    let feeDue: number | null = null;
    if (zoneCode && effectiveCampusId) {
      const { data: zone } = await supabaseAdmin.from("transit_zones").select("id, semester_fee").eq("code", zoneCode).eq("campus_id", effectiveCampusId).maybeSingle();
      if (zone?.id) resolvedZoneId = zone.id;
      if (zone?.semester_fee) feeDue = Number(zone.semester_fee);
    } else if (zoneCode) {
      const { data: zone } = await supabaseAdmin.from("transit_zones").select("id, semester_fee").eq("code", zoneCode).limit(1).maybeSingle();
      if (zone?.id) resolvedZoneId = zone.id;
      if (zone?.semester_fee) feeDue = Number(zone.semester_fee);
    }

    const rawStudentIdCode = (
      body.studentIdCode ||
      body.studentId ||
      body.student_id ||
      ""
    ).trim().toUpperCase();

    // Auto-extract Student ID from college email if not explicitly provided
    // (e.g. adityapandey.230111075@gehu.ac.in -> 230111075)
    let autoExtractedStudentId = "";
    if (cleanEmail) {
      const localPart = cleanEmail.split("@")[0] || "";
      const match = localPart.match(/\b\d{7,10}\b/) || localPart.match(/([a-zA-Z]{1,4}-\d{6,10})/i);
      if (match) autoExtractedStudentId = match[0].toUpperCase();
    }

    const effectiveStudentIdCode = rawStudentIdCode || autoExtractedStudentId || existingStudentIdCode || null;

    const studentData: Record<string, any> = {
      id: finalStudentId,
      user_id: userId,
      full_name: (fullName || session.fullName || "").trim(),
      campus_id: effectiveCampusId,
      campus: effectiveCampus,
      semester: (semester || "").trim() || null,
    };
    // Never clear zone, stop or emergency contact just because a caller left them out.
    if (resolvedZoneId) studentData.zone_id = resolvedZoneId;
    if (primaryStopId) studentData.primary_stop_id = primaryStopId;
    if (emergencyContact) studentData.emergency_contact = emergencyContact;

    if (effectiveStudentIdCode) {
      studentData.student_id_code = effectiveStudentIdCode;
    }

    if (body.homeLatitude !== undefined && body.homeLatitude !== null && !isNaN(Number(body.homeLatitude))) {
      studentData.home_latitude = Number(body.homeLatitude);
    }
    if (body.homeLongitude !== undefined && body.homeLongitude !== null && !isNaN(Number(body.homeLongitude))) {
      studentData.home_longitude = Number(body.homeLongitude);
    }
    if (body.homeAddress) {
      studentData.home_address = String(body.homeAddress).trim();
    }
    if (body.autoAssignedStopId) {
      studentData.auto_assigned_stop_id = body.autoAssignedStopId;
    }

    let finalPhotoUrl = null;
    let finalPhotoLocked = false;
    // Students set their pass photo only through the live camera (/api/students/portrait or
    // /api/biometrics/enroll-v2). A photoUrl sent here by a student is ignored, so a stale client copy
    // or a base64 data URL can never overwrite the stored portrait.
    if (body.photoUrl && isStaffOrAdmin) {
      finalPhotoUrl = body.photoUrl;
      // Only lock photo if student already has an approved subscription
      finalPhotoLocked = hasActiveSubscription;
      studentData.photo_locked = finalPhotoLocked;
    }

    if (validClassId) {
      studentData.class_id = validClassId;
    }

    // Note: Fee and payment status are normalized in transit_zones and payments tables,
    // and dynamically computed by the students_full view based on zone_id.

    // 4. Guarantee users table entry exists FIRST (without dropped 'campus' column)
    // to satisfy foreign key constraint fk_students_users on students table
    const userUpsertPayload: Record<string, any> = {
      id: userId,
      email: cleanEmail,
      full_name: studentData.full_name,
      phone: (phone || "").trim() || null,
      campus_id: studentData.campus_id,
      role: "student",
      provider: "Institutional SSO",
    };
    if (finalPhotoUrl) {
      userUpsertPayload.photo_url = finalPhotoUrl;
      userUpsertPayload.photo_locked = finalPhotoLocked;
    }

    const { error: userErr } = await supabaseAdmin
      .from("users")
      .upsert(userUpsertPayload, { onConflict: "id" });

    if (userErr) {
      console.error("Supabase user profile upsert error:", userErr);
      return NextResponse.json({ success: false, error: userErr.message }, { status: 500 });
    }

    // 5. Upsert student record
    const { data: savedStudent, error: studentErr } = await supabaseAdmin
      .from("students")
      .upsert(studentData, { onConflict: "user_id" })
      .select()
      .single();

    if (studentErr) {
      console.error("Supabase student profile upsert error:", studentErr);
      return NextResponse.json({ success: false, error: studentErr.message }, { status: 500 });
    }

    // 6. Update Redis cache for instant UI resolution
    await invalidateCachedStudentProfile([userId, finalStudentId, cleanEmail]);
    if (finalPhotoUrl) {
      await cacheSet(`student:photo:${userId}`, finalPhotoUrl, 300);
    }

    return NextResponse.json({
      success: true,
      message: "Student profile saved and verified successfully",
      student: savedStudent,
    });
  } catch (err: any) {
    console.error("Error in POST /api/students/profile:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
