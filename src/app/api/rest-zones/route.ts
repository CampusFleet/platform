import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

function mapRestZoneRow(row: any) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    landmark: row.landmark || "",
    fleetCapacity: Number(row.fleet_capacity ?? 25),
    operatingHours: row.operating_hours || "24/7 Fleet Staging",
    campusId: row.campus_id || "",
    isActive: Boolean(row.is_active ?? true),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * GET /api/rest-zones
 * Fetches all fleet staging depots and overnight rest areas from database
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const campusId = searchParams.get("campusId");

    let query = supabaseAdmin
      .from("rest_zones")
      .select("*")
      .order("created_at", { ascending: true });

    if (campusId) {
      query = query.eq("campus_id", campusId);
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    const restZones = (rows || []).map(mapRestZoneRow);

    return NextResponse.json({
      success: true,
      restZones,
    });
  } catch (error: any) {
    console.error("GET /api/rest-zones error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch rest zones." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/rest-zones
 * Creates a new fleet rest depot in the database
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      name,
      code,
      latitude,
      longitude,
      landmark,
      fleetCapacity,
      operatingHours,
      campusId,
      isActive,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Depot name is required." }, { status: 400 });
    }
    if (!code?.trim()) {
      return NextResponse.json({ error: "Depot code is required." }, { status: 400 });
    }
    if (latitude === undefined || longitude === undefined) {
      return NextResponse.json({ error: "Valid GPS coordinates required." }, { status: 400 });
    }

    const payload = {
      id: id || `depot-${Date.now()}`,
      name: name.trim(),
      code: code.trim().toUpperCase(),
      latitude: Number(latitude),
      longitude: Number(longitude),
      landmark: (landmark || "").trim(),
      fleet_capacity: fleetCapacity !== undefined ? Number(fleetCapacity) : 25,
      operating_hours: (operatingHours || "24/7 Fleet Staging").trim(),
      campus_id: campusId || null,
      is_active: isActive !== false,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("rest_zones")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      restZone: mapRestZoneRow(data),
    });
  } catch (error: any) {
    console.error("POST /api/rest-zones error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to create rest depot." },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/rest-zones
 * Updates an existing rest depot in the database
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing rest zone ID." }, { status: 400 });
    }

    const dbPayload: any = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) dbPayload.name = updates.name.trim();
    if (updates.code !== undefined) dbPayload.code = updates.code.trim().toUpperCase();
    if (updates.latitude !== undefined) dbPayload.latitude = Number(updates.latitude);
    if (updates.longitude !== undefined) dbPayload.longitude = Number(updates.longitude);
    if (updates.landmark !== undefined) dbPayload.landmark = updates.landmark.trim();
    if (updates.fleetCapacity !== undefined) dbPayload.fleet_capacity = Number(updates.fleetCapacity);
    if (updates.operatingHours !== undefined) dbPayload.operating_hours = updates.operatingHours.trim();
    if (updates.campusId !== undefined) dbPayload.campus_id = updates.campusId || null;
    if (updates.isActive !== undefined) dbPayload.is_active = Boolean(updates.isActive);

    const { data, error } = await supabaseAdmin
      .from("rest_zones")
      .update(dbPayload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      restZone: mapRestZoneRow(data),
    });
  } catch (error: any) {
    console.error("PATCH /api/rest-zones error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to update rest depot." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/rest-zones
 * Deletes a rest depot from the database
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing rest zone ID." }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("rest_zones").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ success: true, message: "Depot deleted successfully." });
  } catch (error: any) {
    console.error("DELETE /api/rest-zones error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to delete rest depot." },
      { status: 500 }
    );
  }
}

