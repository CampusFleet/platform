// @ts-nocheck
"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  TransitStudioMapController,
  StudioCampusAnchor,
  StudioRestZoneAnchor,
  StudioStop,
} from "@/lib/maps/TransitStudioMapController";
import { Campus, Stop, Student, Route } from "@/lib/types";
import {
  MapPin, Plus, Trash2, ArrowUp, ArrowDown, Users, Check, X,
  Maximize2, Minimize2, Building2, Truck, Navigation, Sliders,
  RotateCcw, Sparkles, Layers, ShieldCheck, HelpCircle, Eye, EyeOff,
  Route as RouteIcon, ChevronDown, ChevronUp, ChevronRight, Edit3, GitMerge
} from "lucide-react";

export interface TransitStudioMapProps {
  campus: Campus;
  campuses: Campus[];
  routes?: Route[];
  selectedRouteId?: string | null;
  onSelectRoute?: (routeId: string | null) => void;
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
  routes = [],
  selectedRouteId = null,
  onSelectRoute,
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

  // Minimization toggles for HUD elements - all points can minimize to a button and toggle
  const [isHubExpanded, setIsHubExpanded] = useState(false);
  const [isToolsExpanded, setIsToolsExpanded] = useState(true);

  // Theme observer: light in light mode, black in dark mode
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const updateTheme = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Active Route ID selected from the dropdown
  const [activeRouteId, setActiveRouteId] = useState<string | null>(selectedRouteId || null);

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
      isBusMergeStop: Boolean(s.isBusMergeStop),
      dwellMinutes: 2,
      order: idx + 1,
    }));
  });

  const [inspectedStop, setInspectedStop] = useState<StudioStop | null>(null);
  const [inspectedDepot, setInspectedDepot] = useState<StudioRestZoneAnchor | null>(null);
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
      tileTheme: isDark ? "CARTO_DARK" : "GOOGLE_STREETS",
      onStopClick: (stop) => {
        setInspectedDepot(null);
        setInspectedStop(stop);
      },
      onRestZoneClick: (rz) => {
        setInspectedStop(null);
        setInspectedDepot(rz);
      },
      onRestZoneMoved: (lat, lng) => {
        handleMoveDepot(lat, lng);
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
          isBusMergeStop: false,
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

  // Sync Dark Mode dynamically with Google Maps
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.setDarkMode(isDark);
    }
  }, [isDark]);

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

  const handleToggleMergeStop = async (stop: StudioStop) => {
    const nextState = !stop.isBusMergeStop;
    const updated = { ...stop, isBusMergeStop: nextState };
    setInspectedStop(updated);
    setStudioStops(prev => prev.map(s => (s.id === stop.id ? updated : s)));

    // If this is an existing database stop, persist to database API immediately
    if (stop.id && !stop.id.startsWith("studio-stop-")) {
      try {
        await fetch(`/api/stops/${encodeURIComponent(stop.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isBusMergeStop: nextState }),
        });
      } catch (e) {
        console.warn("Failed to persist merge stop state to database:", e);
      }
    }
  };

  const handleMoveDepot = async (lat: number, lng: number) => {
    setSelectedRestZone(prev => ({ ...prev, latitude: lat, longitude: lng }));
    setDepotList(prev => prev.map(d => (d.id === selectedRestZone.id ? { ...d, latitude: lat, longitude: lng } : d)));
    if (inspectedDepot && inspectedDepot.id === selectedRestZone.id) {
      setInspectedDepot(prev => prev ? { ...prev, latitude: lat, longitude: lng } : null);
    }
    // Persist new coordinates to database if it's a real depot entity
    if (selectedRestZone.id && !selectedRestZone.id.startsWith("depot-staging-")) {
      try {
        await fetch("/api/rest-zones", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: selectedRestZone.id,
            latitude: lat,
            longitude: lng,
          }),
        });
      } catch (e) {
        console.warn("Failed to persist moved depot coordinates:", e);
      }
    }
  };

  const handleUpdateInspectedDepot = async (updates: Partial<StudioRestZoneAnchor>) => {
    if (!inspectedDepot) return;
    const updated = { ...inspectedDepot, ...updates };
    setInspectedDepot(updated);
    setSelectedRestZone(prev => (prev.id === updated.id ? updated : prev));
    setDepotList(prev => prev.map(d => (d.id === updated.id ? updated : d)));

    // Persist to database API
    try {
      await fetch("/api/rest-zones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
    } catch (e) {
      console.warn("Failed to persist updated depot details:", e);
    }
  };

  // Load an existing corridor route from database into the studio map
  const loadRouteIntoStudio = (routeId: string) => {
    const foundRoute = routes.find(r => r.id === routeId);
    if (!foundRoute) return;

    setName(foundRoute.name);
    setCode(foundRoute.code);

    // If route belongs to another campus, switch the campus hub
    if (foundRoute.campusId || foundRoute.originCampusId) {
      const targetCampusId = foundRoute.campusId || foundRoute.originCampusId;
      const matchedCampus = campuses.find(c => c.id === targetCampusId);
      if (matchedCampus && matchedCampus.id !== campus.id && onSelectCampus) {
        onSelectCampus(matchedCampus);
      }
    }

    if (foundRoute.stops && foundRoute.stops.length > 0) {
      // Map stops to StudioStop format
      const mapped = foundRoute.stops.map((rs: any, idx: number) => {
        const stopObj = rs.stop || stops.find(s => s.id === rs.stopId) || {
          id: rs.stopId,
          name: `Stop ${idx + 1}`,
          code: `ST-${idx + 1}`,
          latitude: rs.latitude || 29.28,
          longitude: rs.longitude || 79.50,
          landmark: "Corridor Station",
          zoneCode: "ZONE_A",
        };
        return {
          id: stopObj.id,
          name: stopObj.name,
          code: stopObj.code,
          latitude: stopObj.latitude,
          longitude: stopObj.longitude,
          landmark: stopObj.landmark || "Corridor Station",
          zoneCode: stopObj.zoneCode || "ZONE_A",
          isBusMergeStop: Boolean(stopObj.isBusMergeStop || rs.isBusMergeStop),
          dwellMinutes: 2,
          order: idx + 1,
        };
      });

      // Filter terminal/depot anchors if already in anchor positions
      let intermediates = mapped;
      if (intermediates.length > 1 && (
        intermediates[0].id === campus.id ||
        intermediates[0].name.toLowerCase().includes("terminal") ||
        intermediates[0].name.toLowerCase().includes(campus.name.toLowerCase().slice(0, 4))
      )) {
        intermediates = intermediates.slice(1);
      }

      const lastCandidate = intermediates[intermediates.length - 1];
      if (lastCandidate) {
        const matchingDepot = depotList.find(d =>
          d.id === lastCandidate.id ||
          (Math.abs(d.latitude - lastCandidate.latitude) < 0.005 && Math.abs(d.longitude - lastCandidate.longitude) < 0.005)
        );
        if (matchingDepot) {
          setSelectedRestZone(matchingDepot);
          if (intermediates.length > 1) {
            intermediates = intermediates.slice(0, -1);
          }
        }
      }

      const reordered = intermediates.map((s, i) => ({ ...s, order: i + 1 }));
      setStudioStops(reordered);
      setInspectedStop(reordered[0] || null);

      if (controllerRef.current) {
        controllerRef.current.setStops(reordered);
        controllerRef.current.fitRouteBounds();
      }
    }
  };

  // Synchronize when external selectedRouteId prop changes
  useEffect(() => {
    if (selectedRouteId && selectedRouteId !== activeRouteId) {
      setActiveRouteId(selectedRouteId);
      loadRouteIntoStudio(selectedRouteId);
    }
  }, [selectedRouteId]);

  // Route selector dropdown handler
  const handleSelectRoute = (val: string) => {
    if (val === "__NEW__") {
      setActiveRouteId(null);
      if (onSelectRoute) onSelectRoute(null);
      setName(`New Corridor ${routes.length + 1}`);
      setCode(`CR-${100 + routes.length + 1}`);
      const draft = stops.slice(0, 2).map((s, idx) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        latitude: s.latitude,
        longitude: s.longitude,
        landmark: s.landmark,
        zoneCode: s.zoneCode || "ZONE_A",
        isBusMergeStop: Boolean(s.isBusMergeStop),
        dwellMinutes: 2,
        order: idx + 1,
      }));
      setStudioStops(draft);
      setStudioMode("ADD_STOP");
      if (controllerRef.current) {
        controllerRef.current.setStops(draft);
        controllerRef.current.fitRouteBounds();
      }
    } else {
      setActiveRouteId(val);
      if (onSelectRoute) onSelectRoute(val);
      loadRouteIntoStudio(val);
    }
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
    <div className={`relative w-full overflow-hidden bg-slate-100 dark:bg-gray-950 text-gray-900 dark:text-white rounded-3xl border border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col ${
      isFullscreen ? "fixed inset-0 z-[9999] rounded-none border-none h-screen w-screen" : "h-[85vh] min-h-[680px]"
    }`}>
      {/* ── Unified Top Command Dock ── */}
      <div className="absolute top-3 inset-x-3 z-30 flex items-center justify-between pointer-events-none gap-2">
        {/* Left: Corridor Hub Pill & Stations Pipeline Toggle */}
        <div className="pointer-events-auto flex items-center gap-2 relative">
          {/* Corridor Hub Pill (Minimizes to compact button, toggles full Hub Popover) */}
          <button
            type="button"
            onClick={() => setIsHubExpanded(prev => !prev)}
            className={`px-3 py-2 backdrop-blur-md rounded-2xl border text-xs font-black flex items-center gap-2 shadow-xl transition-all ${
              isHubExpanded
                ? "bg-blue-600 text-white border-blue-500 shadow-blue-600/30 ring-2 ring-blue-400/40"
                : "bg-white/95 dark:bg-gray-900/95 text-gray-900 dark:text-white border-gray-200/90 dark:border-gray-700/80 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
            title="Toggle Corridor & Fleet Anchors Configuration"
          >
            <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${isHubExpanded ? "bg-white/20 text-white" : "bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"}`}>
              <RouteIcon className="w-3.5 h-3.5" />
            </div>
            <span className="truncate max-w-[130px] sm:max-w-[200px]">
              {name} ({code})
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
              {routeMetrics.distanceKm}km
            </span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isHubExpanded ? "rotate-180 text-white" : "text-gray-400"}`} />
          </button>

          {/* Stations Pipeline Drawer Toggle Button */}
          <button
            type="button"
            onClick={() => setIsSidebarOpen(prev => !prev)}
            className={`px-3 py-2 backdrop-blur-md rounded-2xl border text-xs font-bold flex items-center gap-1.5 shadow-xl transition-all ${
              isSidebarOpen
                ? "bg-indigo-600 text-white border-indigo-500 shadow-indigo-600/30"
                : "bg-white/95 dark:bg-gray-900/95 text-gray-800 dark:text-gray-200 border-gray-200/90 dark:border-gray-700/80 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
            title={isSidebarOpen ? "Collapse Stations Pipeline" : "Show Stations Pipeline"}
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Stations ({studioStops.length})</span>
          </button>

          {/* Corridor Hub Popover (Only drops down when isHubExpanded is true) */}
          {isHubExpanded && (
            <div className="absolute top-full left-0 mt-2 z-50 w-84 sm:w-96 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl rounded-3xl border border-gray-200 dark:border-gray-700/80 shadow-2xl p-4 space-y-3 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-blue-600/10 dark:bg-blue-600/30 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs">
                    <RouteIcon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-black text-gray-900 dark:text-white">Corridor &amp; Anchors Hub</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsHubExpanded(false)}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 1. Select Route Dropdown */}
              <div>
                <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block mb-1">
                  Corridor Route ({routes.length} Available)
                </label>
                <select
                  value={activeRouteId || "__NEW__"}
                  onChange={(e) => handleSelectRoute(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-gray-900 dark:text-white outline-none cursor-pointer focus:border-blue-500"
                >
                  <option value="__NEW__" className="text-blue-600 dark:text-blue-400 font-bold">
                    + [ Build New Corridor ]
                  </option>
                  {routes.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code}) {r.totalDistanceKm ? `• ${r.totalDistanceKm}km` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Corridor Name & Code */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block mb-1">
                    Corridor Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block mb-1">
                    Route Code
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-gray-900 dark:text-white outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* 3. Anchor 1: Campus Terminal */}
              <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                    <Building2 className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-mono font-black uppercase text-emerald-600 dark:text-emerald-400">
                        ANCHOR 1: ORIGIN
                      </span>
                      <span className="text-[9px] font-mono font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 px-1 py-0.2 rounded">
                        Fixed
                      </span>
                    </div>
                    <span className="text-xs font-black text-gray-900 dark:text-white block truncate max-w-[200px]">
                      {campus.name}
                    </span>
                  </div>
                </div>
              </div>

              {/* 4. Anchor 2: Rest Zone Depot */}
              <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                      <Truck className="w-3 h-3" />
                    </div>
                    <span className="text-[9px] font-mono font-black uppercase text-indigo-600 dark:text-indigo-400">
                      ANCHOR 2: REST ZONE DEPOT
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setDepotModalTab("LIST");
                        setIsDepotManagerOpen(true);
                      }}
                      className="text-[9px] font-bold text-indigo-700 dark:text-indigo-300 hover:underline px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-950 rounded border border-indigo-200 dark:border-indigo-800"
                    >
                      Manage
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenCreateDepot}
                      className="p-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px]"
                      title="Add New Staging Depot"
                    >
                      <Plus className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
                <select
                  value={selectedRestZone?.id}
                  onChange={e => {
                    const rz = depotList.find(d => d.id === e.target.value);
                    if (rz) setSelectedRestZone(rz);
                  }}
                  className="w-full bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-800/80 rounded-xl px-2.5 py-1.5 text-xs font-bold text-gray-900 dark:text-white outline-none cursor-pointer focus:border-indigo-500"
                >
                  {depotList.map(rz => (
                    <option key={rz.id} value={rz.id}>
                      {rz.name} ({rz.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setIsHubExpanded(false)}
                  className="px-3 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-xs font-bold hover:opacity-90"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Center: Collapsible GIS & Demand Tools */}
        <div className="pointer-events-auto flex items-center gap-2 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md p-1.5 rounded-2xl border border-gray-200/90 dark:border-gray-700/80 shadow-xl">
          {!isToolsExpanded ? (
            <button
              type="button"
              onClick={() => setIsToolsExpanded(true)}
              className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1.5"
              title="Expand GIS Tools"
            >
              <Sliders className="w-3.5 h-3.5 text-blue-500" />
              <span>GIS Tools</span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>
          ) : (
            <>
              {/* Add Stop Mode Toggle */}
              <button
                type="button"
                onClick={() => setStudioMode(prev => prev === "ADD_STOP" ? "VIEW" : "ADD_STOP")}
                className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all ${
                  studioMode === "ADD_STOP"
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30 ring-2 ring-blue-400/30"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
                title="Click anywhere on the map road to drop a stop"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{studioMode === "ADD_STOP" ? "Click Map Road to Place Stop" : "Place Stops"}</span>
              </button>

              {/* Demand Heatmap Toggle */}
              <button
                type="button"
                onClick={() => setIsDemandVisible(prev => !prev)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                  isDemandVisible
                    ? "bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
                title="Show/hide student home walkability pins"
              >
                {isDemandVisible ? <Eye className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">Demand</span>
              </button>

              {/* Walkability Summary Pill */}
              <div className="hidden xl:flex items-center gap-2 px-2.5 py-1 bg-gray-50 dark:bg-gray-800/80 rounded-xl text-[11px] font-mono border border-gray-200 dark:border-gray-700/60">
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  {demandMetrics.walkable} Walkable (&lt;500m)
                </span>
                <span className="text-gray-300 dark:text-gray-600">•</span>
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  {demandMetrics.moderate}
                </span>
                <span className="text-gray-300 dark:text-gray-600">•</span>
                <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  {demandMetrics.underserved} Far
                </span>
              </div>

              {/* Minimize Tools Toggle */}
              <button
                type="button"
                onClick={() => setIsToolsExpanded(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Minimize Tools"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>

        {/* Right: Actions Suite */}
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={handleReverseRoute}
            className="p-2 bg-white/95 dark:bg-gray-900/95 hover:bg-gray-50 dark:hover:bg-gray-800 backdrop-blur-md rounded-2xl border border-gray-200/90 dark:border-gray-700/80 text-gray-700 dark:text-gray-300 shadow-xl transition-all"
            title="Reverse Route Sequence"
          >
            <RotateCcw className="w-4 h-4 text-blue-500" />
          </button>

          <button
            type="button"
            onClick={() => setIsFullscreen(prev => !prev)}
            className="p-2 bg-white/95 dark:bg-gray-900/95 hover:bg-gray-50 dark:hover:bg-gray-800 backdrop-blur-md rounded-2xl border border-gray-200/90 dark:border-gray-700/80 text-gray-700 dark:text-gray-300 shadow-xl transition-all"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen GIS Studio"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-3.5 sm:px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-black rounded-2xl shadow-xl shadow-blue-600/30 flex items-center gap-1.5 transition-all hover:scale-102"
          >
            <Check className="w-4 h-4" />
            <span>{isSaving ? "Deploying..." : "Deploy Corridor"}</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 bg-white/95 dark:bg-gray-900/95 hover:bg-gray-50 dark:hover:bg-gray-800 backdrop-blur-md rounded-2xl border border-gray-200/90 dark:border-gray-700/80 text-gray-500 hover:text-gray-800 dark:hover:text-white shadow-xl transition-all"
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
      <div className={`absolute top-14 bottom-3 left-3 z-20 w-80 sm:w-96 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md rounded-3xl border border-gray-200/90 dark:border-gray-800 shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ${
        isSidebarOpen ? "translate-x-0 opacity-100" : "-translate-x-[calc(100%+24px)] opacity-0 pointer-events-none"
      }`}>
        {/* Drawer Header */}
        <div className="p-3.5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="font-black text-sm text-gray-900 dark:text-white flex items-center gap-2">
              <Navigation className="w-4 h-4 text-blue-500" />
              <span>Corridor Pipeline</span>
            </h3>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
              {routeMetrics.distanceKm} km • ~{routeMetrics.durationMins} mins • {studioStops.length} stops
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Basic Route Form */}
        <div className="p-3 bg-gray-50/80 dark:bg-gray-950/60 border-b border-gray-200 dark:border-gray-800 grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="text-[9px] uppercase font-bold text-gray-500 dark:text-gray-400 block mb-0.5">Corridor Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-2.5 py-1.5 text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-[9px] uppercase font-bold text-gray-500 dark:text-gray-400 block mb-0.5">Route Code</label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-gray-900 dark:text-white outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Stations Sequence List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
          {/* Anchor 1: Campus Terminal */}
          <div className="p-3 bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                A1
              </div>
              <div>
                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                  ORIGIN CAMPUS TERMINAL
                </span>
                <span className="text-xs font-bold text-gray-900 dark:text-white">{campus.name}</span>
              </div>
            </div>
            <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded">
              0.0 km
            </span>
          </div>

          {/* Intermediate Stops */}
          {studioStops.map((stop, idx) => {
            const isSelected = inspectedStop?.id === stop.id;
            const zoneColor =
              stop.zoneCode === "ZONE_A" ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800" :
              stop.zoneCode === "ZONE_B" ? "bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 border-sky-300 dark:border-sky-800" :
              "bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-800";

            return (
              <div
                key={stop.id}
                onClick={() => {
                  setInspectedDepot(null);
                  setInspectedStop(stop);
                }}
                className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                  isSelected
                    ? "bg-blue-50/90 dark:bg-blue-950/40 border-blue-500 ring-1 ring-blue-500 shadow-md"
                    : "bg-gray-50/80 dark:bg-gray-800/40 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-gray-900 dark:text-white">{stop.name}</span>
                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${zoneColor}`}>
                          {stop.zoneCode || "ZONE_A"}
                        </span>
                        {stop.isBusMergeStop && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center gap-0.5">
                            <GitMerge className="w-2.5 h-2.5" /> Merge Hub
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 block mt-0.5 truncate max-w-[150px]">
                        {stop.landmark || "Transit Boarding Point"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveStopUp(idx)}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-20 rounded text-gray-500 dark:text-gray-300"
                      title="Move Earlier in Route"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === studioStops.length - 1}
                      onClick={() => handleMoveStopDown(idx)}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-20 rounded text-gray-500 dark:text-gray-300"
                      title="Move Later in Route"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteStop(stop.id)}
                      className="p-1 hover:bg-red-100 dark:hover:bg-red-950/60 text-red-500 dark:text-red-400 rounded"
                      title="Delete Stop"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Anchor 2: Rest Zone Depot (Click to Inspect / Rename) */}
          <div
            onClick={() => {
              setInspectedStop(null);
              setInspectedDepot(selectedRestZone);
            }}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              inspectedDepot?.id === selectedRestZone.id
                ? "bg-indigo-100/90 dark:bg-indigo-950/50 border-indigo-500 ring-1 ring-indigo-500 shadow-md"
                : "bg-indigo-50/80 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800/60 hover:border-indigo-400"
            } flex items-center justify-between`}
            title="Click to Rename / Configure Destination Depot"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                A2
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
                    DESTINATION REST DEPOT
                  </span>
                  <span className="text-[9px] font-mono text-indigo-500 dark:text-indigo-400 font-bold">
                    [Edit]
                  </span>
                </div>
                <span className="text-xs font-bold text-gray-900 dark:text-white block truncate max-w-[170px]">
                  {selectedRestZone.name}
                </span>
              </div>
            </div>
            <span className="text-[10px] font-mono text-indigo-700 dark:text-indigo-400 font-bold bg-indigo-100 dark:bg-indigo-950 px-2 py-0.5 rounded">
              {routeMetrics.distanceKm} km
            </span>
          </div>
        </div>

        {/* Drawer Footer Guide */}
        <div className="p-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50/90 dark:bg-gray-950/80 text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-blue-500 shrink-0" />
          <span>Click on the map road or drag pins to optimize coverage near student clusters.</span>
        </div>
      </div>

      {/* ── Floating Stop Inspector Card (When Stop is Clicked) ── */}
      {inspectedStop && (
        <div className="absolute bottom-4 right-4 z-20 w-80 sm:w-88 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md rounded-3xl border border-gray-200/90 dark:border-gray-700/80 shadow-2xl p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                {inspectedStop.order}
              </div>
              <h4 className="text-xs font-black text-gray-900 dark:text-white">Stop Inspector</h4>
            </div>
            <button
              type="button"
              onClick={() => setInspectedStop(null)}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 block mb-0.5">Stop Station Name</label>
              <input
                type="text"
                value={inspectedStop.name}
                onChange={e => handleUpdateInspectedStop({ name: e.target.value })}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-2.5 py-1.5 font-bold text-gray-900 dark:text-white outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 block mb-0.5">Station Landmark</label>
              <input
                type="text"
                value={inspectedStop.landmark || ""}
                onChange={e => handleUpdateInspectedStop({ landmark: e.target.value })}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-2.5 py-1.5 text-gray-700 dark:text-gray-300 outline-none focus:border-blue-500"
              />
            </div>

            {/* Zone Assignment Selection */}
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 block mb-0.5">Assigned Transit Fare Zone</label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { code: "ZONE_A", label: "Zone A", color: "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300" },
                  { code: "ZONE_B", label: "Zone B", color: "border-sky-500 bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300" },
                  { code: "ZONE_C", label: "Zone C", color: "border-purple-500 bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300" },
                ].map(z => (
                  <button
                    key={z.code}
                    type="button"
                    onClick={() => handleUpdateInspectedStop({ zoneCode: z.code })}
                    className={`py-1 rounded-xl text-[11px] font-bold border transition-all ${
                      inspectedStop.zoneCode === z.code ? `${z.color} ring-1 ring-blue-500 dark:ring-white/50` : "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    }`}
                  >
                    {z.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bus Merge Stop Toggle */}
            <div className={`p-2.5 rounded-2xl border transition-all ${
              inspectedStop.isBusMergeStop
                ? "bg-purple-50/90 dark:bg-purple-950/40 border-purple-400 dark:border-purple-600 shadow-sm"
                : "bg-gray-50/80 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold transition-all ${
                    inspectedStop.isBusMergeStop
                      ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                  }`}>
                    <GitMerge className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-gray-900 dark:text-white">Bus Merge Stop</span>
                      {inspectedStop.isBusMergeStop && (
                        <span className="text-[9px] font-mono font-bold bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 px-1.5 py-0.2 rounded border border-purple-200 dark:border-purple-800">
                          ACTIVE HUB
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      Multi-bus passenger transfer &amp; merge junction
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleMergeStop(inspectedStop)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    inspectedStop.isBusMergeStop ? "bg-purple-600" : "bg-gray-300 dark:bg-gray-700"
                  }`}
                  role="switch"
                  aria-checked={Boolean(inspectedStop.isBusMergeStop)}
                  title={inspectedStop.isBusMergeStop ? "Disable Bus Merge Stop" : "Activate as Bus Merge Stop"}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      inspectedStop.isBusMergeStop ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => handleDeleteStop(inspectedStop.id)}
                className="text-[11px] text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 font-bold flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Stop
              </button>

              <button
                type="button"
                onClick={() => setInspectedStop(null)}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Floating Depot Inspector Card (When Depot Anchor 2 is Clicked or Selected) ── */}
      {inspectedDepot && (
        <div className="absolute bottom-4 right-4 z-20 w-80 sm:w-88 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md rounded-3xl border border-indigo-200/90 dark:border-indigo-800/80 shadow-2xl p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                A2
              </div>
              <div>
                <h4 className="text-xs font-black text-gray-900 dark:text-white">Fleet Depot Inspector</h4>
                <span className="text-[9px] font-mono font-bold text-indigo-600 dark:text-indigo-400">CORRIDOR DESTINATION ANCHOR</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setInspectedDepot(null)}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 block mb-0.5">Depot Staging Name</label>
              <input
                type="text"
                value={inspectedDepot.name}
                onChange={e => handleUpdateInspectedDepot({ name: e.target.value })}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-2.5 py-1.5 font-bold text-gray-900 dark:text-white outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 block mb-0.5">Depot Code</label>
                <input
                  type="text"
                  value={inspectedDepot.code}
                  onChange={e => handleUpdateInspectedDepot({ code: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-2.5 py-1.5 font-mono font-bold text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 block mb-0.5">Fleet Capacity</label>
                <input
                  type="number"
                  min="1"
                  value={inspectedDepot.fleetCapacity || 25}
                  onChange={e => handleUpdateInspectedDepot({ fleetCapacity: Number(e.target.value) })}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-2.5 py-1.5 font-bold text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 block mb-0.5">Landmark &amp; Facilities</label>
              <input
                type="text"
                value={inspectedDepot.landmark || ""}
                onChange={e => handleUpdateInspectedDepot({ landmark: e.target.value })}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-2.5 py-1.5 text-gray-700 dark:text-gray-300 outline-none focus:border-indigo-500"
              />
            </div>

            {/* GPS coordinates & Drag tip */}
            <div className="p-2 bg-indigo-50/70 dark:bg-indigo-950/30 rounded-xl border border-indigo-200 dark:border-indigo-800/60 text-[10px] text-indigo-900 dark:text-indigo-300 font-mono flex items-center justify-between">
              <span>GPS: {Number(inspectedDepot.latitude).toFixed(4)}, {Number(inspectedDepot.longitude).toFixed(4)}</span>
              <span className="text-[9px] font-sans font-bold text-indigo-600 dark:text-indigo-400">Drag pin on map</span>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  setDepotModalTab("LIST");
                  setIsDepotManagerOpen(true);
                }}
                className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold"
              >
                Open Depot Manager
              </button>

              <button
                type="button"
                onClick={() => setInspectedDepot(null)}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Fleet Depot & Rest Zone Database Manager Modal ── */}
      {isDepotManagerOpen && (
        <div className="fixed inset-0 z-[99999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700/80 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-950/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-600/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-200 dark:border-indigo-500/40">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-gray-900 dark:text-white">Fleet Staging &amp; Overnight Depots</h3>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">PostgreSQL database entity: rest_zones • Corridor Anchor 2</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDepotManagerOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Subtabs */}
            <div className="flex border-b border-gray-200 dark:border-gray-800 bg-gray-100/60 dark:bg-gray-900/50 p-2 gap-2">
              <button
                type="button"
                onClick={() => setDepotModalTab("LIST")}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  depotModalTab === "LIST"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                Depots Catalog ({depotList.length})
              </button>
              <button
                type="button"
                onClick={handleOpenCreateDepot}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  depotModalTab === "FORM" && !editingDepot
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
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
                            ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500 ring-1 ring-indigo-500 shadow-md"
                            : "bg-gray-50/80 dark:bg-gray-800/40 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-gray-900 dark:text-white">{depot.name}</span>
                              <span className="font-mono text-[9px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 px-1.5 py-0.2 rounded border border-indigo-200 dark:border-indigo-800">
                                {depot.code}
                              </span>
                              {isSelected && (
                                <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/80 px-1.5 py-0.2 rounded border border-emerald-300 dark:border-emerald-800 flex items-center gap-0.5">
                                  <Check className="w-2.5 h-2.5" /> Active Anchor
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1">
                              {depot.landmark || "Overnight fleet parking & workshop depot"}
                            </p>
                            <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500 dark:text-gray-400 font-mono">
                              <span>Capacity: <strong className="text-gray-800 dark:text-gray-300">{depot.fleetCapacity || 25} buses</strong></span>
                              <span>•</span>
                              <span>GPS: <strong className="text-gray-800 dark:text-gray-300">{Number(depot.latitude).toFixed(4)}, {Number(depot.longitude).toFixed(4)}</strong></span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {!isSelected && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedRestZone(depot);
                                  setIsDepotManagerOpen(false);
                                }}
                                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded-lg transition-colors"
                              >
                                Select
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenEditDepot(depot)}
                              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white rounded-lg"
                              title="Edit Depot"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteDepot(depot)}
                              className="p-1 hover:bg-red-100 dark:hover:bg-red-950/60 text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 rounded-lg"
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
                    <label className="text-[10px] uppercase font-bold text-gray-600 dark:text-gray-400 block mb-1">
                      Depot Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Haldwani Central Bus Depot & Overnight Rest Area"
                      value={depotFormData.name}
                      onChange={e => setDepotFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-gray-900 dark:text-white font-bold outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-gray-600 dark:text-gray-400 block mb-1">
                        Depot Code *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. HLD-DEPOT-01"
                        value={depotFormData.code}
                        onChange={e => setDepotFormData(prev => ({ ...prev, code: e.target.value }))}
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-gray-900 dark:text-white font-mono font-bold outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-gray-600 dark:text-gray-400 block mb-1">
                        Fleet Capacity (Vehicles)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={depotFormData.fleetCapacity}
                        onChange={e => setDepotFormData(prev => ({ ...prev, fleetCapacity: Number(e.target.value) }))}
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-gray-900 dark:text-white font-bold outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-gray-600 dark:text-gray-400 block mb-1">
                        Latitude
                      </label>
                      <input
                        type="number"
                        step="any"
                        required
                        value={depotFormData.latitude}
                        onChange={e => setDepotFormData(prev => ({ ...prev, latitude: Number(e.target.value) }))}
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-gray-900 dark:text-white font-mono outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-gray-600 dark:text-gray-400 block mb-1">
                        Longitude
                      </label>
                      <input
                        type="number"
                        step="any"
                        required
                        value={depotFormData.longitude}
                        onChange={e => setDepotFormData(prev => ({ ...prev, longitude: Number(e.target.value) }))}
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-gray-900 dark:text-white font-mono outline-none focus:border-indigo-500"
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
                    className="w-full py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-indigo-600 dark:text-indigo-300 font-bold rounded-xl flex items-center justify-center gap-1.5 text-[11px]"
                  >
                    <MapPin className="w-3 h-3 text-indigo-500" />
                    <span>Sync Coordinates from Current Map View Center</span>
                  </button>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-600 dark:text-gray-400 block mb-1">
                      Landmark &amp; Facilities
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Near Haldwani Main Bus Terminal & Maintenance Yard"
                      value={depotFormData.landmark}
                      onChange={e => setDepotFormData(prev => ({ ...prev, landmark: e.target.value }))}
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-800">
                    <button
                      type="button"
                      onClick={() => setDepotModalTab("LIST")}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl"
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
