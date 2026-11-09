import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { saveStudentFaceProfile } from "@/lib/biometrics";
import { z } from "zod";

export const dynamic = "force-dynamic";

const enrollSchema = z.object({
  embedding: z.array(z.number()).length(512, "Face embedding must contain exactly 512 dimensions"),
  qualityScore: z.number().min(0).max(1).default(1.0),
  livenessScore: z.number().min(0).max(1).default(1.0),
  consentGiven: z.boolean().refine((val) => val === true, "Explicit biometric consent is required"),
  avatarDataUrl: z.string().optional(),
  studentId: z.string().optional(),
});

/**
 * POST /api/biometrics/enroll
 * Secure Biometric Face ID Enrollment Endpoint (DPDP Act 2023 / GDPR Compliant)
 * Stores normalized 512-d mathematical vector embedding in PostgreSQL via pgvector.
 * Raw video frames are processed client-side and never saved.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized. Please log in." }, { status: 401 });
    }

    const body = await req.json();
    const parsed = enrollSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: parsed.error.errors[0]?.message || "Invalid biometric enrollment data.",
        },
        { status: 400 }
      );
    }

    const { embedding, qualityScore, livenessScore, consentGiven, avatarDataUrl, studentId: requestedStudentId } = parsed.data;

    // 1. Resolve authentic student ID in public.students (satisfying fk_student_face_profiles_student_id)
    let resolvedStudentId: string | null = null;

    // Query students table by user_id, id, or requestedStudentId (never query non-existent 'email' on students)
    const filterParts = [
      session.userId ? `user_id.eq.${session.userId}` : null,
      session.userId ? `id.eq.${session.userId}` : null,
      requestedStudentId ? `id.eq.${requestedStudentId}` : null,
    ].filter(Boolean);

    if (filterParts.length > 0) {
      const { data: dbStudents } = await supabaseAdmin
        .from("students")
        .select("id, user_id, full_name, photo_locked")
        .or(filterParts.join(","))
        .limit(1);

      if (dbStudents?.[0]?.id) {
        resolvedStudentId = dbStudents[0].id;
      }
    }

    // Fallback: Check students_full view (which safely joins users.email)
    if (!resolvedStudentId && session.email) {
      const { data: sf } = await supabaseAdmin
        .from("students_full")
        .select("id")
        .ilike("email", session.email)
        .limit(1)
        .maybeSingle();

      if (sf?.id) {
        resolvedStudentId = sf.id;
      }
    }

    // Fallback: If student record does not exist yet (onboarding Step 2 before Step 3 checkout),
    // auto-provision a student row linked to session.userId so the foreign key constraint is ALWAYS satisfied!
    if (!resolvedStudentId && session.userId) {
      const autoStudentId = `stud-${session.userId}`;
      const { data: userRow } = await supabaseAdmin
        .from("users")
        .select("full_name, phone")
        .eq("id", session.userId)
        .maybeSingle();

      const { data: newStudent, error: provisionErr } = await supabaseAdmin
        .from("students")
        .upsert(
          {
            id: autoStudentId,
            user_id: session.userId,
            full_name: userRow?.full_name || (session as any).name || "Student Commuter",
            student_id_code: `ERP-${Date.now().toString().slice(-6)}`,
            photo_locked: false,
          },
          { onConflict: "id" }
        )
        .select("id")
        .single();

      if (!provisionErr && newStudent?.id) {
        resolvedStudentId = newStudent.id;
      }
    }

    if (!resolvedStudentId) {
      return NextResponse.json(
        {
          success: false,
          message: "Could not resolve valid student record for biometric enrollment.",
        },
        { status: 404 }
      );
    }

    // 2. Save biometric vector embedding to student_face_profiles
    const profile = await saveStudentFaceProfile(resolvedStudentId, embedding, {
      qualityScore,
      livenessScore,
      biometricConsent: consentGiven,
      metadata: {
        enrolledByUserId: session.userId,
        enrolledByRole: session.role,
        clientUserAgent: req.headers.get("user-agent") || "unknown",
        enrolledAtIp: req.headers.get("x-forwarded-for") || "unknown",
      },
    });

    // 3. If an avatar thumbnail was captured during the liveness scan, store in user profile
    let avatarUrl: string | undefined = undefined;
    if (avatarDataUrl && avatarDataUrl.startsWith("data:image/")) {
      try {
        avatarUrl = avatarDataUrl; // Data URL for fast instant preview
        // Update user's official avatar and lock photo
        await supabaseAdmin
          .from("users")
          .update({
            photo_url: avatarDataUrl,
            avatar_url: avatarDataUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", session.userId);

        await supabaseAdmin
          .from("students")
          .update({
            photo_locked: true,
          })
          .eq("id", resolvedStudentId);
      } catch (avatarErr) {
        console.warn("Avatar thumbnail update failed (non-fatal):", avatarErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Biometric Face ID profile enrolled successfully. Ready for zero-touch gate boarding.",
      profile: {
        id: profile.id,
        studentId: profile.studentId,
        qualityScore: profile.qualityScore,
        livenessScore: profile.livenessScore,
        enrolledAt: profile.enrolledAt,
        avatarUrl,
      },
    });
  } catch (err: any) {
    console.error("Biometric enrollment error:", err);
    return NextResponse.json(
      {
        success: false,
        message: err.message || "Failed to enroll Face ID profile.",
      },
      { status: 500 }
    );
  }
}
