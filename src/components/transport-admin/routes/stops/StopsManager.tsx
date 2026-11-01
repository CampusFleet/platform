"use client";


import React, { useEffect, useState, useMemo } from "react";
import { store } from "@/lib/store";
import dynamic from "next/dynamic";
import { Route, Stop, Bus, Campus } from "@/lib/types";
import { WhereIsMyBusFlowchart } from "@/components/transit/WhereIsMyBusFlowchart";

// Dynamic import for Leaflet map with no SSR
const CampusFleetMap = dynamic(() => import("@/components/maps/CampusFleetMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-80 rounded-3xl bg-gray-100 dark:bg-gray-800 animate-pulse flex items-center justify-center text-xs text-gray-400 font-bold">
      Loading Corridor GIS Map...
    </div>
  ),
});

import {
  Route as RouteIcon,
  Plus,
  MapPin,
  Clock,
  ShieldAlert,
  Trash2,
  Edit3,
  BusFront,
  Check,
  Navigation,
  ArrowUpDown,
  Compass,
  ArrowUp,
  ArrowDown,
  X,
  Search,
  RotateCcw,
  Sparkles,
  GitCommit,
  GitBranch,
  GitMerge,
  Layers,
  Sliders,
  ChevronRight,
  ChevronDown,
  Info,
  Building2,
  Zap,
} from "lucide-react";
import { CustomDropdown } from "@/components/common/CustomDropdown";

// Haversine geodesic distance in km
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((R * c).toFixed(2));
}

import type { Trip } from "@/lib/types";

import { useRoutesContext } from "@/components/transport-admin/routes/RoutesContext";

import { StopBuilderModal } from "./StopBuilderModal";

