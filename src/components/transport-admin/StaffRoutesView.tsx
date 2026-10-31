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
  Star,
  Zap,
  Keyboard,
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

export interface StaffRoutesProps {
  initialRoutes?: Route[];
  initialStops?: Stop[];
  initialBuses?: Bus[];
  initialTrips?: Trip[];
  initialCampuses?: Campus[];
}

export default function StaffRoutesView({
  initialRoutes = [],
  initialStops = [],
  initialBuses = [],
  initialTrips = [],
  initialCampuses = [],
}: StaffRoutesProps = {}) {
  const [routes, setRoutes] = useState<Route[]>(() => initialRoutes.length > 0 ? initialRoutes : store.getRoutes());
  const [stops, setStops] = useState<Stop[]>(() => initialStops.length > 0 ? initialStops : store.getStops());
  const [buses, setBuses] = useState<Bus[]>(() => initialBuses.length > 0 ? initialBuses : store.getBuses());
  const [trips, setTrips] = useState<Trip[]>(() => initialTrips.length > 0 ? initialTrips : store.getTrips());

  const [campuses, setCampuses] = useState<Campus[]>(() => initialCampuses.length > 0 ? initialCampuses : store.getCampuses());

  const [activeTab, setActiveTab] = useState<"ROUTES" | "CAMPUS_LOCATIONS" | "STOPS">("ROUTES");

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
  const [selectedRouteId, setSelectedRouteId] = useState(routes[0]?.id || "");
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

  useEffect(() => {
    const unsub = store.subscribe(() => {
      const r = store.getRoutes();
      setRoutes(r);
      setStops(store.getStops());
      setCampuses(store.getCampuses());
      setBuses(store.getBuses());
      setTrips(store.getTrips());
      if (!selectedRouteId && r.length > 0) {
        setSelectedRouteId(r[0].id);
      }
    });
    return unsub;
  }, [selectedRouteId]);

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
      {/* Top Banner & Two Primary Creation Options */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-blue-900/10  p-6 rounded-3xl border border-blue-200/60 dark:border-blue-900/40">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
            <Sparkles className="w-4 h-4" />
            University Transit Network Architect
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white flex items-center gap-2.5 mt-1">
            <RouteIcon className="w-7 h-7 text-blue-600" />
            Route Builder & Stops Management
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1 max-w-2xl">
            Design multi-stop university transit corridors using the interactive flowchart builder, drop station pins directly on the map, and shift route paths with live OSRM road geometry.
          </p>
        </div>

        {/* 2 PRIMARY CREATION OPTIONS */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            id="btn-create-stop"
            onClick={handleOpenCreateStop}
            className="px-4 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-bold text-xs rounded-2xl flex items-center gap-2 border border-gray-200 dark:border-gray-700 shadow-sm transition-all hover:scale-[1.02] active:scale-95"
          >
            <div className="w-6 h-6 rounded-lg bg-green-100 dark:bg-green-950/60 text-green-600 flex items-center justify-center font-bold">
              <MapPin className="w-3.5 h-3.5" />
            </div>
            <span>+ Create Stop</span>
          </button>

          <button
            id="btn-create-route"
            onClick={handleOpenCreateRoute}
            className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-2xl flex items-center gap-2.5 shadow-lg shadow-blue-600/30 transition-all hover:scale-[1.02] active:scale-95"
          >
            <div className="w-6 h-6 rounded-lg bg-blue-500 text-white flex items-center justify-center font-bold">
              <GitBranch className="w-3.5 h-3.5" />
            </div>
            <span>+ Create Route (Flowchart Builder)</span>
          </button>
        </div>
      </div>

      {/* Network Topology KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-1">
          <span className="text-[10px] uppercase font-bold text-gray-400">Network Hub Station</span>
          <div className="text-sm font-black text-gray-900 dark:text-white truncate">
            {hubStop?.name || "Transit Terminal"}
          </div>
          <p className="text-[10px] text-blue-600 dark:text-blue-400 font-mono">Most connected transfer node</p>
        </div>

        <div className="p-4 bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-1">
          <span className="text-[10px] uppercase font-bold text-gray-400">Network Diameter</span>
          <div className="text-sm font-black text-blue-600 dark:text-blue-400">
            {networkStats.networkDiameterKm} km
          </div>
          <p className="text-[10px] text-gray-400 font-mono">Longest shortest path corridor</p>
        </div>

        <div className="p-4 bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-1">
          <span className="text-[10px] uppercase font-bold text-gray-400">Minimum Spanning Tree</span>
          <div className="text-sm font-black text-green-600 dark:text-green-400">
            {networkStats.mstTotalKm} km
          </div>
          <p className="text-[10px] text-gray-400 font-mono">Kruskal MST infrastructure span</p>
        </div>

        <div className="p-4 bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-1">
          <span className="text-[10px] uppercase font-bold text-gray-400">Station Density</span>
          <div className="text-sm font-black text-pink-600 dark:text-pink-400">
            {networkStats.avgConnectivity} conn / stop
          </div>
          <p className="text-[10px] text-gray-400 font-mono">{stops.length} physical stops cataloged</p>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-2">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setActiveTab("ROUTES")}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === "ROUTES"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <RouteIcon className="w-4 h-4" />
            <span>Corridors & Routes ({routes.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("CAMPUS_LOCATIONS")}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === "CAMPUS_LOCATIONS"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Campus Locations ({campuses.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("STOPS")}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === "STOPS"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <MapPin className="w-4 h-4" />
            <span>Campus Bus Stops Roster ({stops.length})</span>
          </button>
        </div>

        {activeTab === "ROUTES" && (
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

      {/* ============================================================= */}
      {/* TAB 1: ROUTES & CORRIDORS                                     */}
      {/* ============================================================= */}
      {activeTab === "ROUTES" && (
        <div className="space-y-6">
          {/* Route Selector Pills */}
          {routes.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {routes.map(r => {
                const isSelected = r.id === selectedRouteId;
                return (
                  <button
                    key={r.id}
                    onClick={() => {
                      setSelectedRouteId(r.id);
                      setSelectedStopId(undefined);
                    }}
                    className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all flex-shrink-0 ${
                      isSelected
                        ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                        : "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50"
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                    <span>{r.name}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20 font-mono">
                      {r.stops.length} stops
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {activeRoute ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
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
                        {activeRoute.totalDistanceKm} km • ~{activeRoute.estimatedDurationMins || Math.round(activeRoute.totalDistanceKm * 2.8)} mins • Direction: {activeRoute.direction}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenEditRoute(activeRoute)}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-300 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-sm"
                        title="Edit corridor in visual flowchart builder"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit Flowchart</span>
                      </button>

                      <button
                        onClick={() => setIsAllocateBusModalOpen(true)}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs font-bold rounded-xl flex items-center gap-1.5"
                      >
                        <BusFront className="w-3.5 h-3.5 text-blue-600" />
                        <span>Allocate Bus</span>
                      </button>

                      <button
                        onClick={() => handleDeleteRoute(activeRoute.id, activeRoute.name)}
                        className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl"
                        title="Delete Route"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* View Mode Toggle: Flowchart Timeline vs Map */}
                  <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800/80 p-1.5 rounded-2xl">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setRouteViewMode("FLOWCHART")}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          routeViewMode === "FLOWCHART"
                            ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm"
                            : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>Station Progression Flowchart</span>
                      </button>
                      <button
                        onClick={() => setRouteViewMode("MAP")}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          routeViewMode === "MAP"
                            ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm"
                            : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
                        }`}
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        <span>Corridor GIS Map</span>
                      </button>
                    </div>

                    <span className="text-[11px] font-mono text-gray-400 pr-2 hidden sm:inline">
                      {routeViewMode === "FLOWCHART" ? "Where Is My Train Linear Sequence" : "Road Network Polylines"}
                    </span>
                  </div>

                  {/* Primary Corridor Display */}
                  {routeViewMode === "FLOWCHART" ? (
                    <WhereIsMyBusFlowchart
                      route={activeRoute}
                      bus={assignedBuses[0] || null}
                      busLocation={null}
                      trip={assignedTrips[0] || null}
                      selectedStopId={selectedStopId}
                      onSelectStop={stop => setSelectedStopId(stop.id)}
                      onToggleMapView={() => setRouteViewMode("MAP")}
                      isMapViewActive={false}
                      baseDepartureTime="07:15"
                    />
                  ) : (
                    <CampusFleetMap
                      stops={activeRoute.stops.map(rs => rs.stop)}
                      routeCoordinates={activeRouteCoordinates}
                      campuses={campuses}
                      height="420px"
                      selectedStopId={selectedStopId}
                      onStopClick={stop => setSelectedStopId(stop.id)}
                    />
                  )}

                  {/* Allocated Fleet Buses Strip */}
                  <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <BusFront className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                        Allocated Fleet Buses:
                      </span>
                      {assignedBuses.length > 0 ? (
                        <div className="flex gap-1.5 flex-wrap">
                          {assignedBuses.map(b => (
                            <span
                              key={b.id}
                              className="px-2 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold text-[10px] rounded-lg"
                            >
                              {b.busNumber} ({b.capacity} seats)
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">None allocated yet</span>
                      )}
                    </div>

                    <button
                      onClick={() => setIsAllocateBusModalOpen(true)}
                      className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline"
                    >
                      + Assign Vehicle
                    </button>
                  </div>
                </div>
              </div>

              {/* Right 5 Cols: Ordered Stops Sequence with Flowchart Timeline & Shift Controls */}
              <div className="lg:col-span-5 bg-white dark:bg-gray-900 rounded-3xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                      <GitCommit className="w-4 h-4 text-blue-600" />
                      Corridor Stops Flowchart
                    </h3>
                    <p className="text-[11px] text-gray-400">Sequential stop schedule with live shift controls</p>
                  </div>
                  <button
                    onClick={() => handleOpenEditRoute(activeRoute)}
                    className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Insert Stops
                  </button>
                </div>

                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {activeRoute.stops.map((rs, idx) => {
                    const isFirst = idx === 0;
                    const isLast = idx === activeRoute.stops.length - 1;
                    const isSelected = selectedStopId === rs.stopId;

                    return (
                      <div key={rs.stopId} className="relative">
                        {/* Connecting Line Between Stops */}
                        {!isLast && (
                          <div className="absolute left-6 top-10 bottom-0 w-0.5 bg-blue-500 z-0" />
                        )}

                        <div
                          onClick={() => setSelectedStopId(rs.stopId)}
                          className={`relative z-10 p-3 rounded-2xl border transition-all cursor-pointer ${
                            isSelected
                              ? "bg-green-50 dark:bg-green-950/40 border-green-500 ring-2 ring-green-500/20 shadow-md"
                              : "bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700/60 hover:bg-gray-100"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {/* Station Sequence Badge */}
                              <div
                                className={`w-7 h-7 rounded-full text-white font-mono font-bold text-xs flex items-center justify-center shadow-sm ${
                                  isFirst
                                    ? "bg-green-600 ring-2 ring-green-400/40"
                                    : isLast
                                    ? "bg-blue-600 ring-2 ring-blue-400/40"
                                    : "bg-blue-600"
                                }`}
                              >
                                {isFirst ? (
                                  <MapPin className="w-3.5 h-3.5" />
                                ) : isLast ? (
                                  <Building2 className="w-3.5 h-3.5" />
                                ) : (
                                  idx + 1
                                )}
                              </div>

                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-xs text-gray-900 dark:text-white">
                                    {rs.stop?.name || "Bus Stop"}
                                  </span>
                                  {isFirst && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-green-100 dark:bg-green-950 text-green-700 font-bold">
                                      Origin
                                    </span>
                                  )}
                                  {isLast && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 font-bold">
                                      Destination
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-gray-400 font-mono">
                                  {rs.stop?.code} • {rs.stop?.landmark || "Campus Stop"}
                                </div>
                              </div>
                            </div>

                            {/* Shift Up/Down & Offset Controls */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                                +{rs.arrivalOffsetMinutes}m
                              </span>

                              {/* Shift Buttons */}
                              <div className="flex items-center gap-0.5 ml-2">
                                <button
                                  type="button"
                                  disabled={isFirst}
                                  onClick={e => {
                                    e.stopPropagation();
                                    handleShiftActiveRouteStop(idx, "UP");
                                  }}
                                  className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-20 text-gray-600 dark:text-gray-300"
                                  title="Shift Stop Earlier"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={isLast}
                                  onClick={e => {
                                    e.stopPropagation();
                                    handleShiftActiveRouteStop(idx, "DOWN");
                                  }}
                                  className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-20 text-gray-600 dark:text-gray-300"
                                  title="Shift Stop Later"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-gray-400 mt-2 pt-1.5 border-t border-gray-200/60 dark:border-gray-700/40">
                            <span>Geofence: {rs.stop?.geofenceRadiusMeters || 80}m</span>
                            <span>Buffer Dwell: {rs.bufferTimeMinutes} mins</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Edit in Visual Builder Banner */}
                <button
                  onClick={() => handleOpenEditRoute(activeRoute)}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700  text-white font-bold text-xs rounded-2xl flex items-center justify-center gap-2 shadow-md shadow-blue-600/20 transition-all hover:scale-[1.01]"
                >
                  <GitBranch className="w-4 h-4" />
                  <span>Open Interactive Flowchart Builder</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center bg-white dark:bg-gray-900 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-800 space-y-3">
              <RouteIcon className="w-10 h-10 text-blue-600 mx-auto" />
              <h3 className="font-bold text-base">No Routes Configured Yet</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                Create institutional bus corridors connecting residential areas and university hubs.
              </p>
              <button
                onClick={handleOpenCreateRoute}
                className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl"
              >
                + Create First Route
              </button>
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 2: STOPS ROSTER                                           */}
      {/* ============================================================= */}
      {/* ============================================================= */}
      {/* TAB 2: CAMPUS LOCATIONS (Institutional Campus CRUD)           */}
      {/* ============================================================= */}
      {activeTab === "CAMPUS_LOCATIONS" && (
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
                  className={`relative p-5 rounded-3xl border shadow-sm space-y-4 flex flex-col justify-between transition-all hover:shadow-md ${
                    campus.isPrimary
                      ? "bg-blue-900/30 border-blue-500/40 text-white"
                      : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800"
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner flex-shrink-0 ${
                        campus.isPrimary
                          ? "bg-blue-600/20 border border-blue-500/40 text-blue-400"
                          : "bg-green-50 dark:bg-green-950/60 border border-green-200 dark:border-green-800 text-green-600"
                      }`}>
                        <Building2 className="w-6 h-6" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {campus.isPrimary && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-bold uppercase tracking-wider border border-blue-500/30">
                              <Star className="w-2.5 h-2.5 fill-blue-300 text-blue-300" />
                              Primary Hub
                            </span>
                          )}
                          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                            campus.isActive !== false
                              ? "bg-green-500/20 text-green-400 dark:text-green-300"
                              : "bg-red-500/20 text-red-400"
                          }`}>
                            {campus.isActive !== false ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <h4 className={`font-black text-sm mt-0.5 truncate ${
                          campus.isPrimary ? "text-white" : "text-gray-900 dark:text-white"
                        }`}>
                          {campus.name}
                        </h4>
                        <p className={`text-[11px] truncate ${
                          campus.isPrimary ? "text-gray-400" : "text-gray-400"
                        }`}>
                          {campus.address || campus.landmark || "No address set"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs ${
                    campus.isPrimary ? "" : ""
                  }`}>
                    <div className={`p-2.5 rounded-xl ${
                      campus.isPrimary ? "bg-gray-800/40 border border-gray-700/50" : "bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/50"
                    }`}>
                      <span className="text-[10px] text-gray-400 block font-bold uppercase">Code</span>
                      <span className={`font-mono font-black ${
                        campus.isPrimary ? "text-blue-300" : "text-blue-600 dark:text-blue-400"
                      }`}>{campus.code}</span>
                    </div>
                    <div className={`p-2.5 rounded-xl ${
                      campus.isPrimary ? "bg-gray-800/40 border border-gray-700/50" : "bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/50"
                    }`}>
                      <span className="text-[10px] text-gray-400 block font-bold uppercase">GPS</span>
                      <span className={`font-mono font-bold text-[11px] ${
                        campus.isPrimary ? "text-gray-200" : "text-gray-600 dark:text-gray-300"
                      }`}>
                        {campus.latitude.toFixed(4)}°N
                      </span>
                    </div>
                    <div className={`p-2.5 rounded-xl ${
                      campus.isPrimary ? "bg-gray-800/40 border border-gray-700/50" : "bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/50"
                    }`}>
                      <span className="text-[10px] text-gray-400 block font-bold uppercase">Fleet</span>
                      <span className={`font-bold ${
                        campus.isPrimary ? "text-green-400" : "text-green-600 dark:text-green-400"
                      }`}>{campus.fleetCapacity || 50} buses</span>
                    </div>
                    <div className={`p-2.5 rounded-xl ${
                      campus.isPrimary ? "bg-gray-800/40 border border-gray-700/50" : "bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/50"
                    }`}>
                      <span className="text-[10px] text-gray-400 block font-bold uppercase">Bays</span>
                      <span className={`font-bold ${
                        campus.isPrimary ? "text-yellow-400" : "text-yellow-600 dark:text-yellow-400"
                      }`}>{campus.parkingBays || 20} bays</span>
                    </div>
                  </div>

                  {/* Geofence & Contact */}
                  <div className={`grid grid-cols-2 gap-2 text-xs ${
                    campus.isPrimary ? "" : ""
                  }`}>
                    <div className={`p-2.5 rounded-xl ${
                      campus.isPrimary ? "bg-gray-800/40 border border-gray-700/50" : "bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/50"
                    }`}>
                      <span className="text-[10px] text-gray-400 block font-bold uppercase">Geofence</span>
                      <span className={`font-mono font-bold ${
                        campus.isPrimary ? "text-pink-300" : "text-pink-600 dark:text-pink-400"
                      }`}>{campus.geofenceRadiusMeters}m radius</span>
                    </div>
                    <div className={`p-2.5 rounded-xl ${
                      campus.isPrimary ? "bg-gray-800/40 border border-gray-700/50" : "bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/50"
                    }`}>
                      <span className="text-[10px] text-gray-400 block font-bold uppercase">Landmark</span>
                      <span className={`font-medium truncate block ${
                        campus.isPrimary ? "text-gray-300" : "text-gray-600 dark:text-gray-300"
                      }`}>{campus.landmark || "—"}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className={`flex items-center gap-2 pt-3 border-t ${
                    campus.isPrimary ? "border-gray-700/50" : "border-gray-100 dark:border-gray-800"
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
                      className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all ${
                        campus.isPrimary
                          ? "bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/30"
                          : "bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
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

      {/* ============================================================= */}
      {/* TAB 3: STOPS                                                  */}
      {/* ============================================================= */}
      {activeTab === "STOPS" && (
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
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all border flex items-center gap-1 ${
                      st.isBusMergeStop
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

      {/* ============================================================= */}
      {/* MODAL 1: CREATE / EDIT STOP (MANUAL OR MAP PIN DROP)          */}
      {/* ============================================================= */}
      {isAddStopModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 space-y-4 text-gray-900 dark:text-white shadow-2xl max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-green-100 dark:bg-green-950/60 text-green-600 flex items-center justify-center">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-base">
                    {editingStop ? `Edit Stop: ${editingStop.name}` : "Create Campus Bus Stop"}
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    Add coordinates via interactive map pin-dropping or direct manual input
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsAddStopModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Input Mode Switcher */}
            <div className="grid grid-cols-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl">
              <button
                type="button"
                onClick={() => setStopInputMode("MAP_PIN")}
                className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  stopInputMode === "MAP_PIN"
                    ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Mark on Interactive Map</span>
              </button>

              <button
                type="button"
                onClick={() => setStopInputMode("MANUAL")}
                className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  stopInputMode === "MANUAL"
                    ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>⌨️ Enter GPS Coordinates</span>
              </button>
            </div>

            <form onSubmit={handleSaveStop} className="space-y-4 text-xs">
              {/* If in MAP PIN MODE: Embedded Map with Pin Dropper */}
              {stopInputMode === "MAP_PIN" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-gray-500 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      Click on the map to place station pin
                    </span>
                    <span className="font-mono text-gray-400 font-bold">
                      {stopFormData.latitude.toFixed(5)}, {stopFormData.longitude.toFixed(5)}
                    </span>
                  </div>

                  <CampusFleetMap
                    stops={stops}
                    height="240px"
                    interactiveMode="PIN_DROP"
                    draftPinLocation={[stopFormData.latitude, stopFormData.longitude]}
                    draftGeofenceRadius={stopFormData.geofenceRadiusMeters}
                    onMapClick={(lat, lng) => {
                      setStopFormData(prev => ({
                        ...prev,
                        latitude: lat,
                        longitude: lng,
                      }));
                    }}
                  />
                </div>
              )}

              {/* Stop Name & Code */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold uppercase tracking-wider text-gray-400">Stop Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Subhash Chowk Terminal"
                    value={stopFormData.name}
                    onChange={e => setStopFormData({ ...stopFormData, name: e.target.value })}
                    className="w-full p-2.5 mt-1 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none font-bold"
                  />
                </div>

                <div>
                  <label className="font-bold uppercase tracking-wider text-gray-400">Station Code</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ST-07"
                    value={stopFormData.code}
                    onChange={e => setStopFormData({ ...stopFormData, code: e.target.value })}
                    className="w-full p-2.5 mt-1 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none font-mono font-bold"
                  />
                </div>
              </div>

              {/* Manual Coordinate Inputs (or editable in either mode) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold uppercase tracking-wider text-gray-400">Latitude (°N)</label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={stopFormData.latitude}
                    onChange={e => setStopFormData({ ...stopFormData, latitude: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2.5 mt-1 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="font-bold uppercase tracking-wider text-gray-400">Longitude (°E)</label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={stopFormData.longitude}
                    onChange={e => setStopFormData({ ...stopFormData, longitude: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2.5 mt-1 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none font-mono"
                  />
                </div>
              </div>

              {/* Geofence Radius Slider */}
              <div className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold uppercase tracking-wider text-gray-400">
                    Geofence Arrival Detection Radius
                  </label>
                  <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                    {stopFormData.geofenceRadiusMeters} meters
                  </span>
                </div>
                <input
                  type="range"
                  min={30}
                  max={300}
                  step={5}
                  value={stopFormData.geofenceRadiusMeters}
                  onChange={e => setStopFormData({ ...stopFormData, geofenceRadiusMeters: parseInt(e.target.value) || 80 })}
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <span className="text-[10px] text-gray-400 block">
                  Telematics auto-detects arrival when bus enters this perimeter
                </span>
              </div>

              {/* Landmark description */}
              <div>
                <label className="font-bold uppercase tracking-wider text-gray-400">
                  Landmark & Surrounding Description
                </label>
                <input
                  type="text"
                  placeholder="e.g. Opposite Main Gate #2, Near Post Office"
                  value={stopFormData.landmark}
                  onChange={e => setStopFormData({ ...stopFormData, landmark: e.target.value })}
                  className="w-full p-2.5 mt-1 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none"
                />
              </div>

              {/* Bus Merge Stop Toggle Switch */}
              <div className="p-3.5 bg-pink-50/80 dark:bg-pink-950/40 rounded-2xl border border-pink-200 dark:border-pink-800/60 flex items-center justify-between">
                <div>
                  <div className="font-bold text-xs text-pink-900 dark:text-pink-300 flex items-center gap-1.5">
                    <GitMerge className="w-4 h-4 text-pink-600 dark:text-pink-400" />
                    <span>Is Bus Merge Stop (Consolidation Junction)</span>
                  </div>
                  <p className="text-[10px] text-pink-700/80 dark:text-pink-400 mt-0.5">
                    Turn ON to authorize bus consolidation, transfers, and standing passenger seat transitions at this junction.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-3 flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={stopFormData.isBusMergeStop || false}
                    onChange={e => setStopFormData({ ...stopFormData, isBusMergeStop: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
                </label>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsAddStopModalOpen(false)}
                  className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-600/20"
                >
                  {editingStop ? "Save Station Changes" : "Confirm & Create Stop"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL 1B: EDIT CENTRAL CAMPUS TERMINAL & FLEET DEPOT          */}
      {/* ============================================================= */}
      {isEditCampusModalOpen && campusFormData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 space-y-4 text-gray-900 dark:text-white shadow-2xl max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base">
                    Edit University Campus Terminal & Depot
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    Sourced dynamically from PostgreSQL database. Zero hardcoded constants.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsEditCampusModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Input Mode Switcher */}
            <div className="grid grid-cols-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl">
              <button
                type="button"
                onClick={() => setCampusInputMode("MAP_PIN")}
                className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  campusInputMode === "MAP_PIN"
                    ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Mark on Interactive Map</span>
              </button>

              <button
                type="button"
                onClick={() => setCampusInputMode("MANUAL")}
                className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  campusInputMode === "MANUAL"
                    ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <Keyboard className="w-3.5 h-3.5" />
                <span>Enter GPS Coordinates</span>
              </button>
            </div>

            <form onSubmit={handleSaveCampus} className="space-y-4 text-xs">
              {/* If in MAP PIN MODE: Embedded Map with Pin Dropper */}
              {campusInputMode === "MAP_PIN" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-gray-500 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                      Click on the map to anchor campus terminal pin
                    </span>
                    <span className="font-mono text-gray-400 font-bold">
                      {campusFormData.latitude.toFixed(5)}, {campusFormData.longitude.toFixed(5)}
                    </span>
                  </div>

                  <CampusFleetMap
                    stops={stops}
                    height="240px"
                    interactiveMode="PIN_DROP"
                    draftPinLocation={[campusFormData.latitude, campusFormData.longitude]}
                    draftGeofenceRadius={campusFormData.geofenceRadiusMeters}
                    onMapClick={(lat, lng) => {
                      setCampusFormData(prev => prev ? ({
                        ...prev,
                        latitude: Number(lat.toFixed(6)),
                        longitude: Number(lng.toFixed(6)),
                      }) : null);
                    }}
                  />
                  <p className="text-[10px] text-gray-400 italic flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                    <span>Click anywhere on the map to drop the anchor coordinates for the campus terminal and depot slots.</span>
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">
                    Campus Terminal Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={campusFormData.name}
                    onChange={e => setCampusFormData({ ...campusFormData, name: e.target.value })}
                    placeholder="e.g. University Main Campus Terminal"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">
                    Terminal Station Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={campusFormData.code}
                    onChange={e => setCampusFormData({ ...campusFormData, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. CAMPUS-01"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl font-mono uppercase focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">
                    Geofence Radius (Meters)
                  </label>
                  <input
                    type="number"
                    min="20"
                    max="500"
                    step="5"
                    value={campusFormData.geofenceRadiusMeters}
                    onChange={e =>
                      setCampusFormData({
                        ...campusFormData,
                        geofenceRadiusMeters: parseInt(e.target.value) || 80,
                      })
                    }
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">
                    Latitude Coordinates *
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={campusFormData.latitude}
                    onChange={e =>
                      setCampusFormData({
                        ...campusFormData,
                        latitude: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">
                    Longitude Coordinates *
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={campusFormData.longitude}
                    onChange={e =>
                      setCampusFormData({
                        ...campusFormData,
                        longitude: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">
                    Campus Landmark / Gate Info
                  </label>
                  <input
                    type="text"
                    value={campusFormData.landmark || ""}
                    onChange={e => setCampusFormData({ ...campusFormData, landmark: e.target.value })}
                    placeholder="e.g. University Main Gate 1 & Fleet Depot"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">
                    Campus Affiliation
                  </label>
                  <input
                    type="text"
                    value={campusFormData.campus || ""}
                    onChange={e => setCampusFormData({ ...campusFormData, campus: e.target.value })}
                    placeholder="e.g. Main Campus"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsEditCampusModalOpen(false)}
                  disabled={isSavingCampus}
                  className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingCampus}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-600/20 flex items-center justify-center gap-1.5"
                >
                  {isSavingCampus ? (
                    <span>Persisting to Database...</span>
                  ) : (
                    <span>Save Campus Terminal</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL 2: INTERACTIVE FLOWCHART ROUTE BUILDER                 */}
      {/* ============================================================= */}
      {isRouteBuilderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-6xl h-[92vh] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-5 sm:p-6 flex flex-col justify-between text-gray-900 dark:text-white shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md">
                  <GitBranch className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-lg text-gray-900 dark:text-white">
                    {editingRouteId ? `Edit Corridor: ${routeBuilderData.name}` : "Interactive Route Flowchart Builder"}
                  </h3>
                  <p className="text-xs text-gray-400">
                    Connect origin and destination anchors, insert intermediate stops via flowchart nodes, and verify road geometry
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReverseRoute}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-xs font-bold rounded-xl flex items-center gap-1.5"
                  title="Invert origin and destination"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
                  <span>Reverse Direction</span>
                </button>

                <button
                  onClick={() => setIsRouteBuilderOpen(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-xl"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Middle Grid: Left side Flowchart, Right side Realtime Map Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 my-4 flex-1 overflow-hidden min-h-0">
              {/* Left 6 Cols: Flowchart Pipeline */}
              <div className="lg:col-span-6 flex flex-col h-full overflow-hidden space-y-4 min-h-0">
                {/* Route Basic Info Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700/60 text-xs flex-shrink-0">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-gray-400">Route Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Express Inbound"
                      value={routeBuilderData.name}
                      onChange={e => setRouteBuilderData({ ...routeBuilderData, name: e.target.value })}
                      className="w-full p-1.5 mt-0.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-gray-400">Code</label>
                    <input
                      type="text"
                      required
                      placeholder="RT-105"
                      value={routeBuilderData.code}
                      onChange={e => setRouteBuilderData({ ...routeBuilderData, code: e.target.value })}
                      className="w-full p-1.5 mt-0.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-mono font-bold outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-gray-400">Direction</label>
                    <CustomDropdown
                      value={routeBuilderData.direction}
                      onChange={val => {
                        const newDir = val as any;
                        setRouteBuilderData(prev => {
                          const primary = campuses.find(c => c.isPrimary) || campuses[0] || store.getPrimaryCampus();
                          const nonCampusStops = stops;
                          let startId = prev.startStopId;
                          let endId = prev.endStopId;
                          let origCampId = prev.originCampusId;
                          let destCampId = prev.destinationCampusId;

                          if (newDir === "HOME_TO_CAMPUS") {
                            // Destination must be a campus terminal
                            destCampId = destCampId || primary?.id || campuses[0]?.id || "";
                            endId = destCampId;
                            origCampId = undefined;
                            // If start was a campus, reset to first stop
                            if (campuses.some(c => c.id === startId)) {
                              startId = nonCampusStops[0]?.id || "";
                            }
                          } else if (newDir === "CAMPUS_TO_HOME") {
                            // Origin must be a campus terminal
                            origCampId = origCampId || primary?.id || campuses[0]?.id || "";
                            startId = origCampId;
                            destCampId = undefined;
                            // If end was a campus, reset to first stop
                            if (campuses.some(c => c.id === endId)) {
                              endId = nonCampusStops[nonCampusStops.length - 1]?.id || nonCampusStops[0]?.id || "";
                            }
                          } else if (newDir === "CAMPUS_TO_CAMPUS") {
                            origCampId = origCampId || primary?.id || campuses[0]?.id || "";
                            startId = origCampId;
                            const otherCampus = campuses.find(c => c.id !== origCampId) || primary || campuses[0];
                            destCampId = otherCampus?.id || "";
                            endId = destCampId;
                          }

                          return {
                            ...prev,
                            direction: newDir,
                            startStopId: startId,
                            endStopId: endId,
                            originCampusId: origCampId,
                            destinationCampusId: destCampId,
                          };
                        });
                      }}
                      options={[
                        { value: "HOME_TO_CAMPUS", label: "HOME_TO_CAMPUS (Inbound)" },
                        { value: "CAMPUS_TO_HOME", label: "CAMPUS_TO_HOME (Outbound)" },
                        { value: "CAMPUS_TO_CAMPUS", label: "CAMPUS_TO_CAMPUS (Inter-Campus)" },
                        { value: "CIRCULAR", label: "CIRCULAR (Loop)" },
                      ]}
                    />
                  </div>
                </div>

                {/* Flowchart Station Nodes List */}
                <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                  {/* --- 1. START STOP (ANCHOR 1) --- */}
                  {(() => {
                    const isOriginCampus = routeBuilderData.direction === "CAMPUS_TO_HOME" || routeBuilderData.direction === "CAMPUS_TO_CAMPUS";
                    const originCampusObj = campuses.find(c => c.id === routeBuilderData.startStopId || c.id === routeBuilderData.originCampusId);
                    const originStopObj = stops.find(s => s.id === routeBuilderData.startStopId);
                    const displayName = isOriginCampus
                      ? originCampusObj?.name || "Select Origin Campus"
                      : originStopObj?.name || "Select Starting Point";

                    return (
                      <div className="p-3.5 rounded-2xl bg-green-50 dark:bg-green-950/30 border-2 border-green-500/50 shadow-sm space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-green-600 text-white font-bold text-xs flex items-center justify-center">
                              {isOriginCampus ? <Building2 className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}
                            </span>
                            <div>
                              <span className="text-[10px] font-black tracking-wider uppercase text-green-700 dark:text-green-400 block">
                                {isOriginCampus ? "Origin Campus Terminal (Departure)" : "Start Stop (Origin Passenger Pickup)"}
                              </span>
                              <span className="text-xs font-bold text-gray-900 dark:text-white">
                                {displayName}
                              </span>
                            </div>
                          </div>

                          <span className="text-[11px] font-mono font-bold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-950 px-2 py-0.5 rounded-md">
                            0.0 km • 0 min
                          </span>
                        </div>

                        {/* Start Stop Selector (Campuses if Outbound/Inter-Campus, regular stops if Inbound) */}
                        {isOriginCampus ? (
                          <CustomDropdown
                            value={routeBuilderData.startStopId}
                            onChange={val => {
                              setRouteBuilderData(prev => ({
                                ...prev,
                                startStopId: val,
                                originCampusId: val,
                              }));
                            }}
                            placeholder="-- Choose Origin Campus Terminal --"
                            options={[
                              { value: "", label: "-- Choose Origin Campus Terminal --" },
                              ...campuses.map(c => ({
                                value: c.id,
                                label: `${c.name} (${c.code})${c.isPrimary ? " ★ Primary Campus" : ""} ${c.city ? `• ${c.city}` : ""}`,
                              })),
                            ]}
                          />
                        ) : (
                          <CustomDropdown
                            value={routeBuilderData.startStopId}
                            onChange={val => {
                              setRouteBuilderData(prev => ({
                                ...prev,
                                startStopId: val,
                                originCampusId: undefined,
                              }));
                            }}
                            placeholder="-- Choose Origin Passenger Station --"
                            options={[
                              { value: "", label: "-- Choose Origin Passenger Station --" },
                              ...stops.map(st => ({
                                value: st.id,
                                label: `${st.name} (${st.code}) ${st.landmark ? `• ${st.landmark}` : ""}`,
                              })),
                            ]}
                          />
                        )}
                      </div>
                    );
                  })()}

                  {/* --- CONNECTOR GAP 0 with (+) BUTTON --- */}
                  <div className="relative py-1 flex items-center justify-center">
                    <div className="absolute inset-x-12 h-0.5 bg-green-400" />
                    <button
                      type="button"
                      onClick={() => setInsertingAtGapIndex(0)}
                      className="relative z-10 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black rounded-full shadow-md flex items-center gap-1.5 transition-all hover:scale-105"
                      title="Insert intermediate stop here"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Insert Stop</span>
                    </button>
                  </div>

                  {/* Popover to insert stop at Gap 0 */}
                  {insertingAtGapIndex === 0 && (
                    <div className="p-3 bg-white dark:bg-gray-800 border-2 border-blue-500 rounded-2xl shadow-xl space-y-2 animate-in fade-in">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-blue-600 dark:text-blue-400">Select Stop to Insert Between Origin & Next Stop:</span>
                        <button onClick={() => setInsertingAtGapIndex(null)} className="text-gray-400 hover:text-gray-600">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search available stops..."
                          value={stopPickerSearch}
                          onChange={e => setStopPickerSearch(e.target.value)}
                          className="w-full pl-8 p-1.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs font-bold outline-none"
                          autoFocus
                        />
                      </div>

                      <div className="max-h-36 overflow-y-auto space-y-1">
                        {filteredAvailableStops.length > 0 ? (
                          filteredAvailableStops.map(st => (
                            <button
                              key={st.id}
                              type="button"
                              onClick={() => handleInsertIntermediateStop(st.id)}
                              className="w-full text-left p-2 hover:bg-blue-50 dark:hover:bg-blue-950/60 rounded-xl text-xs font-bold flex items-center justify-between transition-colors"
                            >
                              <span>{st.name} <span className="font-mono text-gray-400 font-normal">({st.code})</span></span>
                              <span className="text-[10px] text-blue-600">+ Insert</span>
                            </button>
                          ))
                        ) : (
                          <div className="p-3 text-center text-xs text-gray-400">
                            No matching or unselected stops available.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* --- 2. INTERMEDIATE STOPS (IF ANY) --- */}
                  {routeBuilderData.intermediateStopIds.map((stopId, iIdx) => {
                    const stopObj = stops.find(s => s.id === stopId);
                    const stopIndexInRoute = iIdx + 1;
                    const offset = builderMetrics.stopOffsets[stopIndexInRoute] || stopIndexInRoute * 8;
                    const gapIndexAfter = iIdx + 1;

                    return (
                      <React.Fragment key={stopId}>
                        {/* Intermediate Node Card */}
                        <div className="p-3 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 shadow-sm space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                                {stopIndexInRoute + 1}
                              </span>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold text-gray-900 dark:text-white">
                                    {stopObj?.name || "Intermediate Station"}
                                  </span>
                                  <span className="text-[10px] font-mono text-gray-400">({stopObj?.code})</span>
                                </div>
                                <span className="text-[10px] text-gray-400">{stopObj?.landmark || "Transit Point"}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                                +{offset}m
                              </span>

                              {/* Shift Up/Down & Delete */}
                              <div className="flex items-center gap-0.5 ml-1">
                                <button
                                  type="button"
                                  disabled={iIdx === 0}
                                  onClick={() => handleShiftIntermediateUp(iIdx)}
                                  className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-20 text-gray-600 dark:text-gray-300"
                                  title="Shift earlier in corridor"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={iIdx === routeBuilderData.intermediateStopIds.length - 1}
                                  onClick={() => handleShiftIntermediateDown(iIdx)}
                                  className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-20 text-gray-600 dark:text-gray-300"
                                  title="Shift later in corridor"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveIntermediate(iIdx)}
                                  className="p-1 rounded-lg hover:bg-red-100 dark:hover:bg-red-950 text-red-600"
                                  title="Remove from this route"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* CONNECTOR GAP with (+) BUTTON */}
                        <div className="relative py-1 flex items-center justify-center">
                          <div className="absolute inset-x-12 h-0.5 bg-blue-400" />
                          <button
                            type="button"
                            onClick={() => setInsertingAtGapIndex(gapIndexAfter)}
                            className="relative z-10 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black rounded-full shadow-md flex items-center gap-1.5 transition-all hover:scale-105"
                            title="Insert intermediate stop here"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Insert Stop</span>
                          </button>
                        </div>

                        {/* Popover to insert stop at this gap */}
                        {insertingAtGapIndex === gapIndexAfter && (
                          <div className="p-3 bg-white dark:bg-gray-800 border-2 border-blue-500 rounded-2xl shadow-xl space-y-2 animate-in fade-in">
                            <div className="flex items-center justify-between text-xs font-bold">
                              <span className="text-blue-600 dark:text-blue-400">Select Stop to Insert:</span>
                              <button onClick={() => setInsertingAtGapIndex(null)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="relative">
                              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
                              <input
                                type="text"
                                placeholder="Search available stops..."
                                value={stopPickerSearch}
                                onChange={e => setStopPickerSearch(e.target.value)}
                                className="w-full pl-8 p-1.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs font-bold outline-none"
                                autoFocus
                              />
                            </div>

                            <div className="max-h-36 overflow-y-auto space-y-1">
                              {filteredAvailableStops.length > 0 ? (
                                filteredAvailableStops.map(st => (
                                  <button
                                    key={st.id}
                                    type="button"
                                    onClick={() => handleInsertIntermediateStop(st.id)}
                                    className="w-full text-left p-2 hover:bg-blue-50 dark:hover:bg-blue-950/60 rounded-xl text-xs font-bold flex items-center justify-between transition-colors"
                                  >
                                    <span>{st.name} <span className="font-mono text-gray-400 font-normal">({st.code})</span></span>
                                    <span className="text-[10px] text-blue-600">+ Insert</span>
                                  </button>
                                ))
                              ) : (
                                <div className="p-3 text-center text-xs text-gray-400">
                                  No matching unselected stops available.
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* --- 3. END STOP (ANCHOR 2) --- */}
                  {(() => {
                    const isDestCampus = routeBuilderData.direction === "HOME_TO_CAMPUS" || routeBuilderData.direction === "CAMPUS_TO_CAMPUS";
                    const destCampusObj = campuses.find(c => c.id === routeBuilderData.endStopId || c.id === routeBuilderData.destinationCampusId);
                    const destStopObj = stops.find(s => s.id === routeBuilderData.endStopId);
                    const displayName = isDestCampus
                      ? destCampusObj?.name || "Select Destination Campus"
                      : destStopObj?.name || "Select Final Drop-off Station";

                    return (
                      <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-500/50 shadow-sm space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                              {isDestCampus ? <Building2 className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}
                            </span>
                            <div>
                              <span className="text-[10px] font-black tracking-wider uppercase text-blue-700 dark:text-blue-400 block">
                                {isDestCampus ? "Destination Campus Terminal (Arrival)" : "Final Drop-off Stop (Terminal Station)"}
                              </span>
                              <span className="text-xs font-bold text-gray-900 dark:text-white">
                                {displayName}
                              </span>
                            </div>
                          </div>

                          <span className="text-[11px] font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950 px-2 py-0.5 rounded-md">
                            {builderMetrics.totalDistanceKm} km • ~{builderMetrics.estimatedDurationMins} min
                          </span>
                        </div>

                        {/* End Stop Selector (Campuses if Inbound/Inter-Campus, regular stops if Outbound) */}
                        {isDestCampus ? (
                          <CustomDropdown
                            value={routeBuilderData.endStopId}
                            onChange={val => {
                              setRouteBuilderData(prev => ({
                                ...prev,
                                endStopId: val,
                                destinationCampusId: val,
                              }));
                            }}
                            placeholder="-- Choose Destination Campus Terminal --"
                            options={[
                              { value: "", label: "-- Choose Destination Campus Terminal --" },
                              ...campuses.map(c => ({
                                value: c.id,
                                label: `${c.name} (${c.code})${c.isPrimary ? " ★ Primary Campus" : ""} ${c.city ? `• ${c.city}` : ""}`,
                              })),
                            ]}
                          />
                        ) : (
                          <CustomDropdown
                            value={routeBuilderData.endStopId}
                            onChange={val => {
                              setRouteBuilderData(prev => ({
                                ...prev,
                                endStopId: val,
                                destinationCampusId: undefined,
                              }));
                            }}
                            placeholder="-- Choose Final Drop-off Station --"
                            options={[
                              { value: "", label: "-- Choose Final Drop-off Station --" },
                              ...stops.map(st => ({
                                value: st.id,
                                label: `${st.name} (${st.code}) ${st.landmark ? `• ${st.landmark}` : ""}`,
                              })),
                            ]}
                          />
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Right 6 Cols: Synchronized Live Road-Snapped Corridor Map Preview */}
              <div className="lg:col-span-6 flex flex-col h-full space-y-3 min-h-0">
                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5 rounded-2xl text-xs flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-blue-600" />
                    <span className="font-bold text-gray-700 dark:text-gray-300">Live Road Geometry & Stop Numbers</span>
                  </div>
                  <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">
                    {builderStops.length} stops linked
                  </span>
                </div>

                <div className="flex-1 rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-800 min-h-[360px] h-full relative flex flex-col">
                  <CampusFleetMap
                    stops={builderStops}
                    campuses={campuses}
                    routeCoordinates={builderStops.map(s => [s.latitude, s.longitude])}
                    height="100%"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs p-3 bg-gray-50 dark:bg-gray-800/40 rounded-2xl border border-gray-200 dark:border-gray-800 flex-shrink-0">
                  <div>
                    <span className="text-[10px] uppercase text-gray-400 font-bold block">Total Distance</span>
                    <span className="font-black text-sm text-gray-900 dark:text-white font-mono">
                      {builderMetrics.totalDistanceKm} km
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-gray-400 font-bold block">Est. Trip Duration</span>
                    <span className="font-black text-sm text-blue-600 dark:text-blue-400 font-mono">
                      ~{builderMetrics.estimatedDurationMins} mins
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-gray-400 font-bold block">Intermediate Stops</span>
                    <span className="font-black text-sm text-blue-600 dark:text-blue-400 font-mono">
                      {routeBuilderData.intermediateStopIds.length}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 font-medium hidden sm:inline">
                  Corridor color badge:
                </span>
                <div className="flex items-center gap-1.5">
                  {["#2563EB", "#059669", "#7C3AED", "#EA580C", "#E11D48", "#0891B2"].map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setRouteBuilderData({ ...routeBuilderData, color: c })}
                      className={`w-5 h-5 rounded-full transition-transform ${
                        routeBuilderData.color === c ? "scale-125 ring-2 ring-white shadow" : "opacity-70 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsRouteBuilderOpen(false)}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleSaveRouteFromBuilder}
                  disabled={builderStops.length < 2}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black rounded-xl shadow-lg shadow-blue-600/30 flex items-center gap-2 transition-all hover:scale-102"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingRouteId ? "Save Corridor Changes" : "Deploy Corridor Route"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL 3: ALLOCATE BUS TO CORRIDOR ROUTE                       */}
      {/* ============================================================= */}
      {isAllocateBusModalOpen && activeRoute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <form
            onSubmit={handleAllocateBus}
            className="w-full max-w-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 space-y-4 text-gray-900 dark:text-white shadow-2xl"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center">
                <BusFront className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-base">Allocate Vehicle to {activeRoute.name}</h3>
                <p className="text-xs text-gray-400">Assign a physical fleet bus to service this transit corridor</p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <label className="font-bold uppercase tracking-wider text-gray-400">Choose Fleet Bus</label>
              <CustomDropdown
                value={selectedBusToAllocate}
                onChange={val => setSelectedBusToAllocate(val)}
                placeholder="-- Select Available Vehicle --"
                options={[
                  { value: "", label: "-- Select Available Vehicle --" },
                  ...buses.map(b => ({
                    value: String(b.id),
                    label: `Bus ${b.busNumber} (${b.registrationNo}) • ${b.capacity} Seats (${b.status})`,
                  })),
                ]}
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAllocateBusModalOpen(false)}
                className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-xs font-bold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!selectedBusToAllocate}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl"
              >
                Confirm Bus Assignment
              </button>
            </div>
          </form>
        </div>
      )}
      {/* ============================================================= */}
      {/* MODAL: CREATE / EDIT CAMPUS LOCATION                          */}
      {/* ============================================================= */}
      {isCampusModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 space-y-4 text-gray-900 dark:text-white shadow-2xl max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-base">
                    {editingCampus ? `Edit: ${editingCampus.name}` : "Create New Campus Location"}
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    {editingCampus ? "Update campus coordinates, details & fleet configuration" : "Add a new institutional campus location for fleet operations"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCampusModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Input Mode Switcher */}
            <div className="grid grid-cols-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl">
              <button
                type="button"
                onClick={() => setCampusLocationInputMode("MAP_PIN")}
                className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  campusLocationInputMode === "MAP_PIN"
                    ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Mark on Interactive Map</span>
              </button>
              <button
                type="button"
                onClick={() => setCampusLocationInputMode("MANUAL")}
                className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  campusLocationInputMode === "MANUAL"
                    ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>⌨️ Enter GPS Coordinates</span>
              </button>
            </div>

            <form onSubmit={handleSaveCampusLocation} className="space-y-4 text-xs">
              {/* Map Pin Drop */}
              {campusLocationInputMode === "MAP_PIN" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-gray-500 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      Click on the map to place campus pin
                    </span>
                    <span className="font-mono text-gray-400 font-bold">
                      {campusLocationFormData.latitude.toFixed(5)}, {campusLocationFormData.longitude.toFixed(5)}
                    </span>
                  </div>
                  <CampusFleetMap
                    stops={stops}
                    height="220px"
                    interactiveMode="PIN_DROP"
                    draftPinLocation={[campusLocationFormData.latitude, campusLocationFormData.longitude]}
                    draftGeofenceRadius={campusLocationFormData.geofenceRadiusMeters}
                    onMapClick={(lat, lng) => {
                      setCampusLocationFormData(prev => ({ ...prev, latitude: lat, longitude: lng }));
                    }}
                  />
                </div>
              )}

              {/* Name & Code */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold uppercase tracking-wider text-gray-400">Campus Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Graphic Era Hill University - Bhimtal Campus"
                    value={campusLocationFormData.name}
                    onChange={e => setCampusLocationFormData({ ...campusLocationFormData, name: e.target.value })}
                    className="w-full p-2.5 mt-1 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold uppercase tracking-wider text-gray-400">Campus Code</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. GEHU-BHT"
                    value={campusLocationFormData.code}
                    onChange={e => setCampusLocationFormData({ ...campusLocationFormData, code: e.target.value })}
                    className="w-full p-2.5 mt-1 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none font-mono font-bold"
                  />
                </div>
              </div>

              {/* Address & Landmark */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold uppercase tracking-wider text-gray-400">Address</label>
                  <input
                    type="text"
                    placeholder="e.g. Sattal Road, Bhimtal, Nainital"
                    value={campusLocationFormData.address}
                    onChange={e => setCampusLocationFormData({ ...campusLocationFormData, address: e.target.value })}
                    className="w-full p-2.5 mt-1 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold uppercase tracking-wider text-gray-400">Landmark</label>
                  <input
                    type="text"
                    placeholder="e.g. GEHU Main Gate & Fleet Parking Depot"
                    value={campusLocationFormData.landmark}
                    onChange={e => setCampusLocationFormData({ ...campusLocationFormData, landmark: e.target.value })}
                    className="w-full p-2.5 mt-1 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none"
                  />
                </div>
              </div>

              {/* Coordinates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold uppercase tracking-wider text-gray-400">Latitude (°N)</label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={campusLocationFormData.latitude}
                    onChange={e => setCampusLocationFormData({ ...campusLocationFormData, latitude: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2.5 mt-1 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold uppercase tracking-wider text-gray-400">Longitude (°E)</label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={campusLocationFormData.longitude}
                    onChange={e => setCampusLocationFormData({ ...campusLocationFormData, longitude: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2.5 mt-1 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none font-mono"
                  />
                </div>
              </div>

              {/* Geofence, Fleet Capacity, Parking Bays */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold uppercase tracking-wider text-gray-400">Geofence Radius (m)</label>
                  <input
                    type="number"
                    min="10"
                    max="500"
                    value={campusLocationFormData.geofenceRadiusMeters}
                    onChange={e => setCampusLocationFormData({ ...campusLocationFormData, geofenceRadiusMeters: parseInt(e.target.value) || 100 })}
                    className="w-full p-2.5 mt-1 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold uppercase tracking-wider text-gray-400">Fleet Capacity</label>
                  <input
                    type="number"
                    min="1"
                    value={campusLocationFormData.fleetCapacity}
                    onChange={e => setCampusLocationFormData({ ...campusLocationFormData, fleetCapacity: parseInt(e.target.value) || 50 })}
                    className="w-full p-2.5 mt-1 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold uppercase tracking-wider text-gray-400">Parking Bays</label>
                  <input
                    type="number"
                    min="1"
                    value={campusLocationFormData.parkingBays}
                    onChange={e => setCampusLocationFormData({ ...campusLocationFormData, parkingBays: parseInt(e.target.value) || 20 })}
                    className="w-full p-2.5 mt-1 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none font-mono"
                  />
                </div>
              </div>

              {/* Contact Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold uppercase tracking-wider text-gray-400">Contact Phone</label>
                  <input
                    type="tel"
                    placeholder="e.g. +91 8057999901"
                    value={campusLocationFormData.contactPhone}
                    onChange={e => setCampusLocationFormData({ ...campusLocationFormData, contactPhone: e.target.value })}
                    className="w-full p-2.5 mt-1 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold uppercase tracking-wider text-gray-400">Contact Email</label>
                  <input
                    type="email"
                    placeholder="e.g. transport@gehu.ac.in"
                    value={campusLocationFormData.contactEmail}
                    onChange={e => setCampusLocationFormData({ ...campusLocationFormData, contactEmail: e.target.value })}
                    className="w-full p-2.5 mt-1 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none"
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={campusLocationFormData.isPrimary}
                    onChange={e => setCampusLocationFormData({ ...campusLocationFormData, isPrimary: e.target.checked })}
                    className="w-4 h-4 rounded accent-blue-600"
                  />
                  <span className="font-bold text-gray-600 dark:text-gray-300">⭐ Set as Primary Operational Hub</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={campusLocationFormData.isActive}
                    onChange={e => setCampusLocationFormData({ ...campusLocationFormData, isActive: e.target.checked })}
                    className="w-4 h-4 rounded accent-green-600"
                  />
                  <span className="font-bold text-gray-600 dark:text-gray-300">Active</span>
                </label>
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCampusModalOpen(false)}
                  className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingCampusLocation}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2"
                >
                  {isSavingCampusLocation ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      {editingCampus ? "Update Campus Location" : "Create Campus Location"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
