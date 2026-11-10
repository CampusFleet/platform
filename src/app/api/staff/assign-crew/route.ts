import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { createAuditLogId } from "@/lib/id";

export const dynamic = "force-dynamic";

/**
 * POST /api/staff/assign-crew
 * Assigns a driver and a conductor to a bus / trip with strict role qualification rules:
 * 1. Driver Slot: ONLY qualified drivers (role === 'driver') are permitted. Conductors CANNOT drive.
 * 2. Conductor Slot: BOTH certified conductors (role === 'conductor') AND drivers (role === 'driver') are permitted.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tripId, busId, driverId, conductorId, assignedBy } = body;

    if (!tripId && !busId) {
      return NextResponse.json(
        { success: false, error: "Missing required tripId or busId." },
        { status: 400 }
      );
    }

    // Fetch staff records from PostgreSQL to validate qualifications
    const { data: allStaff } = await supabaseAdmin
      .from("staff")
      .select("id, full_name, role, license_no, phone");

    const { data: allUsers } = await supabaseAdmin
      .from("users")
      .select("id, full_name, role, email, phone");

    const findPersonnel = (id: string) => {
      const staffMember = allStaff?.find((s) => s.id === id || s.full_name === id);
      if (staffMember) return staffMember;
      const userMember = allUsers?.find((u) => u.id === id || u.email === id);
      if (userMember) return userMember;
      return null;
    };

    // 1. Validate Driver Qualification Rule:
    // "a driver can be a conductor but conductor cant" -> Conductor CANNOT be a Driver!
    let validatedDriverName = "";
    if (driverId) {
      const driverRecord = findPersonnel(driverId);
      if (driverRecord) {
        if (driverRecord.role === "conductor") {
          return NextResponse.json(
            {
              success: false,
              error: `Validation Error: ${driverRecord.full_name || "Selected personnel"} is registered as a Conductor and cannot be assigned as a Driver. A commercial heavy vehicle driving license is required.`,
            },
            { status: 400 }
          );
        }
        if (driverRecord.role !== "driver") {
          return NextResponse.json(
            {
              success: false,
              error: `Validation Error: Only certified drivers can be assigned to the driver seat (found role: ${driverRecord.role}).`,
            },
            { status: 400 }
          );
        }
        validatedDriverName = driverRecord.full_name;
      }
    }

    // 2. Validate Conductor Qualification Rule:
    // A driver CAN be a conductor, and a conductor can be a conductor.
    let validatedConductorName = "";
    if (conductorId) {
      const conductorRecord = findPersonnel(conductorId);
      if (conductorRecord) {
        if (conductorRecord.role !== "conductor" && conductorRecord.role !== "driver") {
          return NextResponse.json(
            {
              success: false,
              error: `Validation Error: ${conductorRecord.full_name || "Selected personnel"} has role "${conductorRecord.role}". Only Conductors or certified Drivers can be assigned as Conductor.`,
            },
            { status: 400 }
          );
        }
        validatedConductorName = conductorRecord.full_name;
      }
    }

    // 3. Update the trip in PostgreSQL
    const updatePayload: Record<string, any> = {};
    if (driverId !== undefined) updatePayload.driver_id = driverId;
    if (conductorId !== undefined) updatePayload.conductor_id = conductorId;

    if (body.applyToAllShifts && busId) {
      let query = supabaseAdmin
        .from("trips")
        .update(updatePayload)
        .eq("bus_id", busId);

      if (body.tripDate) {
        query = query.eq("trip_date", body.tripDate);
      }

      const { error: busTripError } = await query;
      if (busTripError) {
        return NextResponse.json({ success: false, error: busTripError.message }, { status: 500 });
      }
    } else if (tripId) {
      const { error: tripError } = await supabaseAdmin
        .from("trips")
        .update(updatePayload)
        .eq("id", tripId);

      if (tripError) {
        return NextResponse.json({ success: false, error: tripError.message }, { status: 500 });
      }
    } else if (busId) {
      const { error: busTripError } = await supabaseAdmin
        .from("trips")
        .update(updatePayload)
        .eq("bus_id", busId);

      if (busTripError) {
        return NextResponse.json({ success: false, error: busTripError.message }, { status: 500 });
      }
    }

    // 4. Log to audit trail in PostgreSQL
    // audit_logs.id is a UUID with a database default (typed "aud_…" IDs would be rejected)
    await supabaseAdmin.from("audit_logs").insert({
      action: "CREW_ASSIGNED",
      reason: `Crew assigned by ${assignedBy || "Transport Operations Staff"}`,
      entity: "TRIP_CREW",
      entity_id: tripId || busId,
      new_value: {
        driverId,
        driverName: validatedDriverName,
        conductorId,
        conductorName: validatedConductorName,
        assignedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Crew assigned successfully! Driver: ${validatedDriverName || "Assigned"}, Conductor: ${validatedConductorName || "Assigned"}`,
      crew: {
        driverId,
        driverName: validatedDriverName,
        conductorId,
        conductorName: validatedConductorName,
      },
    });
  } catch (err: any) {
    console.error("Assign crew API error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
