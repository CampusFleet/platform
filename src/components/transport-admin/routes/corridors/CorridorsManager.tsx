"use client";

import { RouteBuilderModal } from './RouteBuilderModal';
import { ArrowRight, LayoutGrid, Map as MapIcon, Truck, Eye } from 'lucide-react';
import { AllocateBusModal } from './AllocateBusModal';
import TransitStudioMap from "@/components/maps/TransitStudioMap";
import Link from "next/link";
import React, { useEffect, useState, useMemo } from "react";
import { store } from "@/lib/store";
import dynamic from "next/dynamic";
import { Route, Stop, Bus, Campus, Student } from "@/lib/types";
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

export default function CorridorsManager({ mode = "view" }: { mode?: "view" | "create" }) {
  const { routes, stops, buses, trips, campuses, students = [], restZones = [], selectedRouteId, setSelectedRouteId, showToast } = useRoutesContext();

  // Studio Mode vs. Corridors Grid Directory Mode
  const [viewMode, setViewMode] = useState<"STUDIO" | "DIRECTORY">("STUDIO");

  // Selected Active Campus for Transit Studio (Fixed Anchor 1) sourced directly from database
  const [selectedCampusId, setSelectedCampusId] = useState<string>(() => {
    const primary = (campuses || []).find(c => c.isPrimary);
    return primary?.id || campuses?.[0]?.id || "";
  });

  // Keep selectedCampusId in sync with database campuses table
  useEffect(() => {
    if (!selectedCampusId && campuses && campuses.length > 0) {
      const primary = campuses.find(c => c.isPrimary);
      setSelectedCampusId(primary?.id || campuses[0].id);
    }
  }, [campuses, selectedCampusId]);

  // Dynamically resolved from campuses table in database - zero hardcoding
  const selectedCampus = useMemo(() => {
    if (!campuses || campuses.length === 0) return null;
    const match = campuses.find(c => c.id === selectedCampusId);
    if (match) return match;
    const primary = campuses.find(c => c.isPrimary);
    return primary || campuses[0] || null;
  }, [campuses, selectedCampusId]);

  // Handler for Deploy Corridor from Fullscreen Transit Studio
  const handleSaveCorridorFromStudio = async (data: {
    name: string;
    code: string;
    campusId: string;
    restZone: any;
    stops: any[];
    distanceKm: number;
    durationMins: number;
  }) => {
    try {
      const campus = campuses.find(c => c.id === data.campusId) || selectedCampus;
      if (!campus) {
        alert("Cannot deploy corridor without an active campus from the database.");
        return;
      }
      const campusTerminal = getTerminalStopForCampus(campus, stops);

      let restZoneStop = stops.find(s => s.code === data.restZone.code);
      if (!restZoneStop) {
        restZoneStop = {
          id: `stop-${data.restZone.id}`,
          name: data.restZone.name,
          code: data.restZone.code,
          latitude: data.restZone.latitude,
          longitude: data.restZone.longitude,
          landmark: data.restZone.landmark || "Fleet Depot Rest Area",
          geofenceRadiusMeters: 120,
          campusId: "",
          zoneCode: "ZONE_A",
        };
        await store.createStop(restZoneStop);
      }

      const totalStopsCount = data.stops.length + 2;
      const formattedStops = [
        {
          stopId: campusTerminal.id,
          stopOrder: 1,
          arrivalOffsetMinutes: 0,
          bufferTimeMinutes: 2,
          stop: campusTerminal,
        },
        ...data.stops.map((s, idx) => ({
          stopId: s.id,
          stopOrder: idx + 2,
          arrivalOffsetMinutes: Math.round(((idx + 1) / totalStopsCount) * data.durationMins),
          bufferTimeMinutes: s.dwellMinutes || 2,
          stop: {
            id: s.id,
            name: s.name,
            code: s.code,
            latitude: s.latitude,
            longitude: s.longitude,
            landmark: s.landmark || "",
            geofenceRadiusMeters: 80,
            campusId: "",
            zoneCode: s.zoneCode || "ZONE_A",
          },
        })),
        {
          stopId: restZoneStop.id,
          stopOrder: totalStopsCount,
          arrivalOffsetMinutes: data.durationMins,
          bufferTimeMinutes: 5,
          stop: restZoneStop,
        },
      ];

      const newRoute = await store.createRoute({
        name: data.name,
        code: data.code,
        description: `Corridor connecting ${campus.name} and ${data.restZone.name}`,
        direction: "HOME_TO_CAMPUS",
        campusId: campus.id,
        color: "#2563EB",
        totalDistanceKm: data.distanceKm,
        estimatedDurationMins: data.durationMins,
        stops: formattedStops,
        isActive: true,
      });

      try {
        await fetch("/api/routes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newRoute),
        });
      } catch (e) {
        console.warn("Failed to persist corridor to DB:", e);
      }

      alert(`Corridor "${data.name}" successfully created and deployed!`);
      setSelectedRouteId(newRoute.id);
    } catch (err: any) {
      alert("Error saving corridor: " + (err?.message || "Unknown error"));
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



  // -------------------------------------------------------------
  // CAMPUS LOCATION CRUD HANDLERS
  // -------------------------------------------------------------
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

  const activeRoute = routes.find(r => r.id === selectedRouteId) || routes[0];

  // -------------------------------------------------------------
  // STOP MANAGEMENT
  // -------------------------------------------------------------
  // Dynamically resolved Campus Terminal directly from campuses master table
  const currentCampusStop = useMemo(() => {
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

  // -------------------------------------------------------------
  // CENTRAL CAMPUS TERMINAL MANAGEMENT (DYNAMIC POSTGRESQL CRUD)
  // -------------------------------------------------------------
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
        geofenceRadiusMeters: target.geofenceRadiusMeters || 80,
        campus: target.campus || "",
        isBusMergeStop: target.isBusMergeStop,
        zoneCode: target.zoneCode,
      });
      setCampusInputMode("MAP_PIN");
      setIsEditCampusModalOpen(true);
    }
  };

  const handleSaveCampus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campusFormData) return;
    if (!campusFormData.name.trim()) {
      alert("Please enter a valid Campus Terminal name.");
      return;
    }
    setIsSavingCampus(true);
    try {
      const stopId = campusFormData.id;
      const payload = {
        id: stopId,
        name: campusFormData.name.trim(),
        code: campusFormData.code.trim().toUpperCase(),
        latitude: Number(campusFormData.latitude),
        longitude: Number(campusFormData.longitude),
        landmark: (campusFormData.landmark || "").trim(),
        geofenceRadiusMeters: Number(campusFormData.geofenceRadiusMeters),
        campus: (campusFormData.campus || "").trim(),
      };

      // 1. Update in local reactive store
      await store.updateStop(stopId, payload);

      // 2. Persist to API & Audit Log
      const res = await fetch("/api/campus", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to persist campus terminal to database.");
      }

      setDesignatedCampusId(stopId);
      setIsEditCampusModalOpen(false);
      setCampusFormData(null);
    } catch (err: any) {
      alert("Error saving campus terminal: " + (err?.message || "Unknown error"));
    } finally {
      setIsSavingCampus(false);
    }
  };

  const handleOpenEditStop = (st: Stop) => {
    setEditingStop(st);
    setStopInputMode("MAP_PIN");
    setStopFormData({
      name: st.name,
      code: st.code,
      latitude: st.latitude,
      longitude: st.longitude,
      landmark: st.landmark || "",
      geofenceRadiusMeters: st.geofenceRadiusMeters || 80,
      isBusMergeStop: Boolean(st.isBusMergeStop),
    });
    setIsAddStopModalOpen(true);
  };

  const handleSaveStop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stopFormData.name || !stopFormData.code) {
      alert("Please provide both Stop Name and Station Code.");
      return;
    }

    if (editingStop) {
      await store.updateStop(editingStop.id, stopFormData);
      try {
        await fetch(`/api/stops/${editingStop.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stopFormData),
        });
      } catch (err) {
        console.warn(err);
      }
      setEditingStop(null);
    } else {
      const created = await store.createStop(stopFormData);
      try {
        await fetch("/api/stops", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...stopFormData, id: created.id }),
        });
      } catch (err) {
        console.warn(err);
      }
    }

    setIsAddStopModalOpen(false);
  };

  const handleToggleStopMerge = async (st: Stop) => {
    const nextState = !st.isBusMergeStop;
    await store.updateStop(st.id, { isBusMergeStop: nextState });
    try {
      await fetch(`/api/stops/${st.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBusMergeStop: nextState }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteStop = async (stopId: string, stopName: string) => {
    if (confirm(`Delete stop "${stopName}"? It will also be removed from any routes that use it.`)) {
      await store.deleteStop(stopId);
    }
  };

  // -------------------------------------------------------------
  // Helper to dynamically get or create a terminal Stop representing a campus
  const getTerminalStopForCampus = (campus: Campus, currentStops: Stop[]): Stop => {
    const existing = currentStops.find(s => s.campusId === campus.id || s.code === campus.code);
    if (existing) return existing;
    return {
      id: `campus-stop-${campus.id}`,
      name: `${campus.name} Terminal`,
      code: campus.code,
      latitude: campus.latitude,
      longitude: campus.longitude,
      landmark: campus.landmark || campus.address || `${campus.name} Hub`,
      geofenceRadiusMeters: campus.geofenceRadiusMeters || 100,
      campusId: campus.id,
      zoneCode: "ZONE_B",
    };
  };

  // -------------------------------------------------------------
  // FLOWCHART ROUTE BUILDER
  // -------------------------------------------------------------
  const handleOpenCreateRoute = () => {
    setEditingRouteId(null);
    const primaryCampus = campuses.find(c => c.isPrimary) || campuses[0] || store.getPrimaryCampus();
    const defaultCampusId = primaryCampus?.id || "";
    const startStop = stops[0];
    const nextRouteNum = routes.length + 101;

    setRouteBuilderData({
      name: startStop && primaryCampus ? `${startStop.name} → ${primaryCampus.name} Corridor` : "New Academic Transit Corridor",
      code: `RT-${nextRouteNum}`,
      description: "University Transit Corridor with Multiple Stations",
      direction: "HOME_TO_CAMPUS",
      color: "#2563EB",
      startStopId: startStop?.id || "",
      endStopId: defaultCampusId,
      originCampusId: "",
      destinationCampusId: defaultCampusId,
      intermediateStopIds: [],
    });
    setInsertingAtGapIndex(null);
    setStopPickerSearch("");
    setActivePickerTarget(null);
    setIsRouteBuilderOpen(true);
  };

  const handleOpenEditRoute = (r: Route) => {
    setEditingRouteId(r.id);
    const startId = r.stops[0]?.stopId || "";
    const endId = r.stops.length > 1 ? r.stops[r.stops.length - 1]?.stopId : "";
    const intermediates = r.stops.slice(1, -1).map(s => s.stopId);

    const firstStopObj = r.stops[0]?.stop;
    const lastStopObj = r.stops[r.stops.length - 1]?.stop;

    const resolvedOriginCampusId = r.originCampusId || campuses.find(c => c.id === startId || firstStopObj?.campusId === c.id || firstStopObj?.code === c.code)?.id || (r.direction === "CAMPUS_TO_HOME" || r.direction === "CAMPUS_TO_CAMPUS" ? r.campusId : undefined);
    const resolvedDestCampusId = r.destinationCampusId || campuses.find(c => c.id === endId || lastStopObj?.campusId === c.id || lastStopObj?.code === c.code)?.id || (r.direction === "HOME_TO_CAMPUS" || r.direction === "CAMPUS_TO_CAMPUS" ? r.campusId : undefined);

    setRouteBuilderData({
      name: r.name,
      code: r.code,
      description: r.description,
      direction: r.direction,
      color: r.color || "#2563EB",
      startStopId: (r.direction === "CAMPUS_TO_HOME" || r.direction === "CAMPUS_TO_CAMPUS") ? (resolvedOriginCampusId || startId) : startId,
      endStopId: (r.direction === "HOME_TO_CAMPUS" || r.direction === "CAMPUS_TO_CAMPUS") ? (resolvedDestCampusId || endId) : endId,
      originCampusId: resolvedOriginCampusId,
      destinationCampusId: resolvedDestCampusId,
      intermediateStopIds: intermediates,
    });
    setInsertingAtGapIndex(null);
    setStopPickerSearch("");
    setActivePickerTarget(null);
    setIsRouteBuilderOpen(true);
  };

  // Build the complete ordered stop ID list in builder
  const builderOrderedStopIds = useMemo(() => {
    const list: string[] = [];
    if (routeBuilderData.startStopId) list.push(routeBuilderData.startStopId);
    list.push(...routeBuilderData.intermediateStopIds);
    if (routeBuilderData.endStopId && routeBuilderData.endStopId !== routeBuilderData.startStopId) {
      list.push(routeBuilderData.endStopId);
    }
    return list;
  }, [routeBuilderData]);

  // Stops objects corresponding to the builder sequence (including campus terminal nodes)
  const builderStops = useMemo(() => {
    const map = new Map(stops.map(s => [s.id, s]));
    campuses.forEach(c => {
      const cStop = getTerminalStopForCampus(c, stops);
      map.set(c.id, cStop);
      map.set(cStop.id, cStop);
    });
    return builderOrderedStopIds.map(id => map.get(id)).filter(Boolean) as Stop[];
  }, [builderOrderedStopIds, stops, campuses]);

  // Calculate cumulative distances and arrival offsets
  const builderMetrics = useMemo(() => {
    if (builderStops.length < 2) {
      return { totalDistanceKm: 0, estimatedDurationMins: 0, stopOffsets: [0] };
    }

    let totalDist = 0;
    const offsets: number[] = [0];

    for (let i = 1; i < builderStops.length; i++) {
      const prev = builderStops[i - 1];
      const curr = builderStops[i];
      const segmentKm = calculateDistanceKm(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
      totalDist += segmentKm;
      // Formula: ~2.5 mins per km + 2 min dwell/buffer per intermediate station
      const cumulativeMinutes = Math.round(totalDist * 2.5 + i * 2);
      offsets.push(cumulativeMinutes);
    }

    return {
      totalDistanceKm: parseFloat(totalDist.toFixed(1)),
      estimatedDurationMins: offsets[offsets.length - 1] || Math.round(totalDist * 3),
      stopOffsets: offsets,
    };
  }, [builderStops]);

  // Intermediate Stop Operations
  const handleInsertIntermediateStop = (stopId: string) => {
    if (insertingAtGapIndex === null) return;
    const newIntermediates = [...routeBuilderData.intermediateStopIds];
    newIntermediates.splice(insertingAtGapIndex, 0, stopId);
    setRouteBuilderData(prev => ({
      ...prev,
      intermediateStopIds: newIntermediates,
    }));
    setInsertingAtGapIndex(null);
    setStopPickerSearch("");
  };

  const handleShiftIntermediateUp = (idx: number) => {
    if (idx <= 0) return;
    const newIntermediates = [...routeBuilderData.intermediateStopIds];
    const temp = newIntermediates[idx];
    newIntermediates[idx] = newIntermediates[idx - 1];
    newIntermediates[idx - 1] = temp;
    setRouteBuilderData(prev => ({ ...prev, intermediateStopIds: newIntermediates }));
  };

  const handleShiftIntermediateDown = (idx: number) => {
    if (idx >= routeBuilderData.intermediateStopIds.length - 1) return;
    const newIntermediates = [...routeBuilderData.intermediateStopIds];
    const temp = newIntermediates[idx];
    newIntermediates[idx] = newIntermediates[idx + 1];
    newIntermediates[idx + 1] = temp;
    setRouteBuilderData(prev => ({ ...prev, intermediateStopIds: newIntermediates }));
  };

  const handleRemoveIntermediate = (idx: number) => {
    const newIntermediates = routeBuilderData.intermediateStopIds.filter((_, i) => i !== idx);
    setRouteBuilderData(prev => ({ ...prev, intermediateStopIds: newIntermediates }));
  };

  const handleReverseRoute = () => {
    setRouteBuilderData(prev => {
      const nextDir =
        prev.direction === "HOME_TO_CAMPUS"
          ? "CAMPUS_TO_HOME"
          : prev.direction === "CAMPUS_TO_HOME"
            ? "HOME_TO_CAMPUS"
            : prev.direction;
      return {
        ...prev,
        startStopId: prev.endStopId,
        endStopId: prev.startStopId,
        originCampusId: prev.destinationCampusId,
        destinationCampusId: prev.originCampusId,
        intermediateStopIds: [...prev.intermediateStopIds].reverse(),
        direction: nextDir,
      };
    });
  };

  const handleSaveRouteFromBuilder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!routeBuilderData.name || !routeBuilderData.code) {
      alert("Please specify Route Name and Route Code.");
      return;
    }
    if (!routeBuilderData.startStopId || !routeBuilderData.endStopId) {
      alert("Please select both a Start Stop (Origin) and End Stop (Destination).");
      return;
    }
    if (routeBuilderData.startStopId === routeBuilderData.endStopId && routeBuilderData.direction !== "CIRCULAR") {
      alert("Start and End stop cannot be identical unless Direction is set to CIRCULAR Shuttle Loop.");
      return;
    }

    // Build the ordered stops data structure (including dynamic campus terminal nodes)
    const stopMap = new Map(stops.map(s => [s.id, s]));
    campuses.forEach(c => {
      const cStop = getTerminalStopForCampus(c, stops);
      stopMap.set(c.id, cStop);
      stopMap.set(cStop.id, cStop);
    });

    const formattedStops = builderOrderedStopIds.map((sId, idx) => {
      const stopObj = stopMap.get(sId)!;
      return {
        stopId: stopObj.id,
        stopOrder: idx + 1,
        arrivalOffsetMinutes: builderMetrics.stopOffsets[idx] || idx * 10,
        bufferTimeMinutes: 2,
        stop: stopObj,
      };
    });

    const originCampus = campuses.find(c => c.id === routeBuilderData.originCampusId || c.id === routeBuilderData.startStopId);
    const destCampus = campuses.find(c => c.id === routeBuilderData.destinationCampusId || c.id === routeBuilderData.endStopId);
    const primaryCampus = campuses.find(c => c.isPrimary) || campuses[0];
    const resolvedCampusId = (routeBuilderData.direction === "HOME_TO_CAMPUS" ? destCampus?.id : (routeBuilderData.direction === "CAMPUS_TO_HOME" ? originCampus?.id : (destCampus?.id || originCampus?.id))) || primaryCampus?.id;

    if (editingRouteId) {
      await store.updateRoute(editingRouteId, {
        name: routeBuilderData.name,
        code: routeBuilderData.code,
        description: routeBuilderData.description,
        direction: routeBuilderData.direction,
        campusId: resolvedCampusId,
        originCampusId: originCampus?.id,
        destinationCampusId: destCampus?.id,
        color: routeBuilderData.color,
        totalDistanceKm: builderMetrics.totalDistanceKm || 12,
        estimatedDurationMins: builderMetrics.estimatedDurationMins || 35,
        stops: formattedStops,
      });
      setSelectedRouteId(editingRouteId);
    } else {
      const newRoute = await store.createRoute({
        name: routeBuilderData.name,
        code: routeBuilderData.code,
        description: routeBuilderData.description,
        direction: routeBuilderData.direction,
        campusId: resolvedCampusId,
        originCampusId: originCampus?.id,
        destinationCampusId: destCampus?.id,
        color: routeBuilderData.color,
        isActive: true,
        totalDistanceKm: builderMetrics.totalDistanceKm || 12,
        estimatedDurationMins: builderMetrics.estimatedDurationMins || 35,
        stops: formattedStops,
      });
      setSelectedRouteId(newRoute.id);
    }

    setIsRouteBuilderOpen(false);
  };

  const handleDeleteRoute = async (routeId: string, routeName: string) => {
    if (confirm(`Delete corridor route "${routeName}"? Any active schedules on this route will be unassigned.`)) {
      await store.deleteRoute(routeId);
    }
  };

  // In-page quick shift of active route stops
  const handleShiftActiveRouteStop = async (stopIdx: number, direction: "UP" | "DOWN") => {
    if (!activeRoute) return;
    const currentStops = [...activeRoute.stops];
    const targetIdx = direction === "UP" ? stopIdx - 1 : stopIdx + 1;
    if (targetIdx < 0 || targetIdx >= currentStops.length) return;

    // Swap
    const temp = currentStops[stopIdx];
    currentStops[stopIdx] = currentStops[targetIdx];
    currentStops[targetIdx] = temp;

    // Re-index
    const reindexed = currentStops.map((s, idx) => ({
      ...s,
      stopOrder: idx + 1,
      arrivalOffsetMinutes: idx * 8,
    }));

    await store.updateRoute(activeRoute.id, { stops: reindexed });
  };

  // Allocate bus handlers
  const handleAllocateBus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoute || !selectedBusToAllocate) return;
    await store.allocateBusToRoute(Number(selectedBusToAllocate), activeRoute.id);
    alert(`Successfully allocated bus to Corridor ${activeRoute.name}!`);
    setIsAllocateBusModalOpen(false);
  };

  const handleToggleEmergencyOverride = () => {
    setIsOverrideActive(!isOverrideActive);
    alert(
      !isOverrideActive
        ? "Emergency Route Override Activated: Drivers rerouted around congested corridor. High-priority push alerts dispatched to students."
        : "Emergency Route Override Deactivated: Standard corridor stop sequence restored."
    );
  };

  // Active Route Coordinates for main view
  const activeRouteCoordinates: [number, number][] = activeRoute
    ? activeRoute.stops.map(rs => [rs.stop.latitude, rs.stop.longitude])
    : stops.map(s => [s.latitude, s.longitude]);

  // Network Analytics
  const networkStats = useMemo(() => store.getNetworkStats(), [routes, stops]);
  const hubStop = stops.find(s => s.id === networkStats.hubStopId);

  const assignedTrips = trips.filter(t => t.routeId === activeRoute?.id);
  const assignedBusIds = Array.from(new Set(assignedTrips.map(t => t.busId)));
  const assignedBuses = buses.filter(b => assignedBusIds.includes(b.id));

  // Available stops for search/filter in popover (excluding already selected stops)
  const filteredAvailableStops = useMemo(() => {
    const q = stopPickerSearch.toLowerCase().trim();
    const alreadySelectedSet = new Set(builderOrderedStopIds);
    return stops
      .filter(s => !alreadySelectedSet.has(s.id))
      .filter(s => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || (s.landmark && s.landmark.toLowerCase().includes(q)));
  }, [stops, builderOrderedStopIds, stopPickerSearch]);

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Main Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-800 pb-3">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <button
            onClick={() => setViewMode("STUDIO")}
            className={`px-4 py-2 rounded-2xl text-xs font-black transition-all flex items-center gap-2 ${
              viewMode === "STUDIO"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/25"
                : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
            }`}
          >
            <MapIcon className="w-4 h-4" />
            <span>Transit Studio (GIS Map)</span>
          </button>

          <button
            onClick={() => setViewMode("DIRECTORY")}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
              viewMode === "DIRECTORY"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/25"
                : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Corridors Directory ({routes.length})</span>
          </button>

          {true && (
            <button
              onClick={handleToggleEmergencyOverride}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all ${
                isOverrideActive
                  ? "bg-red-600 text-white animate-pulse"
                  : "bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-800"
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              {isOverrideActive ? "Override Active" : "Emergency Override"}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/transport-admin/routes/stops/create"
            className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
          >
            <MapPin className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
            <span className="hidden sm:inline">Add Stop</span>
          </Link>
          <Link
            href="/transport-admin/routes/corridors/create"
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Route</span>
          </Link>
        </div>
      </div>

      {/* ============================================================= */}
      {/* UNIVERSITY CAMPUS HUBS (CLICK TO SWITCH STUDIO ANCHOR)        */}
      {/* ============================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>University Campus Hubs & Terminals</span>
            </h2>
            <p className="text-xs text-gray-500">
              Corridor Anchor 1 is fixed at the selected Campus Terminal; Corridor Anchor 2 connects to the Overnight Fleet Depot & Rest Zone.
            </p>
          </div>
          <span className="text-[11px] font-mono font-bold text-gray-400">
            {campuses.length} Campuses Active
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campuses.map(c => {
            const isSelected = c.id === selectedCampusId;
            const corridorsCount = routes.filter(
              r => r.campusId === c.id || r.originCampusId === c.id || r.destinationCampusId === c.id
            ).length;
            const campusStudents = students.filter(
              s => s.campusId === c.id || (s.campus && s.campus.toLowerCase().includes(c.name.toLowerCase().slice(0, 4)))
            );

            return (
              <div
                key={c.id}
                onClick={() => {
                  setSelectedCampusId(c.id);
                  setViewMode("STUDIO");
                }}
                className={`group p-5 rounded-3xl border transition-all duration-200 cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                  isSelected
                    ? "bg-gradient-to-br from-blue-50/80 to-white dark:from-blue-950/30 dark:to-gray-900 border-blue-500 shadow-xl shadow-blue-500/10 ring-2 ring-blue-500/20"
                    : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700 shadow-sm hover:shadow-md"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-2xl flex items-center justify-center font-bold text-xs ${
                        isSelected
                          ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                          : "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                      }`}>
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] uppercase font-bold text-gray-400 block">
                            {c.code || "CAMPUS"}
                          </span>
                          {c.isPrimary && (
                            <span className="bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-400 text-[9px] font-bold px-1.5 py-0.2 rounded font-mono border border-amber-300 dark:border-amber-800">
                              Primary Hub
                            </span>
                          )}
                        </div>
                        <h3 className="font-black text-gray-900 dark:text-white text-base leading-snug group-hover:text-blue-600 transition-colors">
                          {c.name}
                        </h3>
                      </div>
                    </div>

                    {isSelected && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100/80 dark:bg-blue-900/40 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                        <Check className="w-3 h-3" /> Active in Studio
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 mb-4">
                    {c.landmark || c.address || "Main Academic Complex & Transit Bay"}
                  </p>

                  {/* Fixed Corridor Anchors Info */}
                  <div className="grid grid-cols-2 gap-2 mb-4 bg-gray-50 dark:bg-gray-800/60 p-2.5 rounded-2xl border border-gray-100 dark:border-gray-800 text-[11px]">
                    <div>
                      <span className="text-[9px] font-mono uppercase font-bold text-emerald-600 dark:text-emerald-400 block">
                        Anchor 1 (Origin)
                      </span>
                      <span className="font-bold text-gray-800 dark:text-gray-200 truncate block">
                        Campus Terminal
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] font-mono uppercase font-bold text-indigo-600 dark:text-indigo-400 block">
                        Anchor 2 (Dest)
                      </span>
                      <span className="font-bold text-gray-800 dark:text-gray-200 truncate block">
                        Rest Depot Area
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-gray-500 dark:text-gray-400 text-[11px]">
                      <strong className="text-gray-900 dark:text-white">{corridorsCount}</strong> corridors
                    </span>
                    <span className="text-gray-300 dark:text-gray-700">•</span>
                    <span className="font-mono text-gray-500 dark:text-gray-400 text-[11px]">
                      <strong className="text-gray-900 dark:text-white">{campusStudents.length || students.length}</strong> commuters
                    </span>
                  </div>

                  <span className="text-blue-600 dark:text-blue-400 font-bold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                    Open in Studio <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ============================================================= */}
      {/* STUDIO VIEW OR DIRECTORY VIEW                                 */}
      {/* ============================================================= */}
      {mode === "create" ? (
        <RouteBuilderModal
          isRouteBuilderOpen={true}
          setIsRouteBuilderOpen={setIsRouteBuilderOpen}
          editingRouteId={editingRouteId}
          routeBuilderData={routeBuilderData}
          setRouteBuilderData={setRouteBuilderData}
          insertingAtGapIndex={insertingAtGapIndex}
          setInsertingAtGapIndex={setInsertingAtGapIndex}
          stopPickerSearch={stopPickerSearch}
          setStopPickerSearch={setStopPickerSearch}
          activePickerTarget={activePickerTarget}
          setActivePickerTarget={setActivePickerTarget}
          stops={stops}
          campuses={campuses}
          handleReverseRoute={handleReverseRoute}
          handleInsertIntermediateStop={handleInsertIntermediateStop}
          handleShiftIntermediateUp={handleShiftIntermediateUp}
          handleShiftIntermediateDown={handleShiftIntermediateDown}
          handleRemoveIntermediateStop={handleRemoveIntermediate}
          handleSaveRouteFromBuilder={handleSaveRouteFromBuilder}
          builderStops={builderStops}
          builderOrderedStopIds={builderOrderedStopIds}
          builderMetrics={builderMetrics}
        />
      ) : viewMode === "STUDIO" ? (
        selectedCampus ? (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <h3 className="text-sm font-black text-gray-900 dark:text-white">
                  Transit Studio Google Map — {selectedCampus.name}
                </h3>
              </div>
              <p className="text-[11px] text-gray-500 font-mono">
                Road-snapped corridors with student demand walkability layer &amp; fare zone assignment
              </p>
            </div>

            <TransitStudioMap
              campus={selectedCampus}
              campuses={campuses}
              stops={stops}
              students={students}
              availableRestZones={restZones}
              onSelectCampus={(c) => setSelectedCampusId(c.id)}
              onSaveCorridor={handleSaveCorridorFromStudio}
            />
          </div>
        ) : (
          <div className="p-12 text-center bg-white dark:bg-gray-900 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-800 space-y-3">
            <Building2 className="w-10 h-10 text-gray-300 mx-auto" />
            <h3 className="font-bold text-gray-900 dark:text-white">No Campuses Found in Database</h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Please register or wait for campuses to sync from the PostgreSQL database table.
            </p>
          </div>
        )
      ) : (
        <div className="space-y-6 pt-2">
          {routes.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {routes.map(r => (
                <Link
                  href={`/transport-admin/routes/corridors/${r.id}`}
                  key={r.id}
                  className="group"
                >
                  <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 relative overflow-hidden flex flex-col h-full hover:border-blue-300 dark:hover:border-blue-700/50">

                    {/* Decorative Top Gradient Line based on Route Color */}
                    <div
                      className="absolute top-0 left-0 right-0 h-1.5 w-full opacity-80 group-hover:opacity-100 transition-opacity"
                      style={{ backgroundColor: r.color }}
                    />

                    {/* Header */}
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className="font-mono text-[10px] uppercase font-bold text-gray-400 block mb-1">
                          {r.code} • {r.direction === "HOME_TO_CAMPUS" ? "Inbound" : "Outbound"}
                        </span>
                        <h3 className="font-black text-gray-900 dark:text-white text-lg leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {r.name}
                        </h3>
                      </div>
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm shrink-0"
                        style={{ color: r.color }}
                      >
                        <RouteIcon className="w-4 h-4" />
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-3 mb-6 mt-auto">
                      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-3 border border-gray-100 dark:border-gray-800">
                        <span className="text-[10px] text-gray-500 font-bold uppercase block mb-0.5">Distance</span>
                        <span className="font-black text-gray-900 dark:text-white text-sm">{r.totalDistanceKm} <span className="text-gray-400 font-normal">km</span></span>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-3 border border-gray-100 dark:border-gray-800">
                        <span className="text-[10px] text-gray-500 font-bold uppercase block mb-0.5">Duration</span>
                        <span className="font-black text-gray-900 dark:text-white text-sm">~{r.estimatedDurationMins || Math.round(r.totalDistanceKm * 2.8)} <span className="text-gray-400 font-normal">min</span></span>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-800 mt-auto">
                      <div className="flex items-center gap-1.5">
                        <span className="flex h-5 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 text-[10px] font-bold text-blue-600 dark:text-blue-400 font-mono border border-blue-100 dark:border-blue-800/50">
                          {r.stops.length} Stops
                        </span>
                      </div>
                      <div className="text-[11px] font-bold text-blue-600 flex items-center gap-1 group-hover:gap-2 transition-all">
                        View Map & Flowchart <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center bg-white dark:bg-gray-900 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-800 space-y-3">
              <RouteIcon className="w-10 h-10 text-gray-300 mx-auto" />
              <h3 className="font-bold text-gray-900 dark:text-white">No Transit Corridors Defined</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                Click the "Create Route" button in the header to start building your first transit network corridor.
              </p>
            </div>
          )}
        </div>
      )}

      <AllocateBusModal
        isAllocateBusModalOpen={isAllocateBusModalOpen}
        setIsAllocateBusModalOpen={setIsAllocateBusModalOpen}
        activeRoute={activeRoute}
        assignedBuses={assignedBuses}
        buses={buses}
        selectedBusToAllocate={selectedBusToAllocate}
        setSelectedBusToAllocate={setSelectedBusToAllocate}
        handleAllocateBus={handleAllocateBus}
      />
    </div>
  );
}