export default function StopsManager({ mode = "view" }: { mode?: "view" | "create" }) {
  const {
    routes, stops, buses, trips, campuses,
    selectedRouteId, setSelectedRouteId, showToast
  } = useRoutesContext();


  // Dynamically resolved Campus Terminal directly from campuses master table
  const currentCampusStop = React.useMemo(() => {
    const primaryCampus = campuses.find(c => c.isPrimary) || campuses[0] || store.getPrimaryCampus();
    if (primaryCampus) {
      return {
        id: primaryCampus.id,
        name: primaryCampus.name,
        code: primaryCampus.code,
        latitude: primaryCampus.latitude,
        longitude: primaryCampus.longitude,
        landmark: primaryCampus.landmark || primaryCampus.address || `${primaryCampus.name} Hub`,
        geofenceRadiusMeters: primaryCampus.geofenceRadiusMeters || 150,
        campusId: primaryCampus.id,
        zoneCode: "ZONE_CAMPUS",
      };
    }
    return stops[0] || null;
  }, [stops, campuses]);

  const handleOpenCreateStop = () => {
    setEditingStop(null);
    setStopInputMode("MAP_PIN");
    // Suggest station code based on current count
    const nextCode = `ST-0${stops.length + 1}`;
    setStopFormData({
      name: "",
      code: nextCode,
      latitude: currentCampusStop?.latitude || stops[0]?.latitude || 0,
      longitude: currentCampusStop?.longitude || stops[0]?.longitude || 0,
      landmark: "",
      geofenceRadiusMeters: 80,
      isBusMergeStop: false,
    });
    setIsAddStopModalOpen(true);
  };

  const handleOpenEditCampus = (stopToEdit?: Stop | null) => {
    const target = stopToEdit || currentCampusStop;

    if (target) {
      setCampusFormData({
        id: target.id,
        name: target.name,
        code: target.code,
        latitude: target.latitude,
        longitude: target.longitude,
        landmark: target.landmark || "",
        geofenceRadiusMeters: target.geofenceRadiusMeters || 100,
        isBusMergeStop: Boolean(target.isBusMergeStop),
        campusId: target.campusId,
        zoneCode: target.zoneCode,
      });
    } else {
      setCampusFormData(null);
    }
  };

  const handleSaveCampusTerminal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campusFormData) return;
    setIsSavingStop(true);
    try {
      if (campusFormData.id) {
        await store.updateStop(campusFormData.id, campusFormData);
        alert(`Campus terminal ${campusFormData.name} updated successfully!`);
      }
      setCampusFormData(null);
    } catch (err) {
      alert("Error saving campus terminal.");
    } finally {
      setIsSavingStop(false);
    }
  };


  const handleOpenEditStop = (stopToEdit: Stop) => {
    setEditingStop(stopToEdit);
    setStopInputMode("MAP_PIN");
    setStopFormData({
      name: stopToEdit.name,
      code: stopToEdit.code,
      latitude: stopToEdit.latitude,
      longitude: stopToEdit.longitude,
      landmark: stopToEdit.landmark || "",
      geofenceRadiusMeters: stopToEdit.geofenceRadiusMeters || 50,
      isBusMergeStop: Boolean(stopToEdit.isBusMergeStop),
    });
    setDesignatedCampusId(stopToEdit.campusId || "");
    setIsAddStopModalOpen(true);
  };

  const handleSaveStop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stopFormData.name.trim() || !stopFormData.code.trim()) {
      alert("Please provide both Stop Name and Code.");
      return;
    }
    setIsSavingStop(true);

    try {
      const payload: Partial<Stop> = {
        ...stopFormData,
        campusId: designatedCampusId || undefined,
        zoneCode: designatedCampusId ? "ZONE_CAMPUS" : "ZONE_CITY",
      };

      if (editingStop) {
        await store.updateStop(editingStop.id, payload);
      } else {
        await store.createStop(payload as Omit<Stop, "id">);
      }
      setIsAddStopModalOpen(false);
      setEditingStop(null);
    } catch (err: any) {
      alert("Error saving stop: " + (err?.message || "Unknown error"));
    } finally {
      setIsSavingStop(false);
    }
  };

  const handleDeleteStop = async (stopId: string, stopName: string) => {
    if (confirm(`Delete stop "${stopName}"? This action cannot be undone.`)) {
      try {
        await store.deleteStop(stopId);
      } catch (err: any) {
        alert("Error deleting stop: " + (err?.message || "Unknown error"));
      }
    }
  };

  const handleToggleStopMerge = async (st: Stop) => {
    try {
      await store.updateStop(st.id, { isBusMergeStop: !st.isBusMergeStop });
    } catch (err: any) {
      alert("Error updating stop: " + (err?.message || "Unknown error"));
    }
  };

  // Campus Location Modal States
  const [isCampusModalOpen, setIsCampusModalOpen] = useState(false);
  const [editingCampus, setEditingCampus] = useState<Campus | null>(null);
  const [campusLocationInputMode, setCampusLocationInputMode] = useState<"MAP_PIN" | "MANUAL">("MAP_PIN");
  const [isSavingCampusLocation, setIsSavingCampusLocation] = useState(false);
  const [campusLocationFormData, setCampusLocationFormData] = useState({
    name: "",
    code: "",
    address: "",
    landmark: "",
    latitude: 29.375015,
    longitude: 79.529479,
    geofenceRadiusMeters: 100,
    fleetCapacity: 50,
    parkingBays: 20,
    contactPhone: "",
    contactEmail: "",
    isPrimary: false,
    isActive: true,
  });
  const [selectedStopId, setSelectedStopId] = useState<string | undefined>(undefined);
  const [isOverrideActive, setIsOverrideActive] = useState(false);

  // Stop Modal States
  const [isAddStopModalOpen, setIsAddStopModalOpen] = useState(false);
  const [editingStop, setEditingStop] = useState<Stop | null>(null);
  const [stopInputMode, setStopInputMode] = useState<"MAP_PIN" | "MANUAL">("MAP_PIN");
  const [stopFormData, setStopFormData] = useState({
    name: "",
    code: "",
    latitude: 0,
    longitude: 0,
    landmark: "",
    geofenceRadiusMeters: 80,
    isBusMergeStop: false,
  });

  // Central Campus Terminal Management States (100% Dynamic from PostgreSQL)
  const [isEditCampusModalOpen, setIsEditCampusModalOpen] = useState(false);
  const [campusInputMode, setCampusInputMode] = useState<"MAP_PIN" | "MANUAL">("MAP_PIN");
  const [isSavingCampus, setIsSavingCampus] = useState(false);
  const [designatedCampusId, setDesignatedCampusId] = useState<string>("");
  const [campusFormData, setCampusFormData] = useState<Stop | null>(null);
  const [isSavingStop, setIsSavingStop] = useState(false);

  // Flowchart Route Builder States
  const [isRouteBuilderOpen, setIsRouteBuilderOpen] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [routeBuilderData, setRouteBuilderData] = useState<{
    name: string;
    code: string;
    description: string;
    direction: "HOME_TO_CAMPUS" | "CAMPUS_TO_HOME" | "CIRCULAR" | "CAMPUS_TO_CAMPUS";
    color: string;
    startStopId: string;
    endStopId: string;
    originCampusId?: string;
    destinationCampusId?: string;
    intermediateStopIds: string[];
  }>({
    name: "",
    code: "",
    description: "Main Academic Transit Corridor",
    direction: "HOME_TO_CAMPUS",
    color: "#2563EB",
    startStopId: "",
    endStopId: "",
    originCampusId: "",
    destinationCampusId: "",
    intermediateStopIds: [],
  });

  // Intermediate Stop Insert Popover
  const [insertingAtGapIndex, setInsertingAtGapIndex] = useState<number | null>(null);
  const [stopPickerSearch, setStopPickerSearch] = useState("");
  const [activePickerTarget, setActivePickerTarget] = useState<"START" | "END" | "INTERMEDIATE" | null>(null);

  // Allocate Bus Modal State
  const [isAllocateBusModalOpen, setIsAllocateBusModalOpen] = useState(false);
  const [selectedBusToAllocate, setSelectedBusToAllocate] = useState("");
  const [routeViewMode, setRouteViewMode] = useState<"FLOWCHART" | "MAP">("FLOWCHART");

  return (
    <div className="space-y-6 animate-in fade-in pb-12 h-full">
      {mode === "create" ? (
        <StopBuilderModal
          isAddStopModalOpen={true}
          setIsAddStopModalOpen={setIsAddStopModalOpen}
          editingStop={editingStop}
          stopFormData={stopFormData}
          setStopFormData={setStopFormData}
          stopInputMode={stopInputMode}
          setStopInputMode={setStopInputMode}
          handleSaveStop={handleSaveStop}
          isSavingStop={isSavingStop}
          designatedCampusId={designatedCampusId}
          setDesignatedCampusId={setDesignatedCampusId}
          campuses={campuses}
        />
      ) : (
        <>
          {/* Main Header */}
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-2">
            <div className="flex items-center gap-2 sm:gap-3">
              <button className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 bg-blue-600 text-white shadow-md shadow-blue-600/20`}>
                <MapPin className="w-4 h-4" />
                <span className="hidden sm:inline">Stops & Terminals</span>
              </button>
            </div>
          </div>
          {/* ============================================================= */}
          {/* TAB 3: STOPS                                                  */}
          {/* ============================================================= */}
          {true && (
            <div className="space-y-5">
              {/* Central Campus Terminal & Fleet Depot Hero Card */}
              {currentCampusStop && (
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-5 sm:p-6 shadow-sm relative overflow-hidden transition-all space-y-4">
                  {/* Top Accent Gradient Line */}
                  <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500" />

                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/80 flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] font-bold uppercase tracking-wider border border-blue-200 dark:border-blue-800">
                            Campus Terminal Anchor & Depot
                          </span>
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold border border-emerald-200 dark:border-emerald-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Active Geofence
                          </span>
                        </div>
                        <h3 className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
                          {currentCampusStop.name}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-xl">
                          Central terminal anchor for all university corridors, arrival geofencing, and overnight fleet depot parking.
                        </p>
                      </div>
                    </div>

                    {/* Switch Terminal Selector & Edit Controls */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 self-stretch lg:self-auto flex-shrink-0">
                      <CustomDropdown
                        value={currentCampusStop.id}
                        onChange={val => setDesignatedCampusId(val)}
                        size="sm"
                        options={stops.map(st => ({
                          value: st.id,
                          label: `Switch: ${st.name} (${st.code})`,
                        }))}
                        containerClassName="w-full sm:w-60"
                      />

                      <button
                        onClick={() => handleOpenEditCampus(currentCampusStop)}
                        className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm shadow-blue-500/20 transition-all active:scale-95"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Configure Terminal</span>
                      </button>
                    </div>
                  </div>

                  {/* 4-Metric Clean Summary Grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-xs">
                    <div className="p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/60">
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 block font-bold uppercase tracking-wider">
                        Terminal Code
                      </span>
                      <span className="font-mono font-black text-blue-600 dark:text-blue-400 text-sm mt-0.5 block">
                        {currentCampusStop.code}
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/60">
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 block font-bold uppercase tracking-wider">
                        GPS Coordinates
                      </span>
                      <span className="font-mono font-bold text-gray-800 dark:text-gray-200 text-xs mt-0.5 block">
                        {currentCampusStop.latitude.toFixed(4)}° N, {currentCampusStop.longitude.toFixed(4)}° E
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/60">
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 block font-bold uppercase tracking-wider">
                        Geofence Radius
                      </span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs mt-0.5 block">
                        {currentCampusStop.geofenceRadiusMeters || 90} meters
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/60">
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 block font-bold uppercase tracking-wider">
                        Depot Landmark
                      </span>
                      <span
                        className="font-medium text-gray-700 dark:text-gray-300 text-xs truncate mt-0.5 block"
                        title={currentCampusStop.landmark || "Main Terminal Area"}
                      >
                        {currentCampusStop.landmark || "Main Terminal Area"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs font-bold text-gray-500">
                  {stops.length} physical boarding stations configured
                </span>
                <button
                  onClick={handleOpenCreateStop}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  + Add New Stop
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stops.map(st => (
                  <div
                    key={st.id}
                    className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-3 flex flex-col justify-between hover:border-blue-300 dark:hover:border-blue-700 transition-all"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-xl bg-green-50 dark:bg-green-950/60 text-green-600">
                            <MapPin className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-sm text-gray-900 dark:text-white">{st.name}</h4>
                            <span className="text-[10px] font-mono text-gray-400">Station Code: {st.code}</span>
                          </div>
                        </div>

                        <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-[10px] font-mono font-bold text-gray-600 dark:text-gray-300">
                          {st.geofenceRadiusMeters}m geofence
                        </span>
                      </div>

                      <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-2xl text-xs space-y-1">
                        <div className="text-[11px] text-gray-500">
                          Landmark: <strong className="text-gray-700 dark:text-gray-300">{st.landmark || "Standard Campus Station"}</strong>
                        </div>
                        <div className="text-[10px] font-mono text-gray-400">
                          GPS: {st.latitude.toFixed(4)}° N, {st.longitude.toFixed(4)}° E
                        </div>
                      </div>

                      {st.isBusMergeStop && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-pink-100 dark:bg-pink-950/80 text-pink-700 dark:text-pink-300 text-[11px] font-bold border border-pink-200 dark:border-pink-800">
                          <GitMerge className="w-3.5 h-3.5 text-pink-600 dark:text-pink-400" />
                          <span>Authorized Bus Merge Stop</span>
                          <Zap className="w-3 h-3 text-pink-500 fill-pink-500" />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                      <button
                        onClick={() => handleToggleStopMerge(st)}
                        className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all border flex items-center gap-1 ${st.isBusMergeStop
                          ? "bg-pink-50 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300 border-pink-300 dark:border-pink-800"
                          : "bg-gray-50 dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700 hover:text-pink-600"
                          }`}
                        title={st.isBusMergeStop ? "Deactivate Bus Merge Stop" : "Activate as Bus Merge Stop"}
                      >
                        <GitMerge className="w-3.5 h-3.5" />
                        <span>{st.isBusMergeStop ? "Merge Stop: ON" : "Merge: OFF"}</span>
                      </button>
                      <button
                        onClick={() => handleOpenEditStop(st)}
                        className="flex-1 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-xs font-bold rounded-xl transition-all"
                      >
                        Edit Station
                      </button>
                      <button
                        onClick={() => handleDeleteStop(st.id, st.name)}
                        className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl"
                        title="Delete Stop"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </>
      )}
    </div>
  );
}
