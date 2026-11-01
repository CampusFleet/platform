// @ts-nocheck
"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import {
  GitBranch, MapPin, Maximize2, Minimize2, MoreVertical, Route as RouteIcon,
  Search, ShieldAlert, Zap, Truck, Navigation, Settings, LayoutGrid, CalendarDays, UserCircle, RefreshCcw, Map
} from "lucide-react";
import { useRoutesContext } from "@/components/transport-admin/routes/RoutesContext";

const CampusFleetMap = dynamic(() => import("@/components/maps/CampusFleetMap"), { ssr: false });
import WhereIsMyBusFlowchart from "@/components/transit/WhereIsMyBusFlowchart";

export default function CorridorDetailView({ routeId }: { routeId: string }) {
  const { routes, stops, buses, trips, campuses, isAddStopModalOpen } = useRoutesContext();

  const [routeViewMode, setRouteViewMode] = useState<"FLOWCHART" | "MAP">("FLOWCHART");
  const [selectedBusToAllocate, setSelectedBusToAllocate] = useState("");
  const [isAllocateBusModalOpen, setIsAllocateBusModalOpen] = useState(false);
  const [isOverrideActive, setIsOverrideActive] = useState(false);

  const activeRoute = routes.find(r => r.id === routeId) || routes[0];
  const assignedBuses = buses.filter(b => b.routeId === routeId);

  if (!activeRoute) {
    return <div className="p-8 text-center text-gray-500">Route not found.</div>;
  }

  const handleDeallocateBus = () => { alert("Not implemented"); };
  const handleAllocateBus = () => { alert("Not implemented"); };
  const handleOpenEditRoute = () => { alert("Not implemented"); };
  const handleDeleteRoute = () => { alert("Not implemented"); };
  const handleToggleEmergencyOverride = () => setIsOverrideActive(prev => !prev);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-12">
      {/* Left 7 Cols: Live Road-Snapped Map & Quick Actions */}
      <div className="lg:col-span-7 space-y-4">
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: activeRoute.color }} />
                <h3 className="font-bold text-base text-gray-900 dark:text-white">
                  {activeRoute.name}
                </h3>
                <span className="font-mono text-xs text-blue-600 font-bold bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-md">
                  {activeRoute.code}
                </span>
              </div>
              <span className="text-xs font-mono text-gray-500 mt-0.5 block">
                {activeRoute.distanceKm} km • ~{activeRoute.estimatedDurationMins} mins • Direction: {activeRoute.direction}
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
                routes={[activeRoute]}
                stops={stops}
                buses={buses}
                isAddStopModalOpen={isAddStopModalOpen}
                style="road"
              />
            ) : (
              <WhereIsMyBusFlowchart
                route={activeRoute}
                stops={stops}
                buses={assignedBuses}
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
                      {b.busNumber.replace('Bus ', '')}
                    </div>
                    <div>
                      <div className="text-[10px] font-bold">{b.registrationNo}</div>
                      <div className="text-[9px] text-gray-500 font-mono">{b.capacity} seats</div>
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
              {trips.filter(t => t.routeId === activeRoute.id && t.status === "IN_TRANSIT").length} Live
            </span>
          </div>

          <div className="space-y-3 pt-2">
            {trips.filter(t => t.routeId === activeRoute.id).length > 0 ? (
              trips.filter(t => t.routeId === activeRoute.id).map(trip => {
                const assignedBus = buses.find(b => b.id === trip.busId);
                return (
                  <div key={trip.id} className="p-4 bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-800 rounded-2xl space-y-3 relative overflow-hidden group hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
                    {trip.status === "IN_TRANSIT" && (
                      <div className="absolute top-0 left-0 w-1 h-full bg-green-500" />
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${trip.status === "IN_TRANSIT" ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"} font-bold text-[10px]`}>
                          {assignedBus?.busNumber || "TBD"}
                        </div>
                        <div className="text-xs font-bold text-gray-900 dark:text-white">Trip {trip.id.substring(0, 5)}</div>
                      </div>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${trip.status === "IN_TRANSIT" ? "bg-green-100 text-green-700 border border-green-200" :
                        trip.status === "COMPLETED" ? "bg-gray-100 text-gray-500" :
                          "bg-blue-100 text-blue-700"
                        }`}>
                        {trip.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white dark:bg-gray-900 rounded-xl p-2 border border-gray-100 dark:border-gray-800">
                        <span className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Departed</span>
                        <div className="text-[11px] font-mono font-black">{trip.startTime || "Scheduled"}</div>
                      </div>
                      <div className="bg-white dark:bg-gray-900 rounded-xl p-2 border border-gray-100 dark:border-gray-800">
                        <span className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Occupancy</span>
                        <div className="text-[11px] font-mono font-black">
                          {trip.manifest.length} / {assignedBus?.capacity || 40}
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
