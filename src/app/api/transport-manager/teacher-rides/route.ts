import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { db } from "@/lib/supabaseClient";
import { isManageRole } from "@/lib/security/actor";
import { isSafeId } from "@/lib/security/safe-id";
import { getTeacherRideSettings, saveTeacherRideSettings, teacherRideInput, TeacherRideError } from "@/lib/teachers/ride";

export const dynamic = "force-dynamic";

/**
 * Transport manager → teachers' bus settings.
 * GET            → { teachers: [{ userId, name, email, routeName, stopName, active }] }
 * GET ?userId=   → same payload as /api/teacher/ride-settings for that teacher
 * PUT { userId, ...settings } → saves for that teacher
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !isManageRole(session.role)) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  const userId = req.nextUrl.searchParams.get("userId");
  if (userId) {
    if (!isSafeId(userId)) return NextResponse.json({ success: false, error: "Invalid teacher." }, { status: 400 });
    return NextResponse.json({ success: true, ...(await getTeacherRideSettings(userId)) });
  }
  const [{ data: teachers }, rides, { data: routes }, { data: stops }] = await Promise.all([
    db.from("users").select("id, full_name, email").in("role", ["teacher", "faculty"]).order("full_name"),
    db.from("teacher_rides").select("user_id, route_id, stop_id, is_active"),
    db.from("routes").select("id, name"),
    db.from("stops").select("id, name"),
  ]);
  const rideBy = new Map(((rides.error ? [] : rides.data) || []).map((r: any) => [r.user_id, r]));
  const rName = new Map((routes || []).map((r) => [r.id, r.name]));
  const sName = new Map((stops || []).map((s) => [s.id, s.name]));
  return NextResponse.json({
    success: true,
    teachers: (teachers || []).map((t) => {
      const r: any = rideBy.get(t.id);
      return { userId: t.id, name: t.full_name || "Teacher", email: t.email, routeName: r ? rName.get(r.route_id) ?? null : null, stopName: r ? sName.get(r.stop_id) ?? null : null, active: Boolean(r?.is_active) };
    }),
  });
}

export async function PUT(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !isManageRole(session.role)) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || !isSafeId(body.userId)) return NextResponse.json({ success: false, error: "Invalid teacher." }, { status: 400 });
  const { data: user } = await db.from("users").select("role").eq("id", body.userId).maybeSingle();
  if (!user || !["teacher", "faculty"].includes(user.role || "")) return NextResponse.json({ success: false, error: "Not a teacher." }, { status: 400 });
  const parsed = teacherRideInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid settings." }, { status: 400 });
  try {
    await saveTeacherRideSettings(body.userId, parsed.data);
    await db.from("audit_logs").insert({ user_id: session.userId, user_role: session.role, action: "TEACHER_RIDE_UPDATED", entity: "User", entity_id: body.userId, reason: "Teacher bus settings changed by transport office" });
    return NextResponse.json({ success: true, message: "Saved." });
  } catch (e) {
    if (e instanceof TeacherRideError) return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    return NextResponse.json({ success: false, error: "Could not save." }, { status: 500 });
  }
}
