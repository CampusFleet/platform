import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";

export const dynamic = "force-dynamic";

/**
 * POST /api/client-errors { message, stack?, path?, digest? }
 * Browser crashes caught by error.tsx / MapBoundary are written to the server log (Vercel logs,
 * prefix "[client-error]") so they can be fixed without asking the user for the console.
 * Nothing is stored. Bodies are truncated.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req).catch(() => null);
  const raw = await req.text().catch(() => "");
  if (raw.length > 20_000) return NextResponse.json({ ok: false }, { status: 413 });
  let body: any = {};
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
  console.error(
    "[client-error]",
    JSON.stringify({
      message: clip(body.message, 500),
      path: clip(body.path, 200),
      digest: clip(body.digest, 100),
      where: clip(body.where, 100),
      role: session?.role ?? null,
      ua: clip(req.headers.get("user-agent"), 160),
      stack: clip(body.stack, 3000),
    })
  );
  return NextResponse.json({ ok: true });
}
