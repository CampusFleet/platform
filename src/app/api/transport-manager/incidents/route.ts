import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { getSecurityIncidents } from "@/lib/biometrics";
import type { IncidentStatus, SecuritySeverity } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized: Missing active session token" }, { status: 401 });
    }

    const authorizedRoles = ["transport_manager", "transport_admin", "admin"];
    if (!authorizedRoles.includes(session.role)) {
      return NextResponse.json(
        { success: false, message: `Forbidden: Role '${session.role}' is not authorized to inspect security incidents` },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status") as IncidentStatus | null;
    const severityParam = searchParams.get("severity") as SecuritySeverity | null;
    const busIdParam = searchParams.get("busId");
    const limitParam = searchParams.get("limit");

    const incidents = await getSecurityIncidents({
      status: statusParam || undefined,
      severity: severityParam || undefined,
      busId: busIdParam ? parseInt(busIdParam, 10) : undefined,
      limit: limitParam ? parseInt(limitParam, 10) : 50,
    });

    return NextResponse.json({
      success: true,
      count: incidents.length,
      incidents,
    });
  } catch (err: any) {
    console.error("Fetch security incidents error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to retrieve security incidents" },
      { status: 500 }
    );
  }
}
