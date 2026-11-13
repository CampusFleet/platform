import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/jwt";
import { findPickupOptions } from "@/lib/students/pickup";

export const dynamic = "force-dynamic";

const query = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  campusId: z.string().max(80).optional(),
});

/**
 * GET /api/students/pickup-options?lat&lng&campusId
 * Nearest stops for a home location with zone, semester fee and route. Read-only: nothing is saved.
 * → { options: PickupOption[], defaultStopId, outOfServiceArea }
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
  const parsed = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ success: false, error: "lat and lng are required." }, { status: 400 });
  try {
    const { lat, lng, campusId } = parsed.data;
    const result = await findPickupOptions({ latitude: lat, longitude: lng }, campusId || null);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("[pickup-options]", (e as Error).message);
    return NextResponse.json({ success: false, error: "Could not load bus stops. Please try again." }, { status: 500 });
  }
}
