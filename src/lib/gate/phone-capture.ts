/**
 * Browser helpers for the crew-phone gate (pilot fallback).
 * The phone only finds and crops the face; templates and decisions are made on the server.
 */
export interface FaceBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Bounding box (pixels) of MediaPipe normalised landmarks. */
export function boxFromLandmarks(landmarks: { x: number; y: number }[], width: number, height: number): FaceBox | null {
  if (!landmarks?.length) return null;
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX * width, y: minY * height, w: (maxX - minX) * width, h: (maxY - minY) * height };
}

/** Square crop around the face with margin (the server re-detects inside it), as base64 JPEG. */
export function cropFaceJpeg(video: HTMLVideoElement, box: FaceBox | null, outPx = 320, quality = 0.88): string | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  // Without a box (manual scan) use the centre 70% of the frame.
  const b = box ?? { x: vw * 0.15, y: vh * 0.15, w: vw * 0.7, h: vh * 0.7 };
  const side = Math.min(Math.max(b.w, b.h) * 2.0, vw, vh);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const sx = Math.max(0, Math.min(vw - side, cx - side / 2));
  const sy = Math.max(0, Math.min(vh - side, cy - side / 2));
  const c = document.createElement("canvas");
  c.width = outPx;
  c.height = outPx;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, sx, sy, side, side, 0, 0, outPx, outPx);
  return c.toDataURL("image/jpeg", quality).replace(/^data:image\/jpeg;base64,/, "");
}

/** Auto-capture gate: face large enough and steady for N consecutive frames. */
export class SteadyFaceTrigger {
  private streak = 0;
  private last: FaceBox | null = null;
  private lastFiredAt = 0;
  constructor(private minWidthRatio = 0.18, private framesRequired = 3, private cooldownMs = 4000) {}

  update(box: FaceBox | null, frameWidth: number, now = Date.now()): boolean {
    if (!box || box.w / frameWidth < this.minWidthRatio) {
      this.streak = 0;
      this.last = null;
      return false;
    }
    const moved = this.last ? Math.hypot(box.x - this.last.x, box.y - this.last.y) / frameWidth : 0;
    this.streak = moved < 0.05 ? this.streak + 1 : 1;
    this.last = box;
    if (this.streak >= this.framesRequired && now - this.lastFiredAt >= this.cooldownMs) {
      this.lastFiredAt = now;
      this.streak = 0;
      return true;
    }
    return false;
  }
}
