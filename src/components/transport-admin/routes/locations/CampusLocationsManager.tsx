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
  Info,
  Building2,
} from "lucide-react";

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

export default function CampusLocationsManager() {
  const { routes, stops, buses, trips, campuses, selectedRouteId, setSelectedRouteId, showToast } = useRoutesContext();


  const handleOpenCreateCampusLocation = () => {
    setEditingCampus(null);
    setCampusLocationInputMode("MAP_PIN");
    const primaryCampus = campuses.find(c => c.isPrimary);
    setCampusLocationFormData({
      name: "",
      code: "",
      address: "",
      landmark: "",
      latitude: primaryCampus?.latitude || 29.375015,
      longitude: primaryCampus?.longitude || 79.529479,
      geofenceRadiusMeters: 100,
      fleetCapacity: 50,
      parkingBays: 20,
      contactPhone: "",
      contactEmail: "",
      isPrimary: campuses.length === 0,
      isActive: true,
    });
    setIsCampusModalOpen(true);
  };

  const handleOpenEditCampusLocation = (campus: Campus) => {
    setEditingCampus(campus);
    setCampusLocationInputMode("MAP_PIN");
    setCampusLocationFormData({
      name: campus.name,
      code: campus.code,
      address: campus.address || "",
      landmark: campus.landmark || "",
      latitude: campus.latitude,
      longitude: campus.longitude,
      geofenceRadiusMeters: campus.geofenceRadiusMeters || 100,
      fleetCapacity: campus.fleetCapacity || 50,
      parkingBays: campus.parkingBays || 20,
      contactPhone: campus.contactPhone || "",
      contactEmail: campus.contactEmail || "",
      isPrimary: Boolean(campus.isPrimary),
      isActive: campus.isActive !== false,
    });
    setIsCampusModalOpen(true);
  };

  const handleSaveCampusLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campusLocationFormData.name.trim() || !campusLocationFormData.code.trim()) {
      alert("Please provide both Campus Name and Campus Code.");
      return;
    }
    setIsSavingCampusLocation(true);
    try {
      if (editingCampus) {
        await store.updateCampus(editingCampus.id, campusLocationFormData);
      } else {
        await store.createCampus(campusLocationFormData);
      }
      setIsCampusModalOpen(false);
      setEditingCampus(null);
    } catch (err: any) {
      alert("Error saving campus location: " + (err?.message || "Unknown error"));
    } finally {
      setIsSavingCampusLocation(false);
    }
  };

  const handleDeleteCampusLocation = async (campus: Campus) => {
    if (campuses.length <= 1) {
      alert("Cannot delete the sole campus location in the system.");
      return;
    }
    if (!confirm(`Delete campus location "${campus.name}"? This action cannot be undone.`)) return;
    try {
      await store.deleteCampus(campus.id);
    } catch (err: any) {
      alert("Error deleting campus: " + (err?.message || "Unknown error"));
    }
  };

  const handleSetPrimaryCampus = async (campus: Campus) => {
    if (campus.isPrimary) return;
    if (!confirm(`Set "${campus.name}" as the Primary Operational Hub?`)) return;
    try {
      await store.setPrimaryCampus(campus.id);
    } catch (err: any) {
      alert("Error setting primary campus: " + (err?.message || "Unknown error"));
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
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Main Header */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-2">
        <div className="flex items-center gap-2 sm:gap-3">
          <button className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 bg-blue-600 text-white shadow-md shadow-blue-600/20`}>
            <Building2 className="w-4 h-4" />
            <span className="hidden sm:inline">Campus Locations</span>
          </button>
        </div>
      </div>

      {/* ============================================================= */}
      {/* TAB 2: CAMPUS LOCATIONS (Institutional Campus CRUD)           */}
      {/* ============================================================= */}
      {true && (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-gray-900 dark:text-white">Institutional Campus Locations</h3>
              <p className="text-xs text-gray-400 mt-0.5">Manage university campuses, fleet depots, and primary dispatch hubs</p>
            </div>
            <button
              onClick={handleOpenCreateCampusLocation}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-md transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add New Campus Location</span>
            </button>
          </div>

          {/* Campus Cards Grid */}
          {campuses.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <Building2 className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600" />
              <p className="text-sm font-bold text-gray-400">No campus locations configured yet</p>
              <p className="text-xs text-gray-400">Add your first institutional campus to anchor all transit operations.</p>
              <button
                onClick={handleOpenCreateCampusLocation}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl mx-auto"
              >
                + Add Campus Location
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {campuses.map(campus => (
                <div
                  key={campus.id}
                  className={`relative p-5 rounded-3xl border shadow-sm space-y-4 flex flex-col justify-between transition-all hover:shadow-md ${campus.isPrimary
                    ? "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800"
                    : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800"
                    }`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-inner flex-shrink-0 ${campus.isPrimary
                        ? "bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400"
                        : "bg-green-50 dark:bg-green-950/60 border border-green-200 dark:border-green-800 text-green-600"
                        }`}>
                        <Building2 className="w-6 h-6" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {campus.isPrimary && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-bold uppercase tracking-wider border border-blue-500/30">
                              ⭐ Primary Hub
                            </span>
                          )}
                          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold ${campus.isActive !== false
                            ? "bg-green-500/20 text-green-400 dark:text-green-300"
                            : "bg-red-500/20 text-red-400"
                            }`}>
                            {campus.isActive !== false ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <h4 className={`font-black text-sm mt-0.5 truncate ${"text-gray-900 dark:text-white"
                          }`}>
                          {campus.name}
                        </h4>
                        <p className={`text-[11px] truncate ${"text-gray-400"
                          }`}>
                          {campus.address || campus.landmark || "No address set"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs ${campus.isPrimary ? "" : ""
                    }`}>
                    <div className={`p-2.5 rounded-xl ${"bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/50"
                      }`}>
                      <span className="text-[10px] text-gray-400 block font-bold uppercase">Code</span>
                      <span className={`font-mono font-black ${"text-blue-600 dark:text-blue-400"
                        }`}>{campus.code}</span>
                    </div>
                    <div className={`p-2.5 rounded-xl ${"bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/50"
                      }`}>
                      <span className="text-[10px] text-gray-400 block font-bold uppercase">GPS</span>
                      <span className={`font-mono font-bold text-[11px] ${"text-gray-600 dark:text-gray-300"
                        }`}>
                        {campus.latitude.toFixed(4)}°N
                      </span>
                    </div>
                    <div className={`p-2.5 rounded-xl ${"bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/50"
                      }`}>
                      <span className="text-[10px] text-gray-400 block font-bold uppercase">Fleet</span>
                      <span className={`font-bold ${"text-green-600 dark:text-green-400"
                        }`}>{campus.fleetCapacity || 50} buses</span>
                    </div>
                    <div className={`p-2.5 rounded-xl ${"bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/50"
                      }`}>
                      <span className="text-[10px] text-gray-400 block font-bold uppercase">Bays</span>
                      <span className={`font-bold ${"text-yellow-600 dark:text-yellow-400"
                        }`}>{campus.parkingBays || 20} bays</span>
                    </div>
                  </div>

                  {/* Geofence & Contact */}
                  <div className={`grid grid-cols-2 gap-2 text-xs ${campus.isPrimary ? "" : ""
                    }`}>
                    <div className={`p-2.5 rounded-xl ${"bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/50"
                      }`}>
                      <span className="text-[10px] text-gray-400 block font-bold uppercase">Geofence</span>
                      <span className={`font-mono font-bold ${"text-pink-600 dark:text-pink-400"
                        }`}>{campus.geofenceRadiusMeters}m radius</span>
                    </div>
                    <div className={`p-2.5 rounded-xl ${"bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/50"
                      }`}>
                      <span className="text-[10px] text-gray-400 block font-bold uppercase">Landmark</span>
                      <span className={`font-medium truncate block ${"text-gray-600 dark:text-gray-300"
                        }`}>{campus.landmark || "—"}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className={`flex items-center gap-2 pt-3 border-t ${"border-gray-100 dark:border-gray-800"
                    }`}>
                    {!campus.isPrimary && (
                      <button
                        onClick={() => handleSetPrimaryCampus(campus)}
                        className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold border bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-800 hover:bg-yellow-100 dark:hover:bg-yellow-900/50 transition-all flex items-center gap-1"
                        title="Set as Primary Hub"
                      >
                        ⭐ Set Primary
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenEditCampusLocation(campus)}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all ${"bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                        }`}
                    >
                      Edit Campus
                    </button>
                    {!campus.isPrimary && (
                      <button
                        onClick={() => handleDeleteCampusLocation(campus)}
                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-all"
                        title="Delete Campus"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
