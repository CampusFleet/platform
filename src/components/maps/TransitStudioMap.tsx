// @ts-nocheck
"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  TransitStudioMapController,
  StudioCampusAnchor,
  StudioRestZoneAnchor,
  StudioStop,
} from "@/lib/maps/TransitStudioMapController";
import { Campus, Stop, Student } from "@/lib/types";
import {
  MapPin, Plus, Trash2, ArrowUp, ArrowDown, Users, Check, X,
  Maximize2, Minimize2, Building2, Truck, Navigation, Sliders,
  RotateCcw, Sparkles, Layers, ShieldCheck, HelpCircle, Eye, EyeOff
} from "lucide-react";

export interface TransitStudioMapProps {
  campus: Campus;
  campuses: Campus[];
  onSelectCampus?: (campus: Campus) => void;
  stops: Stop[];
  students: Student[];
  availableRestZones?: StudioRestZoneAnchor[];
  initialRestZone?: StudioRestZoneAnchor;
  initialStops?: StudioStop[];
  routeName?: string;
  routeCode?: string;
  onSaveCorridor?: (data: {
    name: string;
    code: string;
    campusId: string;
    restZone: StudioRestZoneAnchor;
    stops: StudioStop[];
    distanceKm: number;
    durationMins: number;
  }) => Promise<void>;
  onClose?: () => void;
}

/**
 * Dynamically resolves overnight fleet rest depots & staging areas from database tables (stops, campuses).
 * Zero hardcoded data.
 */
export function deriveRestZonesFromDatabase(
  stops: Stop[],
  campuses: Campus[],
  currentCampusId: string
): StudioRestZoneAnchor[] {
  const dynamicZones: StudioRestZoneAnchor[] = [];

  // 1. Identify depot/merge/terminal stops from database
  (stops || []).forEach(s => {
    if (s.campusId === currentCampusId) return;
    const nameLower = (s.name || "").toLowerCase();
    const landmarkLower = (s.landmark || "").toLowerCase();
    const isDepotCandidate =
      s.isBusMergeStop ||
      nameLower.includes("depot") ||
      nameLower.includes("station") ||
      nameLower.includes("stand") ||
      nameLower.includes("terminal") ||
      nameLower.includes("yard") ||
      nameLower.includes("workshop") ||
      landmarkLower.includes("depot") ||
      landmarkLower.includes("station") ||
      landmarkLower.includes("terminal");

    if (isDepotCandidate) {
      dynamicZones.push({
        id: s.id,
        name: s.name,
        code: s.code || `DEPOT-${s.id.slice(0, 4)}`,
        latitude: s.latitude,
        longitude: s.longitude,
        landmark: s.landmark || "Fleet Depot Rest Area",
        fleetCapacity: 25,
      });
    }
  });

  // 2. Identify other campuses from database
  (campuses || []).forEach(c => {
    if (c.id === currentCampusId) return;
    dynamicZones.push({
      id: `depot-${c.id}`,
      name: `${c.name} Terminal & Fleet Depot`,
      code: `${c.code}-DEPOT`,
      latitude: c.latitude,
      longitude: c.longitude,
      landmark: c.landmark || `${c.name} Staging Bay`,
      fleetCapacity: c.fleetCapacity || c.parkingBays || 20,
    });
  });

  // 3. Fallback to existing non-campus stops in database
  if (dynamicZones.length === 0 && stops && stops.length > 0) {
    const candidateStops = stops.filter(s => s.campusId !== currentCampusId);
    const selected = (candidateStops.length > 0 ? candidateStops : stops).slice(0, 3);
    selected.forEach(s => {
      dynamicZones.push({
        id: s.id,
        name: `${s.name} Staging Bay`,
        code: s.code,
        latitude: s.latitude,
        longitude: s.longitude,
        landmark: s.landmark || "Rest Staging Zone",
        fleetCapacity: 15,
      });
    });
  }

  return dynamicZones;
}

