import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getSessionFromRequest } from "@/lib/jwt";
import { deriveDeviceKey, isValidMac, normalizeMac } from "@/lib/gate/device-auth";

export const dynamic = "force-dynamic";
const MANAGE = ["admin", "transport_admin", "transport_manager"];

async function guard(req: NextRequest) {
  const s = await getSessionFromRequest(req);
  if (!s || !MANAGE.includes(s.role)) return null;
  return s;
}

/** GET /api/gate/devices — paired gate devices with health (no keys). */
export async function GET(req: NextRequest) {
  if (!(await guard(req))) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const { data, error } = await supabaseAdmin
    .from("gate_devices")
    .select("id, device_mac, kind, bus_id, door, label, key_version, paired_at, revoked_at, last_seen_at, firmware_version, health, buses(bus_number)")
    .order("paired_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const now = Date.now();
  return NextResponse.json({
    devices: (data || []).map((d: any) => ({
      ...d,
      busNumber: d.buses?.bus_number ?? null,
      online: Boolean(d.last_seen_at && now - new Date(d.last_seen_at).getTime() < 3 * 60_000),
    })),
  });
}

/**
 * POST /api/gate/devices — pair a device MAC to a bus (same flow as RFID readers).
 * Returns the device key ONCE. Re-pairing an existing MAC rotates the key (old one stops working).
 * Body: { mac, busId, door: "IN"|"OUT"|"BOTH", kind?: "PI_GATE"|"ESP32_RFID", label? }
 */
export async function POST(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const mac = typeof body.mac === "string" ? normalizeMac(body.mac) : "";
  if (!isValidMac(mac) || mac.startsWith("PHONE:")) return NextResponse.json({ error: "Enter a valid MAC address (AA:BB:CC:DD:EE:FF)." }, { status: 400 });
  const door = ["IN", "OUT", "BOTH"].includes(body.door) ? body.door : "BOTH";
  const kind = ["PI_GATE", "ESP32_RFID"].includes(body.kind) ? body.kind : "PI_GATE";
  const busId = Number(body.busId);
  const { data: bus } = await supabaseAdmin.from("buses").select("id, bus_number").eq("id", busId).maybeSingle();
  if (!bus) return NextResponse.json({ error: "Bus not found." }, { status: 404 });

  const { data: existing } = await supabaseAdmin.from("gate_devices").select("id, key_version").eq("device_mac", mac).maybeSingle();
  const keyVersion = existing ? existing.key_version + 1 : 1;
  const row = {
    device_mac: mac,
    kind,
    bus_id: bus.id,
    door,
    label: typeof body.label === "string" ? body.label.slice(0, 80) : null,
    key_version: keyVersion,
    paired_at: new Date().toISOString(),
    paired_by: session.userId,
    revoked_at: null,
  };
  const { data: dev, error } = existing
    ? await supabaseAdmin.from("gate_devices").update(row).eq("id", existing.id).select("id").single()
    : await supabaseAdmin.from("gate_devices").insert(row).select("id").single();
  if (error || !dev) return NextResponse.json({ error: error?.message || "Pairing failed." }, { status: 500 });

  // Keep the RFID reader mapping in sync so existing ESP32 code paths keep working.
  if (kind === "ESP32_RFID") {
    await supabaseAdmin.from("buses").update({ rfid_device_id: null }).eq("rfid_device_id", mac).neq("id", bus.id);
    await supabaseAdmin.from("buses").update({ rfid_device_id: mac }).eq("id", bus.id);
  }

  await supabaseAdmin.from("audit_logs").insert({
    user_id: session.userId,
    user_email: session.email,
    user_role: session.role,
    action: existing ? "GATE_DEVICE_REPAIRED_KEY_ROTATED" : "GATE_DEVICE_PAIRED",
    entity: "GateDevice",
    entity_id: dev.id,
    new_value: { mac, busId: bus.id, door, kind, keyVersion },
  });

  return NextResponse.json(
    {
      deviceId: dev.id,
      mac,
      busNumber: bus.bus_number,
      door,
      keyVersion,
      deviceKey: deriveDeviceKey(mac, keyVersion),
      notice: "Copy this key into the device now. It is not shown again; re-pair to rotate it.",
    },
    { headers: { "cache-control": "no-store" } }
  );
}

/** DELETE /api/gate/devices?id=… — revoke a device immediately. */
export async function DELETE(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await supabaseAdmin.from("gate_devices").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await supabaseAdmin.from("audit_logs").insert({ user_id: session.userId, user_role: session.role, action: "GATE_DEVICE_REVOKED", entity: "GateDevice", entity_id: id });
  return NextResponse.json({ success: true });
}
