import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { isManageRole } from "@/lib/security/actor";
import { isSafeId } from "@/lib/security/safe-id";
import { routeInput, saveRoute, deleteRoute, AdminError } from "@/lib/admin/fleet";

export const dynamic = "force-dynamic";

/** Transport admin routes. PUT { route + stops } create-or-update in one transaction · DELETE ?id=. */
export async function PUT(req: NextRequest) {
  const s = await getSessionFromRequest(req);
  if (!s || !isManageRole(s.role)) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  const p = routeInput.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ success: false, error: p.error.issues[0]?.message || "Invalid route." }, { status: 400 });
  try {
    return NextResponse.json({ success: true, ...(await saveRoute(p.data, { userId: s.userId, role: s.role })) });
  } catch (e) {
    return e instanceof AdminError ? NextResponse.json({ success: false, error: e.message }, { status: e.status }) : NextResponse.json({ success: false, error: "Could not save." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const s = await getSessionFromRequest(req);
  if (!s || !isManageRole(s.role)) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!isSafeId(id)) return NextResponse.json({ success: false, error: "Invalid route." }, { status: 400 });
  try {
    return NextResponse.json({ success: true, ...(await deleteRoute(id, { userId: s.userId, role: s.role })) });
  } catch (e) {
    return e instanceof AdminError ? NextResponse.json({ success: false, error: e.message }, { status: e.status }) : NextResponse.json({ success: false, error: "Could not delete." }, { status: 500 });
  }
}
