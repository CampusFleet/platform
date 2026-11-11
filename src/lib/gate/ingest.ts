import { supabaseAdmin } from "@/lib/supabaseClient";
import { decodeImagePayload, storeEvidence } from "@/lib/gate/evidence";
import type { GateDevice } from "@/lib/gate/device-auth";

/**
 * Validates and stores a batch of door captures. Idempotent per (device, idempotencyKey):
 * a device that retries after a lost response gets the original capture back, not a duplicate.
 */
export const MAX_BATCH = 10;
const MAX_PAST_MS = 72 * 3600_000; // offline buffer upload window (≥ 24 h required)
const MAX_FUTURE_MS = 5 * 60_000;

export interface IncomingCapture {
  idempotencyKey: string;
  door: "IN" | "OUT";
  capturedAt: string;
  latitude?: number | null;
  longitude?: number | null;
  gpsAccuracyM?: number | null;
  trackId?: string | null;
  image: string; // base64 JPEG face crop
}

export interface IngestOutcome {
  accepted: { idempotencyKey: string; captureId: string; duplicate: boolean }[];
  rejected: { idempotencyKey: string | null; error: string }[];
}

function validate(raw: any, device: GateDevice, now: number): { ok: true; c: IncomingCapture; image: Buffer } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "capture must be an object" };
  const key = raw.idempotencyKey;
  if (typeof key !== "string" || !/^[A-Za-z0-9_.:-]{8,80}$/.test(key)) return { ok: false, error: "idempotencyKey must be 8–80 safe characters" };
  if (raw.door !== "IN" && raw.door !== "OUT") return { ok: false, error: "door must be IN or OUT" };
  if (device.door !== "BOTH" && device.door !== raw.door) return { ok: false, error: `device is paired to the ${device.door} door` };
  const t = Date.parse(raw.capturedAt);
  if (!Number.isFinite(t)) return { ok: false, error: "capturedAt must be an ISO timestamp" };
  if (t > now + MAX_FUTURE_MS || t < now - MAX_PAST_MS) return { ok: false, error: "capturedAt outside the accepted window" };
  const num = (v: any, lo: number, hi: number) => (v === null || v === undefined ? null : Number.isFinite(Number(v)) && Number(v) >= lo && Number(v) <= hi ? Number(v) : NaN);
  const lat = num(raw.latitude, -90, 90);
  const lon = num(raw.longitude, -180, 180);
  const acc = num(raw.gpsAccuracyM, 0, 10000);
  if (Number.isNaN(lat) || Number.isNaN(lon) || Number.isNaN(acc)) return { ok: false, error: "invalid GPS fields" };
  let image: Buffer;
  try {
    image = decodeImagePayload(raw.image);
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  const trackId = typeof raw.trackId === "string" ? raw.trackId.slice(0, 64) : null;
  return {
    ok: true,
    image,
    c: { idempotencyKey: key, door: raw.door, capturedAt: new Date(t).toISOString(), latitude: lat, longitude: lon, gpsAccuracyM: acc, trackId, image: "" },
  };
}

export async function ingestCaptures(device: GateDevice, captures: unknown[], tripId: string | null = null): Promise<IngestOutcome> {
  const out: IngestOutcome = { accepted: [], rejected: [] };
  if (!device.bus_id) {
    out.rejected.push({ idempotencyKey: null, error: "Device is not paired to a bus." });
    return out;
  }
  const now = Date.now();
  const keys = captures.map((c: any) => (typeof c?.idempotencyKey === "string" ? c.idempotencyKey : "")).filter(Boolean);
  const { data: existing } = keys.length
    ? await supabaseAdmin.from("gate_captures").select("id, idempotency_key").eq("device_id", device.id).in("idempotency_key", keys)
    : { data: [] as any[] };
  const seen = new Map((existing || []).map((e) => [e.idempotency_key, e.id]));

  for (const raw of captures) {
    const v = validate(raw, device, now);
    if (!v.ok) {
      out.rejected.push({ idempotencyKey: (raw as any)?.idempotencyKey ?? null, error: v.error });
      continue;
    }
    const dup = seen.get(v.c.idempotencyKey);
    if (dup) {
      out.accepted.push({ idempotencyKey: v.c.idempotencyKey, captureId: dup, duplicate: true });
      continue;
    }
    try {
      const day = v.c.capturedAt.slice(0, 10);
      const blobKey = await storeEvidence(`gate-evidence/${day}/bus-${device.bus_id}/${v.c.door.toLowerCase()}.jpg`, v.image);
      const { data, error } = await supabaseAdmin
        .from("gate_captures")
        .insert({
          device_id: device.id,
          bus_id: device.bus_id,
          trip_id: tripId,
          door: v.c.door,
          idempotency_key: v.c.idempotencyKey,
          captured_at: v.c.capturedAt,
          latitude: v.c.latitude,
          longitude: v.c.longitude,
          gps_accuracy_m: v.c.gpsAccuracyM,
          track_id: v.c.trackId,
          evidence_blob_key: blobKey,
          status: "PENDING",
        })
        .select("id")
        .single();
      if (error) {
        // Concurrent retry won the race: return the stored row
        if (error.code === "23505") {
          const { data: row } = await supabaseAdmin.from("gate_captures").select("id").eq("device_id", device.id).eq("idempotency_key", v.c.idempotencyKey).maybeSingle();
          if (row) {
            out.accepted.push({ idempotencyKey: v.c.idempotencyKey, captureId: row.id, duplicate: true });
            continue;
          }
        }
        throw error;
      }
      out.accepted.push({ idempotencyKey: v.c.idempotencyKey, captureId: data.id, duplicate: false });
    } catch (err: any) {
      out.rejected.push({ idempotencyKey: v.c.idempotencyKey, error: `storage failed: ${err?.message || err}` });
    }
  }
  return out;
}

/** Driver/conductor phone fallback: bus comes from the crew member's trip today, never from the request. */
export async function resolvePhoneDevice(userId: string): Promise<{ device: GateDevice; tripId: string } | { error: string }> {
  const { data: staff } = await supabaseAdmin.from("staff").select("id").eq("user_id", userId).maybeSingle();
  if (!staff) return { error: "No staff record for this account." };
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const { data: trips } = await supabaseAdmin
    .from("trips")
    .select("id, bus_id, status, started_at")
    .eq("trip_date", today)
    .or(`driver_id.eq.${staff.id},conductor_id.eq.${staff.id}`)
    .not("status", "in", "(CANCELLED,COMPLETED)");
  const trip = (trips || []).sort((a, b) => Number(b.status === "IN_PROGRESS") - Number(a.status === "IN_PROGRESS"))[0];
  if (!trip?.bus_id) return { error: "You have no active trip assigned today." };

  const mac = `PHONE:BUS-${trip.bus_id}`;
  const { data: dev } = await supabaseAdmin
    .from("gate_devices")
    .upsert({ device_mac: mac, kind: "PHONE", bus_id: trip.bus_id, door: "BOTH", label: "Crew phone (fallback)" }, { onConflict: "device_mac" })
    .select("id, device_mac, kind, bus_id, door, key_version, revoked_at")
    .single();
  if (!dev || dev.revoked_at) return { error: "Phone gate is disabled for this bus." };
  return { device: dev as GateDevice, tripId: trip.id };
}
