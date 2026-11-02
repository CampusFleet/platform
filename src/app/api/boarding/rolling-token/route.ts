import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { generateRollingBusPayload, DEFAULT_TIME_STEP_SECONDS } from "@/lib/rolling-bus-crypto";

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

  const { searchParams } = new URL(request.url);
  const busId = searchParams.get("busId");
  const busNumber = searchParams.get("busNumber") || `Bus ${busId || "Vehicle"}`;

  if (!busId) {
    return NextResponse.json(
      { success: false, error: "Missing busId parameter." },
      { status: 400 }
    );
  }

  const payload = generateRollingBusPayload(busId, busNumber, undefined, DEFAULT_TIME_STEP_SECONDS);

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
