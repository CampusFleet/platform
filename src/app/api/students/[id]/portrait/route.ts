import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/jwt";
import { db } from "@/lib/supabaseClient";
import { isManageRole } from "@/lib/security/actor";
import { isSafeId } from "@/lib/security/safe-id";
import { savePortrait } from "@/lib/students/portrait";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const body = z.object({ portrait: z.string().min(100).max(900_000) });

/**
 * POST /api/students/:id/portrait  { portrait: base64 JPEG }  (transport staff only)
 * Replaces a student's pass photo, also after payment. Stored privately like the live capture.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  if (!isManageRole(session.role)) return NextResponse.json({ success: false, error: "Only transport staff can change a student's photo." }, { status: 403 });
  if (!isSafeId(params.id)) return NextResponse.json({ success: false, error: "Invalid student id." }, { status: 400 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Send one JPEG photo." }, { status: 400 });

  const { data: student } = await db.from("students").select("id, user_id").eq("id", params.id).maybeSingle();
  if (!student?.user_id) return NextResponse.json({ success: false, error: "Student not found." }, { status: 404 });
  try {
    const photoUrl = await savePortrait({ studentId: student.id, userId: student.user_id, image: parsed.data.portrait, byStaff: true });
    await db.from("audit_logs").insert({
      user_id: session.userId,
      user_role: session.role,
      action: "STUDENT_PHOTO_REPLACED",
      entity: "Student",
      entity_id: student.id,
      reason: "Pass photo replaced by transport staff",
    });
    return NextResponse.json({ success: true, photoUrl });
  } catch (e) {
    const msg = (e as Error).message || "";
    if (msg.startsWith("image ")) return NextResponse.json({ success: false, error: "The photo must be a JPEG under 600 KB." }, { status: 400 });
    console.error("[staff portrait]", msg);
    return NextResponse.json({ success: false, error: "Could not save the photo." }, { status: 500 });
  }
}
