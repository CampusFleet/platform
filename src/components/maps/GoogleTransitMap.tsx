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

  // Persistent Overlays & Markers
  const stopOverlaysRef = useRef<any[]>([]);
  const busOverlayRef = useRef<any>(null);
  const campusCircleRef = useRef<google.maps.Circle | null>(null);
  const campusOverlayRef = useRef<any>(null);
  const draftMarkerRef = useRef<any>(null);
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

          const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
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

          // Google's official native DirectionsRenderer (ZERO MATH, zero custom polylines, 100% flicker-free)
          const renderer = new DirectionsRenderer({
            map,
            suppressMarkers: true, // We draw our custom high-DPI station number badges & bus icon, Google draws the road!
            preserveViewport: true, // Do not snap/jerk camera on live vehicle updates
            polylineOptions: {
              strokeColor: isExpressDirect ? "#059669" : "#1A73E8", // Official Google Navigation Blue / Emerald
              strokeWeight: 6,
              strokeOpacity: 0.95,
            },
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

  // Custom HTML Overlay class for Stop Stations and Vehicle Markers
  const createHtmlOverlay = useCallback(
    (pos: { lat: number; lng: number }, div: HTMLElement, zIndex: number = 100) => {
      class CustomHtmlOverlay extends google.maps.OverlayView {
        position: google.maps.LatLng;
        div: HTMLElement;

        constructor(p: { lat: number; lng: number }, d: HTMLElement) {
          super();
          this.position = new google.maps.LatLng(p.lat, p.lng);
          this.div = d;
        }

        onAdd() {
          const panes = this.getPanes();
          panes?.overlayMouseTarget.appendChild(this.div);
        }

        draw() {
          const overlayProjection = this.getProjection();
          if (!overlayProjection) return;
          const point = overlayProjection.fromLatLngToDivPixel(this.position);
          if (point) {
            this.div.style.left = point.x + "px";
            this.div.style.top = point.y + "px";
          }
        }

        setPosition(p: { lat: number; lng: number }) {
          this.position = new google.maps.LatLng(p.lat, p.lng);
          this.draw();
        }

        onRemove() {
          if (this.div.parentNode) {
            this.div.parentNode.removeChild(this.div);
          }
        }
      }

      const overlay = new CustomHtmlOverlay(pos, div);
      overlay.setMap(mapRef.current);
      return overlay;
    },
    []
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
      try { sessionStorage.removeItem(cacheKey); } catch {}
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
          } catch {}
        } else {
          console.warn("[GoogleTransitMap] DirectionsService query returned non-OK status:", status);
          if (status !== google.maps.DirectionsStatus.ZERO_RESULTS) {
            onError?.(`Google Directions service error: ${status}`);
          }
        }
      }
    );

    return () => {
      isMounted = false;
    };
  }, [mapLoaded, stops, routeCoordinates, onRouteMetricsCalculated]);

  // ── 5. Render Custom HTML Station Stop Markers ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || typeof window === "undefined" || !window.google) return;

    // Clean previous stop markers
    stopOverlaysRef.current.forEach((o) => o.setMap(null));
    stopOverlaysRef.current = [];

    stops.forEach((stop, idx) => {
      const isSelected = selectedStopId && stop.id === selectedStopId;
      const isNext = idx === activeStopIndex;
      const isPassed = idx < activeStopIndex;

      const el = document.createElement("div");
      el.className =
        "absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer select-none transition-transform hover:scale-110";
      el.style.zIndex = isSelected ? "300" : isNext ? "250" : "100";

      let bgClass = "bg-blue-600 text-white border-white";
      if (isSelected) {
        bgClass = "bg-emerald-600 text-white border-white ring-4 ring-emerald-400/50";
      } else if (isNext) {
        bgClass = "bg-amber-500 text-white border-white ring-4 ring-amber-300/60";
      } else if (isPassed) {
        bgClass = "bg-zinc-400 dark:bg-zinc-700 text-zinc-100 border-zinc-200 dark:border-zinc-800";
      }

      el.innerHTML = `
        <div class="w-7 h-7 rounded-full flex items-center justify-center font-black text-xs shadow-md border-2 ${bgClass}">
          <span>${idx + 1}</span>
        </div>
      `;

      el.onclick = (e) => {
        e.stopPropagation();
        onStopClick?.(stop);
      };

      const overlay = createHtmlOverlay({ lat: stop.latitude, lng: stop.longitude }, el, isSelected ? 300 : 100);
      stopOverlaysRef.current.push(overlay);
    });

    // Campus Terminal Landmark
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
      }

      if (!campusOverlayRef.current) {
        const campusEl = document.createElement("div");
        campusEl.className = "absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer select-none";
        campusEl.style.zIndex = "150";
        campusEl.innerHTML = `
          <div class="px-3 py-1.5 rounded-2xl bg-indigo-900 text-white border-2 border-indigo-400 shadow-xl flex items-center gap-1.5 text-xs font-bold ring-4 ring-indigo-500/20">
            <span>🏛️</span>
            <span class="whitespace-nowrap">${campusTerminalStop.code || "Campus"}</span>
          </div>
        `;
        campusOverlayRef.current = createHtmlOverlay(
          { lat: campusTerminalStop.latitude, lng: campusTerminalStop.longitude },
          campusEl,
          150
        );
      }
    }
  }, [mapLoaded, stops, activeStopIndex, selectedStopId, showCampusLandmark, campusTerminalStop, createHtmlOverlay]);

  // ── 6. Live Bus Vehicle Marker (Updates Smoothly Without Redrawing Road Path -> ZERO FLICKER) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    let activeBusPos: [number, number] | null = null;
    if (busLocation && typeof busLocation.latitude === "number") {
      activeBusPos = [busLocation.latitude, busLocation.longitude];
    } else if (focusedBusId && fleetBuses) {
      const fb = fleetBuses.find((b) => b.busId === focusedBusId);
      if (fb) activeBusPos = [fb.latitude, fb.longitude];
    }

    if (activeBusPos) {
      if (!busOverlayRef.current) {
        const busEl = document.createElement("div");
        busEl.className =
          "absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer select-none transition-transform hover:scale-110";
        busEl.style.zIndex = "500";
        busEl.innerHTML = `
          <div class="relative flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-blue-600 text-white border-2 border-white shadow-xl ring-4 ring-blue-500/30">
            <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 6v6"></path><path d="M15 6v6"></path><path d="M2 12h19.6"></path>
              <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4C2.9 6 1.9 6.8 1.6 7.8L.2 12.8c-.1.4-.2.8-.2 1.2 0 .4.1.8.2 1.2.3 1.1.8 2.8.8 2.8h3"></path>
              <circle cx="7" cy="18" r="2" fill="currentColor"></circle><path d="M9 18h5"></path><circle cx="16" cy="18" r="2" fill="currentColor"></circle>
            </svg>
            <span class="font-bold text-xs whitespace-nowrap">${busName || "Bus"}</span>
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          </div>
        `;
        busOverlayRef.current = createHtmlOverlay({ lat: activeBusPos[0], lng: activeBusPos[1] }, busEl, 500);
      } else {
        busOverlayRef.current.setPosition({ lat: activeBusPos[0], lng: activeBusPos[1] });
      }
    }
  }, [mapLoaded, busLocation, busName, tripStatus, focusedBusId, fleetBuses, createHtmlOverlay]);

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
        const draftEl = document.createElement("div");
        draftEl.className = "absolute -translate-x-1/2 -translate-y-full cursor-pointer select-none";
        draftEl.style.zIndex = "600";
        draftEl.innerHTML = `
          <div class="w-8 h-8 rounded-full bg-red-600 border-2 border-white shadow-2xl flex items-center justify-center text-white text-xs font-black animate-bounce ring-4 ring-red-400/50">
            📍
          </div>
        `;
        draftMarkerRef.current = createHtmlOverlay({ lat: draftPinLocation[0], lng: draftPinLocation[1] }, draftEl, 600);
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
  }, [mapLoaded, draftPinLocation, draftGeofenceRadius, createHtmlOverlay]);

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
      className={`relative w-full rounded-3xl overflow-hidden shadow-inner border border-zinc-200 dark:border-zinc-800 z-0 flex flex-col ${
        height === "100%" ? "h-full min-h-[350px] flex-1" : ""
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
            className={`p-2.5 rounded-2xl shadow-xl border backdrop-blur-md transition-all flex items-center justify-center group ${
              userLocation
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
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-white/95 dark:bg-zinc-900/95 border border-zinc-200 dark:border-zinc-800 shadow-lg text-[10px] font-bold text-zinc-700 dark:text-zinc-300 select-none">
        <div className="flex items-center gap-1" title="Google Maps Official Navigation Corridor">
          <span className="w-3.5 h-1.5 rounded-full bg-blue-600 inline-block"></span>
          <span>Google Transit Corridor</span>
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
