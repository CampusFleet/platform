import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

// PATCH /api/stops/[id] - Update stop & toggle is_bus_merge_stop
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const stopId = params.id;
    const body = await req.json();
    const { name, code, latitude, longitude, landmark, geofenceRadiusMeters, campusId, campus, isBusMergeStop } = body;

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name.trim();
    if (code !== undefined) updates.code = code.trim().toUpperCase();
    if (latitude !== undefined) updates.latitude = Number(latitude);
    if (longitude !== undefined) updates.longitude = Number(longitude);
    if (landmark !== undefined) updates.landmark = landmark ? landmark.trim() : null;
    if (geofenceRadiusMeters !== undefined) updates.geofence_radius = Number(geofenceRadiusMeters);
    if (campusId !== undefined) updates.campus_id = campusId;
    if (isBusMergeStop !== undefined) updates.is_bus_merge_stop = Boolean(isBusMergeStop);

    const { data: updatedStop, error: updateErr } = await supabaseAdmin
      .from("stops")
      .update(updates)
      .eq("id", stopId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // Handle bus_merge_points synchronization when isBusMergeStop is modified
    if (isBusMergeStop !== undefined) {
      if (isBusMergeStop) {
        // Activate or create merge point
        const mergeCode = `MP-${updatedStop.code || stopId.slice(-6).toUpperCase()}`;
        await supabaseAdmin.from("bus_merge_points").upsert({
          stop_id: stopId,
          route_id: "all-corridors",
          name: `${updatedStop.name} Merge Junction`,
          code: mergeCode,
          description: `Authorized bus consolidation junction at ${updatedStop.name}`,
          is_active: true,
        }, { onConflict: "code" });
      } else {
        // Deactivate merge points for this stop
        await supabaseAdmin
          .from("bus_merge_points")
          .update({ is_active: false })
          .eq("stop_id", stopId);
      }
    }

    await supabaseAdmin.from("audit_logs").insert({
      action: "UPDATE_STOP",
      entity: "Stop",
      entity_id: stopId,
      reason: `Updated stop ${updatedStop.name} (Merge Stop: ${updatedStop.is_bus_merge_stop ? "ON" : "OFF"})`,
      new_value: updatedStop,
    });

    return NextResponse.json({ success: true, stop: updatedStop });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to update stop." },
      { status: 500 }
    );
  }
}

// DELETE /api/stops/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const stopId = params.id;

    // Deactivate merge points
    await supabaseAdmin.from("bus_merge_points").delete().eq("stop_id", stopId);
    await supabaseAdmin.from("route_stops").delete().eq("stop_id", stopId);

    const { error } = await supabaseAdmin.from("stops").delete().eq("id", stopId);
    if (error) throw error;

    await supabaseAdmin.from("audit_logs").insert({
      action: "DELETE_STOP",
      entity: "Stop",
      entity_id: stopId,
      reason: `Deleted stop ${stopId}`,
    });

    return NextResponse.json({ success: true, message: "Stop deleted." });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to delete stop." },
      { status: 500 }
    );
  }
}
