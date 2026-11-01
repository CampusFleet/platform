"use client";

import React, { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { LiveBusLocation, Stop, FleetBusMarkerData, Campus } from "@/lib/types";
import { getCampusStopFromDatabase } from "./CampusFleetMap";
import { Crosshair, Building2, Navigation } from "lucide-react";

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
  onError?: (err: any) => void;
}

// Clean human-grade Google Maps Dark Theme (Pure Black / Deep Slate)
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

// Road snapping via OSRM with fallback
async function fetchRoadGeometry(coordinates: [number, number][]): Promise<[number, number][]> {
  if (coordinates.length < 2) return coordinates;

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
        if (data.routes?.[0]?.geometry?.coordinates) {
          return data.routes[0].geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
        }
      }
    } catch {}
  }
  return coordinates;
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
  activeStopIndex = 0,
  selectedStopId,
  isExpressDirect,
  height = "400px",
  zoom = 14,
  onMapClick,
  onStopClick,
  draftPinLocation,
  showUserLocation = true,
  showCampusLandmark = true,
  tileTheme = "GOOGLE_STREETS",
  onError,
}: GoogleTransitMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const overlaysRef = useRef<any[]>([]);
  const campusCircleRef = useRef<google.maps.Circle | null>(null);
  const userMarkerRef = useRef<any>(null);
  const userCircleRef = useRef<google.maps.Circle | null>(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);

  const resolvedApiKey = apiKey || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const campusTerminalStop = getCampusStopFromDatabase(stops, campuses, primaryCampus);

  // ── 1. Geolocation trigger ──
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

  // ── 2. Initialize Google Maps JS API with modern importLibrary ──
  useEffect(() => {
    if (!resolvedApiKey || !containerRef.current) {
      onError?.("No Google Maps API key provided");
      return;
    }

    let isMounted = true;

    // Listen for Google Auth Failure (e.g. wrong referer restriction)
    (window as any).gm_authFailure = () => {
      console.warn("Google Maps authentication failure (Referrer check or quota issue). Falling back.");
      if (isMounted) {
        onError?.("Google Maps authentication error");
      }
    };

    try {
      setOptions({
        key: resolvedApiKey,
        v: "weekly",
      });

      Promise.all([
        importLibrary("maps"),
        importLibrary("geometry"),
      ])
        .then(([mapsLib]) => {
          if (!isMounted || !containerRef.current) return;
          const { Map } = mapsLib as google.maps.MapsLibrary;

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

          map.addListener("click", (e: google.maps.MapMouseEvent) => {
            if (e.latLng && onMapClick) {
              onMapClick(Number(e.latLng.lat().toFixed(6)), Number(e.latLng.lng().toFixed(6)));
            }
          });

          mapRef.current = map;
          setMapLoaded(true);
        })
        .catch((err: any) => {
          console.warn("Failed to load Google Maps JS API:", err);
          if (isMounted) {
            onError?.(err);
          }
        });
    } catch (err: any) {
      console.warn("Failed to set Google Maps loader options:", err);
      onError?.(err);
    }

    return () => {
      isMounted = false;
    };
  }, [resolvedApiKey, tileTheme]);

  // ── 3. Render Route Polylines and Custom HTML Markers onto Google Map ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || typeof window === "undefined" || !window.google) return;

    let isMounted = true;

    // Clean previous overlays & polylines
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    if (campusCircleRef.current) {
      campusCircleRef.current.setMap(null);
      campusCircleRef.current = null;
    }

    const waypoints: [number, number][] =
      routeCoordinates.length >= 2
        ? routeCoordinates
        : (!fleetBuses || fleetBuses.length === 0) && stops.length >= 2
        ? stops.map((s) => [s.latitude, s.longitude])
        : [];

    async function drawMapFeatures() {
      if (waypoints.length >= 2) {
        const roadSnappedCoords = await fetchRoadGeometry(waypoints);
        if (!isMounted || !mapRef.current) return;

        let activeBusPos: [number, number] | null = null;
        let isCompletedTrip = tripStatus === "COMPLETED";

        if (busLocation && typeof busLocation.latitude === "number") {
          activeBusPos = [busLocation.latitude, busLocation.longitude];
        } else if (focusedBusId && fleetBuses) {
          const fb = fleetBuses.find((b) => b.busId === focusedBusId);
          if (fb) {
            activeBusPos = [fb.latitude, fb.longitude];
            if (fb.tripStatus === "COMPLETED" || fb.state === "CAMPUS_PARKED") isCompletedTrip = true;
          }
        }

        let completedPath: [number, number][] = [];
        let upcomingPath: [number, number][] = [];

        if (isCompletedTrip) {
          completedPath = roadSnappedCoords;
        } else if (!activeBusPos) {
          upcomingPath = roadSnappedCoords;
        } else {
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
            upcomingPath = roadSnappedCoords;
          } else if (splitIdx >= roadSnappedCoords.length - 1) {
            completedPath = roadSnappedCoords;
          } else {
            completedPath = [...roadSnappedCoords.slice(0, splitIdx + 1), activeBusPos];
            upcomingPath = [activeBusPos, ...roadSnappedCoords.slice(splitIdx + 1)];
          }
        }

        // Render Completed Path (Slate-500)
        if (completedPath.length >= 2) {
          const completedPolyline = new google.maps.Polyline({
            path: completedPath.map(([lat, lng]) => ({ lat, lng })),
            strokeColor: "#64748B",
            strokeOpacity: 0.85,
            strokeWeight: 5,
            map,
            zIndex: 10,
          });
          polylinesRef.current.push(completedPolyline);
        }

        // Render Upcoming Path (Google Navigation Blue with border)
        if (upcomingPath.length >= 2) {
          const upcomingBorder = new google.maps.Polyline({
            path: upcomingPath.map(([lat, lng]) => ({ lat, lng })),
            strokeColor: isExpressDirect ? "#065F46" : "#1D4ED8",
            strokeOpacity: 0.95,
            strokeWeight: 7,
            map,
            zIndex: 20,
          });
          const upcomingCore = new google.maps.Polyline({
            path: upcomingPath.map(([lat, lng]) => ({ lat, lng })),
            strokeColor: isExpressDirect ? "#10B981" : "#2563EB",
            strokeOpacity: 1.0,
            strokeWeight: 4.5,
            map,
            zIndex: 21,
          });
          polylinesRef.current.push(upcomingBorder, upcomingCore);
        }

        // Auto-fit bounds
        const bounds = new google.maps.LatLngBounds();
        roadSnappedCoords.forEach(([lat, lng]) => bounds.extend({ lat, lng }));
        if (activeBusPos) bounds.extend({ lat: activeBusPos[0], lng: activeBusPos[1] });
        if (mapRef.current) {
          mapRef.current.fitBounds(bounds, { top: 60, right: 40, bottom: 60, left: 40 });
        }
      }

      // Render Stop Station Markers using Google OverlayView for custom HTML
      class CustomHtmlOverlay extends google.maps.OverlayView {
        position: google.maps.LatLng;
        div: HTMLElement;

        constructor(pos: { lat: number; lng: number }, div: HTMLElement) {
          super();
          this.position = new google.maps.LatLng(pos.lat, pos.lng);
          this.div = div;
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

        onRemove() {
          if (this.div.parentNode) {
            this.div.parentNode.removeChild(this.div);
          }
        }
      }

      // Render Stops
      stops.forEach((stop, idx) => {
        const isSelected = selectedStopId && stop.id === selectedStopId;
        const isNext = idx === activeStopIndex;
        const isPassed = idx < activeStopIndex;

        const el = document.createElement("div");
        el.className = "absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer select-none transition-transform hover:scale-110";
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

        const overlay = new CustomHtmlOverlay({ lat: stop.latitude, lng: stop.longitude }, el);
        overlay.setMap(map);
        overlaysRef.current.push(overlay);
      });

      // Render Bus Live Vehicle Marker
      if (busLocation && typeof busLocation.latitude === "number") {
        const busEl = document.createElement("div");
        busEl.className = "absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer select-none transition-transform hover:scale-110";
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

        const busOverlay = new CustomHtmlOverlay({ lat: busLocation.latitude, lng: busLocation.longitude }, busEl);
        busOverlay.setMap(map);
        overlaysRef.current.push(busOverlay);
      }

      // Render Primary Campus Landmark & Geofence
      if (showCampusLandmark && campusTerminalStop) {
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

        const campusEl = document.createElement("div");
        campusEl.className = "absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer select-none";
        campusEl.style.zIndex = "150";
        campusEl.innerHTML = `
          <div class="px-3 py-1.5 rounded-2xl bg-indigo-900 text-white border-2 border-indigo-400 shadow-xl flex items-center gap-1.5 text-xs font-bold ring-4 ring-indigo-500/20">
            <span>🏛️</span>
            <span class="whitespace-nowrap">${campusTerminalStop.code || "Campus"}</span>
          </div>
        `;
        const campusOverlay = new CustomHtmlOverlay(
          { lat: campusTerminalStop.latitude, lng: campusTerminalStop.longitude },
          campusEl
        );
        campusOverlay.setMap(map);
        overlaysRef.current.push(campusOverlay);
      }
    }

    drawMapFeatures();

    return () => {
      isMounted = false;
    };
  }, [
    mapLoaded,
    busLocation,
    busName,
    tripStatus,
    fleetBuses,
    stops,
    routeCoordinates,
    activeStopIndex,
    selectedStopId,
    showCampusLandmark,
    campusTerminalStop,
  ]);

  // ── 4. Render User Location Dot ──
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
                : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-800 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
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
            className="p-2.5 rounded-2xl shadow-xl border bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-800 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all flex items-center justify-center"
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
        <div className="flex items-center gap-1" title="Already traveled road path">
          <span className="w-3.5 h-1.5 rounded-full bg-slate-400 inline-block"></span>
          <span>Covered</span>
        </div>
        <span className="text-zinc-300 dark:text-zinc-700">•</span>
        <div className="flex items-center gap-1" title="Upcoming road path ahead">
          <span className="w-3.5 h-1.5 rounded-full bg-blue-600 inline-block"></span>
          <span>Ahead</span>
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
