"use client";

import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import Link from "next/link";
import {
  Crosshair,
  Footprints,
  Route as RouteIcon,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Radio,
  ArrowRight,
  ExternalLink,
  BusFront,
  Navigation,
  X,
} from "lucide-react";
import { Stop, Route } from "@/lib/types";
import { CommuterCorridorController } from "@/lib/maps/CommuterCorridorController";

export interface CommuterCorridorMapHandle {
  recenterOnBus: () => void;
  recenterOnGps: () => void;
  recenterOnHome: () => void;
  recenterOnStop: (stop?: Stop | null) => void;
  recenterOnCoords: (coords: { latitude: number; longitude: number } | null, zoom?: number) => void;
  fitCorridorBounds: () => void;
  fitWalkingBounds: () => void;
  setTileTheme: (theme: "GOOGLE_STREETS" | "GOOGLE_HYBRID" | "CARTO_DARK") => void;
  invalidateSize: () => void;
}

export interface CommuterCorridorMapProps {
  homeCoords?: { latitude: number; longitude: number } | null;
  homeAddress?: string | null;
  assignedStop?: Stop | null;
  assignedRoute?: Route | null;
  allStops?: Stop[];
  walkingDistanceMeters?: number;
  walkingTimeMins?: number;
  busLocation?: any;
  busName?: string;
  isTelematicsLive?: boolean;
  deviceGpsCoords?: { latitude: number; longitude: number } | null;
  radarHref?: string;
  height?: string;
  className?: string;
  zoom?: number;
  tileTheme?: "GOOGLE_STREETS" | "GOOGLE_HYBRID" | "CARTO_DARK";
  hideInlineControls?: boolean;
  onStopClick?: (stop: Stop) => void;
}

/**
 * Calculates initial geographic bearing from point A to point B in degrees (0 - 360)
 */
