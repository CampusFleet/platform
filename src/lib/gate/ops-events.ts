import { redis } from "@/lib/redis";

/**
 * Cross-device ops event feed (replaces same-device BroadcastChannel).
 * Events go into a capped Redis list; /api/ops/stream (SSE) tails it for Transport Manager / conductor screens.
 * Payloads carry ids and types only — no names, faces or trip codes.
 */
const KEY = "ops:events";
const MAX_EVENTS = 500;

export type OpsEvent =
  | { type: "GATE"; busId: number; door: "IN" | "OUT"; outcome: string; captureId: string }
  | { type: "INCIDENT"; busId: number; incidentId: string; incidentType: string }
  | { type: "INCIDENT_RESOLVED"; busId: number; incidentId: string }
  | { type: "DEVICE"; busId: number | null; deviceId: string; status: string };

export interface StoredOpsEvent {
  seq: number;
  at: string;
  event: OpsEvent;
}

export async function publishOpsEvent(event: OpsEvent): Promise<void> {
  if (!redis) return;
  try {
    const seq = await redis.incr(`${KEY}:seq`);
    const item: StoredOpsEvent = { seq, at: new Date().toISOString(), event };
    await redis.lpush(KEY, JSON.stringify(item));
    await redis.ltrim(KEY, 0, MAX_EVENTS - 1);
  } catch (err) {
    console.warn("[ops-events] publish failed", err);
  }
}

/** Events with seq > afterSeq, oldest first. */
export async function readOpsEvents(afterSeq: number, limit = 100): Promise<StoredOpsEvent[]> {
  if (!redis) return [];
  const raw = (await redis.lrange(KEY, 0, limit - 1)) as unknown[];
  const items = raw
    .map((r) => (typeof r === "string" ? JSON.parse(r) : r) as StoredOpsEvent)
    .filter((e) => e && e.seq > afterSeq);
  return items.sort((a, b) => a.seq - b.seq);
}

export async function latestOpsSeq(): Promise<number> {
  if (!redis) return 0;
  return Number((await redis.get(`${KEY}:seq`)) || 0);
}
