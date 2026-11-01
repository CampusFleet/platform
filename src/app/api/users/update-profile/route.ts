import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { setCachedStudentProfile, cacheSet, CACHE_TTL } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      fullName,
      phone,
      // Student specific
      semester,
      emergencyContactName,
      emergencyContactPhone,
      classId,
      className,
      // Staff specific
      employeeCode,
      category,
      licenseNo
    } = body;

    const role = session.role;
    
    // Validate basics
    if (!fullName || fullName.trim().length < 2) {
      return NextResponse.json({ success: false, error: "Full name is required (minimum 2 characters)." }, { status: 400 });
    }

    const trimmedFullName = fullName.trim();
    const trimmedPhone = phone ? phone.trim() : null;

    // 1. Always update users table (full_name and phone are stored in users)
    const { error: userError } = await supabaseAdmin
      .from("users")
      .update({
        full_name: trimmedFullName,
        phone: trimmedPhone,
      })
      .eq("id", session.userId);

    if (userError) {
      console.error("Error updating user record:", userError);
    }

    let updatedStudentRecord: any = null;

    if (role === "student" || role === "portal" || !role) {
      // 2. Update students table (normalized: class_id, semester, emergency_contact, student_id_code)
      // Note: Do NOT add 'department' as a column - department is derived dynamically from classes/branches in students_full view
      const studentUpdate: Record<string, any> = {
        full_name: trimmedFullName,
        semester: semester ? String(semester).trim() : null,
        emergency_contact: {
          name: emergencyContactName ? String(emergencyContactName).trim() : "",
          phone: emergencyContactPhone ? String(emergencyContactPhone).trim() : "",
          relationship: "Parent / Guardian",
        }
      };

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (classId && uuidRegex.test(String(classId).trim())) {
        studentUpdate.class_id = String(classId).trim();
      }

      const rawId = body.studentIdCode || body.studentId || body.student_id;
      if (rawId && String(rawId).trim()) {
        studentUpdate.student_id_code = String(rawId).trim().toUpperCase();
      }

      let { data: updatedRows, error: studentError } = await supabaseAdmin
        .from("students")
        .update(studentUpdate)
        .eq("user_id", session.userId)
        .select();

      // Fallback matching if primary user_id lookup returns no rows
      if (!studentError && (!updatedRows || updatedRows.length === 0)) {
        const { data: fallbackRows, error: fallbackError } = await supabaseAdmin
          .from("students")
          .update(studentUpdate)
          .or(`id.eq.${session.userId},id.eq.stud-${session.userId}`)
          .select();
        if (!fallbackError && fallbackRows && fallbackRows.length > 0) {
          updatedRows = fallbackRows;
        } else if (fallbackError) {
          studentError = fallbackError;
        }
      }

      if (studentError) {
        console.error("Error updating student profile:", studentError);
        return NextResponse.json({ success: false, error: studentError.message || "Failed to update student profile." }, { status: 500 });
      }

      // 3. Fetch consolidated fresh record from students_full view
      const { data: freshList, error: fullError } = await supabaseAdmin
        .from("students_full")
        .select("*")
        .or(`user_id.eq.${session.userId},email.ilike.${session.email}`)
        .order("created_at", { ascending: false })
        .limit(1);

      if (fullError) {
        console.warn("Could not query students_full after update:", fullError.message);
      }

      const freshStudent = freshList?.[0];
      if (freshStudent) {
        updatedStudentRecord = {
          id: freshStudent.id,
          userId: freshStudent.user_id,
          fullName: freshStudent.full_name || trimmedFullName,
          email: freshStudent.email || session.email,
          phone: freshStudent.phone || trimmedPhone || null,
          department: freshStudent.department || "",
          semester: freshStudent.semester || studentUpdate.semester || "",
          campus: freshStudent.campus || "",
          campusId: freshStudent.campus_id || "",
          primaryStopId: freshStudent.primary_stop_id || "",
          primaryRouteId: freshStudent.primary_route_id || "",
          emergencyContact: freshStudent.emergency_contact || studentUpdate.emergency_contact,
          transportAccessSuspended: Boolean(freshStudent.transport_access_suspended),
          hasActiveSubscription: Boolean(freshStudent.has_active_subscription) || freshStudent.payment_status === "APPROVED",
          subscriptionExpiryDate: freshStudent.subscription_expiry_date || null,
          classId: freshStudent.class_id || studentUpdate.class_id || null,
          className: freshStudent.class_name || className || null,
          zoneCode: freshStudent.zone_code || "ZONE_B",
          paymentStatus: freshStudent.payment_status || "UNPAID",
          totalFeeDue: Number(freshStudent.total_fee_due) || 0,
          totalFeePaid: Number(freshStudent.total_fee_paid) || 0,
          photoUrl: freshStudent.photo_url || "",
          photoLocked: Boolean(freshStudent.photo_url && freshStudent.photo_url.trim() !== "") || Boolean(freshStudent.photo_locked),
          avatarUrl: freshStudent.photo_url || null,
          studentIdCode: freshStudent.student_id_code || studentUpdate.student_id_code || null,
          homeLatitude: freshStudent.home_latitude ?? null,
          homeLongitude: freshStudent.home_longitude ?? null,
          homeAddress: freshStudent.home_address || null,
          autoAssignedStopId: freshStudent.auto_assigned_stop_id || null,
        };

        // 4. Redis Write-Through Cache: Populate all keys immediately for sub-5ms lookup
        await Promise.allSettled([
          setCachedStudentProfile(session.userId, updatedStudentRecord, CACHE_TTL.STUDENT_PROFILE),
          setCachedStudentProfile(updatedStudentRecord.id, updatedStudentRecord, CACHE_TTL.STUDENT_PROFILE),
          setCachedStudentProfile(session.email.toLowerCase(), updatedStudentRecord, CACHE_TTL.STUDENT_PROFILE),
          cacheSet(`student:subscription:${session.userId}`, updatedStudentRecord.hasActiveSubscription, CACHE_TTL.STUDENT_PROFILE),
          cacheSet(`student:photo:${session.userId}`, updatedStudentRecord.photoUrl, CACHE_TTL.STUDENT_PROFILE),
        ]);
      }
    } else {
      // Update staff table
      const { error: staffError } = await supabaseAdmin
        .from("staff")
        .update({
          full_name: trimmedFullName,
          phone: trimmedPhone,
          employee_code: employeeCode ? String(employeeCode).trim() : null,
          category: category ? String(category).trim() : null,
          license_no: licenseNo ? String(licenseNo).trim() : null
        })
        .eq("user_id", session.userId);

      if (staffError) {
        console.error("Error updating staff profile:", staffError);
        return NextResponse.json({ success: false, error: "Failed to update staff profile." }, { status: 500 });
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: "Profile updated successfully.",
      student: updatedStudentRecord
    });
  } catch (err: any) {
    console.error("update-profile error:", err);
    return NextResponse.json({ success: false, error: err.message || "Internal server error." }, { status: 500 });
  }
}
