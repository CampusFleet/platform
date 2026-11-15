import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/jwt";
import { REVIEW_ALL_ROLES, listGatePasses, reviewGatePass } from "@/lib/teachers/gate-passes";

export const dynamic = "force-dynamic";

/**
 * Gate passes (leave-early requests) for the teacher's own classes; managers see all.
 * GET: list. PATCH: { requestId, status: APPROVED | REJECTED, remarks? }.
 */
const REVIEWERS = ["teacher", "faculty", ...REVIEW_ALL_ROLES] as string[];

async function reviewerSession(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return { error: NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 }) };
  if (!REVIEWERS.includes(session.role)) return { error: NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 }) };
  return { session };
}

export async function GET(req: NextRequest) {
  const { session, error } = await reviewerSession(req);
  if (error) return error;
  try {
    const { items } = await listGatePasses(session.userId, session.role);
    return NextResponse.json({ success: true, requests: items }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[gate-pass] list:", (e as Error).message);
    return NextResponse.json({ success: false, error: "Could not load requests." }, { status: 500 });
  }
}

const Review = z.object({
  requestId: z.string().uuid(),
  status: z.enum(["APPROVED", "REJECTED"]),
  remarks: z.string().trim().max(300).optional().default(""),
});

export async function PATCH(req: NextRequest) {
  const { session, error } = await reviewerSession(req);
  if (error) return error;
  const parsed = Review.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Send requestId and status (APPROVED or REJECTED)." }, { status: 400 });
  const result = await reviewGatePass(parsed.data.requestId, parsed.data.status === "APPROVED", parsed.data.remarks, {
    userId: session.userId,
    role: session.role,
  });
  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, status: result.status });
}
