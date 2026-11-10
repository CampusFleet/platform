import crypto from "crypto";

/**
 * Verifies a scheduled-job call: `Authorization: Bearer <CRON_SECRET>`.
 * Vercel Cron sends exactly this header when CRON_SECRET is configured.
 * Fails closed when CRON_SECRET is not set.
 */
export function isAuthorizedCron(req: { headers: Headers }): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") || "";
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const received = Buffer.from(header, "utf8");
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}
