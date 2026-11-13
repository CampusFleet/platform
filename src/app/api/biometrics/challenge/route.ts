import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { issueFaceChallenge } from "@/lib/face/challenge";

export const dynamic = "force-dynamic";

/**
 * GET /api/biometrics/challenge → { token, turn: "LEFT" | "RIGHT", expiresAt }
 * One-time, 5-minute token that /api/biometrics/enroll-v2 requires. `turn` is the head-turn prompt.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  if (session.role !== "student") return NextResponse.json({ success: false, error: "Only students can enroll Face ID." }, { status: 403 });
  return NextResponse.json({ success: true, ...issueFaceChallenge(session.userId) }, { headers: { "cache-control": "no-store" } });
}
