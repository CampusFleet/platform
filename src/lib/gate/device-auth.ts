import crypto from "crypto";
import { redis } from "@/lib/redis";
import { supabaseAdmin } from "@/lib/supabaseClient";

/**
 * Bus device authentication (Pi gate cameras and ESP32 RFID readers).
 *
 * Identity  : the device MAC, paired to a bus by the Transport Admin (same workflow as RFID).
 * Secret    : device key = hex(HMAC_SHA256(GATE_DEVICE_MASTER_KEY, "<normalised mac>:<key_version>")).
 *             Derived on demand, never stored. Shown once at pairing. Re-pairing bumps key_version → old key dies.
 * Request   : headers
 *               X-CF-Device:    MAC
 *               X-CF-Timestamp: unix seconds (±300 s)
 *               X-CF-Nonce:     16–64 chars, single use (Redis, 10 min)
 *               X-CF-Signature: hex(HMAC_SHA256(deviceKey, "<ts>\n<nonce>\n<METHOD>\n<path>\n<sha256_hex(body)>"))
 */
export const MAX_SKEW_SECONDS = 300;
const NONCE_TTL_SECONDS = 600;

export function normalizeMac(mac: string): string {
  return mac.trim().toUpperCase().replace(/-/g, ":");
}

export function isValidMac(mac: string): boolean {
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(normalizeMac(mac)) || /^PHONE:BUS-\d+$/.test(normalizeMac(mac));
}

function masterKey(): string {
  const k = process.env.GATE_DEVICE_MASTER_KEY || "";
  if (k.length < 32) throw new Error("GATE_DEVICE_MASTER_KEY must be set (32+ characters).");
  return k;
}

export function deriveDeviceKey(mac: string, keyVersion: number, master: string = masterKey()): string {
  return crypto.createHmac("sha256", master).update(`${normalizeMac(mac)}:${keyVersion}`).digest("hex");
}

export function signDeviceRequest(deviceKey: string, ts: string, nonce: string, method: string, path: string, body: Buffer | string): string {
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  return crypto.createHmac("sha256", deviceKey).update(`${ts}\n${nonce}\n${method.toUpperCase()}\n${path}\n${bodyHash}`).digest("hex");
}

export interface GateDevice {
  id: string;
  device_mac: string;
  kind: "PI_GATE" | "ESP32_RFID" | "PHONE";
  bus_id: number | null;
  door: "IN" | "OUT" | "BOTH";
  key_version: number;
  revoked_at: string | null;
}

export type DeviceAuthResult =
  | { ok: true; device: GateDevice }
  | { ok: false; status: number; error: string };

export function hasDeviceSignature(headers: Headers): boolean {
  return Boolean(headers.get("x-cf-device") && headers.get("x-cf-signature"));
}

export async function authenticateDevice(
  headers: Headers,
  method: string,
  path: string,
  body: Buffer,
  opts: { now?: number; checkNonce?: (nonce: string) => Promise<boolean> } = {}
): Promise<DeviceAuthResult> {
  const mac = headers.get("x-cf-device");
  const ts = headers.get("x-cf-timestamp");
  const nonce = headers.get("x-cf-nonce");
  const sig = headers.get("x-cf-signature");
  if (!mac || !ts || !nonce || !sig) return { ok: false, status: 401, error: "Missing device signature headers." };
  if (!isValidMac(mac)) return { ok: false, status: 401, error: "Invalid device identifier." };
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) return { ok: false, status: 401, error: "Invalid nonce." };

  const t = Number(ts);
  const now = opts.now ?? Date.now() / 1000;
  if (!Number.isFinite(t) || Math.abs(now - t) > MAX_SKEW_SECONDS) {
    return { ok: false, status: 401, error: "Timestamp outside the allowed window (check the device clock)." };
  }

  const { data: device } = await supabaseAdmin
    .from("gate_devices")
    .select("id, device_mac, kind, bus_id, door, key_version, revoked_at")
    .eq("device_mac", normalizeMac(mac))
    .maybeSingle();
  if (!device || device.revoked_at) return { ok: false, status: 401, error: "Unknown or revoked device." };

  const expected = Buffer.from(signDeviceRequest(deriveDeviceKey(mac, device.key_version), ts, nonce, method, path, body), "utf8");
  const received = Buffer.from(sig, "utf8");
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return { ok: false, status: 401, error: "Bad signature." };
  }

  // Single-use nonce (checked after the signature so attackers can't burn nonces)
  const fresh = opts.checkNonce ? await opts.checkNonce(nonce) : await claimNonce(device.id, nonce);
  if (!fresh) return { ok: false, status: 401, error: "Replayed request." };

  return { ok: true, device: device as GateDevice };
}

async function claimNonce(deviceId: string, nonce: string): Promise<boolean> {
  if (!redis) {
    if (process.env.NODE_ENV === "production") return false; // fail closed
    return true;
  }
  const r = await redis.set(`gate:nonce:${deviceId}:${nonce}`, 1, { nx: true, ex: NONCE_TTL_SECONDS });
  return r === "OK";
}

export async function touchDevice(deviceId: string, extra: Record<string, any> = {}) {
  await supabaseAdmin.from("gate_devices").update({ last_seen_at: new Date().toISOString(), ...extra }).eq("id", deviceId);
}
