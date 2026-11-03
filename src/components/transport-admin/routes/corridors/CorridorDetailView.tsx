// @ts-nocheck
"use client";

import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  GitBranch, MapPin, Maximize2, Minimize2, MoreVertical, Route as RouteIcon,
  Search, ShieldAlert, Zap, Truck, Navigation, Settings, LayoutGrid, CalendarDays, UserCircle, RefreshCcw, Map
} from "lucide-react";
import { useRoutesContext } from "@/components/transport-admin/routes/RoutesContext";

const CampusFleetMap = dynamic(() => import("@/components/maps/CampusFleetMap"), { ssr: false });
import WhereIsMyBusFlowchart from "@/components/transit/WhereIsMyBusFlowchart";

export default function CorridorDetailView({ routeId }: { routeId: string }) {
  const { routes, stops, buses, trips, campuses } = useRoutesContext();

  const [routeViewMode, setRouteViewMode] = useState<"FLOWCHART" | "MAP">("FLOWCHART");
  const [selectedBusToAllocate, setSelectedBusToAllocate] = useState("");
  const [isAllocateBusModalOpen, setIsAllocateBusModalOpen] = useState(false);
  const [isOverrideActive, setIsOverrideActive] = useState(false);

  const activeRoute = useMemo(() => {
    if (!routes || routes.length === 0) return null;
    return routes.find(r => r.id === routeId || r.code === routeId) || routes[0];
  }, [routes, routeId]);

  const assignedBuses = useMemo(() => {
    if (!activeRoute) return [];
    return (buses || []).filter(
      b => b?.routeId === activeRoute.id || (b as any)?.currentRouteId === activeRoute.id
    );
  }, [buses, activeRoute]);

  // Enrich stops with coordinates & landmarks from master stops catalog if needed
  const corridorStops = useMemo(() => {
    if (!activeRoute?.stops) return [];
    return (activeRoute.stops || [])
      .map((rs: any, idx: number) => {
        const stopObj =
          rs?.stop ||
          (stops || []).find((s) => s.id === (rs?.stopId || rs?.stop_id)) || {
            id: rs?.stopId || rs?.stop_id || `stop-${idx}`,
            name: rs?.name || `Station ${idx + 1}`,
            code: rs?.code || `ST-${idx + 1}`,
            latitude: Number(rs?.latitude) || 29.38,
            longitude: Number(rs?.longitude) || 79.52,
            landmark: rs?.landmark || "",
            geofenceRadiusMeters: 100,
            campusId: "",
            campus: "",
            isBusMergeStop: false,
          };
        return {
          ...rs,
          stopId: stopObj.id || rs?.stopId,
          stopOrder: rs?.stopOrder ?? idx + 1,
          arrivalOffsetMinutes: rs?.arrivalOffsetMinutes ?? idx * 5,
          bufferTimeMinutes: rs?.bufferTimeMinutes ?? 2,
          stop: stopObj,
        };
      })
      .filter(Boolean);
  }, [activeRoute, stops]);

  const mapStops = useMemo(() => {
    return corridorStops.map((rs: any) => rs.stop).filter(Boolean);
  }, [corridorStops]);

  const corridorCoordinates = useMemo(() => {
    return corridorStops
      .map((rs: any) => (rs?.stop?.latitude && rs?.stop?.longitude ? [rs.stop.latitude, rs.stop.longitude] : null))
      .filter(Boolean) as [number, number][];
  }, [corridorStops]);

  if (!routes || routes.length === 0) {
    return (
      <div className="p-12 text-center bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800">
        <RefreshCcw className="w-6 h-6 text-blue-500 animate-spin mx-auto mb-2" />
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Loading corridor details...</p>
      </div>
    );
  }

  if (!activeRoute) {
    return (
      <div className="p-12 text-center bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800">
        <RouteIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-base font-bold text-gray-800 dark:text-gray-200">Corridor Not Found</p>
        <p className="text-xs text-gray-500 font-mono mt-1">Route ID: {routeId}</p>
      </div>
    );
  }

  const handleDeallocateBus = () => { alert("Not implemented"); };
  const handleAllocateBus = () => { alert("Not implemented"); };
  const handleOpenEditRoute = () => { alert("Not implemented"); };
  const handleDeleteRoute = () => { alert("Not implemented"); };
  const handleToggleEmergencyOverride = () => setIsOverrideActive(prev => !prev);

  const activeTrips = (trips || []).filter(t => t && (t.routeId === activeRoute.id || (t as any).route_id === activeRoute.id));
  const liveTripsCount = activeTrips.filter(t => t?.status === "IN_TRANSIT" || (t as any)?.status === "IN_PROGRESS").length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-12">
      {/* Left 7 Cols: Live Road-Snapped Map & Quick Actions */}
      <div className="lg:col-span-7 space-y-4">
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: activeRoute.color || "#2563eb" }} />
                <h3 className="font-bold text-base text-gray-900 dark:text-white">
                  {activeRoute.name}
                </h3>
                <span className="font-mono text-xs text-blue-600 font-bold bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-md">
                  {activeRoute.code || "CORRIDOR"}
                </span>
              </div>
              <span className="text-xs font-mono text-gray-500 mt-0.5 block">
                {activeRoute.totalDistanceKm || activeRoute.distanceKm || 0} km • ~{activeRoute.estimatedDurationMins || 45} mins • Direction: {activeRoute.direction || "Inbound"}
              </span>
            </div>

            {/* Context Actions for Route */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleOpenEditRoute()}
                className="px-3 py-1.5 text-[11px] font-bold text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-gray-200 dark:border-gray-700 flex items-center gap-1.5"
              >
                <Settings className="w-3 h-3" /> Edit Mode
              </button>
            </div>
          </div>

          {/* View Toggles */}
          <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 p-1.5 rounded-2xl w-fit">
            <button
              onClick={() => setRouteViewMode("FLOWCHART")}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all ${routeViewMode === "FLOWCHART"
                ? "bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
                }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Station Progression Flowchart
            </button>
            <button
              onClick={() => setRouteViewMode("MAP")}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all ${routeViewMode === "MAP"
                ? "bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
                }`}
            >
              <Map className="w-3.5 h-3.5" /> Corridor GIS Map
            </button>
          </div>

          <div className="h-[500px] bg-gray-100 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden relative isolate">
            {routeViewMode === "MAP" ? (
              <CampusFleetMap
                stops={mapStops.length > 0 ? mapStops : stops}
                campuses={campuses}
                routeCoordinates={corridorCoordinates}
                height="100%"
              />
            ) : (
              <WhereIsMyBusFlowchart
                route={{ ...activeRoute, stops: corridorStops }}
                stops={stops}
                buses={assignedBuses}
                bus={assignedBuses[0] || null}
              />
            )}
            <div className="absolute top-2 right-2 flex flex-col gap-2 z-[9999]">
              <button
                onClick={() => setRouteViewMode(prev => prev === "MAP" ? "FLOWCHART" : "MAP")}
                className="p-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 transition-colors"
                title="Toggle View Mode"
              >
                {routeViewMode === "MAP" ? <LayoutGrid className="w-4 h-4" /> : <Map className="w-4 h-4" />}
              </button>
              <button className="p-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 transition-colors">
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Fleet Allocation Widget */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-600" /> Allocated Fleet Buses
            </h3>
            <button
              onClick={() => setIsAllocateBusModalOpen(true)}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 px-3 py-1.5 rounded-xl transition-colors"
            >
              + Assign Bus
            </button>
          </div>

          {assignedBuses.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {assignedBuses.map(b => (
                <div key={b.id} className="p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800 rounded-2xl flex items-center justify-between group">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 flex items-center justify-center font-bold text-xs">
                      {String(b.busNumber || "").replace('Bus ', '')}
                    </div>
                    <div>
                      <div className="text-[10px] font-bold">{b.registrationNo || `Bus ${b.busNumber}`}</div>
                      <div className="text-[9px] text-gray-500 font-mono">{b.capacity || 40} seats</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeallocateBus()}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-2xl bg-gray-50 dark:bg-gray-800/20">
              <span className="text-[11px] text-gray-500 font-mono">No buses actively mapped to this corridor.</span>
            </div>
          )}
        </div>
      </div>

      {/* Right 5 Cols: Service Schedule & Telemetry Manifest */}
      <div className="lg:col-span-5 space-y-4">
        {/* Active Trips Telemetry */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4 h-full min-h-[500px]">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" /> Active Dispatches
            </h3>
            <span className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 px-2 py-1 rounded-lg font-mono font-bold flex items-center gap-1 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              {liveTripsCount} Live
            </span>
          </div>

          <div className="space-y-3 pt-2">
            {activeTrips.length > 0 ? (
              activeTrips.map(trip => {
                const assignedBus = (buses || []).find(b => b.id === trip.busId || String(b.id) === String(trip.busId));
                const manifestCount = Array.isArray(trip?.manifest)
                  ? trip.manifest.length
                  : Array.isArray((trip as any)?.reservations)
                  ? (trip as any).reservations.length
                  : typeof (trip as any)?.occupancy === "number"
                  ? (trip as any).occupancy
                  : 0;

                const isLive = trip.status === "IN_TRANSIT" || (trip as any)?.status === "IN_PROGRESS";

                return (
                  <div key={trip.id} className="p-4 bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-800 rounded-2xl space-y-3 relative overflow-hidden group hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
                    {isLive && (
                      <div className="absolute top-0 left-0 w-1 h-full bg-green-500" />
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${isLive ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"} font-bold text-[10px]`}>
                          {assignedBus?.busNumber ? `Bus ${assignedBus.busNumber}` : "Bus Assigned"}
                        </div>
                        <div className="text-xs font-bold text-gray-900 dark:text-white">
                          Dispatch #{trip.tripCode || (trip.id ? trip.id.substring(0, 6) : "1")}
                        </div>
                      </div>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                        isLive ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400 border border-green-200 dark:border-green-800" :
                        trip.status === "COMPLETED" ? "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" :
                        "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                      }`}>
                        {trip.status || "SCHEDULED"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white dark:bg-gray-900 rounded-xl p-2 border border-gray-100 dark:border-gray-800">
                        <span className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Departed</span>
                        <div className="text-[11px] font-mono font-black">{trip.startedAt || (trip as any).departureTime || (trip as any).startTime || "Scheduled"}</div>
                      </div>
                      <div className="bg-white dark:bg-gray-900 rounded-xl p-2 border border-gray-100 dark:border-gray-800">
                        <span className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Occupancy</span>
                        <div className="text-[11px] font-mono font-black">
                          {manifestCount} / {assignedBus?.capacity || 40}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
                <CalendarDays className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <span className="text-[11px] text-gray-500 font-mono">No active schedules for this corridor today.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
