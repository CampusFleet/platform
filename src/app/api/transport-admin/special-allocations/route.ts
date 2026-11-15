import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/jwt";
import { isManageRole } from "@/lib/security/actor";
import { allocateSpecial, removeSpecial, AdminError } from "@/lib/admin/fleet";

export const dynamic = "force-dynamic";

const Body = z.object({ shiftId: z.string().min(1).max(128), studentId: z.string().min(1).max(128), tripId: z.string().max(128).nullable().optional(), notes: z.string().max(300).nullable().optional() });

/** Special-shift allocations (placement drives, events). POST add · DELETE remove. */
export async function POST(req: NextRequest) {
  const s = await getSessionFromRequest(req);
  if (!s || !isManageRole(s.role)) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  try {
    return NextResponse.json({ success: true, ...(await allocateSpecial(p.data, { userId: s.userId, role: s.role })) });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof AdminError ? e.message : "Could not save." }, { status: e instanceof AdminError ? e.status : 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const s = await getSessionFromRequest(req);
  if (!s || !isManageRole(s.role)) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  const p = Body.pick({ shiftId: true, studentId: true }).safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  try {
    await removeSpecial(p.data.shiftId, p.data.studentId, { userId: s.userId, role: s.role });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof AdminError ? e.message : "Could not remove." }, { status: e instanceof AdminError ? e.status : 500 });
  }
}
