import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getSessionFromRequest } from "@/lib/jwt";

const MANAGE_ROLES = ["admin", "transport_admin", "transport_manager"];

// GET /api/dispatch - Get progressive dispatch rules and evaluated bus queue
export async function GET() {
  try {
    // 1. Fetch current dispatch configuration
    const { data: config, error: cfgErr } = await supabaseAdmin
      .from("dispatch_configs")
      .select("*")
      .limit(1)
      .single();

    if (cfgErr && cfgErr.code !== "PGRST116") throw cfgErr;

    const currentConfig = config || {
      min_occupancy_percent: 80,
      max_wait_minutes: 15,
      progressive_dispatch_enabled: true,
    };

    // 2. Fetch active buses
    const { data: buses, error: busErr } = await supabaseAdmin
      .from("buses")
      .select("*, routes(id, name, code)")
      .not("status", "in", '("MAINTENANCE","OUT_OF_SERVICE")')
      .order("occupancy", { ascending: false });

    if (busErr) throw busErr;

    // 3. Evaluate each bus against progressive dispatch threshold
    const evaluatedBuses = (buses || []).map((b) => {
      const cap = b.capacity || 50;
      const occ = b.occupancy || 0;
      const percent = Math.round((occ / cap) * 100);

      // Check if qualifies for progressive dispatch
      const meetsOccupancy = percent >= currentConfig.min_occupancy_percent;
      const isAlreadyDispatched = b.status === "DISPATCHED" || b.status === "ON_TRIP";
      const isReadyToDispatch = !isAlreadyDispatched && meetsOccupancy && currentConfig.progressive_dispatch_enabled;

      return {
        id: b.id,
        busNumber: b.bus_number || b.plate_number || b.name,
        plateNumber: b.plate_number,
        routeId: b.route_id || (b.routes as any)?.id,
        routeName: (b.routes as any)?.name || "Assigned Route",
        capacity: cap,
        occupancy: occ,
        occupancyPercent: percent,
        status: b.status,
        meetsOccupancy,
        isReadyToDispatch,
        dispatchStatus: isAlreadyDispatched
          ? "DISPATCHED"
          : isReadyToDispatch
          ? "READY_TO_DISPATCH"
          : "BOARDING",
      };
    });

    return NextResponse.json({
      success: true,
      config: currentConfig,
      queue: evaluatedBuses,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to load dispatch status." },
      { status: 500 }
    );
  }
}

// POST /api/dispatch - Update thresholds OR Dispatch specific bus
export async function POST(req: NextRequest) {
  try {
    // Actor identity comes from the session, never from the body.
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    if (!MANAGE_ROLES.includes(session.role)) {
      return NextResponse.json({ success: false, message: "Only transport managers can change dispatch." }, { status: 403 });
    }
    const body = await req.json();
    const { action, minOccupancyPercent, maxWaitMinutes, enabled, busId } = body;
    const dispatcherName = session.fullName || session.email;

    // ACTION: UPDATE THRESHOLDS
    if (action === "UPDATE_CONFIG") {
      const updates: any = {
        updated_at: new Date().toISOString(),
      };
      if (minOccupancyPercent !== undefined) updates.min_occupancy_percent = Number(minOccupancyPercent);
      if (maxWaitMinutes !== undefined) updates.max_wait_minutes = Number(maxWaitMinutes);
      if (enabled !== undefined) updates.progressive_dispatch_enabled = Boolean(enabled);

      const { data: existing } = await supabaseAdmin.from("dispatch_configs").select("id").limit(1).maybeSingle();

      let updatedConfig;
      if (existing) {
        const { data, error } = await supabaseAdmin
          .from("dispatch_configs")
          .update(updates)
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        updatedConfig = data;
      } else {
        const { data, error } = await supabaseAdmin
          .from("dispatch_configs")
          .insert({
            min_occupancy_percent: minOccupancyPercent || 80,
            max_wait_minutes: maxWaitMinutes || 15,
            progressive_dispatch_enabled: enabled ?? true,
          })
          .select()
          .single();
        if (error) throw error;
        updatedConfig = data;
      }

      await supabaseAdmin.from("audit_logs").insert({
        user_id: session.userId,
        user_role: session.role,
        action: "UPDATE_DISPATCH_CONFIG",
        entity: "DispatchConfig",
        entity_id: updatedConfig.id,
        reason: `Progressive dispatch threshold set to ${updatedConfig.min_occupancy_percent}% occupancy, max wait ${updatedConfig.max_wait_minutes} min`,
        new_value: updatedConfig,
      });

      return NextResponse.json({ success: true, config: updatedConfig });
    }

    // ACTION: DISPATCH BUS NOW
    if (action === "DISPATCH_BUS") {
      if (!busId) {
        return NextResponse.json({ success: false, message: "busId is required." }, { status: 400 });
      }

      const { data: bus, error: busErr } = await supabaseAdmin
        .from("buses")
        .select("*")
        .eq("id", busId)
        .single();

      if (busErr || !bus) {
        return NextResponse.json({ success: false, message: "Bus not found." }, { status: 404 });
      }

      // Update bus status to DISPATCHED
      const { data: updatedBus, error: upErr } = await supabaseAdmin
        .from("buses")
        .update({ status: "DISPATCHED" })
        .eq("id", busId)
        .select()
        .single();

      if (upErr) throw upErr;

      // Audit log
      await supabaseAdmin.from("audit_logs").insert({
        user_id: session.userId,
        user_role: session.role,
        action: "PROGRESSIVE_BUS_DISPATCH",
        entity: "Bus",
        entity_id: busId,
        reason: `Bus ${bus.bus_number || bus.plate_number || bus.name} progressively dispatched at ${Math.round(((bus.occupancy || 0) / (bus.capacity || 50)) * 100)}% occupancy by ${dispatcherName || "Traffic Controller"}`,
        previous_value: { status: bus.status },
        new_value: { status: "DISPATCHED" },
      });

      return NextResponse.json({
        success: true,
        message: `Bus ${bus.bus_number || bus.name || busId} has been progressively dispatched!`,
        bus: updatedBus,
      });
    }

    return NextResponse.json({ success: false, message: "Invalid action." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to update dispatch." },
      { status: 500 }
    );
  }
}
