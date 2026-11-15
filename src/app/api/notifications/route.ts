import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/jwt";
import { listInbox, markRead } from "@/lib/notifications/inbox";

export const dynamic = "force-dynamic";

/** GET /api/notifications: the caller's latest notifications and unread count. */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  try {
    const inbox = await listInbox(session.userId);
    return NextResponse.json({ success: true, ...inbox }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    console.error("[notifications] list:", e?.message);
    return NextResponse.json({ success: false, error: "Could not load notifications." }, { status: 500 });
  }
}

const MarkBody = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }),
]);

/** PATCH /api/notifications: mark { ids } or { all: true } as read. */
export async function PATCH(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  const parsed = MarkBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Send { ids } or { all: true }." }, { status: 400 });
  try {
    await markRead(session.userId, "all" in parsed.data ? "all" : parsed.data.ids);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[notifications] mark read:", e?.message);
    return NextResponse.json({ success: false, error: "Could not update notifications." }, { status: 500 });
  }
}
