import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { generateRollingBusPayload, DEFAULT_TIME_STEP_SECONDS } from "@/lib/rolling-bus-crypto";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { isSafeId } from "@/lib/security/safe-id";

export const dynamic = "force-dynamic";

/**
 * GET /api/boarding/rolling-token
 *
 * Fetches the current time-synchronized rolling cryptographic QR payload
 * for an active bus display screen or conductor tablet.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Authentication required." },
      { status: 401 }
    );
  }

  // Only on-bus crew / transport operations may display the rolling door QR.
  // A student who could mint tokens could "board" remotely.
  if (!["conductor", "driver", "transport_admin", "transport_manager", "admin"].includes(session.role)) {
    return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const busId = searchParams.get("busId");

  if (!busId || !isSafeId(busId)) {
    return NextResponse.json(
      { success: false, error: "Missing or invalid busId parameter." },
      { status: 400 }
    );
  }

  const { data: bus } = await supabaseAdmin
    .from("buses")
    .select("id, bus_number")
    .eq("id", busId)
    .maybeSingle();
  if (!bus) {
    return NextResponse.json({ success: false, error: "Bus not found." }, { status: 404 });
  }

  let payload;
  try {
    payload = generateRollingBusPayload(String(bus.id), `Bus ${bus.bus_number}`, undefined, DEFAULT_TIME_STEP_SECONDS);
  } catch (err: any) {
    console.error("[rolling-token]", err?.message);
    return NextResponse.json({ success: false, error: "Rolling QR is not configured on the server." }, { status: 503 });
  }

  return NextResponse.json(
    {
      success: true,
      payload,
      serverTimeSec: Math.floor(Date.now() / 1000),
      stepSeconds: DEFAULT_TIME_STEP_SECONDS,
      remainingInStepSec: DEFAULT_TIME_STEP_SECONDS - (Math.floor(Date.now() / 1000) % DEFAULT_TIME_STEP_SECONDS),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    }
  );
}
