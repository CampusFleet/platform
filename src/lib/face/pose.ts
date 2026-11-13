/**
 * Head-pose helpers shared by the live capture screen (browser) and enroll-v2 (server).
 *
 * Both sides use the same measure as the face service: the horizontal distance from the nose tip
 * to the midpoint between the eyes, divided by the distance between the eyes ("yaw ratio").
 * About 0 when looking straight at the camera, about 0.14 at 15° and 0.24 at 25° of head turn.
 * The face service rejects frames above FACE_MAX_YAW_RATIO (0.35), so the turn prompt stays below that.
 */

export interface Point2D {
  x: number;
  y: number;
}

/** Client gates: what the capture screen asks for. */
export const CLIENT_POSE = {
  /** |ratio| at or below this counts as looking straight. */
  FRONTAL_MAX: 0.07,
  /** The turn prompt is satisfied between these values, in the requested direction. */
  TURN_MIN: 0.16,
  TURN_MAX: 0.32,
} as const;

/** Server gates: looser than the client so small differences between detectors do not fail real users. */
export const SERVER_POSE = {
  FRONTAL_MAX: 0.1,
  TURN_MIN: 0.12,
} as const;

// MediaPipe Face Landmarker (478-point mesh) indices.
const NOSE_TIP = 1;
const RIGHT_EYE = [33, 133]; // subject's right eye, outer + inner corner
const LEFT_EYE = [362, 263]; // subject's left eye, inner + outer corner

function mid(lm: Point2D[], [a, b]: number[]): Point2D | null {
  const p = lm[a];
  const q = lm[b];
  if (!p || !q) return null;
  return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
}

/**
 * Signed yaw ratio from MediaPipe landmarks in the raw (not mirrored) camera frame.
 * Positive means the subject turned their head to their own LEFT (the nose moves toward the
 * right edge of the raw image); negative means they turned to their RIGHT.
 */
export function signedYawRatio(lm: Point2D[] | null | undefined): number | null {
  if (!lm || lm.length < 400) return null;
  const nose = lm[NOSE_TIP];
  const r = mid(lm, RIGHT_EYE);
  const l = mid(lm, LEFT_EYE);
  if (!nose || !r || !l) return null;
  const eyeDist = Math.hypot(l.x - r.x, l.y - r.y);
  if (eyeDist < 1e-4) return null;
  return (nose.x - (r.x + l.x) / 2) / eyeDist;
}

/** Bounding box of the landmarks in normalised [0,1] image units. */
export function faceBox(lm: Point2D[]): { cx: number; cy: number; w: number; h: number } {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of lm) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}

export type FramingIssue = "TOO_FAR" | "TOO_CLOSE" | "OFF_CENTRE" | null;

/** Is the face large enough and roughly centred for a usable pass photo? */
export function framingIssue(lm: Point2D[]): FramingIssue {
  const b = faceBox(lm);
  if (b.w < 0.22) return "TOO_FAR";
  if (b.w > 0.7) return "TOO_CLOSE";
  if (Math.abs(b.cx - 0.5) > 0.16 || Math.abs(b.cy - 0.5) > 0.2) return "OFF_CENTRE";
  return null;
}

export type TurnSide = "LEFT" | "RIGHT";

/** Does this signed ratio satisfy the turn prompt for `side`? */
export function isTurned(ratio: number, side: TurnSide): boolean {
  const v = side === "LEFT" ? ratio : -ratio;
  return v >= CLIENT_POSE.TURN_MIN && v <= CLIENT_POSE.TURN_MAX;
}

export type PoseCheck = { ok: true } | { ok: false; code: "NO_FRONTAL_FRAME" | "NO_TURNED_FRAME" };

/**
 * Server check on the unsigned yaw ratios the face service reported for each frame (null when no
 * face was found). Enrollment needs at least one frame looking straight and one with the head turned,
 * which a single still photo held up to the camera cannot provide.
 */
export function checkEnrollmentPoses(
  ratios: (number | null | undefined)[],
  gates: { frontalMax: number; turnMin: number } = { frontalMax: SERVER_POSE.FRONTAL_MAX, turnMin: SERVER_POSE.TURN_MIN }
): PoseCheck {
  const seen = ratios.filter((r): r is number => typeof r === "number" && Number.isFinite(r)).map(Math.abs);
  if (!seen.some((r) => r <= gates.frontalMax)) return { ok: false, code: "NO_FRONTAL_FRAME" };
  if (!seen.some((r) => r >= gates.turnMin)) return { ok: false, code: "NO_TURNED_FRAME" };
  return { ok: true };
}
