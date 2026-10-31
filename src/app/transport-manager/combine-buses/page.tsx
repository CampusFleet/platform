import { getStaffServerData } from "@/lib/staff-data";
import { supabaseAdmin } from "@/lib/supabaseClient";
import TransportManagerMergesView from "@/components/transport-manager/TransportManagerMergesView";

export const dynamic = "force-dynamic";

export default async function TransportManagerCombineBusesPage() {
  await getStaffServerData("/transport-manager/combine-buses");

  const [
    { data: dbSuggestions },
    { data: dbMergePoints },
    { data: buses },
    { data: routes },
  ] = await Promise.all([
    supabaseAdmin.from("bus_merge_suggestions").select("*, bus_merge_points(*)").order("created_at", { ascending: false }).limit(50),
    supabaseAdmin.from("bus_merge_points").select("*").order("code"),
    supabaseAdmin.from("buses").select("id, bus_number, registration_no, capacity, current_route_id, status"),
    supabaseAdmin.from("routes").select("id, name, code"),
  ]);

  const busMap = new Map((buses || []).map((b) => [String(b.id), b]));
  const routeMap = new Map((routes || []).map((r) => [r.id, r]));

  const enriched = (dbSuggestions || []).map((s: any) => {
    const sourceBus = busMap.get(String(s.source_bus_id));
    const targetBus = busMap.get(String(s.target_bus_id));
    const route = routeMap.get(s.route_id);
    const secRoute = s.secondary_route_id ? routeMap.get(s.secondary_route_id) : null;
    const mp = s.bus_merge_points;
    const isRouteStitch = s.orchestration_type === "ROUTE_STITCH_CONSOLIDATION";

    return {
      id: s.id,
      orchestrationType: s.orchestration_type || "INTRA_CORRIDOR_DISASSEMBLY",
      mergePointId: s.merge_point_id,
      mergePointCode: mp?.code || (isRouteStitch ? "STITCH-HUB" : "MP"),
      mergePointName: mp?.name || (isRouteStitch ? "Cross-Corridor Splice" : "Designated Merge Stop"),
      routeId: s.route_id,
      routeName: route ? route.name : s.route_id,
      secondaryRouteId: s.secondary_route_id,
      secondaryRouteName: secRoute ? secRoute.name : s.secondary_route_name || null,
      stitchedRouteName: s.stitched_route_name || (secRoute ? `${route?.name || "Route 1"} + ${secRoute.name}` : null),
      sourceBusId: s.source_bus_id,
      sourceBusName: sourceBus ? (sourceBus.bus_number ? `Bus ${sourceBus.bus_number}` : sourceBus.registration_no) : `Bus ${s.source_bus_id}`,
      sourceOccupancy: s.source_occupancy,
      targetBusId: s.target_bus_id,
      targetBusName: targetBus ? (targetBus.bus_number ? `Bus ${targetBus.bus_number}` : targetBus.registration_no) : `Bus ${s.target_bus_id}`,
      targetOccupancy: s.target_occupancy,
      targetCapacity: s.target_capacity,
      combinedOccupancy: s.combined_occupancy,
      remainingSeats: Math.max(0, s.target_capacity - s.combined_occupancy),
      activeStopIds: s.active_stop_ids || [],
      bypassedStopIds: s.bypassed_stop_ids || [],
      estimatedDetourMinutes: s.estimated_detour_minutes || 0,
      fuelSavedLiters: Number(s.estimated_fuel_saved_liters || 0),
      prunedAbsenteeCount: s.pruned_absentee_count || 0,
      status: s.status,
      rejectionReason: s.rejection_reason,
      suggestedBy: s.suggested_by,
      reviewedBy: s.reviewed_by,
      reviewedAt: s.reviewed_at,
      createdAt: s.created_at,
    };
  });

  return (
    <TransportManagerMergesView
      initialSuggestions={enriched}
      initialMergePoints={dbMergePoints || []}
    />
  );
}
