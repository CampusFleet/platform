import { db } from "@/lib/supabaseClient";
import { decodeImagePayload, storeEvidence, deleteEvidence } from "@/lib/gate/evidence";
import { cacheDel, invalidateCachedStudentProfile } from "@/lib/redis";

/**
 * Official commuter (pass) photo. Server-only.
 *
 * The photo is a live camera capture, stored in the private evidence Blob store. users.photo_url
 * points at the access-controlled /api/biometrics/portrait route, never at a public URL or a data URL.
 * Students may retake it until their pass is paid; after that only staff can change it.
 */

const PORTRAIT_KEY = /[?&]k=([^&]+)/;

/** Blob key of the stored portrait, from a users.photo_url value written by savePortrait. */
export function portraitKeyFromUrl(url: string | null | undefined): string | null {
  if (!url || !url.startsWith("/api/biometrics/portrait/")) return null;
  const m = url.match(PORTRAIT_KEY);
  return m ? decodeURIComponent(m[1]) : null;
}

export class PortraitLockedError extends Error {
  constructor() {
    super("Your pass photo is locked after payment. Ask the transport office to change it.");
  }
}

/** True when the student's pass is paid, so the student can no longer replace the photo. */
export async function isPortraitLocked(studentId: string): Promise<boolean> {
  const { data } = await db.from("students_full").select("payment_status").eq("id", studentId).maybeSingle();
  return (data as { payment_status?: string | null } | null)?.payment_status === "APPROVED";
}

/**
 * Stores `dataUrl` (base64 JPEG) as the student's pass photo and returns the new photo_url.
 * Deletes the previous stored portrait. Throws PortraitLockedError when the pass is already paid.
 */
export async function savePortrait(opts: { studentId: string; userId: string; image: unknown; byStaff?: boolean }): Promise<string> {
  const { studentId, userId } = opts;
  const buf = decodeImagePayload(opts.image);
  if (!opts.byStaff && (await isPortraitLocked(studentId))) throw new PortraitLockedError();

  const { data: user } = await db.from("users").select("photo_url").eq("id", userId).maybeSingle();
  const oldKey = portraitKeyFromUrl(user?.photo_url);

  const key = await storeEvidence(`portraits/${studentId}.jpg`, buf);
  const photoUrl = `/api/biometrics/portrait/${studentId}?k=${encodeURIComponent(key)}`;
  const { error } = await db.from("users").update({ photo_url: photoUrl }).eq("id", userId);
  if (error) {
    await deleteEvidence([key]).catch(() => {});
    throw new Error("Could not save your photo. Please try again.");
  }
  if (oldKey && oldKey !== key) await deleteEvidence([oldKey]).catch(() => {});

  await Promise.all([cacheDel(`student:photo:${userId}`), invalidateCachedStudentProfile([userId, studentId])]);
  return photoUrl;
}
