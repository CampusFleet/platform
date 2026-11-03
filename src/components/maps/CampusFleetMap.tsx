"use client";

import React, { useEffect, useRef, useState } from "react";
import { LiveBusLocation, Stop, FleetBusMarkerData, Campus } from "@/lib/types";
import { store } from "@/lib/store";
import { MapPin, Zap, Crosshair, Building2, Navigation } from "lucide-react";
import GoogleTransitMap from "./GoogleTransitMap";

/**
 * Resolves the institutional university campus terminal location dynamically.
 * Always resolves from master Campus records (from campuses table) rather than stops.
 * Zero hardcoded constants: respects database modifications in PostgreSQL campuses table.
 */
export function getCampusStopFromDatabase(
  stops?: Stop[],
  campuses?: Campus[],
  primaryCampus?: Campus | null
): Stop {
  const activeCampus =
    primaryCampus ||
    campuses?.find((c) => c.isPrimary) ||
    campuses?.[0] ||
    (typeof window !== "undefined" ? store.getPrimaryCampus() : null);

  if (activeCampus) {
    return {
      id: activeCampus.id,
      name: activeCampus.name,
      code: activeCampus.code,
      latitude: activeCampus.latitude,
      longitude: activeCampus.longitude,
      landmark: activeCampus.landmark || activeCampus.address || `${activeCampus.name} Terminal`,
      geofenceRadiusMeters: activeCampus.geofenceRadiusMeters || 150,
      campusId: activeCampus.id,
      zoneCode: "ZONE_CAMPUS",
    };
  }

  // Next check if a stop in stops matches campus terminal name
  if (stops && stops.length > 0) {
    const match =
      stops.find((s) => s.name.toLowerCase().includes("campus terminal")) ||
      stops.find((s) => s.name.toLowerCase().includes("university terminal"));
    if (match) return match;
  }

  // Institutional default: Graphic Era Hill University - Bhimtal Campus
  return {
    id: "campus-gehu-bhimtal",
    name: "Graphic Era Hill University - Bhimtal Campus",
    code: "GEHU-BHT",
    latitude: 29.375015,
    longitude: 79.529479,
    landmark: "GEHU Main Gate & Fleet Parking Depot, Sattal Road",
    geofenceRadiusMeters: 150,
    campusId: "campus-gehu-bhimtal",
    zoneCode: "ZONE_CAMPUS",
  };
}

// Crisp vector SVG icons for high-DPI Leaflet markers (replaces low-res emojis)
const busSvg = `<svg class="w-3.5 h-3.5 mr-1 shrink-0 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"></path><path d="M15 6v6"></path><path d="M2 12h19.6"></path><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4C2.9 6 1.9 6.8 1.6 7.8L.2 12.8c-.1.4-.2.8-.2 1.2 0 .4.1.8.2 1.2.3 1.1.8 2.8.8 2.8h3"></path><circle cx="7" cy="18" r="2" fill="currentColor"></circle><path d="M9 18h5"></path><circle cx="16" cy="18" r="2" fill="currentColor"></circle></svg>`;

const universitySvg = `<svg class="w-4 h-4 shrink-0 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 10-10-5L2 10l10 5 10-5Z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path><line x1="22" y1="10" x2="22" y2="16"></line></svg>`;

const stopPinSvg = `<svg class="w-3.5 h-3.5 shrink-0 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;

const boardingPointSvg = `<svg class="w-3.5 h-3.5 shrink-0 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="3" fill="currentColor"></circle></svg>`;

const checkStarSvg = `<svg class="w-3.5 h-3.5 shrink-0 inline-block mr-1" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;

interface CampusFleetMapProps {
  busLocation?: LiveBusLocation;
  busName?: string;
  tripStatus?: string;
  fleetBuses?: FleetBusMarkerData[];
  focusedBusId?: number;
  onBusClick?: (bus: FleetBusMarkerData) => void;
  stops?: Stop[];
  campuses?: Campus[];
  primaryCampus?: Campus | null;
  routeCoordinates?: [number, number][];
  walkingCoordinates?: [number, number][];
  activeStopIndex?: number;
  shortestPathStopIds?: string[];
  selectedStopId?: string;
  isExpressDirect?: boolean;
  expressReason?: string;
  height?: string;
  zoom?: number;
  onMapClick?: (lat: number, lng: number) => void;
  onStopClick?: (stop: Stop) => void;
  draftPinLocation?: [number, number] | null;
  draftGeofenceRadius?: number;
  interactiveMode?: "VIEW" | "PIN_DROP";
  showUserLocation?: boolean;
  showCampusLandmark?: boolean;
  tileTheme?: "GOOGLE_STREETS" | "CARTO_VOYAGER" | "CARTO_DARK" | "GOOGLE_HYBRID" | "AUTO";
  onRouteMetricsCalculated?: (metrics: any) => void;
}

// Fetches actual road-snapped geometry with client sessionStorage caching
async function fetchRoadSnappedRoute(coordinates: [number, number][]): Promise<[number, number][]> {
  if (coordinates.length < 2) return coordinates;

  const coordKey = `cf_isolated_osrm_leaf_v4_${coordinates.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(";")}`;
  if (typeof window !== "undefined") {
    try {
      const cached = sessionStorage.getItem(coordKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length >= 2) return parsed;
      }
    } catch {}
  }

  // 1. First try internal /api/geo/directions (which leverages Google Routes API + server-side OSRM fallback)
  try {
    const apiCoords = coordinates.map(([lat, lng]) => `${lat},${lng}`).join(";");
    const apiRes = await fetch(`/api/geo/directions?coords=${apiCoords}`, { signal: AbortSignal.timeout(6000) });
    if (apiRes.ok) {
      const apiData = await apiRes.json();
      if (apiData.success && Array.isArray(apiData.coordinates) && apiData.coordinates.length >= 2) {
        if (typeof window !== "undefined") {
          try { sessionStorage.setItem(coordKey, JSON.stringify(apiData.coordinates)); } catch {}
        }
        return apiData.coordinates;
      }
    }
  } catch (err) {
    // Continue to external mirrors
  }

  const coordString = coordinates.map(([lat, lng]) => `${lng},${lat}`).join(";");
  const endpoints = [
    `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`,
    `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coordString}?overview=full&geometries=geojson`,
  ];

  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.routes && data.routes[0]?.geometry?.coordinates) {
          const snapped = data.routes[0].geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
          if (typeof window !== "undefined") {
            try { sessionStorage.setItem(coordKey, JSON.stringify(snapped)); } catch {}
          }
          return snapped;
        }
      }
    } catch {
      // Continue to next mirror
    }
  }

  // Segment-by-segment fallback for high reliability
  try {
    const fullSnapped: [number, number][] = [];
    for (let i = 0; i < coordinates.length - 1; i++) {
      const segmentStr = `${coordinates[i][1]},${coordinates[i][0]};${coordinates[i + 1][1]},${coordinates[i + 1][0]}`;
      const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${segmentStr}?overview=full&geometries=geojson`);
      if (res.ok) {
        const data = await res.json();
        if (data.routes && data.routes[0]?.geometry?.coordinates) {
          const segCoords = data.routes[0].geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]);
          fullSnapped.push(...segCoords);
        }
      }
    }
    if (fullSnapped.length > 0) {
      if (typeof window !== "undefined") {
        try { sessionStorage.setItem(coordKey, JSON.stringify(fullSnapped)); } catch {}
      }
      return fullSnapped;
    }
  } catch {
    // Fallback to straight lines
  }

  return coordinates;
}

