import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { authenticateDevice, hasDeviceSignature, touchDevice } from "@/lib/gate/device-auth";
import { ingestCaptures, resolvePhoneDevice, MAX_BATCH } from "@/lib/gate/ingest";
import { processPending } from "@/lib/gate/processor";
import { getSessionFromRequest } from "@/lib/jwt";
import { isBoardingMethodOn, methodDisabledBody } from "@/lib/attendance/server-policy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 4 * 1024 * 1024; // Vercel request body limit is 4.5 MB
const CREW_ROLES = ["driver", "conductor"];

/**
 * POST /api/gate/captures
 *   Bus devices: signed with the per-device key (see src/lib/gate/device-auth.ts).
 *   Crew phones (pilot fallback): session cookie; the bus is taken from the crew member's trip today.
 * Body: { captures: [{ idempotencyKey, door, capturedAt, latitude?, longitude?, gpsAccuracyM?, trackId?, image }] }
 * Refused with 403 METHOD_DISABLED while Face ID boarding is switched off.
 * Response 200: { accepted: [...], rejected: [...] } — devices delete accepted items from their queue.
 */
export async function POST(req: NextRequest) {
  if (!(await isBoardingMethodOn("faceId"))) {
    return NextResponse.json(methodDisabledBody("faceId"), { status: 403 });
  }
  const raw = Buffer.from(await req.arrayBuffer());
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Batch too large." }, { status: 413 });

  let device;
  let tripId: string | null = null;
  if (hasDeviceSignature(req.headers)) {
    const auth = await authenticateDevice(req.headers, "POST", new URL(req.url).pathname, raw);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    device = auth.device;
  } else {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!CREW_ROLES.includes(session.role)) return NextResponse.json({ error: "Only bus crew can submit gate captures." }, { status: 403 });
    const phone = await resolvePhoneDevice(session.userId);
    if ("error" in phone) return NextResponse.json({ error: phone.error }, { status: 409 });
    device = phone.device;
    tripId = phone.tripId;
  }

  let body: any;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const captures = Array.isArray(body?.captures) ? body.captures : null;
  if (!captures || captures.length === 0 || captures.length > MAX_BATCH) {
    return NextResponse.json({ error: `captures must contain 1–${MAX_BATCH} items.` }, { status: 400 });
  }

  const result = await ingestCaptures(device, captures, tripId);
  waitUntil(touchDevice(device.id, { last_ip: req.headers.get("x-forwarded-for")?.split(",")[0] || null }));
  if (result.accepted.some((a) => !a.duplicate)) {
    // Decide right away (target: < 5 s); the cron sweep retries anything that fails here.
    waitUntil(processPending({ busId: device.bus_id ?? undefined, limit: MAX_BATCH + 5 }).catch((e) => console.error("[gate] process", e)));
  }
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
