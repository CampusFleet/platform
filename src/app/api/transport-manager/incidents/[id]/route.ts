import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { updateSecurityIncidentStatus } from "@/lib/biometrics";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UpdateIncidentSchema = z.object({
  status: z.enum(["ACKNOWLEDGED", "RESOLVED"]),
  resolutionNotes: z.string().max(500).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized: Missing active session token" }, { status: 401 });
    }

    const authorizedRoles = ["transport_manager", "transport_admin", "admin"];
    if (!authorizedRoles.includes(session.role)) {
      return NextResponse.json(
        { success: false, message: `Forbidden: Role '${session.role}' is not authorized to update security incidents` },
        { status: 403 }
      );
    }

    const { id } = params;
    if (!id) {
      return NextResponse.json({ success: false, message: "Incident ID is required" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = UpdateIncidentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Validation error", errors: parsed.error.format() },
        { status: 400 }
      );
    }

    const updated = await updateSecurityIncidentStatus(id, {
      status: parsed.data.status,
      resolvedBy: session.userId,
      resolutionNotes: parsed.data.resolutionNotes,
    });

    return NextResponse.json({
      success: true,
      message: `Incident marked as ${parsed.data.status}`,
      incident: updated,
    });
  } catch (err: any) {
    console.error("Update security incident error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to update security incident" },
      { status: 500 }
    );
  }
}
