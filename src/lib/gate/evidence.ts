import { put, get, del } from "@vercel/blob";

/**
 * Private evidence storage (Vercel Blob, access: "private").
 * Face crops are never public: they are read server-side and streamed only to authorised staff,
 * with every view written to biometric_access_log. Purged after the retention window.
 */
const MAX_CROP_BYTES = 600 * 1024;

export function isJpeg(buf: Buffer): boolean {
  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

export function decodeImagePayload(b64: unknown): Buffer {
  if (typeof b64 !== "string" || b64.length === 0) throw new Error("image is required (base64 JPEG)");
  const clean = b64.replace(/^data:image\/jpeg;base64,/, "");
  const buf = Buffer.from(clean, "base64");
  if (buf.length === 0 || buf.length > MAX_CROP_BYTES) throw new Error(`image must be 1 byte – ${MAX_CROP_BYTES / 1024} KB`);
  if (!isJpeg(buf)) throw new Error("image must be a JPEG");
  return buf;
}

export async function storeEvidence(pathname: string, image: Buffer): Promise<string> {
  const res = await put(pathname, image, {
    access: "private",
    contentType: "image/jpeg",
    addRandomSuffix: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return res.pathname;
}

export async function readEvidence(pathname: string): Promise<Buffer | null> {
  const res = await get(pathname, { access: "private", useCache: false, token: process.env.BLOB_READ_WRITE_TOKEN });
  if (!res || res.statusCode !== 200 || !res.stream) return null;
  return Buffer.from(await new Response(res.stream).arrayBuffer());
}

export async function deleteEvidence(pathnames: string[]): Promise<void> {
  const list = pathnames.filter(Boolean);
  if (list.length === 0) return;
  await del(list, { token: process.env.BLOB_READ_WRITE_TOKEN });
}
