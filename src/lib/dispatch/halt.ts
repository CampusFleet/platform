import { cacheGet, cacheSet } from "@/lib/redis";
import { createHaltId } from "@/lib/id";
import { db } from "@/lib/supabaseClient";
import type { HaltRequest } from "@/lib/types";

/**
 * "Please wait for me" requests from a rider to their bus crew. Server-only.
 * Stored in Redis for 15 minutes under halt_request:{tripId}:{studentId} (read by the conductor's
 * Halt requests tab through /api/dispatch/halt-requests).
 */
export const HALT_TTL_SECONDS = 900;
export const haltKey = (tripId: string, studentId: string) => `halt_request:${tripId}:${studentId}`;

export function getHaltRequest(tripId: string, studentId: string) {
  return cacheGet<HaltRequest>(haltKey(tripId, studentId));
}

/** Creates a pending request, or returns the existing one unless it was rejected. */
export async function createHaltRequest(tripId: string, studentId: string, at: { latitude: number; longitude: number }): Promise<HaltRequest> {
  const existing = await getHaltRequest(tripId, studentId);
  if (existing && existing.status !== "REJECTED") return existing;
  // Name and photo come from the database, not from the request.
  const { data: student } = await db.from("students_full").select("full_name, photo_url").eq("id", studentId).maybeSingle();
  const now = new Date().toISOString();
  const req: HaltRequest = {
    id: createHaltId(),
    tripId,
    studentId,
    studentName: student?.full_name || "Student",
    studentPhoto: student?.photo_url || undefined,
    latitude: at.latitude,
    longitude: at.longitude,
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
  };
  await cacheSet(haltKey(tripId, studentId), req, HALT_TTL_SECONDS);
  return req;
}
