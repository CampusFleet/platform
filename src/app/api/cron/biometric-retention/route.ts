import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/security/cron-auth";
import { runBiometricRetention } from "@/lib/biometrics-lifecycle";
import { processPending } from "@/lib/gate/processor";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/biometric-retention (Vercel Cron, daily) — retention purge + sweep of any gate
 * captures still pending (e.g. face service was down when they arrived).
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const retention = await runBiometricRetention();
  const swept = await processPending({ limit: 100 });
  return NextResponse.json({ success: true, retention, swept: swept.length });
}
