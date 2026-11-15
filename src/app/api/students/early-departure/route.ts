import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/jwt";
import { waitUntil } from "@vercel/functions";
import { getLeaveEarly, isLeaveEarlyError, notifyLeaveEarlyReviewers, requestLeaveEarly, withdrawLeaveEarly } from "@/lib/students/leave-early";

export const dynamic = "force-dynamic";

/**
 * Leave early (student). The student is always the session user; no ids are read from the request.
 * GET: today's options and requests. POST: { shiftId, reason }. DELETE: { requestId } withdraws a waiting request.
 */
async function studentSession(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return { error: NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 }) };
  if (session.role !== "student") return { error: NextResponse.json({ success: false, error: "Only students can ask to leave early." }, { status: 403 }) };
  return { session };
}

function failure(e: unknown, label: string) {
  if (isLeaveEarlyError(e)) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
  console.error(`[leave-early] ${label}:`, (e as Error)?.message);
  return NextResponse.json({ success: false, error: "Something went wrong. Try again." }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const { session, error } = await studentSession(req);
  if (error) return error;
  try {
    return NextResponse.json({ success: true, ...(await getLeaveEarly(session.userId)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e, "get");
  }
}

const RequestBody = z.object({
  shiftId: z.string().min(1).max(100),
  reason: z.string().trim().min(5, "Write a short reason (at least 5 characters).").max(300, "Keep the reason under 300 characters."),
});

export async function POST(req: NextRequest) {
  const { session, error } = await studentSession(req);
  if (error) return error;
  const parsed = RequestBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Pick a bus and write a reason." }, { status: 400 });
  }
  try {
    const created = await requestLeaveEarly(session.userId, parsed.data.shiftId, parsed.data.reason);
    waitUntil(notifyLeaveEarlyReviewers(created).catch((e) => console.warn("[leave-early] notify:", e?.message)));
    return NextResponse.json({ success: true, ...(await getLeaveEarly(session.userId)) });
  } catch (e) {
    return failure(e, "request");
  }
}

const WithdrawBody = z.object({ requestId: z.string().uuid() });

export async function DELETE(req: NextRequest) {
  const { session, error } = await studentSession(req);
  if (error) return error;
  const parsed = WithdrawBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Send { requestId }." }, { status: 400 });
  try {
    await withdrawLeaveEarly(session.userId, parsed.data.requestId);
    return NextResponse.json({ success: true, ...(await getLeaveEarly(session.userId)) });
  } catch (e) {
    return failure(e, "withdraw");
  }
}
