import crypto from "crypto";

/**
 * Client for the Python face service (github.com/CampusFleet/face-service). Server-only.
 * Requests are signed: HMAC_SHA256(FACE_SERVICE_KEY, "<ts>\nPOST\n/v1/template\n<sha256(body)>").
 */
export interface FaceTemplateResult {
  model_version: string;
  faces_detected: number;
  accepted: boolean;
  rejection_reasons: string[];
  template: number[] | null;
  quality: { score: number; face_px: number; sharpness: number; yaw_ratio: number; det_score: number; passed: boolean } | null;
  pad: { real_score: number; passed: boolean } | null;
  bbox: number[] | null;
  elapsed_ms: number;
}

export class FaceServiceError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
  }
}

function config() {
  const url = (process.env.FACE_SERVICE_URL || "").replace(/\/$/, "");
  const key = process.env.FACE_SERVICE_KEY || "";
  if (!url || key.length < 32) {
    throw new FaceServiceError("FACE_SERVICE_URL / FACE_SERVICE_KEY are not configured.", false);
  }
  return { url, key };
}

export function signFaceRequest(key: string, ts: string, path: string, body: Buffer): string {
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  return crypto.createHmac("sha256", key).update(`${ts}\nPOST\n${path}\n${bodyHash}`).digest("hex");
}

export async function createFaceTemplate(
  image: Buffer,
  opts: { pad?: boolean; requestId?: string; timeoutMs?: number } = {}
): Promise<FaceTemplateResult> {
  const { url, key } = config();
  const path = "/v1/template";
  const ts = String(Math.floor(Date.now() / 1000));
  let res: Response;
  try {
    res = await fetch(`${url}${path}${opts.pad === false ? "?pad=false" : ""}`, {
      method: "POST",
      headers: {
        "content-type": "image/jpeg",
        "x-cf-timestamp": ts,
        "x-cf-signature": signFaceRequest(key, ts, path, image),
        ...(opts.requestId ? { "x-request-id": opts.requestId } : {}),
      },
      body: new Uint8Array(image),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10000),
      cache: "no-store",
    });
  } catch (err: any) {
    throw new FaceServiceError(`Face service unreachable: ${err?.name || err}`, true);
  }
  if (res.status === 400) throw new FaceServiceError("Image could not be decoded.", false);
  if (!res.ok) throw new FaceServiceError(`Face service HTTP ${res.status}`, res.status >= 500 || res.status === 429);
  return (await res.json()) as FaceTemplateResult;
}

/** pgvector literal for a numeric array. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.map((x) => Number(x).toFixed(6)).join(",")}]`;
}

export function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return 1 - dot;
}