function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const CommuterCorridorMap = forwardRef<CommuterCorridorMapHandle, CommuterCorridorMapProps>(function CommuterCorridorMap({
  homeCoords,
  homeAddress,
  assignedStop,
  assignedRoute,
  allStops = [],
  walkingDistanceMeters,
  walkingTimeMins,
  busLocation,
  busName = "Campus Shuttle",
  isTelematicsLive = false,
  deviceGpsCoords,
  radarHref,
  height = "360px",
  className = "",
  zoom = 15,
  tileTheme = "GOOGLE_STREETS",
  hideInlineControls = false,
  onStopClick,
}: CommuterCorridorMapProps, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<CommuterCorridorController | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [userHeading, setUserHeading] = useState<number>(0);
  const [liveUserGps, setLiveUserGps] = useState<{ latitude: number; longitude: number } | null>(
    deviceGpsCoords || null
  );

  // Fallback initial center coordinates
  const initLat =
    homeCoords?.latitude && !isNaN(homeCoords.latitude)
      ? homeCoords.latitude
      : assignedStop?.latitude && !isNaN(assignedStop.latitude)
      ? assignedStop.latitude
      : 29.220936;

  const initLng =
    homeCoords?.longitude && !isNaN(homeCoords.longitude)
      ? homeCoords.longitude
      : assignedStop?.longitude && !isNaN(assignedStop.longitude)
      ? assignedStop.longitude
      : 79.514496;

  // Initialize Controller
  useEffect(() => {
    if (!containerRef.current || controllerRef.current) return;

    const controller = new CommuterCorridorController({
      zoom,
      tileTheme,
      onStopClick,
    });

    controller
      .initialize(containerRef.current, { latitude: initLat, longitude: initLng })
      .then(() => {
        setMapReady(true);
        if (assignedRoute) {
          controller.setAssignedRoute(assignedRoute, allStops);
        }
        if (assignedStop) {
          controller.setPickupStop(assignedStop, walkingDistanceMeters, walkingTimeMins);
        }
        if (busLocation) {
          controller.setLiveBusLocation(busLocation, busName);
        }
      })
      .catch(console.error);

    controllerRef.current = controller;

    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [zoom]);

  // Expose Imperative Methods to Parents (e.g. FullScreenLiveRadarView)
  useImperativeHandle(
    ref,
    () => ({
      recenterOnBus: () => controllerRef.current?.recenterOnBus(),
      recenterOnGps: () => controllerRef.current?.recenterOnGps(),
      recenterOnHome: () => controllerRef.current?.recenterOnHome(),
      recenterOnStop: (stop?: Stop | null) => controllerRef.current?.recenterOnStop(stop),
      recenterOnCoords: (coords, z) => controllerRef.current?.recenterOnCoords(coords, z),
      fitCorridorBounds: () => controllerRef.current?.fitCorridorBounds(),
      fitWalkingBounds: () => controllerRef.current?.fitWalkingBounds(),
      setTileTheme: (theme) => controllerRef.current?.setTileTheme(theme),
      invalidateSize: () => controllerRef.current?.invalidateSize(),
    }),
    []
  );

  // Sync Tile Theme
  useEffect(() => {
    if (!controllerRef.current || !mapReady || !tileTheme) return;
    controllerRef.current.setTileTheme(tileTheme);
  }, [tileTheme, mapReady]);

  // Sync Home Location
  useEffect(() => {
    if (!controllerRef.current || !mapReady) return;
    if (homeCoords && !isNaN(homeCoords.latitude) && !isNaN(homeCoords.longitude)) {
      controllerRef.current.setHomeLocation(homeCoords);
    }
  }, [homeCoords?.latitude, homeCoords?.longitude, mapReady]);

  // Sync Assigned Pickup Stop & Pedestrian Walking Path
  useEffect(() => {
    if (!controllerRef.current || !mapReady) return;
    controllerRef.current.setPickupStop(assignedStop ?? null, walkingDistanceMeters, walkingTimeMins);
  }, [assignedStop?.id, assignedStop?.latitude, assignedStop?.longitude, walkingDistanceMeters, walkingTimeMins, mapReady]);

  // Sync Assigned Transit Route Corridor
  useEffect(() => {
    if (!controllerRef.current || !mapReady) return;
    controllerRef.current.setAssignedRoute(assignedRoute ?? null, allStops);
  }, [assignedRoute?.id, allStops.length, mapReady]);

  // Sync Live Bus Location
  useEffect(() => {
    if (!controllerRef.current || !mapReady) return;
    controllerRef.current.setLiveBusLocation(busLocation, busName);
  }, [busLocation?.latitude, busLocation?.longitude, busLocation?.speedKmh, busLocation?.speed, busLocation?.headingDeg, busName, mapReady]);

  // ── 1. Live Geolocation Movement & Heading Watcher ──
  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setLiveUserGps({ latitude: lat, longitude: lng });

        // If device is in motion, GPS heading is authentic and accurate
        if (pos.coords.heading !== null && !isNaN(pos.coords.heading) && (pos.coords.speed || 0) > 0.4) {
          setUserHeading(pos.coords.heading);
        }
      },
      (err) => {
        console.warn("[CommuterCorridorMap] GPS watch:", err);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // ── 2. Live Magnetometer & Compass Device Orientation (Heading) ──
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOrientation = (e: any) => {
      let heading: number | null = null;
      if (e.webkitCompassHeading !== undefined && e.webkitCompassHeading !== null) {
        // iOS Safari Native Compass
        heading = e.webkitCompassHeading;
      } else if (e.alpha !== null && e.alpha !== undefined) {
        // Android Chrome Standard
        heading = (360 - e.alpha) % 360;
      }

      if (heading !== null && !isNaN(heading)) {
        setUserHeading(heading);
      }
    };

    const hasAbsolute = "ondeviceorientationabsolute" in window;
    if (hasAbsolute) {
      window.addEventListener("deviceorientationabsolute" as any, handleOrientation, true);
    } else {
      window.addEventListener("deviceorientation", handleOrientation, true);
    }

    return () => {
      window.removeEventListener("deviceorientationabsolute" as any, handleOrientation, true);
      window.removeEventListener("deviceorientation", handleOrientation, true);
    };
  }, []);

  // ── 3. Initial Facing Fallback: Point down the street toward the Assigned Boarding Stop ──
  useEffect(() => {
    if (userHeading === 0 && assignedStop) {
      const uLat = liveUserGps?.latitude || deviceGpsCoords?.latitude || homeCoords?.latitude;
      const uLng = liveUserGps?.longitude || deviceGpsCoords?.longitude || homeCoords?.longitude;
      if (uLat && uLng && assignedStop.latitude && assignedStop.longitude) {
        const initialBearing = calculateBearing(uLat, uLng, assignedStop.latitude, assignedStop.longitude);
        setUserHeading(initialBearing);
      }
    }
  }, [
    liveUserGps?.latitude,
    liveUserGps?.longitude,
    deviceGpsCoords?.latitude,
    deviceGpsCoords?.longitude,
    homeCoords?.latitude,
    homeCoords?.longitude,
    assignedStop?.id,
  ]);

  // ── 4. Sync Live User Navigation Arrow and Heading to Controller ──
  useEffect(() => {
    if (!controllerRef.current || !mapReady) return;
    const effectiveGps = liveUserGps || deviceGpsCoords || null;
    controllerRef.current.setDeviceGps(effectiveGps, userHeading);
  }, [
    liveUserGps?.latitude,
    liveUserGps?.longitude,
    deviceGpsCoords?.latitude,
    deviceGpsCoords?.longitude,
    userHeading,
    mapReady,
  ]);

  // Fullscreen toggle handler
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => {
      const next = !prev;
      setTimeout(() => {
        if (controllerRef.current) {
          controllerRef.current.invalidateSize();
          controllerRef.current.fitWalkingBounds();
        }
      }, 120);
      return next;
    });
  }, []);

  // Exit fullscreen on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
        setTimeout(() => {
          controllerRef.current?.invalidateSize();
        }, 120);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  // Camera Actions
  const handleRecenterLocation = useCallback(() => {
    if (liveUserGps || deviceGpsCoords) {
      controllerRef.current?.recenterOnGps();
    } else {
      controllerRef.current?.recenterOnHome();
    }
  }, [liveUserGps, deviceGpsCoords]);

  const handleFitWalkView = useCallback(() => {
    controllerRef.current?.fitWalkingBounds();
  }, []);

  const handleFocusBus = useCallback(() => {
    controllerRef.current?.recenterOnBus();
  }, []);

  const handleFitCorridor = useCallback(() => {
    controllerRef.current?.fitCorridorBounds();
  }, []);

  const effectiveWalkDist = walkingDistanceMeters ?? 390;
  const effectiveWalkMins = walkingTimeMins ?? Math.max(1, Math.round(effectiveWalkDist / 80));

  // External Google Maps Walking Directions URL
  const directionsUrl =
    homeCoords && assignedStop
      ? `https://www.google.com/maps/dir/?api=1&origin=${homeCoords.latitude},${homeCoords.longitude}&destination=${assignedStop.latitude},${assignedStop.longitude}&travelmode=walking`
      : null;

  return (
    <div
      className={
        isFullscreen
          ? "fixed inset-0 z-[9999] w-screen h-screen bg-zinc-950 flex flex-col select-none animate-in fade-in duration-200"
          : `relative w-full rounded-2xl overflow-hidden border border-zinc-200/90 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 shadow-sm select-none ${className}`
      }
      style={{ height: isFullscreen ? "100dvh" : height }}
    >
      {/* Map DOM Element */}
      <div ref={containerRef} className="w-full h-full z-0" />

      {/* Fullscreen Floating Header */}
      {isFullscreen && (
        <div className="absolute top-0 inset-x-0 z-20 bg-zinc-900/90 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2 text-white">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <div>
              <p className="text-xs font-bold leading-tight">Live Transit Corridor & First-Mile Map</p>
              <p className="text-[10px] text-zinc-400">
                {assignedStop?.name ? `Boarding at ${assignedStop.name}` : "Commuter Transit Overview"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Done</span>
          </button>
        </div>
      )}

      {/* ─── Inline Overlays (Hidden when embedded in dedicated FullScreenLiveRadarView) ─── */}
      {!hideInlineControls && (
        <>
          {/* ─── 1. Top-Left Callouts: Route & Live Status Badges ─── */}
          <div
            className={`absolute left-3 z-10 pointer-events-none flex flex-col gap-1.5 max-w-[calc(100%-120px)] sm:max-w-md ${
              isFullscreen ? "top-16" : "top-3"
            }`}
          >
            {assignedRoute && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-900/95 dark:bg-blue-950/95 backdrop-blur-md text-white text-[11px] font-bold shadow-md border border-blue-400/40 w-fit pointer-events-auto">
                <RouteIcon className="w-3.5 h-3.5 text-blue-300 shrink-0" />
                <span className="truncate">Route: {assignedRoute.name}</span>
              </div>
            )}

            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/90 dark:bg-zinc-900/90 backdrop-blur-md text-white text-xs font-semibold shadow-md border border-white/10 w-fit pointer-events-auto">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isTelematicsLive ? "bg-emerald-400 animate-pulse" : "bg-blue-400"
                }`}
              />
              <span className="text-[11px] font-bold">
                {isTelematicsLive ? "Live GPS Connected" : "Scheduled Dispatch"}
              </span>
            </div>
          </div>

          {/* ─── 2. Top-Right Radar Shortcut (if radarHref provided) ─── */}
          {radarHref && !isFullscreen && (
            <div className="absolute top-3 right-14 z-10">
              <Link
                href={radarHref}
                className="px-3 py-1.5 rounded-xl bg-indigo-600/95 hover:bg-indigo-700 active:scale-95 text-white text-[11px] font-bold backdrop-blur-md shadow-lg border border-white/20 flex items-center gap-1.5 transition-all group cursor-pointer"
                title="Launch Full-Screen Live Radar"
              >
                <Radio className="w-3.5 h-3.5 text-cyan-300 animate-pulse" />
                <span>Full Radar</span>
                <ArrowRight className="w-3 h-3 opacity-70 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          )}

          {/* ─── 3. Right-Side Map Controls ─── */}
          <div
            className={`absolute right-3 z-10 flex flex-col gap-1.5 shadow-md ${
              isFullscreen ? "top-16" : "top-3"
            }`}
          >
            <button
              type="button"
              onClick={handleRecenterLocation}
              title="Recenter on My Location / Home"
              className="w-9 h-9 rounded-xl bg-white/95 dark:bg-zinc-800/95 backdrop-blur-sm border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-700 flex items-center justify-center transition-transform active:scale-90 shadow-sm cursor-pointer touch-manipulation"
            >
              <Crosshair className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </button>

            <button
              type="button"
              onClick={handleFitWalkView}
              title="Fit Walking Path in View"
              className="w-9 h-9 rounded-xl bg-white/95 dark:bg-zinc-800/95 backdrop-blur-sm border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-700 flex items-center justify-center transition-transform active:scale-90 shadow-sm cursor-pointer touch-manipulation"
            >
              <Footprints className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </button>

            {busLocation && (
              <button
                type="button"
                onClick={handleFocusBus}
                title="Focus on Live Bus"
                className="w-9 h-9 rounded-xl bg-white/95 dark:bg-zinc-800/95 backdrop-blur-sm border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-700 flex items-center justify-center transition-transform active:scale-90 shadow-sm cursor-pointer touch-manipulation"
              >
                <BusFront className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </button>
            )}

            <button
              type="button"
              onClick={handleFitCorridor}
              title="View Entire Corridor"
              className="w-9 h-9 rounded-xl bg-white/95 dark:bg-zinc-800/95 backdrop-blur-sm border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-700 flex items-center justify-center transition-transform active:scale-90 shadow-sm cursor-pointer touch-manipulation"
            >
              <RouteIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit Fullscreen" : "Expand Fullscreen Map"}
              className="w-9 h-9 rounded-xl bg-white/95 dark:bg-zinc-800/95 backdrop-blur-sm border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-700 flex items-center justify-center transition-transform active:scale-90 shadow-sm cursor-pointer touch-manipulation"
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Maximize2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              )}
            </button>

            <div className="flex flex-col rounded-xl bg-white/95 dark:bg-zinc-800/95 backdrop-blur-sm border border-gray-200 dark:border-zinc-700 overflow-hidden divide-y divide-gray-100 dark:divide-zinc-700 shadow-sm mt-0.5">
              <button
                type="button"
                onClick={() => controllerRef.current?.zoomIn()}
                title="Zoom In"
                className="w-9 h-7 flex items-center justify-center text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-700 text-xs cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => controllerRef.current?.zoomOut()}
                title="Zoom Out"
                className="w-9 h-7 flex items-center justify-center text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-700 text-xs cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* ─── 4. Bottom Assigned Stop & Walking Path Pill Card (Direct from Settings) ─── */}
          {assignedStop && (
            <div className="absolute bottom-3 left-3 right-3 sm:right-auto z-10 pointer-events-none">
              <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-gray-200 dark:border-zinc-700 shadow-xl text-gray-800 dark:text-white pointer-events-auto max-w-sm sm:max-w-md">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-inner">
                  <Footprints className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0 pr-2">
                  <div className="text-[10px] uppercase font-extrabold text-emerald-600 dark:text-emerald-400 tracking-wider flex items-center gap-1.5">
                    <span>Assigned Boarding Stop</span>
                  </div>
                  <div className="text-xs font-bold text-gray-900 dark:text-white truncate">
                    {assignedStop.name}
                  </div>
                </div>
                <div className="ml-auto pl-2 border-l border-gray-200 dark:border-zinc-800 text-right shrink-0 flex items-center gap-2">
                  <div>
                    <div className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                      {effectiveWalkDist}m
                    </div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                      ~{effectiveWalkMins} min walk
                    </div>
                  </div>
                  {directionsUrl && (
                    <a
                      href={directionsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center transition-colors cursor-pointer"
                      title="Open Walking Navigation in Google Maps"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Global Tooltip & Node Styles */}
      <style jsx global>{`
        .custom-walking-tooltip {
          background: rgba(15, 23, 42, 0.94) !important;
          color: #fff !important;
          border: 1px solid rgba(16, 185, 129, 0.5) !important;
          border-radius: 9999px !important;
          padding: 3px 10px !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3) !important;
          letter-spacing: 0.01em;
        }
        .custom-walking-tooltip::before {
          display: none !important;
        }
        .custom-route-stop-tooltip {
          background: rgba(15, 23, 42, 0.9) !important;
          color: #e2e8f0 !important;
          border: 1px solid rgba(59, 130, 246, 0.4) !important;
          border-radius: 6px !important;
          padding: 2px 6px !important;
          font-size: 10px !important;
          font-weight: 600 !important;
        }
        .custom-route-stop-tooltip::before {
          display: none !important;
        }

        /* ── Google Maps Live User Location Navigation Arrow & Directional Cone ── */
        .user-location-nav-marker {
          position: relative;
          width: 84px;
          height: 84px;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: auto;
          cursor: pointer;
        }
        .user-pulse-ring {
          position: absolute;
          width: 44px;
          height: 44px;
          background-color: rgba(59, 130, 246, 0.28);
          border-radius: 50%;
          animation: user-nav-pulse 2.2s cubic-bezier(0.2, 0.6, 0.35, 1) infinite;
          pointer-events: none;
        }
        @keyframes user-nav-pulse {
          0% {
            transform: scale(0.6);
            opacity: 0.95;
          }
          60% {
            transform: scale(2.0);
            opacity: 0.22;
          }
          100% {
            transform: scale(2.8);
            opacity: 0;
          }
        }
        .user-heading-cone {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          transition: transform 0.18s cubic-bezier(0.25, 0.1, 0.25, 1);
          transform-origin: 42px 42px;
        }
        .user-heading-arrow-disc {
          position: relative;
          width: 34px;
          height: 34px;
          background-color: #ffffff;
          border-radius: 50%;
          border: 2px solid #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.35), 0 0 0 1.5px rgba(59, 130, 246, 0.5);
          transition: transform 0.18s cubic-bezier(0.25, 0.1, 0.25, 1);
          transform-origin: center center;
          z-index: 10;
        }
        .user-center-dot {
          position: absolute;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background-color: #1d4ed8;
          border: 1.5px solid #ffffff;
          pointer-events: none;
          z-index: 12;
        }
      `}</style>
    </div>
  );
});

export default CommuterCorridorMap;
