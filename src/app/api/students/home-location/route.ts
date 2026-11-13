import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/jwt";
import { isManageRole } from "@/lib/security/actor";
import { isSafeId } from "@/lib/security/safe-id";
import { getHomeSettings, updateHome, HomeUpdateError } from "@/lib/students/home";

export const dynamic = "force-dynamic";

/**
 * Home location and pickup stop (Settings). Rules in src/lib/students/home.ts.
 * GET  → { home, stopId, campusId, zoneLocked, zoneId, options, defaultStopId, outOfServiceArea }
 * PUT  { latitude, longitude, address, stopId } → { pickup }
 * Students act on themselves; transport managers may pass ?studentId= / body.studentId.
 * This route never books a seat; the boarding chart assigns buses.
 */

async function actingRef(req: NextRequest, requested: unknown) {
  const session = await getSessionFromRequest(req);
  if (!session) return { error: NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 }) };
  if (isManageRole(session.role)) {
    if (!isSafeId(requested)) return { error: NextResponse.json({ success: false, message: "studentId required" }, { status: 400 }) };
    return { ref: requested as string, session };
  }
  if (session.role !== "student") return { error: NextResponse.json({ success: false, message: "Only students have a pickup stop." }, { status: 403 }) };
  return { ref: session.userId, session };
}

function fail(e: unknown) {
  if (e instanceof HomeUpdateError) return NextResponse.json({ success: false, message: e.message, code: e.code }, { status: e.status });
  console.error("[home-location]", (e as Error).message);
  return NextResponse.json({ success: false, message: "Could not load your pickup stop. Please try again." }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const a = await actingRef(req, req.nextUrl.searchParams.get("studentId"));
  if ("error" in a) return a.error;
  try {
    return NextResponse.json({ success: true, ...(await getHomeSettings(a.ref)) });
  } catch (e) {
    return fail(e);
  }
}

const putBody = z.object({
  studentId: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().trim().min(3, "Enter your home address").max(300),
  stopId: z.string().trim().min(1, "Choose a pickup stop").max(80),
});

export async function PUT(req: NextRequest) {
  const parsed = putBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: parsed.error.issues[0]?.message || "Invalid input." }, { status: 400 });
  const a = await actingRef(req, parsed.data.studentId);
  if ("error" in a) return a.error;
  try {
    const pickup = await updateHome(a.ref, { userId: a.session.userId, role: a.session.role }, parsed.data);
    return NextResponse.json({ success: true, pickup, message: `Pickup stop set to ${pickup.name}.` });
  } catch (e) {
    return fail(e);
  }
}
