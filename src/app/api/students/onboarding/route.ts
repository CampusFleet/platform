import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { loadPickupCatalog } from "@/lib/students/pickup";
import { onboardingInput, saveOnboarding, OnboardingError } from "@/lib/students/onboarding";

export const dynamic = "force-dynamic";

/**
 * Single-page onboarding.
 * GET  → { campuses: [{ id, name, isPrimary, latitude, longitude }] } for the campus picker and map centre.
 * POST → saves details, class, home and pickup stop for the signed-in student (see lib/students/onboarding).
 *        Returns { studentId, pickup: { stop, zone, fee, route } }. Payment is started separately.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  const { campuses } = await loadPickupCatalog();
  return NextResponse.json({ success: true, campuses });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  if (session.role !== "student") return NextResponse.json({ success: false, error: "Only students can onboard." }, { status: 403 });

  const parsed = onboardingInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ success: false, error: issue?.message || "Invalid details.", field: issue?.path.join(".") }, { status: 400 });
  }
  try {
    const result = await saveOnboarding({ userId: session.userId, email: session.email }, parsed.data);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    if (e instanceof OnboardingError) return NextResponse.json({ success: false, error: e.message, code: e.code }, { status: e.status });
    console.error("[onboarding] POST failed:", (e as Error).message);
    return NextResponse.json({ success: false, error: "Could not save your details. Please try again." }, { status: 500 });
  }
}
