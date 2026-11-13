import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/jwt";
import { getOwnStudentId } from "@/lib/security/actor";
import { savePortrait, PortraitLockedError } from "@/lib/students/portrait";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const body = z.object({ portrait: z.string().min(100).max(900_000) });

/**
 * POST /api/students/portrait  { portrait: base64 JPEG from the live camera }
 * Pass photo for students who do not consent to Face ID. No face template is created.
 * Students who use Face ID get their photo saved by /api/biometrics/enroll-v2 instead.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  if (session.role !== "student") return NextResponse.json({ success: false, error: "Only students can set a pass photo here." }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Send one JPEG photo." }, { status: 400 });

  const studentId = await getOwnStudentId(session.userId);
  if (!studentId) return NextResponse.json({ success: false, error: "Save your details first." }, { status: 404 });
  try {
    const photoUrl = await savePortrait({ studentId, userId: session.userId, image: parsed.data.portrait });
    return NextResponse.json({ success: true, photoUrl });
  } catch (e) {
    if (e instanceof PortraitLockedError) return NextResponse.json({ success: false, error: e.message }, { status: 403 });
    const msg = (e as Error).message || "";
    if (msg.startsWith("image ")) return NextResponse.json({ success: false, error: "The photo could not be read. Please retake it." }, { status: 400 });
    console.error("[portrait]", msg);
    return NextResponse.json({ success: false, error: "Could not save your photo. Please try again." }, { status: 500 });
  }
}
