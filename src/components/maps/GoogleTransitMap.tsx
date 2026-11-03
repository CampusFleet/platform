"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { Stop } from "@/lib/types";
import { getCampusStopFromDatabase } from "./CampusFleetMap";
import { GoogleTransitMapProps, AuthoritativeGoogleDirectionsEnvelope, RouteMetrics } from "./google/types";
import { DARK_MAP_STYLES } from "./google/mapStyles";
import {
  createStopMarkerSvgUri,
  createBusMarkerSvgUri,
  createHomePinMarkerSvgUri,
} from "./google/markerIcons";
import { MapOverlays } from "./google/MapOverlays";

export type { RouteMetrics, GoogleTransitMapProps };

// In-Memory cache for Google Directions results (preserves native LatLng and Bounds prototypes)
const inMemoryGoogleDirectionsCache = new Map<string, google.maps.DirectionsResult>();

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

  // Persistent Google Native Polylines
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

  const initialFitDoneRef = useRef(false);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);

  // Transient Pin Helper: Shows for exactly 1 second, then auto-disappears
  const [showPinHint, setShowPinHint] = useState(false);
  const pinHintTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isPinDrop = interactiveMode === "PIN_DROP";
  const resolvedApiKey = apiKey || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const campusTerminalStop = getCampusStopFromDatabase(stops, campuses, primaryCampus);

  // ── 1. Pin Helper Timer ──
  useEffect(() => {
    if (isPinDrop) {
      setShowPinHint(true);
      if (pinHintTimerRef.current) clearTimeout(pinHintTimerRef.current);
      pinHintTimerRef.current = setTimeout(() => {
        setShowPinHint(false);
      }, 1000); // 1-second auto-disappear
    } else {
      setShowPinHint(false);
    }
    return () => {
      if (pinHintTimerRef.current) clearTimeout(pinHintTimerRef.current);
    };
  }, [isPinDrop]);

  // ── 2. Geolocation Trigger ──
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

  // ── 3. Initialize Google Maps JS API Engine ──
  useEffect(() => {
    if (!resolvedApiKey) {
      onError?.("No Google Maps API key provided");
      return;
    }
    if (!containerRef.current) return;

    let isMounted = true;

    (window as any).gm_authFailure = () => {
      console.warn("Google Maps authentication failure. Falling back to Leaflet.");
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

          const defaultCenter = draftPinLocation
            ? { lat: draftPinLocation[0], lng: draftPinLocation[1] }
            : stops.length > 0
            ? { lat: stops[0].latitude, lng: stops[0].longitude }
            : { lat: 29.375015, lng: 79.529479 };

          const isDarkTheme =
            tileTheme === "CARTO_DARK" ||
            (tileTheme === "AUTO" && typeof document !== "undefined" && document.documentElement.classList.contains("dark"));

          const map = new mapsLib.Map(containerRef.current, {
            center: defaultCenter,
            zoom: zoom || 14,
            mapTypeId: tileTheme === "GOOGLE_HYBRID" ? google.maps.MapTypeId.HYBRID : google.maps.MapTypeId.ROADMAP,
            styles: isDarkTheme ? DARK_MAP_STYLES : [],
            disableDefaultUI: true,
            zoomControl: true,
            gestureHandling: "greedy",
            clickableIcons: false,
          });

          map.addListener("click", (e: google.maps.MapMouseEvent) => {
            if (pinHintTimerRef.current) clearTimeout(pinHintTimerRef.current);
            setShowPinHint(false);
            if (e.latLng && onMapClick) {
              onMapClick(Number(e.latLng.lat().toFixed(6)), Number(e.latLng.lng().toFixed(6)));
            }
          });

          mapRef.current = map;
          directionsServiceRef.current = new routesLib.DirectionsService();
          setMapLoaded(true);
        })
        .catch((err) => {
          if (isMounted) {
            console.warn("Failed to load Google Maps libraries:", err);
            onError?.(err);
          }
        });
    } catch (e) {
      onError?.(e);
    }

    return () => {
      isMounted = false;
    };
  }, [resolvedApiKey, onError, tileTheme, zoom]);

  // ── 4. Dynamic Traveled vs Upcoming Polyline Projection ──
  const updateTraveledAndUpcoming = useCallback(
    (currentBusPos: { lat: number; lng: number } | null) => {
      const map = mapRef.current;
      const fullPath = fullOverviewPathRef.current;
      if (!map || fullPath.length < 2 || !window.google?.maps?.geometry) return;

      let splitIdx = 0;
      if (currentBusPos) {
        let minDistance = Infinity;
        const busLatLng = new google.maps.LatLng(currentBusPos.lat, currentBusPos.lng);
        for (let i = 0; i < fullPath.length; i++) {
          const dist = google.maps.geometry.spherical.computeDistanceBetween(busLatLng, fullPath[i]);
          if (dist < minDistance) {
            minDistance = dist;
            splitIdx = i;
          }
        }
      }

      const isCompletedTrip = tripStatus === "COMPLETED";
      const actualSplit = isCompletedTrip ? fullPath.length - 1 : splitIdx;
      const traveledCoords = fullPath.slice(0, actualSplit + 1);
      const upcomingCoords = fullPath.slice(actualSplit);

      // Traveled Polyline (Subtle Slate)
      if (!traveledPolylineRef.current) {
        traveledPolylineRef.current = new google.maps.Polyline({
          path: traveledCoords,
          strokeColor: "#94A3B8",
          strokeOpacity: 0.85,
          strokeWeight: 4,
          zIndex: 10,
          map,
        });
      } else {
        traveledPolylineRef.current.setPath(traveledCoords);
        traveledPolylineRef.current.setMap(map);
      }

      // Upcoming Polyline (Vibrant Google Blue)
      if (!upcomingPolylineRef.current) {
        upcomingGlowPolylineRef.current = new google.maps.Polyline({
          path: upcomingCoords,
          strokeColor: "#60A5FA",
          strokeOpacity: 0.35,
          strokeWeight: 9,
          zIndex: 14,
          map,
        });
        upcomingPolylineRef.current = new google.maps.Polyline({
          path: upcomingCoords,
          strokeColor: "#1A73E8",
          strokeOpacity: 0.95,
          strokeWeight: 5,
          zIndex: 15,
          map,
        });
      } else {
        upcomingGlowPolylineRef.current?.setPath(upcomingCoords);
        upcomingGlowPolylineRef.current?.setMap(map);
        upcomingPolylineRef.current.setPath(upcomingCoords);
        upcomingPolylineRef.current.setMap(map);
      }
    },
    [tripStatus]
  );

  // ── 5. Directions Service Query (STRICT SECURITY ISOLATION: SKIPPED IN PIN_DROP MODE) ──
  useEffect(() => {
    const map = mapRef.current;
    const directionsService = directionsServiceRef.current;
    if (!map || !mapLoaded || !directionsService || typeof window === "undefined" || !window.google) return;

    // SECURITY: In PIN_DROP mode, NEVER fetch or draw multi-stop transit route curves to prevent route data leaks
    if (isPinDrop) {
      if (traveledPolylineRef.current) traveledPolylineRef.current.setMap(null);
      if (upcomingPolylineRef.current) upcomingPolylineRef.current.setMap(null);
      if (upcomingGlowPolylineRef.current) upcomingGlowPolylineRef.current.setMap(null);
      return;
    }

    if (stops.length < 2 && routeCoordinates.length < 2) {
      if (traveledPolylineRef.current) traveledPolylineRef.current.setMap(null);
      if (upcomingPolylineRef.current) upcomingPolylineRef.current.setMap(null);
      if (upcomingGlowPolylineRef.current) upcomingGlowPolylineRef.current.setMap(null);
      return;
    }

    let isMounted = true;
    const waypoints: [number, number][] =
      routeCoordinates.length >= 2
        ? routeCoordinates
        : stops.map((s) => [s.latitude, s.longitude]);

    if (waypoints.length < 2) return;

    const cacheKey = `cf_gdir_v4_${waypoints.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(";")}`;

    function applyRouteResult(result: google.maps.DirectionsResult) {
      if (!isMounted || !result.routes?.[0]?.overview_path) return;
      fullOverviewPathRef.current = result.routes[0].overview_path;

      const currentBusPos =
        busLocation && typeof busLocation.latitude === "number"
          ? { lat: busLocation.latitude, lng: busLocation.longitude }
          : null;
      updateTraveledAndUpcoming(currentBusPos);

      // Route metrics
      if (result.routes[0].legs) {
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

      if (!initialFitDoneRef.current && mapRef.current && result.routes?.[0]?.bounds) {
        mapRef.current.fitBounds(result.routes[0].bounds, { top: 60, right: 40, bottom: 60, left: 40 });
        initialFitDoneRef.current = true;
      }
    }

    const inMem = inMemoryGoogleDirectionsCache.get(cacheKey);
    if (inMem) {
      applyRouteResult(inMem);
      return;
    }

    try {
      const cachedRaw = typeof window !== "undefined" ? sessionStorage.getItem(cacheKey) : null;
      if (cachedRaw) {
        const envelope: AuthoritativeGoogleDirectionsEnvelope = JSON.parse(cachedRaw);
        if (envelope?.version === "4.0" && envelope?.directionsResult?.routes?.length > 0) {
          applyRouteResult(envelope.directionsResult);
          inMemoryGoogleDirectionsCache.set(cacheKey, envelope.directionsResult);
          return;
        }
      }
    } catch {}

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
            sessionStorage.setItem(
              cacheKey,
              JSON.stringify({
                version: "4.0",
                provider: "google",
                sourceProvenance: "google_directions_api",
                isGoogleAuthoritative: true,
                cachedAt: Date.now(),
                directionsResult: result,
              })
            );
          } catch {}
        }
      }
    );

    return () => {
      isMounted = false;
    };
  }, [mapLoaded, stops, routeCoordinates, isPinDrop, onRouteMetricsCalculated, updateTraveledAndUpcoming, busLocation]);

  // ── 6. First-Mile Walking Polyline ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !window.google) return;

    if (walkingPolylineRef.current) {
      walkingPolylineRef.current.setMap(null);
      walkingPolylineRef.current = null;
    }

    if (walkingCoordinates && walkingCoordinates.length >= 2) {
      const walkingPath = walkingCoordinates.map(([lat, lng]) => new google.maps.LatLng(lat, lng));
      walkingPolylineRef.current = new google.maps.Polyline({
        path: walkingPath,
        strokeColor: "#10B981",
        strokeOpacity: 0.9,
        strokeWeight: 4,
        zIndex: 12,
        map,
      });
    }
  }, [mapLoaded, walkingCoordinates]);

  // ── 7. Render Station Stop Markers (DATA LEAK GUARD: In PIN_DROP mode, only render assigned stop) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || typeof window === "undefined" || !window.google) return;

    stopMarkersRef.current.forEach((m) => m.setMap(null));
    stopMarkersRef.current = [];

    // DATA PRIVACY: In PIN_DROP mode, NEVER render all system stops across towns!
    // Only render the commuter's selected/allocated stop to prevent route data leaks.
    const stopsToRender = isPinDrop
      ? (selectedStopId ? stops.filter((s) => s.id === selectedStopId) : [])
      : stops;

    const effectiveStopIndex =
      activeStopIndex !== undefined && activeStopIndex !== null
        ? activeStopIndex
        : busLocation?.currentStopId
        ? Math.max(0, stops.findIndex((s) => s.id === busLocation.currentStopId))
        : 0;

    stopsToRender.forEach((stop, idx) => {
      const isSelected = Boolean(selectedStopId && stop.id === selectedStopId);
      const isNext = idx === effectiveStopIndex;
      const isPassed = idx < effectiveStopIndex;
      const isTerminal = idx === stopsToRender.length - 1 && !isPinDrop;

      const state: "passed" | "next" | "upcoming" | "selected" = isSelected
        ? "selected"
        : isNext
        ? "next"
        : isPassed
        ? "passed"
        : "upcoming";

      const iconUrl = createStopMarkerSvgUri({
        index: isPinDrop ? 1 : idx + 1,
        state,
        isTerminal,
      });

      const marker = new google.maps.Marker({
        position: { lat: stop.latitude, lng: stop.longitude },
        map,
        icon: {
          url: iconUrl,
          scaledSize: isTerminal ? new google.maps.Size(44, 44) : new google.maps.Size(34, 34),
          anchor: isTerminal ? new google.maps.Point(22, 22) : new google.maps.Point(17, 17),
        },
        title: `${stop.name} (${stop.code})`,
        zIndex: isSelected ? 400 : 200 + idx,
      });

      marker.addListener("click", () => {
        onStopClick?.(stop);
      });

      stopMarkersRef.current.push(marker);
    });
  }, [mapLoaded, stops, activeStopIndex, selectedStopId, isPinDrop, onStopClick, busLocation?.currentStopId]);

  // ── 8. Live Bus Vehicle Marker ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !window.google || isPinDrop) {
      if (busMarkerRef.current) {
        busMarkerRef.current.setMap(null);
        busMarkerRef.current = null;
      }
      return;
    }

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

      updateTraveledAndUpcoming(posObj);
    }
  }, [mapLoaded, busLocation, busName, tripStatus, focusedBusId, fleetBuses, isPinDrop, updateTraveledAndUpcoming]);

  // ── 9. Draft Home Location Pin (Student & Admin Pin-Drop Mode) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !window.google) return;

    if (draftPinLocation) {
      const homePinSvgUri = createHomePinMarkerSvgUri();

      if (!draftMarkerRef.current) {
        draftMarkerRef.current = new google.maps.Marker({
          position: { lat: draftPinLocation[0], lng: draftPinLocation[1] },
          map,
          icon: {
            url: homePinSvgUri,
            scaledSize: new google.maps.Size(44, 44),
            anchor: new google.maps.Point(22, 22),
          },
          title: "Your Selected Home Location",
          zIndex: 700,
        });
      } else {
        draftMarkerRef.current.setPosition({ lat: draftPinLocation[0], lng: draftPinLocation[1] });
      }

      // Geofence circle: only drawn in admin mode, never for student home pin
      if (draftGeofenceRadius && draftGeofenceRadius > 0 && !isPinDrop) {
        if (!draftCircleRef.current) {
          draftCircleRef.current = new google.maps.Circle({
            center: { lat: draftPinLocation[0], lng: draftPinLocation[1] },
            radius: draftGeofenceRadius,
            strokeColor: "#E11D48",
            strokeOpacity: 0.9,
            strokeWeight: 2,
            fillColor: "#FECDD3",
            fillOpacity: 0.35,
            map,
          });
        } else {
          draftCircleRef.current.setCenter({ lat: draftPinLocation[0], lng: draftPinLocation[1] });
        }
      } else if (draftCircleRef.current) {
        draftCircleRef.current.setMap(null);
        draftCircleRef.current = null;
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
  }, [mapLoaded, draftPinLocation, draftGeofenceRadius, isPinDrop]);

  // ── 10. User GPS Blue Dot Marker ──
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

    userMarkerRef.current = new google.maps.Marker({
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

      {/* Floating Controls, Transient 1s Pin Hint, and Isolated Legend */}
      <MapOverlays
        showUserLocation={showUserLocation}
        userLocation={userLocation}
        isLocating={isLocating}
        onLocateUser={handleLocateUser}
        showCampusLandmark={showCampusLandmark}
        campusTerminalStop={campusTerminalStop}
        onPanToCampus={handlePanToCampus}
        locationNotice={locationNotice}
        interactiveMode={interactiveMode}
        showPinHint={showPinHint}
        hasRouteLegend={stops.length >= 2}
      />
    </div>
  );
}
