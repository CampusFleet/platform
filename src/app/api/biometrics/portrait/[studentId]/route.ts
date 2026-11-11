import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { readEvidence } from "@/lib/gate/evidence";
import { isSafeId } from "@/lib/security/safe-id";

export const dynamic = "force-dynamic";

const STAFF = ["admin", "transport_admin", "transport_manager", "driver", "conductor", "teacher"];

/**
 * GET /api/biometrics/portrait/:studentId?k=<blob key>
 * Official commuter photo from private storage. Visible to the student and to staff who verify riders.
 */
export async function GET(req: NextRequest, { params }: { params: { studentId: string } }) {
  const session = await getSessionFromRequest(req);
  if (!session) return new NextResponse(null, { status: 401 });
  const { studentId } = params;
  const key = new URL(req.url).searchParams.get("k") || "";
  if (!isSafeId(studentId) || !key.startsWith(`portraits/${studentId}`)) return new NextResponse(null, { status: 400 });

  if (!STAFF.includes(session.role)) {
    const { data: own } = await supabaseAdmin.from("students").select("id").eq("user_id", session.userId).maybeSingle();
    if (own?.id !== studentId) return new NextResponse(null, { status: 403 });
  }

  const img = await readEvidence(key).catch(() => null);
  if (!img) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(img), {
    headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" },
  });
}
