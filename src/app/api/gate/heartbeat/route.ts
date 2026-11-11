import { NextRequest, NextResponse } from "next/server";
import { authenticateDevice, touchDevice } from "@/lib/gate/device-auth";
import { publishOpsEvent } from "@/lib/gate/ops-events";
import { supabaseAdmin } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

/**
 * POST /api/gate/heartbeat — signed device health report + over-the-air config pull.
 * Body: { firmware, queueDepth, oldestQueuedAt, cameras: { in, out }, gps: { fix, satellites }, uptimeS, diskFreeMb }
 * Response: config the agent applies without a redeploy.
 */
export async function POST(req: NextRequest) {
  const raw = Buffer.from(await req.arrayBuffer());
  if (raw.length > 32 * 1024) return NextResponse.json({ error: "Too large." }, { status: 413 });
  const auth = await authenticateDevice(req.headers, "POST", new URL(req.url).pathname, raw);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: any = {};
  try {
    body = JSON.parse(raw.toString("utf8") || "{}");
  } catch {}
  const health = {
    queueDepth: Number(body.queueDepth) || 0,
    oldestQueuedAt: typeof body.oldestQueuedAt === "string" ? body.oldestQueuedAt : null,
    cameras: typeof body.cameras === "object" ? body.cameras : null,
    gps: typeof body.gps === "object" ? body.gps : null,
    uptimeS: Number(body.uptimeS) || null,
    diskFreeMb: Number(body.diskFreeMb) || null,
    reportedAt: new Date().toISOString(),
  };
  await touchDevice(auth.device.id, {
    health,
    firmware_version: typeof body.firmware === "string" ? body.firmware.slice(0, 40) : null,
    last_ip: req.headers.get("x-forwarded-for")?.split(",")[0] || null,
  });
  await publishOpsEvent({ type: "DEVICE", busId: auth.device.bus_id, deviceId: auth.device.id, status: "HEARTBEAT" });

  const { data: settings } = await supabaseAdmin.from("transport_settings").select("attendance_mode").limit(1).maybeSingle();
  const faceEnabled = !settings || ["FACE_ID", "ALL"].includes(settings.attendance_mode);
  return NextResponse.json({
    busId: auth.device.bus_id,
    door: auth.device.door,
    config: {
      captureEnabled: faceEnabled && Boolean(auth.device.bus_id),
      minFacePx: 80,
      crossingCooldownS: 8,
      uploadBatchSize: 5,
      heartbeatIntervalS: 60,
      jpegQuality: 88,
      cropSizePx: 320,
    },
    serverTime: new Date().toISOString(),
  });
}