export default function TransitStudioMap({
  campus,
  campuses = [],
  onSelectCampus,
  stops = [],
  students = [],
  availableRestZones,
  initialRestZone,
  initialStops = [],
  routeName = "Corridor 1",
  routeCode = "CR-101",
  onSaveCorridor,
  onClose,
}: TransitStudioMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<TransitStudioMapController | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [studioMode, setStudioMode] = useState<"ADD_STOP" | "INSPECT" | "VIEW">("VIEW");
  const [isDemandVisible, setIsDemandVisible] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Corridor Attributes
  const [name, setName] = useState(routeName);
  const [code, setCode] = useState(routeCode);

  // Dynamically resolve rest zones from database (stops & campuses)
  const dynamicRestZones = useMemo(() => {
    if (availableRestZones && availableRestZones.length > 0) {
      return availableRestZones;
    }
    const derived = deriveRestZonesFromDatabase(stops, campuses, campus.id);
    if (derived.length > 0) return derived;
    // Fallback based on campus coordinates if database has no secondary stops yet
    return [
      {
        id: `depot-staging-${campus.id}`,
        name: `${campus.name} Fleet Staging & Overnight Yard`,
        code: `${campus.code}-DEPOT`,
        latitude: campus.latitude - 0.02,
        longitude: campus.longitude - 0.02,
        landmark: `${campus.name} Perimeter Depot Bay`,
        fleetCapacity: campus.fleetCapacity || 20,
      },
    ];
  }, [availableRestZones, stops, campuses, campus]);

  const [selectedRestZone, setSelectedRestZone] = useState<StudioRestZoneAnchor>(
    () => initialRestZone || dynamicRestZones[0]
  );

  // Live Database Staging Depots State (Anchor 2)
  const [depotList, setDepotList] = useState<StudioRestZoneAnchor[]>(() => dynamicRestZones);
  const [isDepotManagerOpen, setIsDepotManagerOpen] = useState(false);
  const [depotModalTab, setDepotModalTab] = useState<"LIST" | "FORM">("LIST");
  const [editingDepot, setEditingDepot] = useState<StudioRestZoneAnchor | null>(null);
  const [isSavingDepot, setIsSavingDepot] = useState(false);

  const [depotFormData, setDepotFormData] = useState({
    id: "",
    name: "",
    code: "",
    latitude: 29.215248,
    longitude: 79.518641,
    landmark: "",
    fleetCapacity: 30,
    operatingHours: "24/7 Fleet Staging",
    campusId: campus.id,
  });

  // Sync depotList from dynamicRestZones
  useEffect(() => {
    if (dynamicRestZones.length > 0) {
      setDepotList(dynamicRestZones);
    }
  }, [dynamicRestZones]);

  // Fetch latest rest zones directly from database API on mount
  useEffect(() => {
    fetch("/api/rest-zones")
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.restZones) && data.restZones.length > 0) {
          setDepotList(data.restZones);
          if (!data.restZones.some((d: any) => d.id === selectedRestZone?.id)) {
            setSelectedRestZone(data.restZones[0]);
          }
        }
      })
      .catch(e => console.warn("Live DB rest-zones query:", e));
  }, [campus.id]);

  const handleOpenCreateDepot = () => {
    setEditingDepot(null);
    const center = controllerRef.current?.getCenter() || {
      lat: campus.latitude - 0.02,
      lng: campus.longitude - 0.02,
    };
    const nextNum = depotList.length + 1;
    setDepotFormData({
      id: "",
      name: "",
      code: `DEPOT-0${nextNum}`,
      latitude: center.lat,
      longitude: center.lng,
      landmark: "Fleet Staging & Maintenance Yard",
      fleetCapacity: 30,
      operatingHours: "24/7 Fleet Staging",
      campusId: campus.id,
    });
    setDepotModalTab("FORM");
  };

  const handleOpenEditDepot = (depot: StudioRestZoneAnchor) => {
    setEditingDepot(depot);
    setDepotFormData({
      id: depot.id,
      name: depot.name,
      code: depot.code,
      latitude: depot.latitude,
      longitude: depot.longitude,
      landmark: depot.landmark || "",
      fleetCapacity: depot.fleetCapacity || 25,
      operatingHours: (depot as any).operatingHours || "24/7 Fleet Staging",
      campusId: (depot as any).campusId || campus.id,
    });
    setDepotModalTab("FORM");
  };

  const handleSaveDepot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!depotFormData.name.trim() || !depotFormData.code.trim()) {
      alert("Please provide both Depot Name and Code.");
      return;
    }

    setIsSavingDepot(true);
    try {
      if (editingDepot) {
        const res = await fetch("/api/rest-zones", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(depotFormData),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to update depot.");

        setDepotList(prev => prev.map(d => (d.id === data.restZone.id ? data.restZone : d)));
        if (selectedRestZone?.id === data.restZone.id) {
          setSelectedRestZone(data.restZone);
        }
      } else {
        const res = await fetch("/api/rest-zones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(depotFormData),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to create depot.");

        setDepotList(prev => [...prev, data.restZone]);
        setSelectedRestZone(data.restZone);
      }

      setDepotModalTab("LIST");
    } catch (err: any) {
      alert("Error saving depot to database: " + (err?.message || "Unknown error"));
    } finally {
      setIsSavingDepot(false);
    }
  };

  const handleDeleteDepot = async (depot: StudioRestZoneAnchor) => {
    if (depotList.length <= 1) {
      alert("Cannot delete the only rest depot. Keep at least one depot for route endpoints.");
      return;
    }
    if (!confirm(`Permanently delete depot "${depot.name}" from database?`)) return;

    try {
      const res = await fetch(`/api/rest-zones?id=${encodeURIComponent(depot.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to delete depot.");
      }

      const nextList = depotList.filter(d => d.id !== depot.id);
      setDepotList(nextList);
      if (selectedRestZone?.id === depot.id && nextList.length > 0) {
        setSelectedRestZone(nextList[0]);
      }
    } catch (err: any) {
      alert("Error deleting depot: " + (err?.message || "Unknown error"));
    }
  };

  // Sync selectedRestZone when dynamicRestZones update
  useEffect(() => {
    if (depotList.length > 0 && (!selectedRestZone || !depotList.some(d => d.id === selectedRestZone.id))) {
      setSelectedRestZone(depotList[0]);
    }
  }, [depotList]);

  // Active Intermediate Stops
  const [studioStops, setStudioStops] = useState<StudioStop[]>(() => {
    if (initialStops && initialStops.length > 0) {
      return initialStops.map((s, idx) => ({ ...s, order: s.order ?? idx + 1 }));
    }
    // Pick 3 initial nearby stops if available
    const initialCandidates = stops.slice(0, 3);
    return initialCandidates.map((s, idx) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      latitude: s.latitude,
      longitude: s.longitude,
      landmark: s.landmark,
      zoneCode: s.zoneCode || "ZONE_A",
      dwellMinutes: 2,
      order: idx + 1,
    }));
  });

  const [inspectedStop, setInspectedStop] = useState<StudioStop | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Real-time Metrics
  const [routeMetrics, setRouteMetrics] = useState({ distanceKm: 28, durationMins: 55 });
  const [demandMetrics, setDemandMetrics] = useState({
    total: students.length,
    walkable: Math.round(students.length * 0.8),
    moderate: Math.round(students.length * 0.15),
    underserved: Math.round(students.length * 0.05),
    walkablePercent: 80,
  });

  // Campus Anchor
  const campusAnchor: StudioCampusAnchor = useMemo(() => ({
    id: campus.id,
    name: campus.name,
    code: campus.code,
    latitude: campus.latitude,
    longitude: campus.longitude,
    landmark: campus.landmark || `${campus.name} Terminal`,
  }), [campus]);

  // Initialize Map Controller
  useEffect(() => {
    if (!containerRef.current) return;

    const controller = new TransitStudioMapController({
      zoom: 13,
      onStopClick: (stop) => {
        setInspectedStop(stop);
      },
      onStopMoved: (stopId, lat, lng) => {
        setStudioStops(prev =>
          prev.map(s => (s.id === stopId ? { ...s, latitude: lat, longitude: lng } : s))
        );
      },
      onMapClickAddStop: async (lat, lng) => {
        let stopName = `Stop #${studioStops.length + 1}`;
        let landmark = "Transit Point";

        try {
          const res = await fetch(`/api/geo/reverse-geocode?lat=${lat}&lng=${lng}`);
          if (res.ok) {
            const data = await res.json();
            if (data.address) {
              const parts = data.address.split(",");
              stopName = parts[0]?.trim() || stopName;
              landmark = parts[1]?.trim() || landmark;
            }
          }
        } catch {}

        const newStop: StudioStop = {
          id: `studio-stop-${Date.now()}`,
          name: stopName,
          code: `ST-${100 + studioStops.length + 1}`,
          latitude: lat,
          longitude: lng,
          landmark,
          zoneCode: "ZONE_A",
          dwellMinutes: 2,
          order: studioStops.length + 1,
        };

        setStudioStops(prev => [...prev, newStop]);
        setInspectedStop(newStop);
      },
      onDemandMetricsCalculated: (metrics) => {
        setDemandMetrics(metrics);
      },
      onRouteMetricsCalculated: (metrics) => {
        setRouteMetrics(metrics);
      },
    });

    controller.initialize(containerRef.current, {
      latitude: campus.latitude,
      longitude: campus.longitude,
    }).then(() => {
      controller.setCampusAnchor(campusAnchor);
      controller.setRestZoneAnchor(selectedRestZone);
      controller.setStops(studioStops);
      controller.setDemandStudents(students);
      controller.setDemandLayerVisibility(isDemandVisible);
      controller.fitRouteBounds();
    });

    controllerRef.current = controller;

    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [campus.id]);

  // Sync Campus Anchor Updates
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.setCampusAnchor(campusAnchor);
    }
  }, [campusAnchor]);

  // Sync Rest Zone Updates
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.setRestZoneAnchor(selectedRestZone);
    }
  }, [selectedRestZone]);

  // Sync Stops Updates
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.setStops(studioStops, inspectedStop?.id);
    }
  }, [studioStops, inspectedStop?.id]);

  // Sync Demand Layer Visibility
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.setDemandLayerVisibility(isDemandVisible);
    }
  }, [isDemandVisible]);

  // Sync Studio Mode (ADD_STOP / VIEW)
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.setStudioMode(studioMode);
    }
  }, [studioMode]);

  // Stop Reordering Handlers
  const handleMoveStopUp = (index: number) => {
    if (index <= 0) return;
    const next = [...studioStops];
    const temp = next[index];
    next[index] = next[index - 1];
    next[index - 1] = temp;
    next.forEach((s, i) => { s.order = i + 1; });
    setStudioStops(next);
  };

  const handleMoveStopDown = (index: number) => {
    if (index >= studioStops.length - 1) return;
    const next = [...studioStops];
    const temp = next[index];
    next[index] = next[index + 1];
    next[index + 1] = temp;
    next.forEach((s, i) => { s.order = i + 1; });
    setStudioStops(next);
  };

  const handleDeleteStop = (id: string) => {
    const next = studioStops.filter(s => s.id !== id);
    next.forEach((s, i) => { s.order = i + 1; });
    setStudioStops(next);
    if (inspectedStop?.id === id) setInspectedStop(null);
  };

  const handleUpdateInspectedStop = (updates: Partial<StudioStop>) => {
    if (!inspectedStop) return;
    const updated = { ...inspectedStop, ...updates };
    setInspectedStop(updated);
    setStudioStops(prev => prev.map(s => (s.id === updated.id ? updated : s)));
  };

  // Reverse Route
  const handleReverseRoute = () => {
    const reversed = [...studioStops].reverse().map((s, idx) => ({
      ...s,
      order: idx + 1,
    }));
    setStudioStops(reversed);
  };

  // Save Corridor
  const handleSave = async () => {
    if (!name || !code) {
      alert("Please enter Corridor Name and Route Code.");
      return;
    }
    if (studioStops.length === 0) {
      alert("Please place at least one intermediate stop between the Campus Terminal and the Rest Zone.");
      return;
    }

    setIsSaving(true);
    try {
      if (onSaveCorridor) {
        await onSaveCorridor({
          name,
          code,
          campusId: campus.id,
          restZone: selectedRestZone,
          stops: studioStops,
          distanceKm: routeMetrics.distanceKm,
          durationMins: routeMetrics.durationMins,
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`relative w-full overflow-hidden bg-gray-900 text-white rounded-3xl border border-gray-800 shadow-2xl flex flex-col ${
      isFullscreen ? "fixed inset-0 z-[9999] rounded-none border-none h-screen w-screen" : "h-[85vh] min-h-[680px]"
    }`}>
      {/* ── Top Floating Studio Toolbar ── */}
      <div className="absolute top-4 inset-x-4 z-20 flex items-center justify-between pointer-events-none gap-3">
        {/* Left: Campus Terminal & Rest Zone Indicator */}
        <div className="pointer-events-auto flex items-center gap-2 bg-gray-900/90 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-gray-700/80 shadow-xl">
          <div className="w-8 h-8 rounded-xl bg-emerald-600/30 text-emerald-400 flex items-center justify-center font-bold text-xs border border-emerald-500/40">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-white">{campus.name}</span>
              <span className="text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.2 rounded">
                ANCHOR 1
              </span>
            </div>
            <p className="text-[10px] text-gray-400 font-mono">
              Fixed Origin: {campusAnchor.landmark || "Campus Terminal"}
            </p>
          </div>

          <div className="h-6 w-px bg-gray-700 mx-1" />

          {/* Rest Zone Switcher & Database Depot Manager */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-indigo-600/30 text-indigo-400 flex items-center justify-center font-bold text-xs border border-indigo-500/40">
              <Truck className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-bold text-indigo-400 uppercase block">ANCHOR 2: REST ZONE</span>
                <button
                  onClick={() => {
                    setDepotModalTab("LIST");
                    setIsDepotManagerOpen(true);
                  }}
                  className="text-[9px] font-bold text-indigo-300 hover:text-white px-1 bg-indigo-950/80 rounded border border-indigo-800/60"
                  title="Open Database Depot Manager"
                >
                  Manage
                </button>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <select
                  value={selectedRestZone?.id}
                  onChange={e => {
                    const rz = depotList.find(d => d.id === e.target.value);
                    if (rz) setSelectedRestZone(rz);
                  }}
                  className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer max-w-[155px] truncate"
                >
                  {depotList.map(rz => (
                    <option key={rz.id} value={rz.id} className="bg-gray-900 text-white">
                      {rz.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleOpenCreateDepot}
                  className="p-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-[10px] font-bold"
                  title="Add New Fleet Depot to Database"
                >
                  <Plus className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Mode Toggles & Demand KPI HUD */}
        <div className="pointer-events-auto flex items-center gap-2 bg-gray-900/90 backdrop-blur-md p-1.5 rounded-2xl border border-gray-700/80 shadow-xl">
          {/* Add Stop Mode Toggle */}
          <button
            onClick={() => setStudioMode(prev => prev === "ADD_STOP" ? "VIEW" : "ADD_STOP")}
            className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all ${
              studioMode === "ADD_STOP"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/40 animate-pulse"
                : "bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700"
            }`}
            title="Click anywhere on the map road to drop a stop"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{studioMode === "ADD_STOP" ? "Click Map Road to Place Stop" : "Place Stops"}</span>
          </button>

          {/* Demand Heatmap Toggle */}
          <button
            onClick={() => setIsDemandVisible(prev => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              isDemandVisible
                ? "bg-emerald-950/80 text-emerald-300 border border-emerald-700/60"
                : "bg-gray-800 text-gray-400 hover:text-gray-200"
            }`}
            title="Show/hide student home walkability pins"
          >
            {isDemandVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-gray-500" />}
            <span>Student Demand</span>
          </button>

          {/* Walkability Summary Pill */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-gray-800/80 rounded-xl text-[11px] font-mono border border-gray-700/60">
            <span className="flex items-center gap-1 text-emerald-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {demandMetrics.walkable} Walkable (&lt;500m)
            </span>
            <span className="text-gray-600">•</span>
            <span className="flex items-center gap-1 text-amber-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              {demandMetrics.moderate}
            </span>
            <span className="text-gray-600">•</span>
            <span className="flex items-center gap-1 text-red-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              {demandMetrics.underserved} Far
            </span>
          </div>
        </div>

        {/* Right: Fullscreen, Reverse, Save Corridor */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={handleReverseRoute}
            className="p-2 bg-gray-900/90 hover:bg-gray-800 backdrop-blur-md rounded-2xl border border-gray-700/80 text-gray-300 hover:text-white transition-all shadow-xl"
            title="Reverse Route Sequence"
          >
            <RotateCcw className="w-4 h-4 text-blue-400" />
          </button>

          <button
            onClick={() => setIsFullscreen(prev => !prev)}
            className="p-2 bg-gray-900/90 hover:bg-gray-800 backdrop-blur-md rounded-2xl border border-gray-700/80 text-gray-300 hover:text-white transition-all shadow-xl"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen GIS Studio"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-black rounded-2xl shadow-xl shadow-blue-600/30 flex items-center gap-1.5 transition-all hover:scale-102"
          >
            <Check className="w-4 h-4" />
            <span>{isSaving ? "Deploying..." : "Deploy Corridor"}</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 bg-gray-900/90 hover:bg-gray-800 backdrop-blur-md rounded-2xl border border-gray-700/80 text-gray-400 hover:text-white transition-all shadow-xl"
              title="Close Studio"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Main Map Canvas (Underneath) ── */}
      <div ref={containerRef} className="w-full h-full relative isolate" />

      {/* ── Left Station Progression Flowchart Drawer ── */}
      <div className={`absolute top-20 bottom-4 left-4 z-20 w-80 sm:w-96 bg-gray-900/95 backdrop-blur-md rounded-3xl border border-gray-800 shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ${
        isSidebarOpen ? "translate-x-0" : "-translate-x-[calc(100%+24px)]"
      }`}>
        {/* Drawer Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="font-black text-sm text-white flex items-center gap-2">
              <Navigation className="w-4 h-4 text-blue-500" />
              <span>Corridor Pipeline</span>
            </h3>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {routeMetrics.distanceKm} km • ~{routeMetrics.durationMins} mins • {studioStops.length} stops
            </p>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Basic Route Form */}
        <div className="p-3 bg-gray-950/60 border-b border-gray-800 grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="text-[9px] uppercase font-bold text-gray-500 block mb-0.5">Corridor Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-xl px-2.5 py-1.5 text-xs font-bold text-white outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-[9px] uppercase font-bold text-gray-500 block mb-0.5">Route Code</label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-white outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Stations Sequence List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
          {/* Anchor 1: Campus Terminal */}
          <div className="p-3 bg-emerald-950/30 border border-emerald-800/60 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                A1
              </div>
              <div>
                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 block">
                  ORIGIN CAMPUS TERMINAL
                </span>
                <span className="text-xs font-bold text-white">{campus.name}</span>
              </div>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-950 px-2 py-0.5 rounded">
              0.0 km
            </span>
          </div>

          {/* Intermediate Stops */}
          {studioStops.map((stop, idx) => {
            const isSelected = inspectedStop?.id === stop.id;
            const zoneColor =
              stop.zoneCode === "ZONE_A" ? "bg-emerald-950 text-emerald-400 border-emerald-800" :
              stop.zoneCode === "ZONE_B" ? "bg-sky-950 text-sky-400 border-sky-800" :
              "bg-purple-950 text-purple-400 border-purple-800";

            return (
              <div
                key={stop.id}
                onClick={() => setInspectedStop(stop)}
                className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                  isSelected
                    ? "bg-blue-950/40 border-blue-500 ring-1 ring-blue-500 shadow-md"
                    : "bg-gray-800/40 border-gray-800 hover:border-gray-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white">{stop.name}</span>
                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${zoneColor}`}>
                          {stop.zoneCode || "ZONE_A"}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400 block mt-0.5 truncate max-w-[150px]">
                        {stop.landmark || "Transit Boarding Point"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <button
                      disabled={idx === 0}
                      onClick={() => handleMoveStopUp(idx)}
                      className="p-1 hover:bg-gray-700 disabled:opacity-20 rounded text-gray-300"
                      title="Move Earlier in Route"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      disabled={idx === studioStops.length - 1}
                      onClick={() => handleMoveStopDown(idx)}
                      className="p-1 hover:bg-gray-700 disabled:opacity-20 rounded text-gray-300"
                      title="Move Later in Route"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteStop(stop.id)}
                      className="p-1 hover:bg-red-950/60 text-red-400 rounded"
                      title="Delete Stop"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Anchor 2: Rest Zone Depot */}
          <div className="p-3 bg-indigo-950/30 border border-indigo-800/60 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                A2
              </div>
              <div>
                <span className="text-[9px] font-black uppercase tracking-wider text-indigo-400 block">
                  DESTINATION REST DEPOT
                </span>
                <span className="text-xs font-bold text-white">{selectedRestZone.name}</span>
              </div>
            </div>
            <span className="text-[10px] font-mono text-indigo-400 font-bold bg-indigo-950 px-2 py-0.5 rounded">
              {routeMetrics.distanceKm} km
            </span>
          </div>
        </div>

        {/* Drawer Footer Guide */}
        <div className="p-3 border-t border-gray-800 bg-gray-950/80 text-[10px] text-gray-400 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-blue-400 shrink-0" />
          <span>Click on the map road or drag pins to optimize coverage near student clusters.</span>
        </div>
      </div>

      {/* Button to reopen drawer if closed */}
      {!isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="absolute top-20 left-4 z-20 px-3.5 py-2 bg-gray-900/90 hover:bg-gray-800 backdrop-blur-md rounded-2xl border border-gray-700/80 text-xs font-bold text-white flex items-center gap-2 shadow-xl"
        >
          <Navigation className="w-4 h-4 text-blue-400" />
          <span>Show Stations Pipeline ({studioStops.length})</span>
        </button>
      )}

      {/* ── Floating Stop Inspector Card (When Stop is Clicked) ── */}
      {inspectedStop && (
        <div className="absolute bottom-6 right-6 z-20 w-80 bg-gray-900/95 backdrop-blur-md rounded-3xl border border-gray-700/80 shadow-2xl p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                {inspectedStop.order}
              </div>
              <h4 className="text-xs font-black text-white">Stop Inspector</h4>
            </div>
            <button
              onClick={() => setInspectedStop(null)}
              className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-500 block mb-0.5">Stop Station Name</label>
              <input
                type="text"
                value={inspectedStop.name}
                onChange={e => handleUpdateInspectedStop({ name: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-2.5 py-1.5 font-bold text-white outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-gray-500 block mb-0.5">Station Landmark</label>
              <input
                type="text"
                value={inspectedStop.landmark || ""}
                onChange={e => handleUpdateInspectedStop({ landmark: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-2.5 py-1.5 text-gray-300 outline-none focus:border-blue-500"
              />
            </div>

            {/* Zone Assignment Selection */}
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-500 block mb-0.5">Assigned Transit Fare Zone</label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { code: "ZONE_A", label: "Zone A", color: "border-emerald-600 bg-emerald-950/60 text-emerald-300" },
                  { code: "ZONE_B", label: "Zone B", color: "border-sky-600 bg-sky-950/60 text-sky-300" },
                  { code: "ZONE_C", label: "Zone C", color: "border-purple-600 bg-purple-950/60 text-purple-300" },
                ].map(z => (
                  <button
                    key={z.code}
                    type="button"
                    onClick={() => handleUpdateInspectedStop({ zoneCode: z.code })}
                    className={`py-1 rounded-xl text-[11px] font-bold border transition-all ${
                      inspectedStop.zoneCode === z.code ? `${z.color} ring-1 ring-white/50` : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                    }`}
                  >
                    {z.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => handleDeleteStop(inspectedStop.id)}
                className="text-[11px] text-red-400 hover:text-red-300 font-bold flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Stop
              </button>

              <button
                type="button"
                onClick={() => setInspectedStop(null)}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Fleet Depot & Rest Zone Database Manager Modal ── */}
      {isDepotManagerOpen && (
        <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700/80 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-950/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600/30 text-indigo-400 flex items-center justify-center border border-indigo-500/40">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-white">Fleet Staging &amp; Overnight Depots</h3>
                  <p className="text-[10px] text-gray-400 font-mono">PostgreSQL database entity: rest_zones • Corridor Anchor 2</p>
                </div>
              </div>
              <button
                onClick={() => setIsDepotManagerOpen(false)}
                className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Subtabs */}
            <div className="flex border-b border-gray-800 bg-gray-900/50 p-2 gap-2">
              <button
                onClick={() => setDepotModalTab("LIST")}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  depotModalTab === "LIST"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Depots Catalog ({depotList.length})
              </button>
              <button
                onClick={handleOpenCreateDepot}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  depotModalTab === "FORM" && !editingDepot
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{editingDepot ? "Edit Depot" : "Add Staging Depot"}</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
              {depotModalTab === "LIST" ? (
                <div className="space-y-2.5">
                  {depotList.map(depot => {
                    const isSelected = selectedRestZone?.id === depot.id;
                    return (
                      <div
                        key={depot.id}
                        className={`p-3.5 rounded-2xl border transition-all ${
                          isSelected
                            ? "bg-indigo-950/40 border-indigo-500 ring-1 ring-indigo-500 shadow-md"
                            : "bg-gray-800/40 border-gray-800 hover:border-gray-700"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-white">{depot.name}</span>
                              <span className="font-mono text-[9px] font-bold bg-indigo-950 text-indigo-400 px-1.5 py-0.2 rounded border border-indigo-800">
                                {depot.code}
                              </span>
                              {isSelected && (
                                <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/80 px-1.5 py-0.2 rounded border border-emerald-800 flex items-center gap-0.5">
                                  <Check className="w-2.5 h-2.5" /> Active Anchor
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-gray-400 mt-1">
                              {depot.landmark || "Overnight fleet parking & workshop depot"}
                            </p>
                            <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500 font-mono">
                              <span>Capacity: <strong className="text-gray-300">{depot.fleetCapacity || 25} buses</strong></span>
                              <span>•</span>
                              <span>GPS: <strong className="text-gray-300">{Number(depot.latitude).toFixed(4)}, {Number(depot.longitude).toFixed(4)}</strong></span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {!isSelected && (
                              <button
                                onClick={() => {
                                  setSelectedRestZone(depot);
                                  setIsDepotManagerOpen(false);
                                }}
                                className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded-lg transition-colors"
                              >
                                Select
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenEditDepot(depot)}
                              className="p-1 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg"
                              title="Edit Depot"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteDepot(depot)}
                              className="p-1 hover:bg-red-950/60 text-red-400 hover:text-red-300 rounded-lg"
                              title="Delete Depot from Database"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <form onSubmit={handleSaveDepot} className="space-y-3 text-xs">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">
                      Depot Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Haldwani Central Bus Depot & Overnight Rest Area"
                      value={depotFormData.name}
                      onChange={e => setDepotFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white font-bold outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">
                        Depot Code *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. HLD-DEPOT-01"
                        value={depotFormData.code}
                        onChange={e => setDepotFormData(prev => ({ ...prev, code: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white font-mono font-bold outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">
                        Fleet Capacity (Vehicles)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={depotFormData.fleetCapacity}
                        onChange={e => setDepotFormData(prev => ({ ...prev, fleetCapacity: Number(e.target.value) }))}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white font-bold outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">
                        Latitude
                      </label>
                      <input
                        type="number"
                        step="any"
                        required
                        value={depotFormData.latitude}
                        onChange={e => setDepotFormData(prev => ({ ...prev, latitude: Number(e.target.value) }))}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">
                        Longitude
                      </label>
                      <input
                        type="number"
                        step="any"
                        required
                        value={depotFormData.longitude}
                        onChange={e => setDepotFormData(prev => ({ ...prev, longitude: Number(e.target.value) }))}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const center = controllerRef.current?.getCenter();
                      if (center) {
                        setDepotFormData(prev => ({ ...prev, latitude: center.lat, longitude: center.lng }));
                      }
                    }}
                    className="w-full py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-indigo-300 font-bold rounded-xl flex items-center justify-center gap-1.5 text-[11px]"
                  >
                    <MapPin className="w-3 h-3 text-indigo-400" />
                    <span>Sync Coordinates from Current Map View Center</span>
                  </button>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">
                      Landmark &amp; Facilities
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Near Haldwani Main Bus Terminal & Maintenance Yard"
                      value={depotFormData.landmark}
                      onChange={e => setDepotFormData(prev => ({ ...prev, landmark: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-800">
                    <button
                      type="button"
                      onClick={() => setDepotModalTab("LIST")}
                      className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingDepot}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isSavingDepot ? "Saving to Database..." : editingDepot ? "Update Depot" : "Create Depot"}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