export default function CampusFleetMap(props: CampusFleetMapProps) {
  const [googleMapsError, setGoogleMapsError] = useState(false);
  const hasGoogleKey = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
  const theme = props.tileTheme || "AUTO";

  // If user requested Google mode and Google Maps API key is available and hasn't failed:
  // Render official GoogleTransitMap!
  if (
    hasGoogleKey &&
    !googleMapsError &&
    (theme === "GOOGLE_STREETS" || theme === "GOOGLE_HYBRID" || theme === "AUTO" || theme === "CARTO_DARK")
  ) {
    return (
      <GoogleTransitMap
        {...props}
        apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
        onRouteMetricsCalculated={props.onRouteMetricsCalculated}
        onError={(err) => {
          console.warn("[CampusFleetMap] GoogleTransitMap failed, falling back to Leaflet:", err);
          setGoogleMapsError(true);
        }}
      />
    );
  }

  return <LeafletTransitMap {...props} />;
}

function LeafletTransitMap({
  busLocation,
  busName,
  tripStatus,
  fleetBuses,
  focusedBusId,
  onBusClick,
  stops = [],
  campuses = [],
  primaryCampus,
  routeCoordinates = [],
  walkingCoordinates = [],
  activeStopIndex = 0,
  shortestPathStopIds = [],
  selectedStopId,
  isExpressDirect,
  expressReason,
  height = "400px",
  zoom = 13,
  onMapClick,
  onStopClick,
  draftPinLocation,
  draftGeofenceRadius = 80,
  interactiveMode = "VIEW",
  showUserLocation = true,
  showCampusLandmark = true,
  tileTheme = "AUTO",
}: CampusFleetMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const busMarkerRef = useRef<any>(null);
  const fleetMarkersMapRef = useRef<Map<number, any>>(new Map());
  const currentTileLayerRef = useRef<any>(null);
  const currentTileThemeRef = useRef<string>("");

  // Dual-color Google Maps path polylines (Completed = Gray, Upcoming = Blue)
  const polylineUpcomingGlowRef = useRef<any>(null);
  const polylineUpcomingBorderRef = useRef<any>(null);
  const polylineUpcomingCoreRef = useRef<any>(null);
  const polylineCompletedBorderRef = useRef<any>(null);
  const polylineCompletedCoreRef = useRef<any>(null);

  const shortestPathPolylineRef = useRef<any>(null);
  const walkingPolylineRef = useRef<any>(null);
  const markersGroupRef = useRef<any>(null);
  const campusMarkerGroupRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const userAccuracyCircleRef = useRef<any>(null);

  // User Live Location & Geolocation state
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Transient Pin Drop Helper (Shows for 1 second, then automatically disappears)
  const [showPinHint, setShowPinHint] = useState(false);
  const pinHintTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (interactiveMode === "PIN_DROP") {
      setShowPinHint(true);
      if (pinHintTimerRef.current) clearTimeout(pinHintTimerRef.current);
      pinHintTimerRef.current = setTimeout(() => {
        setShowPinHint(false);
      }, 1000); // 1 second duration
    } else {
      setShowPinHint(false);
    }
    return () => {
      if (pinHintTimerRef.current) clearTimeout(pinHintTimerRef.current);
    };
  }, [interactiveMode]);

  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const onStopClickRef = useRef(onStopClick);
  onStopClickRef.current = onStopClick;
  const onBusClickRef = useRef(onBusClick);
  onBusClickRef.current = onBusClick;

  const userInteractedRef = useRef(false);
  const initialFitDoneRef = useRef(false);
  const lastFittedRouteRef = useRef<string | null>(null);
  const lastFocusedBusIdRef = useRef<number | undefined>(undefined);

  // Geolocation trigger: centers and pins user position with live GPS
  const handleLocateUser = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setLocationNotice("GPS Geolocation is not supported by your browser");
      setTimeout(() => setLocationNotice(null), 3500);
      return;
    }

    setIsLocating(true);
    setLocationNotice(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const { latitude, longitude, accuracy } = pos.coords;
        const loc = { lat: latitude, lng: longitude, accuracy };
        setUserLocation(loc);

        if (mapInstanceRef.current) {
          mapInstanceRef.current.setView([latitude, longitude], Math.max(mapInstanceRef.current.getZoom(), 15), {
            animate: true,
          });
        }
        setLocationNotice(`Live location acquired (±${Math.round(accuracy)}m)`);
        setTimeout(() => setLocationNotice(null), 3500);
      },
      (err) => {
        setIsLocating(false);
        console.warn("Geolocation prompt error:", err.message);
        setLocationNotice("Location permission denied or unavailable");
        setTimeout(() => setLocationNotice(null), 4000);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
    );

    if (watchIdRef.current === null) {
      try {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            setUserLocation({ lat: latitude, lng: longitude, accuracy });
          },
          (err) => console.warn("Watch position error:", err.message),
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
        );
      } catch {
        // watchPosition fallback
      }
    }
  };

  const campusTerminalStop = getCampusStopFromDatabase(stops, campuses, primaryCampus);

  const handlePanToCampus = () => {
    if (mapInstanceRef.current && campusTerminalStop) {
      mapInstanceRef.current.setView([campusTerminalStop.latitude, campusTerminalStop.longitude], 15, {
        animate: true,
      });
    }
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return;

    let isMounted = true;

    import("leaflet").then(async L => {
      if (!isMounted || !mapContainerRef.current) return;

      // Fix icon assets in bundlers
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      // Default center: resolved campus terminal from campuses table, bus location, or first stop
      const campusStop = campusTerminalStop;
      const defaultCenter: [number, number] = draftPinLocation
        ? draftPinLocation
        : busLocation
        ? [busLocation.latitude, busLocation.longitude]
        : campusStop
        ? [campusStop.latitude, campusStop.longitude]
        : stops[0]
        ? [stops[0].latitude, stops[0].longitude]
        : [29.375015, 79.529479];

      if (!mapInstanceRef.current) {
        const map = L.map(mapContainerRef.current, {
          center: defaultCenter,
          zoom: zoom,
          zoomControl: false,
        });

        L.control.zoom({ position: "bottomright" }).addTo(map);

        map.on("click", (e: any) => {
          if (pinHintTimerRef.current) clearTimeout(pinHintTimerRef.current);
          setShowPinHint(false);
          if (onMapClickRef.current) {
            onMapClickRef.current(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
          }
        });

        map.on("zoomstart dragstart", () => {
          userInteractedRef.current = true;
        });

        mapInstanceRef.current = map;
      }

      const map = mapInstanceRef.current;
      if (!map) return;

      // ─── HIGH-RELIABILITY MAP TILE ENGINE (Google Maps Streets / CartoDB) ───
      // Resolves blocked openstreetmap.org 403s on Vercel and mobile networks
      const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
      const activeTheme = tileTheme === "AUTO" ? (isDark ? "CARTO_DARK" : "GOOGLE_STREETS") : tileTheme;

      if (!currentTileLayerRef.current || currentTileThemeRef.current !== activeTheme) {
        if (currentTileLayerRef.current && map.hasLayer(currentTileLayerRef.current)) {
          map.removeLayer(currentTileLayerRef.current);
        }

        // Bulletproof high-speed Google Maps tile engine (CORS open, zero-watermark, zero-API-key requirement)
        let tileUrl = "https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}";
        let subdomains: any = ["mt0", "mt1", "mt2", "mt3"];
        let maxZoom = 20;
        let attribution = '&copy; Google Maps';
        let className = "";

        if (activeTheme === "CARTO_DARK") {
          tileUrl = "https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}";
          subdomains = ["mt0", "mt1", "mt2", "mt3"];
          attribution = '&copy; Google Maps';
          className = "google-dark-tiles";
        } else if (activeTheme === "GOOGLE_HYBRID") {
          tileUrl = "https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}";
          subdomains = ["mt0", "mt1", "mt2", "mt3"];
          attribution = '&copy; Google Maps';
          className = "";
        } else {
          // Standard Google Streets (Roadmap)
          tileUrl = "https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}";
          subdomains = ["mt0", "mt1", "mt2", "mt3"];
          attribution = '&copy; Google Maps';
          className = "";
        }

        const tileLayer = L.tileLayer(tileUrl, {
          maxZoom,
          subdomains,
          attribution,
          className,
        });

        // Resilient fallback: retry from mt0 if any tile errors out
        tileLayer.on("tileerror", (errorEvent: any) => {
          if (errorEvent.tile && !errorEvent.tile.dataset.retried) {
            errorEvent.tile.dataset.retried = "true";
            const lyrs = activeTheme === "GOOGLE_HYBRID" ? "s,h" : "m";
            errorEvent.tile.src = `https://mt0.google.com/vt/lyrs=${lyrs}&x=${errorEvent.coords.x}&y=${errorEvent.coords.y}&z=${errorEvent.coords.z}`;
          }
        });

        tileLayer.addTo(map);
        if (tileLayer.bringToBack) {
          tileLayer.bringToBack();
        }

        currentTileLayerRef.current = tileLayer;
        currentTileThemeRef.current = activeTheme;
      }

      // Invalidate size immediately to prevent height 0 collapse in modals
      map.invalidateSize();

      if (map.getContainer()) {
        map.getContainer().style.cursor = interactiveMode === "PIN_DROP" ? "crosshair" : "";
      }

      // Small delayed invalidations to guarantee proper dimensions after modal CSS transitions
      const t1 = setTimeout(() => {
        if (isMounted && mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 80);

      const t2 = setTimeout(() => {
        if (isMounted && mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 300);

      // Clean existing markers group
      if (markersGroupRef.current) {
        markersGroupRef.current.clearLayers();
      } else {
        markersGroupRef.current = L.layerGroup().addTo(map);
      }

      // Calculate Main Route Waypoints
      // Never draw auto-connected multi-stop route polylines in PIN_DROP mode
      const waypoints: [number, number][] =
        interactiveMode === "PIN_DROP"
          ? []
          : routeCoordinates.length >= 2
          ? routeCoordinates
          : (!fleetBuses || fleetBuses.length === 0) && stops.length >= 2
          ? stops.map(s => [s.latitude, s.longitude])
          : [];

      if (waypoints.length >= 2) {
        // Fetch real road curves
        const roadSnappedCoords = await fetchRoadSnappedRoute(waypoints);

        if (isMounted) {
          // Remove previous polylines if exist
          if (polylineUpcomingGlowRef.current) map.removeLayer(polylineUpcomingGlowRef.current);
          if (polylineUpcomingBorderRef.current) map.removeLayer(polylineUpcomingBorderRef.current);
          if (polylineUpcomingCoreRef.current) map.removeLayer(polylineUpcomingCoreRef.current);
          if (polylineCompletedBorderRef.current) map.removeLayer(polylineCompletedBorderRef.current);
          if (polylineCompletedCoreRef.current) map.removeLayer(polylineCompletedCoreRef.current);

          // Determine active bus position along this corridor
          let activeBusPos: [number, number] | null = null;
          let isCompletedTrip = tripStatus === "COMPLETED";

          if (busLocation && typeof busLocation.latitude === "number") {
            activeBusPos = [busLocation.latitude, busLocation.longitude];
          } else if (focusedBusId && fleetBuses) {
            const fb = fleetBuses.find((b) => b.busId === focusedBusId);
            if (fb) {
              activeBusPos = [fb.latitude, fb.longitude];
              if (fb.tripStatus === "COMPLETED" || fb.state === "CAMPUS_PARKED") {
                isCompletedTrip = true;
              }
            }
          } else if (fleetBuses && fleetBuses.length > 0) {
            const fb = fleetBuses[0];
            if (fb) {
              activeBusPos = [fb.latitude, fb.longitude];
              if (fb.tripStatus === "COMPLETED" || fb.state === "CAMPUS_PARKED") {
                isCompletedTrip = true;
              }
            }
          }

          let completedPath: [number, number][] = [];
          let upcomingPath: [number, number][] = [];

          if (isCompletedTrip) {
            // Entire route is completed -> All Gray
            completedPath = roadSnappedCoords;
            upcomingPath = [];
          } else if (!activeBusPos) {
            // No active vehicle position -> Entire route is upcoming -> All Blue
            completedPath = [];
            upcomingPath = roadSnappedCoords;
          } else {
            // Find nearest point on the road geometry to the bus location
            let minDistance = Infinity;
            let splitIdx = 0;

            for (let i = 0; i < roadSnappedCoords.length; i++) {
              const dLat = roadSnappedCoords[i][0] - activeBusPos[0];
              const dLng = (roadSnappedCoords[i][1] - activeBusPos[1]) * Math.cos((activeBusPos[0] * Math.PI) / 180);
              const distSq = dLat * dLat + dLng * dLng;
              if (distSq < minDistance) {
                minDistance = distSq;
                splitIdx = i;
              }
            }

            if (splitIdx === 0) {
              // Bus at starting stop
              completedPath = [];
              upcomingPath = roadSnappedCoords;
            } else if (splitIdx >= roadSnappedCoords.length - 1) {
              // Bus at destination
              completedPath = roadSnappedCoords;
              upcomingPath = [];
            } else {
              // Strictly follow road geometry without injecting raw off-road bus GPS coordinate
              completedPath = roadSnappedCoords.slice(0, splitIdx + 1);
              upcomingPath = roadSnappedCoords.slice(splitIdx);
            }
          }

          // 1. Render Completed Path (Already covered -> Slate / Gray, like Google Maps)
          if (completedPath.length >= 2) {
            polylineCompletedBorderRef.current = L.polyline(completedPath, {
              color: "#475569", // Slate-600 outline
              weight: 6.5,
              opacity: 0.75,
              lineJoin: "round",
              lineCap: "round",
            }).addTo(map);

            polylineCompletedCoreRef.current = L.polyline(completedPath, {
              color: "#94A3B8", // Slate-400 core
              weight: 4.5,
              opacity: 0.95,
              lineJoin: "round",
              lineCap: "round",
            }).addTo(map);
          }

          // 2. Render Upcoming Path (To be covered -> Vibrant Blue / Emerald, like Google Maps)
          if (upcomingPath.length >= 2) {
            polylineUpcomingGlowRef.current = L.polyline(upcomingPath, {
              color: isExpressDirect ? "#10B981" : "#2563EB",
              weight: 12,
              opacity: 0.25,
              lineJoin: "round",
              lineCap: "round",
            }).addTo(map);

            polylineUpcomingBorderRef.current = L.polyline(upcomingPath, {
              color: isExpressDirect ? "#065F46" : "#1D4ED8",
              weight: 7,
              opacity: 0.95,
              lineJoin: "round",
              lineCap: "round",
            }).addTo(map);

            polylineUpcomingCoreRef.current = L.polyline(upcomingPath, {
              color: isExpressDirect ? "#34D399" : "#38BDF8",
              weight: 4.5,
              opacity: 1.0,
              lineJoin: "round",
              lineCap: "round",
            }).addTo(map);
          }

          // Auto-fit bounds so the entire road path is visible when route changes
          const currentRouteKey = roadSnappedCoords.map(c => `${c[0].toFixed(3)},${c[1].toFixed(3)}`).join(";");
          const mapSize = map.getSize();
          const shouldFitBounds = lastFittedRouteRef.current !== currentRouteKey || mapSize.y < 50;

          if (roadSnappedCoords.length >= 2 && shouldFitBounds) {
            lastFittedRouteRef.current = currentRouteKey;
            userInteractedRef.current = false;
            map.invalidateSize();
            const bounds = L.latLngBounds(roadSnappedCoords);
            if (busLocation) {
              // Only extend bounds if busLocation is reasonably close to this corridor (within ~0.5 deg / ~50km)
              const lats = roadSnappedCoords.map(c => c[0]);
              const lngs = roadSnappedCoords.map(c => c[1]);
              const minLat = Math.min(...lats);
              const maxLat = Math.max(...lats);
              const minLng = Math.min(...lngs);
              const maxLng = Math.max(...lngs);

              const isNearby =
                busLocation.latitude >= minLat - 0.4 &&
                busLocation.latitude <= maxLat + 0.4 &&
                busLocation.longitude >= minLng - 0.4 &&
                busLocation.longitude <= maxLng + 0.4;

              if (isNearby) {
                bounds.extend([busLocation.latitude, busLocation.longitude]);
              }
            }
            if (bounds.isValid()) {
              map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
            }
          }
        }
      } else {
        // Cleanup old polylines if route has fewer than 2 waypoints
        if (polylineUpcomingGlowRef.current) {
          map.removeLayer(polylineUpcomingGlowRef.current);
          polylineUpcomingGlowRef.current = null;
        }
        if (polylineUpcomingBorderRef.current) {
          map.removeLayer(polylineUpcomingBorderRef.current);
          polylineUpcomingBorderRef.current = null;
        }
        if (polylineUpcomingCoreRef.current) {
          map.removeLayer(polylineUpcomingCoreRef.current);
          polylineUpcomingCoreRef.current = null;
        }
        if (polylineCompletedBorderRef.current) {
          map.removeLayer(polylineCompletedBorderRef.current);
          polylineCompletedBorderRef.current = null;
        }
        if (polylineCompletedCoreRef.current) {
          map.removeLayer(polylineCompletedCoreRef.current);
          polylineCompletedCoreRef.current = null;
        }
        lastFittedRouteRef.current = null;

        if (stops.length === 1) {
          map.setView([stops[0].latitude, stops[0].longitude], 14, { animate: true });
        }
      }

      // Dijkstra Shortest Path Overlay (if provided)
      if (shortestPathStopIds.length >= 2) {
        const stopMap = new Map(stops.map(s => [s.id, s]));
        if (campusTerminalStop) {
          stopMap.set(campusTerminalStop.id, campusTerminalStop);
          if (campusTerminalStop.campusId) {
            stopMap.set(campusTerminalStop.campusId, campusTerminalStop);
          }
        }
        const pathCoords: [number, number][] = shortestPathStopIds
          .map(id => stopMap.get(id))
          .filter(Boolean)
          .map(s => [s!.latitude, s!.longitude]);

        if (pathCoords.length >= 2) {
          const snappedPath = await fetchRoadSnappedRoute(pathCoords);
          if (isMounted) {
            if (shortestPathPolylineRef.current) map.removeLayer(shortestPathPolylineRef.current);

            shortestPathPolylineRef.current = L.polyline(snappedPath, {
              color: "#8B5CF6", // Purple / Violet shortest path
              weight: 6,
              opacity: 0.9,
              dashArray: "10, 6",
              lineJoin: "round",
              lineCap: "round",
            }).addTo(map);

            if (!busLocation) {
              const bounds = L.latLngBounds(snappedPath);
              map.fitBounds(bounds, { padding: [50, 50] });
            }
          }
        }
      }

      // Render First-Mile Pedestrian Walking Path Layer
      if (walkingPolylineRef.current) {
        map.removeLayer(walkingPolylineRef.current);
        walkingPolylineRef.current = null;
      }
      if (walkingCoordinates && walkingCoordinates.length >= 2) {
        walkingPolylineRef.current = L.polyline(walkingCoordinates, {
          color: "#10B981", // Emerald 500
          weight: 5,
          opacity: 0.95,
          dashArray: "6, 8",
          lineJoin: "round",
          lineCap: "round",
        }).addTo(map);
      }

      // Render Stop Station Markers
      const shortestPathSet = new Set(shortestPathStopIds);
      const hasSpecificRoute = shortestPathStopIds.length > 0;
      const isCorridorSequence =
        (routeCoordinates.length >= 2 || hasSpecificRoute || (!fleetBuses || fleetBuses.length === 0)) &&
        stops.length >= 2;

      // In PIN_DROP mode, NEVER render all system stops across campuses!
      // If a specific pickup stop is selected, ONLY render that single stop to avoid route data leak.
      const stopsToRender = interactiveMode === "PIN_DROP"
        ? (selectedStopId ? stops.filter(s => s.id === selectedStopId) : [])
        : stops;

      stopsToRender.forEach((stop, idx) => {
        const isPassed = idx < activeStopIndex;
        const isNext = idx === activeStopIndex;
        const isStudentPickup = selectedStopId && stop.id === selectedStopId;
        const isOnShortestPath = shortestPathSet.has(stop.id);
        const isStartOfPath = isCorridorSequence ? idx === 0 : hasSpecificRoute && shortestPathStopIds[0] === stop.id;
        const isCampusTerminal =
          stop.id === campusTerminalStop.id ||
          stop.id === campusTerminalStop.campusId ||
          stop.code === campusTerminalStop.code ||
          stop.name.toLowerCase().includes("campus terminal") ||
          stop.name.toLowerCase().includes("university terminal");
        const isEndOfPath = isCorridorSequence
          ? idx === stops.length - 1
          : (hasSpecificRoute && shortestPathStopIds[shortestPathStopIds.length - 1] === stop.id) ||
            (!hasSpecificRoute && isCampusTerminal);

        let iconBgClass = "bg-blue-600 border-white text-white shadow-md";
        if (isStudentPickup) {
          iconBgClass = "bg-green-600 border-white text-white ring-4 ring-green-400/60 animate-pulse shadow-lg";
        } else if (isCampusTerminal || isEndOfPath) {
          iconBgClass = "bg-blue-600 border-white text-white ring-4 ring-blue-400/50 shadow-md";
        } else if (isStartOfPath) {
          iconBgClass = "bg-green-600 border-white text-white ring-4 ring-green-400/50 shadow-md";
        } else if (isOnShortestPath) {
          iconBgClass = "bg-pink-600 border-white text-white ring-2 ring-pink-400/30";
        } else if (isNext) {
          iconBgClass = "bg-yellow-500 border-white text-white animate-bounce ring-4 ring-yellow-400/30";
        } else if (isPassed) {
          iconBgClass = "bg-gray-300 dark:bg-gray-700 border-gray-400 text-gray-700 dark:text-gray-300";
        }

        const stopSymbolHtml = isStudentPickup
          ? stopPinSvg
          : isCorridorSequence
          ? `<span class="font-black text-[11px]">${idx + 1}</span>`
          : isCampusTerminal
          ? universitySvg
          : isStartOfPath
          ? boardingPointSvg
          : hasSpecificRoute
          ? `<span>${idx + 1}</span>`
          : boardingPointSvg;

        const stopIcon = L.divIcon({
          className: "custom-stop-icon",
          html: `<div class="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shadow-md border-2 ${iconBgClass}">
            ${stopSymbolHtml}
          </div>`,
          iconSize: isStudentPickup ? [32, 32] : [28, 28],
          iconAnchor: isStudentPickup ? [16, 16] : [14, 14],
        });

        const marker = L.marker([stop.latitude, stop.longitude], { icon: stopIcon }).addTo(markersGroupRef.current);
        marker.on("click", () => {
          onStopClickRef.current?.(stop);
        });

        marker.bindPopup(`
          <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4;">
            ${isStudentPickup ? `<div style="color: #059669; font-weight: 900; font-size: 12px; margin-bottom: 3px; display: flex; align-items: center; gap: 4px;">${checkStarSvg} Your Allocated Boarding Point</div>` : ""}
            ${isCampusTerminal ? `<div style="color: #1d4ed8; font-weight: 900; font-size: 12px; margin-bottom: 3px; display: flex; align-items: center; gap: 4px;">${universitySvg} Destination University Campus</div>` : ""}
            <strong style="color: #0f172a; font-size: 13px;">${stop.name} (${stop.code})</strong><br/>
            <span>Landmark: <strong>${stop.landmark || "Transit Stop"}</strong></span><br/>
            <span>${hasSpecificRoute ? `Route Sequence: Stop #${idx + 1}` : `Station Code: ${stop.code}`}</span>
            ${isOnShortestPath ? `<br/><span style="color: #7c3aed; font-weight: bold; display: flex; align-items: center; gap: 4px; margin-top: 2px;">${checkStarSvg} On Shortest Route to Campus</span>` : ""}
          </div>
        `);

        // Draw Geofence circle
        L.circle([stop.latitude, stop.longitude], {
          radius: stop.geofenceRadiusMeters || 80,
          color: isStudentPickup ? "#059669" : isEndOfPath ? "#1d4ed8" : isStartOfPath ? "#10b981" : isOnShortestPath ? "#8b5cf6" : isNext ? "#f59e0b" : "#0d9488",
          weight: isStudentPickup || isEndOfPath ? 2.5 : 1.5,
          opacity: 0.8,
          fillColor: isStudentPickup ? "#a7f3d0" : isEndOfPath ? "#bfdbfe" : isStartOfPath ? "#d1fae5" : isOnShortestPath ? "#ede9fe" : isNext ? "#fef3c7" : "#ccfbf1",
          fillOpacity: isStudentPickup || isEndOfPath ? 0.35 : 0.25,
        }).addTo(markersGroupRef.current);
      });

      // Render Draft Stop Pin & Geofence Preview (Pin Drop Mode)
      if (draftPinLocation) {
        const draftIcon = L.divIcon({
          className: "custom-draft-pin-icon",
          html: `
            <div class="relative flex items-center justify-center w-10 h-10 -translate-x-1/2 -translate-y-full">
              <div class="w-8 h-8 rounded-full bg-emerald-600 border-2 border-white shadow-2xl flex items-center justify-center text-white text-sm font-black ring-4 ring-emerald-400/40">
                ${stopPinSvg}
              </div>
              <div class="absolute -bottom-1 w-2 h-2 rounded-full bg-emerald-700"></div>
            </div>
          `,
          iconSize: [40, 40],
          iconAnchor: [20, 40],
        });

        const draftMarker = L.marker(draftPinLocation, {
          icon: draftIcon,
          zIndexOffset: 1500,
        }).addTo(markersGroupRef.current);

        // Subtle non-intrusive tooltip on hover/click instead of auto-opening coordinate popup
        draftMarker.bindTooltip("Your Home Location", {
          direction: "top",
          offset: [0, -32],
          className: "custom-pin-tooltip",
        });

        // Only draw geofence circle in admin stop creation mode, not student home pin drop
        if (draftGeofenceRadius && draftGeofenceRadius > 0 && interactiveMode !== "PIN_DROP") {
          L.circle(draftPinLocation, {
            radius: draftGeofenceRadius,
            color: "#e11d48",
            dashArray: "6, 6",
            weight: 2,
            opacity: 0.9,
            fillColor: "#fecdd3",
            fillOpacity: 0.35,
          }).addTo(markersGroupRef.current);
        }

        map.panTo(draftPinLocation);
      }

      // Render Real-time Live Bus Vehicle Marker
      if (busLocation) {
        const busIcon = L.divIcon({
          className: "custom-bus-icon",
          html: `
            <div class="relative flex items-center justify-center w-11 h-11 rounded-2xl bg-blue-600 border-2 border-white shadow-2xl text-white transform -translate-x-1/2 -translate-y-1/2">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 6v6"></path><path d="M15 6v6"></path><path d="M2 12h19.6"></path><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4C2.9 6 1.9 6.8 1.6 7.8L.2 12.8c-.1.4-.2.8-.2 1.2 0 .4.1.8.2 1.2.3 1.1.8 2.8.8 2.8h3"></path><circle cx="7" cy="18" r="2"></circle><path d="M9 18h5"></path><circle cx="16" cy="18" r="2"></circle>
              </svg>
              <span class="absolute -top-1 -right-1 flex h-3 w-3">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
            </div>
          `,
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        });

        const busDisplayName = busName || "Campus Shuttle";
        const isStationary = !busLocation.speedKmh || busLocation.speedKmh === 0;
        const currentTripStatus = tripStatus || (isStationary ? "SCHEDULED" : "IN_PROGRESS");

        const currentDelayMins = busLocation.delayMinutes || 0;
        const currentStopName = stops.find(s => s.id === busLocation.currentStopId)?.name || stops.find(s => s.id === busLocation.nextStopId)?.name || "Corridor Track";
        const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${busLocation.latitude},${busLocation.longitude}`;

        const popupHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; line-height: 1.45; min-width: 220px; padding: 2px;">
            <strong style="color: #0f172a; font-size: 13px; font-weight: 900;">${busDisplayName}</strong><br/>
            <div style="color: #334155; font-size: 12px; font-weight: bold; margin-top: 2px;">
              At ${currentStopName}
            </div>
            <div style="margin-top: 3px; font-size: 11px;">
              ${
                currentDelayMins > 2
                  ? `<span style="color: #e11d48; font-weight: 800;">Delayed by ${currentDelayMins} minutes at ${currentStopName}</span>`
                  : `<span style="color: #16a34a; font-weight: 800;">Running on time • ${busLocation.speedKmh || 0} km/h</span>`
              }
            </div>
            <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #e2e8f0;">
              <a
                href="${googleMapsUrl}"
                target="_blank"
                rel="noopener noreferrer"
                style="display: inline-flex; align-items: center; gap: 6px; color: #0284c7; font-weight: 800; font-size: 11px; text-decoration: none; padding: 4px 8px; border-radius: 8px; background: #f0f9ff; border: 1px solid #bae6fd;"
              >
                <svg style="width: 14px; height: 14px; color: #ea4335;" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
                View in Google Maps
              </a>
            </div>
          </div>
        `;

        if (!busMarkerRef.current) {
          busMarkerRef.current = L.marker([busLocation.latitude, busLocation.longitude], {
            icon: busIcon,
            zIndexOffset: 1000,
          }).addTo(map);

          busMarkerRef.current.bindPopup(popupHtml);
        } else {
          busMarkerRef.current.setLatLng([busLocation.latitude, busLocation.longitude]);
          busMarkerRef.current.setPopupContent(popupHtml);
        }
      }

      // Render Full Multi-Bus Fleet Tracking (when fleetBuses provided)
      if (fleetBuses && fleetBuses.length > 0) {
        const currentMarkers = fleetMarkersMapRef.current;
        const activeBusIds = new Set(fleetBuses.map((fb) => fb.busId));

        // Cleanup removed vehicles
        currentMarkers.forEach((marker, id) => {
          if (!activeBusIds.has(id)) {
            map.removeLayer(marker);
            currentMarkers.delete(id);
          }
        });

        fleetBuses.forEach((fb) => {
          const isParked = fb.state === "CAMPUS_PARKED";
          const isStandby = fb.state === "STANDBY_STARTING_POINT";
          const isInTransit = fb.state === "IN_TRANSIT";

          const bgClass = isParked
            ? "bg-gray-800 text-gray-100 border-gray-400 ring-4 ring-gray-400/20 shadow-md"
            : isStandby
            ? "bg-yellow-500 text-white border-white ring-4 ring-yellow-300/50 shadow-md"
            : "bg-blue-600 text-white border-white ring-4 ring-blue-400/50 shadow-md shadow-blue-500/30";

          const pulseBadge = isParked
            ? `<span class="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span class="relative inline-flex rounded-full h-3.5 w-3.5 bg-green-500 border-2 border-white items-center justify-center text-[8px] font-black text-white">✓</span>
              </span>`
            : isStandby
            ? `<span class="absolute -top-1 -right-1 flex h-3 w-3">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-3 w-3 bg-yellow-500 border border-white"></span>
              </span>`
            : `<span class="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-3.5 w-3.5 bg-green-500 border border-white"></span>
              </span>`;

          const busIcon = L.divIcon({
            className: "custom-fleet-bus-icon",
            html: `
              <div class="relative flex items-center justify-center min-w-[38px] h-9 px-2 rounded-xl shadow-xl border-2 font-black text-xs cursor-pointer select-none transition-transform hover:scale-110 ${bgClass} -translate-x-1/2 -translate-y-1/2">
                ${busSvg}
                <span class="font-mono text-[11px] font-black tracking-tight">${fb.shortLabel}</span>
                ${pulseBadge}
              </div>
            `,
            iconSize: [46, 36],
            iconAnchor: [23, 18],
          });

          const popupHtml = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; line-height: 1.45; min-width: 220px;">
              <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 6px;">
                <strong style="color: #0f172a; font-size: 14px; font-weight: 900;">${fb.busNumber}</strong>
                <span style="font-family: monospace; font-size: 11px; color: #64748b;">${fb.registrationNo}</span>
              </div>

              <div style="margin-bottom: 6px;">
                <span style="font-size: 10px; padding: 3px 8px; border-radius: 999px; font-weight: 900; text-transform: uppercase; ${
                  isParked
                    ? "background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1;"
                    : isStandby
                    ? "background: #fef3c7; color: #b45309; border: 1px solid #fcd34d;"
                    : "background: #dbeafe; color: #1d4ed8; border: 1px solid #93c5fd;"
                }">
                  ${
                    isParked
                      ? "✓ TRIP COMPLETED • PARKED"
                      : isStandby
                      ? "● STANDBY AT STARTING POINT"
                      : "● IN TRANSIT (LIVE TELEMATICS)"
                  }
                </span>
              </div>

              <div style="color: #334155; font-size: 11px;">
                <div style="margin-top: 3px;">Route: <strong style="color: #1e293b;">${fb.routeName || "Corridor Route"}</strong></div>
                <div style="margin-top: 3px;">Status: <strong style="color: ${isInTransit ? "#2563eb" : isStandby ? "#d97706" : "#475569"};">${fb.statusText}</strong></div>
                <div style="margin-top: 3px;">Scheduled Departure: <strong style="color: #2563eb;">${fb.departureTime || "07:30 AM"}</strong></div>
                <div style="margin-top: 3px;">Speed: <strong style="color: #0f172a;">${fb.speedKmh} km/h</strong></div>
                <div style="margin-top: 3px; color: #64748b; font-size: 10px;">
                  Crew: <strong>${fb.driverName || "Driver"}</strong> (Driver) • <strong>${fb.conductorName || "Conductor"}</strong>
                </div>
              </div>
              <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #e2e8f0;">
                <a
                  href="https://www.google.com/maps/search/?api=1&query=${fb.latitude},${fb.longitude}"
                  target="_blank"
                  rel="noopener noreferrer"
                  style="display: inline-flex; align-items: center; gap: 5px; color: #0284c7; font-weight: 800; font-size: 11px; text-decoration: none; padding: 4px 8px; border-radius: 8px; background: #f0f9ff; border: 1px solid #bae6fd;"
                >
                  <svg style="width: 14px; height: 14px; color: #ea4335;" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                  </svg>
                  View in Google Maps
                </a>
              </div>
            </div>
          `;

          let marker = currentMarkers.get(fb.busId);
          if (!marker) {
            marker = L.marker([fb.latitude, fb.longitude], {
              icon: busIcon,
              zIndexOffset: isInTransit ? 1200 : isStandby ? 1100 : 900,
            }).addTo(map);

            marker.bindPopup(popupHtml);
            marker.on("click", () => {
              onBusClickRef.current?.(fb);
            });
            currentMarkers.set(fb.busId, marker);
          } else {
            marker.setLatLng([fb.latitude, fb.longitude]);
            marker.setIcon(busIcon);
            marker.setPopupContent(popupHtml);
          }
        });

        // Fit bounds for fleet buses ONLY once on initial mount, preserving user's manual zoom
        if (waypoints.length < 2 && fleetBuses.length > 0 && !initialFitDoneRef.current && !userInteractedRef.current) {
          const fleetBounds = L.latLngBounds(fleetBuses.map((b) => [b.latitude, b.longitude]));
          if (stops.length > 0) {
            stops.forEach((s) => fleetBounds.extend([s.latitude, s.longitude]));
          }
          map.fitBounds(fleetBounds, { padding: [35, 35], maxZoom: 14 });
          initialFitDoneRef.current = true;
        }
      }

      if (focusedBusId && fleetMarkersMapRef.current.has(focusedBusId)) {
        if (lastFocusedBusIdRef.current !== focusedBusId) {
          lastFocusedBusIdRef.current = focusedBusId;
          const marker = fleetMarkersMapRef.current.get(focusedBusId);
          const currentZoom = map.getZoom();
          const targetZoom = Math.max(currentZoom, 15);
          map.setView(marker.getLatLng(), targetZoom, { animate: true });
          marker.openPopup();
        }
      } else if (!focusedBusId) {
        lastFocusedBusIdRef.current = undefined;
      }

      // Render Central University Campus Terminal Landmark (from database)
      if (showCampusLandmark && campusTerminalStop) {
        if (!campusMarkerGroupRef.current) {
          campusMarkerGroupRef.current = L.layerGroup().addTo(map);

          const campusIcon = L.divIcon({
            className: "custom-campus-landmark-icon",
            html: `
              <div class="flex items-center gap-2 px-3 py-1.5 bg-blue-950 text-white rounded-2xl shadow-2xl border-2 border-blue-400 font-bold text-xs select-none hover:scale-105 transition-transform cursor-pointer -translate-x-1/2 -translate-y-1/2 whitespace-nowrap ring-4 ring-blue-500/20">
                <span class="p-1 rounded-xl bg-blue-600 text-white shadow-xs">${universitySvg}</span>
                <div class="leading-tight text-left">
                  <div class="text-[11px] font-black text-white flex items-center gap-1">${campusTerminalStop.name}</div>
                  <div class="text-[9px] text-blue-300 font-semibold tracking-wide">${campusTerminalStop.landmark || "Central Terminal & Fleet Depot"}</div>
                </div>
              </div>
            `,
            iconSize: [210, 38],
            iconAnchor: [105, 19],
          });

          const campusMarker = L.marker([campusTerminalStop.latitude, campusTerminalStop.longitude], {
            icon: campusIcon,
            zIndexOffset: 850,
          }).addTo(campusMarkerGroupRef.current);

          campusMarker.bindPopup(`
            <div style="font-family: sans-serif; font-size: 12px; line-height: 1.45; min-width: 220px; padding: 2px;">
              <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 5px;">
                <span style="font-size: 18px;">🎓</span>
                <div>
                  <strong style="color: #1e1b4b; font-size: 13px;">${campusTerminalStop.name}</strong><br/>
                  <span style="color: #4f46e5; font-size: 11px; font-weight: 800;">${campusTerminalStop.code} • Central Transit Hub</span>
                </div>
              </div>
              <div style="color: #334155; font-size: 11px; border-top: 1px solid #e2e8f0; padding-top: 5px; margin-top: 5px;">
                <div><strong>Landmark:</strong> ${campusTerminalStop.landmark || "Main Gate"}</div>
                <div><strong>GPS:</strong> ${campusTerminalStop.latitude.toFixed(4)}° N, ${campusTerminalStop.longitude.toFixed(4)}° E</div>
                <div><strong>Geofence Radius:</strong> ${campusTerminalStop.geofenceRadiusMeters || 80}m</div>
                <div style="margin-top: 4px;">
                  <a
                    href="https://www.google.com/maps/search/?api=1&query=${campusTerminalStop.latitude},${campusTerminalStop.longitude}"
                    target="_blank"
                    rel="noopener noreferrer"
                    style="color: #2563eb; font-weight: 700; text-decoration: none; font-size: 11px;"
                  >
                    View in Google Maps ↗
                  </a>
                </div>
              </div>
            </div>
          `);

          // Soft indigo perimeter circle for the university campus zone
          L.circle([campusTerminalStop.latitude, campusTerminalStop.longitude], {
            radius: Math.max(campusTerminalStop.geofenceRadiusMeters || 80, 250),
            color: "#4338CA",
            weight: 2,
            dashArray: "6, 4",
            fillColor: "#6366F1",
            fillOpacity: 0.12,
          }).addTo(campusMarkerGroupRef.current);

          // Render ALL secondary campuses from campuses table (e.g. Dehradun, other branches)
          if (campuses && campuses.length > 1) {
            campuses.forEach((sc) => {
              // Skip the primary campus — already rendered above
              if (
                sc.id === campusTerminalStop.id ||
                sc.id === campusTerminalStop.campusId ||
                sc.code === campusTerminalStop.code ||
                sc.isPrimary
              ) return;
              if (!sc.latitude || !sc.longitude) return;

              const secondaryIcon = L.divIcon({
                className: "custom-secondary-campus-icon",
                html: `
                  <div class="flex items-center gap-2 px-3 py-1.5 bg-pink-900 text-white rounded-2xl shadow-xl border-2 border-pink-400 font-bold text-xs select-none hover:scale-105 transition-transform cursor-pointer -translate-x-1/2 -translate-y-1/2 whitespace-nowrap ring-4 ring-pink-500/20">
                    <span class="p-1 rounded-xl bg-pink-600 text-white shadow-xs">${universitySvg}</span>
                    <div class="leading-tight text-left">
                      <div class="text-[11px] font-black text-white">${sc.name}</div>
                      <div class="text-[9px] text-pink-300 font-semibold tracking-wide">${sc.code} \u2022 Branch Campus</div>
                    </div>
                  </div>
                `,
                iconSize: [200, 38],
                iconAnchor: [100, 19],
              });

              const secondaryMarker = L.marker([sc.latitude, sc.longitude], {
                icon: secondaryIcon,
                zIndexOffset: 800,
              }).addTo(campusMarkerGroupRef.current);

              secondaryMarker.bindPopup(`
                <div style="font-family: sans-serif; font-size: 12px; line-height: 1.45; min-width: 220px; padding: 2px;">
                  <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 5px;">
                    <span style="font-size: 18px;">🏛️</span>
                    <div>
                      <strong style="color: #2e1065; font-size: 13px;">${sc.name}</strong><br/>
                      <span style="color: #7c3aed; font-size: 11px; font-weight: 800;">${sc.code} \u2022 Branch Campus</span>
                    </div>
                  </div>
                  <div style="color: #334155; font-size: 11px; border-top: 1px solid #e2e8f0; padding-top: 5px; margin-top: 5px;">
                    ${sc.address ? `<div><strong>Address:</strong> ${sc.address}</div>` : ""}
                    ${sc.landmark ? `<div><strong>Landmark:</strong> ${sc.landmark}</div>` : ""}
                    <div><strong>GPS:</strong> ${sc.latitude.toFixed(4)}° N, ${sc.longitude.toFixed(4)}° E</div>
                    ${sc.geofenceRadiusMeters ? `<div><strong>Geofence:</strong> ${sc.geofenceRadiusMeters}m</div>` : ""}
                    <div style="margin-top: 4px;"><a href="https://www.google.com/maps/search/?api=1&query=${sc.latitude},${sc.longitude}" target="_blank" rel="noopener noreferrer" style="color: #7c3aed; font-weight: 700; text-decoration: none; font-size: 11px;">View in Google Maps ↗</a></div>
                  </div>
                </div>
              `);

              L.circle([sc.latitude, sc.longitude], {
                radius: Math.max(sc.geofenceRadiusMeters || 80, 250),
                color: "#7c3aed",
                weight: 2,
                dashArray: "6, 4",
                fillColor: "#a78bfa",
                fillOpacity: 0.10,
              }).addTo(campusMarkerGroupRef.current);
            });
          }
        }
      }

      // Render User Live Location Marker (Google Maps Style Pulsing Blue Dot)
      if (showUserLocation && userLocation) {
        const userIcon = L.divIcon({
          className: "custom-user-location-icon",
          html: `
            <div class="relative flex items-center justify-center w-8 h-8 select-none">
              <span class="animate-ping absolute inline-flex h-6 w-6 rounded-full bg-blue-500 opacity-60"></span>
              <div class="relative w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-xl ring-2 ring-blue-400 flex items-center justify-center">
                <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
              </div>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        if (!userMarkerRef.current) {
          userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], {
            icon: userIcon,
            zIndexOffset: 1600,
          }).addTo(map);

          userMarkerRef.current.bindPopup(`
            <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4;">
              <strong style="color: #1d4ed8; font-size: 13px; display: flex; align-items: center; gap: 4px;">📍 Your Live Location</strong>
              <div style="color: #64748b; font-size: 11px; margin-top: 2px;">Accurate within ±${Math.round(userLocation.accuracy)}m</div>
            </div>
          `);
        } else {
          userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
          userMarkerRef.current.setIcon(userIcon);
        }

        if (!userAccuracyCircleRef.current) {
          userAccuracyCircleRef.current = L.circle([userLocation.lat, userLocation.lng], {
            radius: Math.min(userLocation.accuracy, 250),
            color: "#3b82f6",
            weight: 1.5,
            fillColor: "#60a5fa",
            fillOpacity: 0.12,
          }).addTo(map);
        } else {
          userAccuracyCircleRef.current.setLatLng([userLocation.lat, userLocation.lng]);
          userAccuracyCircleRef.current.setRadius(Math.min(userLocation.accuracy, 250));
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [
    busLocation,
    busName,
    tripStatus,
    fleetBuses,
    focusedBusId,
    stops,
    routeCoordinates,
    activeStopIndex,
    shortestPathStopIds,
    selectedStopId,
    isExpressDirect,
    zoom,
    draftPinLocation,
    draftGeofenceRadius,
    interactiveMode,
    userLocation,
    showUserLocation,
    showCampusLandmark,
    campusTerminalStop,
    tileTheme,
  ]);

  return (
    <div
      className={`relative w-full rounded-3xl overflow-hidden shadow-inner border border-gray-200 dark:border-gray-800 z-0 flex flex-col ${
        height === "100%" ? "h-full min-h-[350px] flex-1" : ""
      }`}
      style={{
        height: height || "400px",
        minHeight: height === "100%" ? "350px" : height || "400px",
      }}
    >
      <div
        ref={mapContainerRef}
        className="w-full flex-1"
        style={{
          height: "100%",
          width: "100%",
          minHeight: height === "100%" ? "350px" : height || "400px",
        }}
      />

      {/* Floating Google Maps Style Controls: Locate Me & Center on Campus */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
        {showUserLocation && (
          <button
            onClick={handleLocateUser}
            type="button"
            title={userLocation ? "Your GPS Location is Active (Click to Re-center)" : "Locate My Position (GPS)"}
            aria-label="Locate me"
            className={`p-2.5 rounded-2xl shadow-xl border backdrop-blur-md transition-all flex items-center justify-center group ${
              userLocation
                ? "bg-blue-600 text-white border-blue-400 ring-2 ring-blue-300 hover:bg-blue-700"
                : "bg-white/95 dark:bg-gray-900/95 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-800 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            <Crosshair className={`w-4 h-4 ${isLocating ? "animate-spin text-yellow-400" : ""}`} />
          </button>
        )}

        {showCampusLandmark && campusTerminalStop && (
          <button
            onClick={handlePanToCampus}
            type="button"
            title={`Center on ${campusTerminalStop.name}`}
            aria-label="Center on Campus"
            className="p-2.5 rounded-2xl shadow-xl border bg-white/95 dark:bg-gray-900/95 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-800 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800 backdrop-blur-md transition-all flex items-center justify-center"
          >
            <Building2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Floating GPS Location Status Toast */}
      {locationNotice && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3.5 py-1.5 rounded-full bg-gray-900/90 text-white text-xs font-bold shadow-2xl border border-gray-700/80 backdrop-blur-md flex items-center gap-1.5 animate-in fade-in slide-in-from-top-2">
          <Navigation className="w-3.5 h-3.5 text-blue-400" />
          <span>{locationNotice}</span>
        </div>
      )}

      {/* Google Maps Style Navigation Legend in Bottom Left (Hidden in PIN_DROP mode) */}
      {interactiveMode !== "PIN_DROP" && (
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border border-gray-200/80 dark:border-gray-800/80 shadow-lg text-[10px] font-bold text-gray-700 dark:text-gray-300 select-none">
          <div className="flex items-center gap-1" title="Already traveled road path">
            <span className="w-3.5 h-1.5 rounded-full bg-gray-400 inline-block"></span>
            <span>Covered</span>
          </div>
          <span className="text-gray-300 dark:text-gray-700">•</span>
          <div className="flex items-center gap-1" title="Upcoming road path ahead">
            <span className="w-3.5 h-1.5 rounded-full bg-blue-500 inline-block shadow-xs shadow-blue-400"></span>
            <span>Ahead</span>
          </div>
          {campusTerminalStop && (
            <>
              <span className="text-gray-300 dark:text-gray-700">•</span>
              <div
                onClick={handlePanToCampus}
                className="flex items-center gap-1 text-blue-600 dark:text-blue-400 cursor-pointer hover:underline"
                title={`Pan to ${campusTerminalStop.name}`}
              >
                <span>🎓</span>
                <span>{campusTerminalStop.code}</span>
              </div>
            </>
          )}
          {userLocation && (
            <>
              <span className="text-gray-300 dark:text-gray-700">•</span>
              <div
                onClick={() => {
                  if (mapInstanceRef.current && userLocation) {
                    mapInstanceRef.current.setView([userLocation.lat, userLocation.lng], 15, { animate: true });
                  }
                }}
                className="flex items-center gap-1 text-blue-600 dark:text-blue-400 cursor-pointer hover:underline"
                title="Your Live GPS Location"
              >
                <span className="w-2 h-2 rounded-full bg-blue-600 border border-white inline-block"></span>
                <span>You</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Transient Pin Helper Pill - Shows for 1 second on touch/activation then auto-disappears */}
      {interactiveMode === "PIN_DROP" && showPinHint && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 dark:bg-zinc-900/95 text-white font-medium text-xs px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 border border-white/20 pointer-events-none transition-all duration-300 animate-in fade-in zoom-in-95">
          <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Click anywhere on map to drop pin</span>
        </div>
      )}

      {isExpressDirect && (
        <div className="absolute top-16 right-3 z-10 bg-green-500 text-gray-950 font-black text-[11px] px-3.5 py-1.5 rounded-full shadow-2xl flex items-center gap-1.5 border border-white/40 animate-pulse pointer-events-none">
          <Zap className="w-3.5 h-3.5 fill-current shrink-0" />
          <span>Direct Non-Stop to Campus</span>
        </div>
      )}
    </div>
  );
}
