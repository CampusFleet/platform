import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { issueStudentPass } from "@/lib/security/student-pass";

export const dynamic = "force-dynamic";

/**
 * GET /api/students/pass-token
 * Issues the signed, minute-rotating boarding pass token for the logged-in student.
 * The student ID always comes from the session, never from the request.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  }

  const { data: student } = await supabaseAdmin
    .from("students")
    .select("id")
    .eq("user_id", session.userId)
    .maybeSingle();

  if (!student?.id) {
    return NextResponse.json({ success: false, error: "No student profile for this account." }, { status: 404 });
  }

  return NextResponse.json(
    { success: true, pass: issueStudentPass(student.id) },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
