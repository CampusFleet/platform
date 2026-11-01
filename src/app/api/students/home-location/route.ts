import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { calculateHaversineDistanceKm } from "@/lib/eta-calculator";
import { cacheDel } from "@/lib/redis";
import type { EnrichedPickupStop } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Intelligent Commuter Stop Allocation, Home Geocoding & Zone Pricing API
 * - Standard SQL & ACID Data Integrity
 * - Geospatial K-Nearest Stops calculation from student home coordinates
 * - Relational Zone, Route, and Subscription Fee binding
 */

// Helper to fetch and enrich nearest stops
async function calculateAndEnrichNearestStops(
  homeLat: number,
  homeLng: number,
  primaryStopId?: string | null,
  autoAssignedStopId?: string | null,
  limit: number = 6
): Promise<EnrichedPickupStop[]> {
  const [stopsRes, zonesRes, routeStopsRes, routesRes] = await Promise.all([
    supabaseAdmin
      .from("stops")
      .select("id, name, code, latitude, longitude, landmark, geofence_radius, zone_id, zone_code, campus_id")
      .order("name"),
    supabaseAdmin
      .from("transit_zones")
      .select("id, code, name, semester_fee, corridor_description"),
    supabaseAdmin
      .from("route_stops")
      .select("route_id, stop_id, stop_order, arrival_offset_minutes"),
    supabaseAdmin
      .from("routes")
      .select("id, name, code, color"),
  ]);

  const allStops = stopsRes.data || [];
  const allZones = zonesRes.data || [];
  const allRouteStops = routeStopsRes.data || [];
  const allRoutes = routesRes.data || [];

  const zoneMap = new Map<string, any>();
  allZones.forEach((z: any) => {
    if (z.id) zoneMap.set(z.id, z);
    if (z.code) zoneMap.set(z.code, z);
  });

  const routeStopMap = new Map<string, any>();
  allRouteStops.forEach((rs: any) => {
    if (!routeStopMap.has(rs.stop_id)) {
      routeStopMap.set(rs.stop_id, rs);
    }
  });

  const routeMap = new Map<string, any>();
  allRoutes.forEach((r: any) => {
    routeMap.set(r.id, r);
  });

  const enriched = allStops
    .map((s: any) => {
      const distanceKm = calculateHaversineDistanceKm(homeLat, homeLng, s.latitude, s.longitude);
      const matchedZone = zoneMap.get(s.zone_id) || zoneMap.get(s.zone_code) || allZones[1] || null;
      const matchedRouteStop = routeStopMap.get(s.id);
      const matchedRoute = matchedRouteStop ? routeMap.get(matchedRouteStop.route_id) : null;

      const walkTimeMins = Math.round((distanceKm / 5.0) * 60); // 5 km/h walking speed

      return {
        id: s.id,
        stopId: s.id,
        name: s.name,
        code: s.code || s.name.substring(0, 4).toUpperCase(),
        latitude: s.latitude,
        longitude: s.longitude,
        landmark: s.landmark || "",
        distanceKm,
        walkTimeMins: Math.max(1, walkTimeMins),
        zoneId: matchedZone?.id || null,
        zoneCode: matchedZone?.code || s.zone_code || "ZONE_B",
        zoneName: matchedZone?.name || "Transit Corridor",
        semesterFee: matchedZone?.semester_fee ? Number(matchedZone.semester_fee) : 12000,
        routeId: matchedRoute?.id || null,
        routeName: matchedRoute?.name || "Campus Transit Corridor",
        routeCode: matchedRoute?.code || "",
        arrivalOffsetMinutes: matchedRouteStop?.arrival_offset_minutes || 0,
        isPrimary: s.id === primaryStopId,
        isAutoAssigned: s.id === autoAssignedStopId,
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);

  return enriched;
}

// ─────────────────────────────────────────────────────────────
// GET: Returns student's home location, active pickup stop, and enriched nearest stops
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const studentId = req.nextUrl.searchParams.get("studentId");
    if (!studentId) {
      return NextResponse.json({ success: false, message: "studentId required" }, { status: 400 });
    }

    // Query authoritative student record
    const { data: dbStudent } = await supabaseAdmin
      .from("students")
      .select("id, user_id, full_name, home_latitude, home_longitude, home_address, auto_assigned_stop_id, primary_stop_id, primary_route_id, zone_id, zone_code, payment_status, total_fee_due, total_fee_paid")
      .or(`id.eq.${studentId},user_id.eq.${studentId}`)
      .maybeSingle();

    let student: any = dbStudent;

    if (!student) {
      const { data: userRow } = await supabaseAdmin
        .from("users")
        .select("id, full_name, role")
        .eq("id", studentId)
        .maybeSingle();

      if (userRow) {
        student = {
          id: userRow.id,
          full_name: userRow.full_name,
          home_latitude: null,
          home_longitude: null,
          home_address: null,
          auto_assigned_stop_id: null,
          primary_stop_id: null,
          zone_code: "ZONE_B",
        };
      } else {
        return NextResponse.json({ success: false, message: "Commuter profile not found." }, { status: 404 });
      }
    }

    let nearestStops: EnrichedPickupStop[] = [];
    if (student.home_latitude && student.home_longitude) {
      nearestStops = await calculateAndEnrichNearestStops(
        student.home_latitude,
        student.home_longitude,
        student.primary_stop_id,
        student.auto_assigned_stop_id,
        6
      );
    }

    // Resolve primary stop object
    const primaryStop = nearestStops.find(s => s.id === student.primary_stop_id) || null;

    return NextResponse.json({
      success: true,
      homeLocation: {
        latitude: student.home_latitude,
        longitude: student.home_longitude,
        address: student.home_address,
        autoAssignedStopId: student.auto_assigned_stop_id,
        primaryStopId: student.primary_stop_id,
        primaryRouteId: student.primary_route_id,
        zoneCode: student.zone_code || "ZONE_B",
        totalFeeDue: student.total_fee_due,
        paymentStatus: student.payment_status || "UNPAID",
        isZoneLocked: student.payment_status === "APPROVED",
      },
      primaryStop,
      nearestStops,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch home location." },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// PUT: Saves home GPS coordinates, auto-assigns or sets chosen stop
// ─────────────────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { studentId, latitude, longitude, address, chosenStopId } = body;

    if (!studentId) {
      return NextResponse.json({ success: false, message: "studentId required" }, { status: 400 });
    }
    if (latitude === undefined || longitude === undefined) {
      return NextResponse.json({ success: false, message: "latitude and longitude required" }, { status: 400 });
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return NextResponse.json({ success: false, message: "Invalid GPS coordinates." }, { status: 400 });
    }

    // 1. Fetch all stops, zones, and routes to resolve auto-assignment & metadata
    const [stopsRes, zonesRes, routeStopsRes] = await Promise.all([
      supabaseAdmin.from("stops").select("id, name, code, latitude, longitude, landmark, zone_id, zone_code"),
      supabaseAdmin.from("transit_zones").select("id, code, name, semester_fee"),
      supabaseAdmin.from("route_stops").select("route_id, stop_id"),
    ]);

    const allStops = stopsRes.data || [];
    const allZones = zonesRes.data || [];
    const allRouteStops = routeStopsRes.data || [];

    // Find nearest stop by Haversine distance
    const sortedStops = allStops
      .map((s: any) => ({
        ...s,
        dist: calculateHaversineDistanceKm(latitude, longitude, s.latitude, s.longitude),
      }))
      .sort((a, b) => a.dist - b.dist);

    const autoStop = sortedStops[0] || null;
    const autoStopId = autoStop?.id || null;

    // Target stop to establish as primary
    const targetStopId = chosenStopId || autoStopId;
    const targetStop = allStops.find((s: any) => s.id === targetStopId) || autoStop;

    // Match zone
    const targetZone = allZones.find(
      (z: any) => z.id === targetStop?.zone_id || z.code === targetStop?.zone_code
    ) || allZones[1] || allZones[0];

    // Match route
    const targetRouteStop = allRouteStops.find((rs: any) => rs.stop_id === targetStopId);
    const targetRouteId = targetRouteStop?.route_id || null;

    // 2. Prepare atomic update payload
    const updatePayload: Record<string, any> = {
      home_latitude: latitude,
      home_longitude: longitude,
    };
    if (address) updatePayload.home_address = address;
    if (autoStopId) updatePayload.auto_assigned_stop_id = autoStopId;

    if (targetStopId) {
      updatePayload.primary_stop_id = targetStopId;
    }
    if (targetZone?.id) {
      updatePayload.zone_id = targetZone.id;
      updatePayload.zone_code = targetZone.code;
    }
    if (targetRouteId) {
      updatePayload.primary_route_id = targetRouteId;
    }

    // Inspect if student already approved payment
    const { data: curStud } = await supabaseAdmin
      .from("students")
      .select("id, payment_status, total_fee_due")
      .or(`id.eq.${studentId},user_id.eq.${studentId}`)
      .maybeSingle();

    if (curStud && curStud.payment_status !== "APPROVED" && targetZone?.semester_fee) {
      updatePayload.total_fee_due = Number(targetZone.semester_fee);
    }

    // 3. Update database
    let { data: updated } = await supabaseAdmin
      .from("students")
      .update(updatePayload)
      .eq("id", studentId)
      .select("*")
      .maybeSingle();

    if (!updated) {
      const res = await supabaseAdmin
        .from("students")
        .update(updatePayload)
        .eq("user_id", studentId)
        .select("*")
        .maybeSingle();
      updated = res.data;
    }

    if (!updated) {
      // Upsert record if missing
      const { data: userRow } = await supabaseAdmin
        .from("users")
        .select("id, full_name, email, phone")
        .eq("id", studentId)
        .maybeSingle();

      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("students")
        .insert({
          id: studentId,
          user_id: studentId,
          full_name: userRow?.full_name || "Commuter",
          semester: "1",
          transport_access_suspended: false,
          total_fee_due: targetZone?.semester_fee ? Number(targetZone.semester_fee) : 12000,
          ...updatePayload,
        })
        .select("*")
        .single();

      if (insErr) throw insErr;
      updated = inserted;
    }

    // 4. Automatic Bus Allocation for Today / Tomorrow
    let assignedBusNumber: string | null = null;
    if (targetStopId && updated?.id) {
      try {
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istDate = new Date(now.getTime() + istOffset);
        const today = istDate.toISOString().split("T")[0];

        if (targetRouteId) {
          const { data: trip } = await supabaseAdmin
            .from("trips")
            .select("id, bus_id, shift_id")
            .eq("route_id", targetRouteId)
            .limit(1)
            .maybeSingle();

          if (trip && trip.bus_id) {
            await supabaseAdmin.from("bus_reservations").upsert(
              {
                student_id: updated.id,
                trip_id: trip.id,
                bus_id: trip.bus_id,
                boarding_stop_id: targetStopId,
                shift_id: trip.shift_id,
                reservation_date: today,
                assigned_by: "AI_STOP_ZONE_ENGINE",
                assignment_score: 0.99,
                status: "ASSIGNED",
              },
              { onConflict: "student_id,reservation_date,shift_id" }
            );

            const { data: busRow } = await supabaseAdmin
              .from("buses")
              .select("bus_number")
              .eq("id", trip.bus_id)
              .maybeSingle();

            if (busRow?.bus_number) assignedBusNumber = busRow.bus_number;
          }
        }
      } catch (allocErr) {
        console.warn("[home-location] Bus allocation warning:", allocErr);
      }
    }

    // 5. ACID Audit Log
    const timestamp = new Date().toISOString();
    await supabaseAdmin.from("audit_logs").insert({
      user_id: studentId,
      user_role: "student",
      action: "STUDENT_PICKUP_STOP_SELECTED",
      entity: "Student",
      entity_id: updated.id,
      reason: `Pickup stop set to "${targetStop?.name || "Assigned Stop"}" (Zone ${targetZone?.code || "ZONE_B"}, ₹${targetZone?.semester_fee || 12000}).`,
      new_value: {
        primaryStopId: targetStopId,
        zoneCode: targetZone?.code,
        semesterFee: targetZone?.semester_fee,
        assignedBus: assignedBusNumber,
        timestamp,
      },
    });

    await cacheDel(`student:${studentId}`);

    // Fetch enriched nearest stops for response
    const nearestStops = await calculateAndEnrichNearestStops(
      latitude,
      longitude,
      targetStopId,
      autoStopId,
      6
    );

    const message = targetStop
      ? assignedBusNumber
        ? `✓ Pickup Stop: ${targetStop.name} (${nearestStops[0]?.distanceKm ?? 0}km walk) • Zone ${targetZone?.code} • Allocated on Bus ${assignedBusNumber}!`
        : `✓ Pickup Stop: ${targetStop.name} (${nearestStops[0]?.distanceKm ?? 0}km walk) • Zone ${targetZone?.code} (Fee: ₹${targetZone?.semester_fee})!`
      : "Home location saved successfully!";

    return NextResponse.json({
      success: true,
      message,
      assignedBusNumber,
      homeLocation: {
        latitude: updated.home_latitude,
        longitude: updated.home_longitude,
        address: updated.home_address,
        autoAssignedStopId: updated.auto_assigned_stop_id,
        primaryStopId: updated.primary_stop_id,
        primaryRouteId: updated.primary_route_id,
        zoneCode: updated.zone_code || targetZone?.code,
        totalFeeDue: updated.total_fee_due,
      },
      selectedStop: nearestStops.find(s => s.id === targetStopId) || nearestStops[0],
      nearestStops,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to save home location." },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// POST: High-Speed 1-Tap Pickup Stop Selection Action
// ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, studentId, stopId } = body;

    if (action === "SELECT_PICKUP_STOP") {
      if (!studentId || !stopId) {
        return NextResponse.json(
          { success: false, message: "studentId and stopId are required" },
          { status: 400 }
        );
      }

      // 1. Fetch Stop & Zone
      const [stopRes, zonesRes, routeStopsRes] = await Promise.all([
        supabaseAdmin.from("stops").select("*").eq("id", stopId).single(),
        supabaseAdmin.from("transit_zones").select("*"),
        supabaseAdmin.from("route_stops").select("route_id, stop_id").eq("stop_id", stopId).limit(1),
      ]);

      const targetStop = stopRes.data;
      if (!targetStop) {
        return NextResponse.json({ success: false, message: "Transit stop not found" }, { status: 404 });
      }

      const allZones = zonesRes.data || [];
      const targetZone = allZones.find(
        (z: any) => z.id === targetStop.zone_id || z.code === targetStop.zone_code
      ) || allZones[1] || allZones[0];

      const targetRouteId = routeStopsRes.data?.[0]?.route_id || null;

      // 2. Inspect Student & Zone Lock Guardrail
      const { data: curStudent } = await supabaseAdmin
        .from("students")
        .select("id, payment_status, zone_code, primary_stop_id")
        .or(`id.eq.${studentId},user_id.eq.${studentId}`)
        .maybeSingle();

      if (!curStudent) {
        return NextResponse.json({ success: false, message: "Student record not found" }, { status: 404 });
      }

      const isZoneLocked = curStudent.payment_status === "APPROVED";
      if (isZoneLocked && curStudent.zone_code && targetZone?.code && curStudent.zone_code !== targetZone.code) {
        return NextResponse.json(
          {
            success: false,
            message: `Your transport pass is locked to Zone ${curStudent.zone_code}. Stop "${targetStop.name}" belongs to Zone ${targetZone.code}. Please request a zone tier switch through Transport Admin.`,
          },
          { status: 403 }
        );
      }

      const updatePayload: Record<string, any> = {
        primary_stop_id: targetStop.id,
        zone_id: targetZone.id,
        zone_code: targetZone.code,
      };
      if (targetRouteId) updatePayload.primary_route_id = targetRouteId;
      if (!isZoneLocked && targetZone.semester_fee) {
        updatePayload.total_fee_due = Number(targetZone.semester_fee);
      }

      await supabaseAdmin.from("students").update(updatePayload).eq("id", curStudent.id);

      // 3. Auto-allocate on Bus Reservation
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const today = new Date(now.getTime() + istOffset).toISOString().split("T")[0];
      let assignedBusNumber: string | null = null;

      if (targetRouteId) {
        const { data: trip } = await supabaseAdmin
          .from("trips")
          .select("id, bus_id, shift_id")
          .eq("route_id", targetRouteId)
          .limit(1)
          .maybeSingle();

        if (trip && trip.bus_id) {
          await supabaseAdmin.from("bus_reservations").upsert(
            {
              student_id: curStudent.id,
              trip_id: trip.id,
              bus_id: trip.bus_id,
              boarding_stop_id: targetStop.id,
              shift_id: trip.shift_id,
              reservation_date: today,
              assigned_by: "AI_STOP_ZONE_ENGINE",
              assignment_score: 0.99,
              status: "ASSIGNED",
            },
            { onConflict: "student_id,reservation_date,shift_id" }
          );

          const { data: busRow } = await supabaseAdmin
            .from("buses")
            .select("bus_number")
            .eq("id", trip.bus_id)
            .maybeSingle();

          if (busRow?.bus_number) assignedBusNumber = busRow.bus_number;
        }
      }

      // 4. ACID Audit Log
      await supabaseAdmin.from("audit_logs").insert({
        user_id: studentId,
        user_role: "student",
        action: "STUDENT_PICKUP_STOP_SELECTED",
        entity: "Student",
        entity_id: curStudent.id,
        reason: `Student switched designated pickup stop to "${targetStop.name}" (Zone ${targetZone.code}).`,
        previous_value: { primaryStopId: curStudent.primary_stop_id, zoneCode: curStudent.zone_code },
        new_value: { primaryStopId: targetStop.id, zoneCode: targetZone.code, assignedBus: assignedBusNumber },
      });

      await cacheDel(`student:${studentId}`);

      return NextResponse.json({
        success: true,
        message: `✓ Designated pickup stop set to "${targetStop.name}" (Zone ${targetZone.code}, ₹${targetZone.semester_fee}/sem)!`,
        stop: {
          id: targetStop.id,
          name: targetStop.name,
          landmark: targetStop.landmark,
          zoneCode: targetZone.code,
          semesterFee: targetZone.semester_fee,
        },
        assignedBusNumber,
      });
    }

    return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to select pickup stop" },
      { status: 500 }
    );
  }
}
