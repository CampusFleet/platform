import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { isManageRole } from "@/lib/security/actor";
import { busInput, createBus, updateBus, deleteBus, AdminError } from "@/lib/admin/fleet";

export const dynamic = "force-dynamic";

/** Transport admin buses. POST create · PATCH ?id= update · DELETE ?id= (retires a bus that has past trips). */
async function guard(req: NextRequest) {
  const s = await getSessionFromRequest(req);
  return s && isManageRole(s.role) ? s : null;
}
const fail = (e: unknown) =>
  e instanceof AdminError ? NextResponse.json({ success: false, error: e.message }, { status: e.status }) : NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
const idOf = (req: NextRequest) => Number(req.nextUrl.searchParams.get("id"));

export async function POST(req: NextRequest) {
  const s = await guard(req);
  if (!s) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  const p = busInput.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ success: false, error: p.error.issues[0]?.message || "Invalid bus." }, { status: 400 });
  try {
    return NextResponse.json({ success: true, ...(await createBus(p.data, { userId: s.userId, role: s.role })) });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: NextRequest) {
  const s = await guard(req);
  if (!s) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  const id = idOf(req);
  if (!Number.isInteger(id)) return NextResponse.json({ success: false, error: "Invalid bus." }, { status: 400 });
  const p = busInput.partial().safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ success: false, error: p.error.issues[0]?.message || "Invalid bus." }, { status: 400 });
  try {
    await updateBus(id, p.data, { userId: s.userId, role: s.role });
    return NextResponse.json({ success: true });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest) {
  const s = await guard(req);
  if (!s) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  const id = idOf(req);
  if (!Number.isInteger(id)) return NextResponse.json({ success: false, error: "Invalid bus." }, { status: 400 });
  try {
    return NextResponse.json({ success: true, ...(await deleteBus(id, { userId: s.userId, role: s.role })) });
  } catch (e) {
    return fail(e);
  }
}
