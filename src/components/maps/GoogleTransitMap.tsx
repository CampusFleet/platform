"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { LiveBusLocation, Stop, FleetBusMarkerData, Campus } from "@/lib/types";
import { getCampusStopFromDatabase } from "./CampusFleetMap";
import { Crosshair, Building2, Navigation } from "lucide-react";

export interface RouteMetrics {
  totalDistanceKm: number;
  totalDurationMins: number;
  sourceProvenance: "google_directions_api";
  isGoogleAuthoritative: true;
  isDegradedFallback: false;
  legs: {
    distanceKm: number;
    durationMins: number;
    distanceText: string;
    durationText: string;
  }[];
}

// In-Memory cache for Google Directions results (retains native LatLng and Bounds class prototypes)
const inMemoryGoogleDirectionsCache = new Map<string, google.maps.DirectionsResult>();

interface AuthoritativeGoogleDirectionsEnvelope {
  version: "4.0";
  provider: "google";
  sourceProvenance: "google_directions_api";
  isGoogleAuthoritative: true;
  isDegradedFallback: false;
  cachedAt: number;
  directionsResult: google.maps.DirectionsResult;
}

export interface GoogleTransitMapProps {
  apiKey?: string;
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
  onRouteMetricsCalculated?: (metrics: RouteMetrics) => void;
  onError?: (err: any) => void;
}

// Clean human-grade Google Maps Dark Theme (Pure Black / Slate)
const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#18181b" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#09090b" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#a1a1aa" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d4d4d8" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#71717a" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#14291e" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#27272a" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#18181b" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#a1a1aa" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#3f3f46" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#27272a" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#f4f4f5" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#27272a" }],
  },
  {
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [{ color: "#a1a1aa" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#091c33" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#38bdf8" }],
  },
];

// High-DPI Inline SVG Data URIs for Hardware-Accelerated Native Google Maps Markers
function createStopMarkerSvgUri(params: {
  index: number;
  state: "passed" | "next" | "upcoming" | "selected";
  isTerminal: boolean;
  label?: string;
}): string {
  const { index, state, isTerminal } = params;

  if (isTerminal) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
      <defs>
        <filter id="ts" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="3" flood-opacity="0.4"/>
        </filter>
      </defs>
      <circle cx="22" cy="22" r="19" fill="#4338CA" stroke="#C7D2FE" stroke-width="2.5" filter="url(#ts)"/>
      <path d="M14 27h16M16 27v-8M22 27v-8M28 27v-8M13 19l9-6 9 6H13z" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>`;
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg.trim());
  }

  if (state === "passed") {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="12" fill="#64748B" stroke="#CBD5E1" stroke-width="2"/>
      <path d="M11 16l3.5 3.5L21 12" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>`;
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg.trim());
  }

  if (state === "next" || state === "selected") {
    const color = state === "selected" ? "#059669" : "#2563EB";
    const ringColor = state === "selected" ? "#34D399" : "#93C5FD";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
      <defs>
        <filter id="ns" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2.5" flood-opacity="0.35"/>
        </filter>
      </defs>
      <circle cx="20" cy="20" r="18" fill="none" stroke="${ringColor}" stroke-width="2.5" opacity="0.85"/>
      <circle cx="20" cy="20" r="14" fill="${color}" stroke="#FFFFFF" stroke-width="2.5" filter="url(#ns)"/>
      <text x="20" y="24.5" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="13" fill="#FFFFFF">${index}</text>
    </svg>`;
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg.trim());
  }

  // Upcoming
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <defs>
      <filter id="us" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.2"/>
      </filter>
    </defs>
    <circle cx="16" cy="16" r="12" fill="#FFFFFF" stroke="#1D4ED8" stroke-width="2.5" filter="url(#us)"/>
    <text x="16" y="20.5" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="12" fill="#1E40AF">${index}</text>
  </svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg.trim());
}

function createBusMarkerSvgUri(busLabel: string, headingDeg: number = 0): string {
  const shortLabel = busLabel.replace(/bus\s*/i, "").trim() || "BUS";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
    <defs>
      <filter id="bs" x="-25%" y="-25%" width="150%" height="150%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-opacity="0.4"/>
      </filter>
    </defs>
    <circle cx="24" cy="24" r="21" fill="#1A73E8" fill-opacity="0.18"/>
    <circle cx="24" cy="24" r="16" fill="#1A73E8" stroke="#FFFFFF" stroke-width="2.5" filter="url(#bs)"/>
    ${headingDeg ? `
      <g transform="rotate(${headingDeg} 24 24)">
        <polygon points="24,9 28,14 20,14" fill="#FFFFFF"/>
      </g>
    ` : ""}
    <g transform="translate(16.5, 16.5) scale(0.62)">
      <path d="M4 16c0 .88.39 1.67 1 2.22V20a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z" fill="#FFFFFF"/>
    </g>
    <circle cx="36" cy="12" r="4.5" fill="#10B981" stroke="#FFFFFF" stroke-width="1.5"/>
  </svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg.trim());
}

export default function GoogleTransitMap({
  apiKey,
  busLocation,
  busName,
  tripStatus,
  fleetBuses,
  focusedBusId,
  stops = [],
  campuses = [],
  primaryCampus,
  routeCoordinates = [],
  walkingCoordinates = [],
  activeStopIndex = 0,
  selectedStopId,
  isExpressDirect,
  height = "400px",
  zoom = 14,
  onMapClick,
  onStopClick,
  draftPinLocation,
  draftGeofenceRadius = 80,
  interactiveMode = "VIEW",
  showUserLocation = true,
  showCampusLandmark = true,
  tileTheme = "GOOGLE_STREETS",
  onRouteMetricsCalculated,
  onError,
}: GoogleTransitMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);

  // Persistent Google Native Polylines: Traveled (Muted Slate) vs To Travel (Google Blue)
  const fullOverviewPathRef = useRef<google.maps.LatLng[]>([]);
  const traveledPolylineRef = useRef<google.maps.Polyline | null>(null);
  const upcomingPolylineRef = useRef<google.maps.Polyline | null>(null);
  const upcomingGlowPolylineRef = useRef<google.maps.Polyline | null>(null);
  const walkingPolylineRef = useRef<google.maps.Polyline | null>(null);

  // Native Hardware-Accelerated Markers
  const stopMarkersRef = useRef<google.maps.Marker[]>([]);
  const busMarkerRef = useRef<google.maps.Marker | null>(null);
  const campusCircleRef = useRef<google.maps.Circle | null>(null);
  const draftMarkerRef = useRef<google.maps.Marker | null>(null);
  const draftCircleRef = useRef<google.maps.Circle | null>(null);
  const userMarkerRef = useRef<any>(null);
  const userCircleRef = useRef<google.maps.Circle | null>(null);

  const cachedRouteKeyRef = useRef<string>("");
  const initialFitDoneRef = useRef(false);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);

  const resolvedApiKey = apiKey || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const campusTerminalStop = getCampusStopFromDatabase(stops, campuses, primaryCampus);

  // ── 1. Geolocation Trigger ──
  const handleLocateUser = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setLocationNotice("GPS Geolocation is not supported by your browser");
      setTimeout(() => setLocationNotice(null), 3000);
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const { latitude, longitude, accuracy } = pos.coords;
        const loc = { lat: latitude, lng: longitude, accuracy };
        setUserLocation(loc);

        if (mapRef.current) {
          mapRef.current.panTo({ lat: latitude, lng: longitude });
          mapRef.current.setZoom(Math.max(mapRef.current.getZoom() || 14, 15));
        }
        setLocationNotice(`GPS Acquired (±${Math.round(accuracy)}m)`);
        setTimeout(() => setLocationNotice(null), 3500);
      },
      () => {
        setIsLocating(false);
        setLocationNotice("Location permission denied or unavailable");
        setTimeout(() => setLocationNotice(null), 4000);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
    );
  };

  const handlePanToCampus = () => {
    if (mapRef.current && campusTerminalStop) {
      mapRef.current.panTo({ lat: campusTerminalStop.latitude, lng: campusTerminalStop.longitude });
      mapRef.current.setZoom(15);
    }
  };

  // ── 2. Initialize Google Maps JS API Engine ──
  useEffect(() => {
    if (!resolvedApiKey) {
      onError?.("No Google Maps API key provided");
      return;
    }
    if (!containerRef.current) {
      return;
    }

    let isMounted = true;

    (window as any).gm_authFailure = () => {
      console.warn("Google Maps authentication failure (Referrer check or quota issue). Falling back.");
      if (isMounted) onError?.("Google Maps authentication error");
    };

    try {
      setOptions({
        key: resolvedApiKey,
        v: "weekly",
      });

      Promise.all([
        importLibrary("maps"),
        importLibrary("routes"),
        importLibrary("geometry"),
      ])
        .then(([mapsLib, routesLib]) => {
          if (!isMounted || !containerRef.current) return;
          const { Map } = mapsLib as google.maps.MapsLibrary;
          const { DirectionsService, DirectionsRenderer } = routesLib as google.maps.RoutesLibrary;

          directionsServiceRef.current = new DirectionsService();

          const isDark = tileTheme === "CARTO_DARK" || (typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
          const defaultCenter = draftPinLocation
            ? { lat: draftPinLocation[0], lng: draftPinLocation[1] }
            : busLocation
              ? { lat: busLocation.latitude, lng: busLocation.longitude }
              : campusTerminalStop
                ? { lat: campusTerminalStop.latitude, lng: campusTerminalStop.longitude }
                : stops[0]
                  ? { lat: stops[0].latitude, lng: stops[0].longitude }
                  : { lat: 29.375015, lng: 79.529479 };

          const mapTypeId = tileTheme === "GOOGLE_HYBRID" ? "hybrid" : "roadmap";

          const map = new Map(containerRef.current, {
            center: defaultCenter,
            zoom: zoom,
            mapTypeId,
            disableDefaultUI: true,
            zoomControl: true,
            zoomControlOptions: {
              position: google.maps.ControlPosition.RIGHT_BOTTOM,
            },
            gestureHandling: "greedy",
            styles: isDark && tileTheme !== "GOOGLE_HYBRID" ? DARK_MAP_STYLES : [],
          });

          // Google's official native DirectionsRenderer (road curves from DirectionsService)
          const renderer = new DirectionsRenderer({
            map,
            suppressMarkers: true, // We draw our custom high-DPI station number badges & bus puck
            suppressPolylines: true, // We draw the dual traveled vs upcoming polyline with Google's overview_path
            preserveViewport: true, // Do not snap/jerk camera on live vehicle updates
          });
          directionsRendererRef.current = renderer;

          map.addListener("click", (e: google.maps.MapMouseEvent) => {
            if (e.latLng && onMapClick) {
              onMapClick(Number(e.latLng.lat().toFixed(6)), Number(e.latLng.lng().toFixed(6)));
            }
          });

          mapRef.current = map;
          setMapLoaded(true);

          // Trigger resize for mobile browsers
          setTimeout(() => {
            if (mapRef.current) {
              google.maps.event.trigger(mapRef.current, "resize");
            }
          }, 150);
        })
        .catch((err: any) => {
          console.warn("Failed to load Google Maps JS API:", err);
          if (isMounted) onError?.(err);
        });
    } catch (err: any) {
      console.warn("Failed to set Google Maps loader options:", err);
      onError?.(err);
    }

    return () => {
      isMounted = false;
      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
      }
      traveledPolylineRef.current?.setMap(null);
      upcomingPolylineRef.current?.setMap(null);
      upcomingGlowPolylineRef.current?.setMap(null);
      walkingPolylineRef.current?.setMap(null);
      busMarkerRef.current?.setMap(null);
      stopMarkersRef.current.forEach((m) => m.setMap(null));
      stopMarkersRef.current = [];
    };
  }, [resolvedApiKey, tileTheme]);

  // ── 3. ResizeObserver for Mobile Responsiveness (Ensures map tiles never disappear) ──
  useEffect(() => {
    if (!containerRef.current || !mapLoaded) return;

    const ro = new ResizeObserver(() => {
      if (mapRef.current) {
        google.maps.event.trigger(mapRef.current, "resize");
      }
    });

    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [mapLoaded]);

  // ── 3a. First-Mile Pedestrian Walking Path Layer ──
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    if (walkingPolylineRef.current) {
      walkingPolylineRef.current.setMap(null);
      walkingPolylineRef.current = null;
    }
    if (walkingCoordinates && walkingCoordinates.length >= 2) {
      const path = walkingCoordinates.map(([lat, lng]) => ({ lat, lng }));
      const lineSymbol = {
        path: "M 0,-1 0,1",
        strokeOpacity: 1,
        scale: 3,
        strokeColor: "#10B981",
      };
      walkingPolylineRef.current = new google.maps.Polyline({
        path,
        strokeOpacity: 0,
        icons: [
          {
            icon: lineSymbol,
            offset: "0",
            repeat: "14px",
          },
        ],
        map: mapRef.current,
        zIndex: 60,
      });
    }
  }, [walkingCoordinates, mapLoaded]);

  // ── 3b. Slices Google Maps authoritative overview_path into Traveled vs To Travel (Upcoming) ──
  const updateTraveledAndUpcoming = useCallback(
    (busPos?: { lat: number; lng: number } | null) => {
      const map = mapRef.current;
      const path = fullOverviewPathRef.current;
      if (!map || path.length === 0 || !window.google?.maps?.geometry) return;

      const isDark = tileTheme === "CARTO_DARK" || (typeof document !== "undefined" && document.documentElement.classList.contains("dark"));

      if (!upcomingGlowPolylineRef.current) {
        upcomingGlowPolylineRef.current = new google.maps.Polyline({
          map,
          strokeColor: isExpressDirect ? "#10B981" : "#3B82F6",
          strokeWeight: 10,
          strokeOpacity: 0.25,
          zIndex: 50,
        });
      }
      if (!upcomingPolylineRef.current) {
        upcomingPolylineRef.current = new google.maps.Polyline({
          map,
          strokeColor: isExpressDirect ? "#059669" : "#1A73E8", // Official Google Navigation Blue
          strokeWeight: 6,
          strokeOpacity: 1.0,
          zIndex: 60,
        });
      }
      if (!traveledPolylineRef.current) {
        traveledPolylineRef.current = new google.maps.Polyline({
          map,
          strokeColor: isDark ? "#64748B" : "#94A3B8", // Muted Transit Slate
          strokeWeight: 5,
          strokeOpacity: 0.85,
          zIndex: 55,
        });
      }

      // If no bus GPS position available yet, whole path is upcoming
      if (!busPos || typeof busPos.lat !== "number" || typeof busPos.lng !== "number") {
        traveledPolylineRef.current.setPath([]);
        upcomingPolylineRef.current.setPath(path);
        upcomingGlowPolylineRef.current.setPath(path);
        return;
      }

      const busLatLng = new google.maps.LatLng(busPos.lat, busPos.lng);

      // Find the closest point index on the authoritative Google road path
      let closestIdx = 0;
      let minDistance = Infinity;
      for (let i = 0; i < path.length; i++) {
        const dist = google.maps.geometry.spherical.computeDistanceBetween(path[i], busLatLng);
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = i;
        }
      }

      // Strictly road-following geometry: traveled and upcoming paths must ONLY contain points on the road network.
      // Never insert raw off-road GPS coordinates into the road polyline.
      let traveledPoints: google.maps.LatLng[] = [];
      let upcomingPoints: google.maps.LatLng[] = [];

      if (closestIdx === 0) {
        traveledPoints = [];
        upcomingPoints = path;
      } else if (closestIdx >= path.length - 1) {
        traveledPoints = path;
        upcomingPoints = [];
      } else {
        traveledPoints = path.slice(0, closestIdx + 1);
        upcomingPoints = path.slice(closestIdx);
      }

      traveledPolylineRef.current.setPath(traveledPoints);
      upcomingPolylineRef.current.setPath(upcomingPoints);
      upcomingGlowPolylineRef.current.setPath(upcomingPoints);
    },
    [isExpressDirect, tileTheme]
  );

  // ── 4. Google Maps Directions API with Intelligent Multi-Tier Caching (SessionStorage + In-Memory) ──
  useEffect(() => {
    const map = mapRef.current;
    const directionsService = directionsServiceRef.current;
    const directionsRenderer = directionsRendererRef.current;
    if (!map || !mapLoaded || !directionsService || !directionsRenderer) return;

    let isMounted = true;

    // Calculate corridor sequence
    const waypoints: [number, number][] =
      routeCoordinates.length >= 2
        ? routeCoordinates
        : (!fleetBuses || fleetBuses.length === 0) && stops.length >= 2
          ? stops.map((s) => [s.latitude, s.longitude])
          : [];

    if (waypoints.length < 2) return;

    const cacheKey = `cf_google_authoritative_directions_v4_${waypoints.map((w) => `${w[0].toFixed(5)},${w[1].toFixed(5)}`).join(";")}`;

    // Skip redundant network queries if route sequence has not changed
    if (cacheKey === cachedRouteKeyRef.current) return;

    function applyRouteResult(result: google.maps.DirectionsResult) {
      if (!isMounted || !directionsRenderer) return;
      directionsRenderer.setDirections(result);
      cachedRouteKeyRef.current = cacheKey;

      // Extract authoritative road curves and initialize Traveled vs Upcoming Polylines
      if (result.routes?.[0]?.overview_path) {
        fullOverviewPathRef.current = result.routes[0].overview_path;
        const currentBusPos =
          busLocation && typeof busLocation.latitude === "number"
            ? { lat: busLocation.latitude, lng: busLocation.longitude }
            : null;
        updateTraveledAndUpcoming(currentBusPos);
      }

      // Extract high-accuracy Google Maps transit road metrics
      if (result.routes?.[0]?.legs) {
        let totalDistMeters = 0;
        let totalDurSec = 0;
        const legs = result.routes[0].legs.map((leg) => {
          totalDistMeters += leg.distance?.value || 0;
          totalDurSec += leg.duration?.value || 0;
          return {
            distanceKm: Math.round(((leg.distance?.value || 0) / 1000) * 100) / 100,
            durationMins: Math.round(((leg.duration?.value || 0) / 60) * 10) / 10,
            distanceText: leg.distance?.text || "",
            durationText: leg.duration?.text || "",
          };
        });

        onRouteMetricsCalculated?.({
          totalDistanceKm: Math.round((totalDistMeters / 1000) * 100) / 100,
          totalDurationMins: Math.round((totalDurSec / 60) * 10) / 10,
          sourceProvenance: "google_directions_api",
          isGoogleAuthoritative: true,
          isDegradedFallback: false,
          legs,
        });
      }

      // Fit bounds ONCE on initial corridor load
      if (!initialFitDoneRef.current && mapRef.current && result.routes?.[0]?.bounds) {
        mapRef.current.fitBounds(result.routes[0].bounds, { top: 60, right: 40, bottom: 60, left: 40 });
        initialFitDoneRef.current = true;
      }
    }

    // 1. Check in-memory native cache first (zero latency, preserves LatLng class prototypes)
    const inMem = inMemoryGoogleDirectionsCache.get(cacheKey);
    if (inMem) {
      applyRouteResult(inMem);
      return;
    }

    // 2. Check client-side storage cache with strict security envelope validation
    try {
      const cachedRaw = typeof window !== "undefined" ? sessionStorage.getItem(cacheKey) : null;
      if (cachedRaw) {
        const envelope = JSON.parse(cachedRaw);
        if (
          envelope?.version === "4.0" &&
          envelope?.provider === "google" &&
          envelope?.sourceProvenance === "google_directions_api" &&
          envelope?.isGoogleAuthoritative === true &&
          envelope?.directionsResult?.routes?.length > 0
        ) {
          applyRouteResult(envelope.directionsResult);
          inMemoryGoogleDirectionsCache.set(cacheKey, envelope.directionsResult);
          return;
        } else {
          // Detected non-Google, degraded, or corrupted data: purge immediately
          sessionStorage.removeItem(cacheKey);
        }
      }
    } catch {
      try { sessionStorage.removeItem(cacheKey); } catch { }
    }

    // 3. Query Google Maps DirectionsService directly (official Google road curves)
    const origin = { lat: waypoints[0][0], lng: waypoints[0][1] };
    const destination = { lat: waypoints[waypoints.length - 1][0], lng: waypoints[waypoints.length - 1][1] };
    const intermediate = waypoints.slice(1, -1).slice(0, 23).map(([lat, lng]) => ({
      location: new google.maps.LatLng(lat, lng),
      stopover: true,
    }));

    directionsService.route(
      {
        origin,
        destination,
        waypoints: intermediate,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (!isMounted) return;
        if (status === google.maps.DirectionsStatus.OK && result) {
          inMemoryGoogleDirectionsCache.set(cacheKey, result);
          applyRouteResult(result);
          try {
            const envelope: AuthoritativeGoogleDirectionsEnvelope = {
              version: "4.0",
              provider: "google",
              sourceProvenance: "google_directions_api",
              isGoogleAuthoritative: true,
              isDegradedFallback: false,
              cachedAt: Date.now(),
              directionsResult: result,
            };
            sessionStorage.setItem(cacheKey, JSON.stringify(envelope));
          } catch { }
        } else {
          console.warn("[GoogleTransitMap] DirectionsService query returned non-OK status:", status);
          // Fallback to internal road directions API to keep path strictly on roads
          const coordsStr = waypoints.map((w) => `${w[0]},${w[1]}`).join(";");
          fetch(`/api/geo/directions?coords=${coordsStr}`)
            .then((res) => res.json())
            .then((data) => {
              if (data?.success && Array.isArray(data.coordinates) && data.coordinates.length >= 2 && isMounted) {
                const roadPath = data.coordinates.map(([lat, lng]: [number, number]) => new google.maps.LatLng(lat, lng));
                fullOverviewPathRef.current = roadPath;
                const currentBusPos =
                  busLocation && typeof busLocation.latitude === "number"
                    ? { lat: busLocation.latitude, lng: busLocation.longitude }
                    : null;
                updateTraveledAndUpcoming(currentBusPos);
              } else if (status !== google.maps.DirectionsStatus.ZERO_RESULTS) {
                onError?.(`Google Directions service error: ${status}`);
              }
            })
            .catch(() => {
              if (status !== google.maps.DirectionsStatus.ZERO_RESULTS) {
                onError?.(`Google Directions service error: ${status}`);
              }
            });
        }
      }
    );

    return () => {
      isMounted = false;
    };
  }, [mapLoaded, stops, routeCoordinates, onRouteMetricsCalculated, updateTraveledAndUpcoming, busLocation]);

  // ── 5. Render Native High-DPI Station Stop Markers Along Route ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || typeof window === "undefined" || !window.google) return;

    // Clean previous stop markers
    stopMarkersRef.current.forEach((m) => m.setMap(null));
    stopMarkersRef.current = [];

    const effectiveStopIndex =
      activeStopIndex !== undefined && activeStopIndex !== null
        ? activeStopIndex
        : busLocation?.currentStopId
        ? Math.max(0, stops.findIndex((s) => s.id === busLocation.currentStopId))
        : 0;

    stops.forEach((stop, idx) => {
      const isSelected = Boolean(selectedStopId && stop.id === selectedStopId);
      const isNext = idx === effectiveStopIndex;
      const isPassed = idx < effectiveStopIndex;
      const isTerminal = idx === stops.length - 1;

      const state: "passed" | "next" | "upcoming" | "selected" = isSelected
        ? "selected"
        : isNext
          ? "next"
          : isPassed
            ? "passed"
            : "upcoming";

      const iconUrl = createStopMarkerSvgUri({
        index: idx + 1,
        state,
        isTerminal,
        label: stop.code || stop.name,
      });

      const size = isTerminal ? 44 : isNext || isSelected ? 40 : 32;
      const anchorPoint = isTerminal ? 22 : isNext || isSelected ? 20 : 16;

      const marker = new google.maps.Marker({
        position: { lat: stop.latitude, lng: stop.longitude },
        map,
        icon: {
          url: iconUrl,
          scaledSize: new google.maps.Size(size, size),
          anchor: new google.maps.Point(anchorPoint, anchorPoint),
        },
        title: `${idx + 1}. ${stop.name} (${isPassed ? "Passed" : isNext ? "Next Stop" : isTerminal ? "Campus Terminal" : "Upcoming"})`,
        zIndex: isSelected ? 400 : isNext ? 350 : isTerminal ? 300 : 200,
      });

      marker.addListener("click", () => {
        onStopClick?.(stop);
      });

      stopMarkersRef.current.push(marker);
    });

    // Campus Terminal Landmark Geofence Ring
    if (showCampusLandmark && campusTerminalStop) {
      if (!campusCircleRef.current) {
        campusCircleRef.current = new google.maps.Circle({
          center: { lat: campusTerminalStop.latitude, lng: campusTerminalStop.longitude },
          radius: campusTerminalStop.geofenceRadiusMeters || 150,
          strokeColor: "#4F46E5",
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: "#6366F1",
          fillOpacity: 0.12,
          map,
        });
      } else {
        campusCircleRef.current.setCenter({ lat: campusTerminalStop.latitude, lng: campusTerminalStop.longitude });
        campusCircleRef.current.setRadius(campusTerminalStop.geofenceRadiusMeters || 150);
      }
    }
  }, [mapLoaded, stops, activeStopIndex, selectedStopId, showCampusLandmark, campusTerminalStop, onStopClick, busLocation?.currentStopId]);

  // ── 6. Live Bus Vehicle Marker & Dynamic Dual-Polyline Traveled/Upcoming Update ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !window.google) return;

    let activeBusPos: [number, number] | null = null;
    let heading = 0;
    if (busLocation && typeof busLocation.latitude === "number") {
      activeBusPos = [busLocation.latitude, busLocation.longitude];
      heading = busLocation.headingDeg || 0;
    } else if (focusedBusId && fleetBuses) {
      const fb = fleetBuses.find((b) => b.busId === focusedBusId);
      if (fb) {
        activeBusPos = [fb.latitude, fb.longitude];
        heading = (fb as any).headingDeg || 0;
      }
    }

    if (activeBusPos) {
      const posObj = { lat: activeBusPos[0], lng: activeBusPos[1] };
      const latLng = new google.maps.LatLng(posObj.lat, posObj.lng);
      const busSvgUri = createBusMarkerSvgUri(busName || "Bus", heading);

      if (!busMarkerRef.current) {
        busMarkerRef.current = new google.maps.Marker({
          position: latLng,
          map,
          icon: {
            url: busSvgUri,
            scaledSize: new google.maps.Size(48, 48),
            anchor: new google.maps.Point(24, 24),
          },
          title: `${busName || "Campus Bus"} (Live GPS)`,
          zIndex: 500,
        });
      } else {
        busMarkerRef.current.setPosition(latLng);
        busMarkerRef.current.setIcon({
          url: busSvgUri,
          scaledSize: new google.maps.Size(48, 48),
          anchor: new google.maps.Point(24, 24),
        });
      }

      // Smoothly update Traveled vs To Travel polylines with zero re-querying and zero flicker
      updateTraveledAndUpcoming(posObj);
    }
  }, [mapLoaded, busLocation, busName, tripStatus, focusedBusId, fleetBuses, updateTraveledAndUpcoming]);

  // ── 7. Draft Pin & Geofence (Admin Interactive Mode) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !window.google) return;

    if (draftPinLocation) {
      if (!draftCircleRef.current) {
        draftCircleRef.current = new google.maps.Circle({
          center: { lat: draftPinLocation[0], lng: draftPinLocation[1] },
          radius: draftGeofenceRadius || 80,
          strokeColor: "#E11D48",
          strokeOpacity: 0.9,
          strokeWeight: 2,
          fillColor: "#FECDD3",
          fillOpacity: 0.35,
          map,
        });
      } else {
        draftCircleRef.current.setCenter({ lat: draftPinLocation[0], lng: draftPinLocation[1] });
        draftCircleRef.current.setRadius(draftGeofenceRadius || 80);
      }

      if (!draftMarkerRef.current) {
        draftMarkerRef.current = new google.maps.Marker({
          position: { lat: draftPinLocation[0], lng: draftPinLocation[1] },
          map,
          title: "Draft Stop Location",
          zIndex: 600,
        });
      } else {
        draftMarkerRef.current.setPosition({ lat: draftPinLocation[0], lng: draftPinLocation[1] });
      }

      map.panTo({ lat: draftPinLocation[0], lng: draftPinLocation[1] });
    } else {
      if (draftCircleRef.current) {
        draftCircleRef.current.setMap(null);
        draftCircleRef.current = null;
      }
      if (draftMarkerRef.current) {
        draftMarkerRef.current.setMap(null);
        draftMarkerRef.current = null;
      }
    }
  }, [mapLoaded, draftPinLocation, draftGeofenceRadius]);

  // ── 8. Render User Location Dot ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !window.google || !userLocation) return;

    if (userCircleRef.current) userCircleRef.current.setMap(null);
    if (userMarkerRef.current) userMarkerRef.current.setMap(null);

    userCircleRef.current = new google.maps.Circle({
      center: { lat: userLocation.lat, lng: userLocation.lng },
      radius: userLocation.accuracy || 30,
      strokeColor: "#3B82F6",
      strokeOpacity: 0.5,
      strokeWeight: 1,
      fillColor: "#60A5FA",
      fillOpacity: 0.15,
      map,
    });

    const userMarker = new google.maps.Marker({
      position: { lat: userLocation.lat, lng: userLocation.lng },
      map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: "#2563EB",
        fillOpacity: 1,
        strokeColor: "#FFFFFF",
        strokeWeight: 2.5,
      },
      title: "Your GPS Location",
      zIndex: 900,
    });
    userMarkerRef.current = userMarker;
  }, [mapLoaded, userLocation]);

  return (
    <div
      className={`relative w-full rounded-3xl overflow-hidden shadow-inner border border-zinc-200 dark:border-zinc-800 z-0 flex flex-col ${height === "100%" ? "h-full min-h-[350px] flex-1" : ""
        }`}
      style={{
        height: height || "400px",
        minHeight: height === "100%" ? "350px" : height || "400px",
      }}
    >
      <div
        ref={containerRef}
        className="w-full flex-1"
        style={{
          height: "100%",
          width: "100%",
          minHeight: height === "100%" ? "350px" : height || "400px",
        }}
      />

      {/* Floating Google Controls: Locate Me & Center on Campus */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
        {showUserLocation && (
          <button
            onClick={handleLocateUser}
            type="button"
            title={userLocation ? "Your GPS Location is Active (Click to Re-center)" : "Locate My Position (GPS)"}
            aria-label="Locate me"
            className={`p-2.5 rounded-2xl shadow-xl border backdrop-blur-md transition-all flex items-center justify-center group ${userLocation
              ? "bg-blue-600 text-white border-blue-400 ring-2 ring-blue-300 hover:bg-blue-700"
              : "bg-white dark:bg-black text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-800 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              }`}
          >
            <Crosshair className={`w-4 h-4 ${isLocating ? "animate-spin text-amber-400" : ""}`} />
          </button>
        )}

        {showCampusLandmark && campusTerminalStop && (
          <button
            onClick={handlePanToCampus}
            type="button"
            title={`Center on ${campusTerminalStop.name}`}
            aria-label="Center on Campus"
            className="p-2.5 rounded-2xl shadow-xl border bg-white dark:bg-black text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-800 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-all flex items-center justify-center"
          >
            <Building2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Floating GPS Location Status Toast */}
      {locationNotice && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3.5 py-1.5 rounded-full bg-zinc-900/90 text-white text-xs font-bold shadow-2xl border border-zinc-700/80 backdrop-blur-md flex items-center gap-1.5 animate-in fade-in slide-in-from-top-2">
          <Navigation className="w-3.5 h-3.5 text-blue-400" />
          <span>{locationNotice}</span>
        </div>
      )}

      {/* Google Maps Transit Legend */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2.5 px-3 py-1.5 rounded-2xl bg-white/95 dark:bg-zinc-900/95 border border-zinc-200 dark:border-zinc-800 shadow-lg text-[10px] font-bold text-zinc-700 dark:text-zinc-300 select-none">
        <div className="flex items-center gap-1.5" title="Route segment already covered by the bus">
          <span className="w-3.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 inline-block"></span>
          <span>Traveled</span>
        </div>
        <span className="text-zinc-300 dark:text-zinc-700">•</span>
        <div className="flex items-center gap-1.5" title="Remaining route corridor to campus">
          <span className="w-3.5 h-1.5 rounded-full bg-blue-600 inline-block"></span>
          <span>To Campus</span>
        </div>
        {campusTerminalStop && (
          <>
            <span className="text-zinc-300 dark:text-zinc-700">•</span>
            <div
              onClick={handlePanToCampus}
              className="flex items-center gap-1 text-blue-600 dark:text-blue-400 cursor-pointer hover:underline"
              title={`Pan to ${campusTerminalStop.name}`}
            >
              <span>🏛️</span>
              <span>{campusTerminalStop.code}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
