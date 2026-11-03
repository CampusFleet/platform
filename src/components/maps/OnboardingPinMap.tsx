"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Stop } from "@/lib/types";
import { Crosshair, Navigation, MapPin, ZoomIn, ZoomOut, Loader2, Footprints } from "lucide-react";
import { OnboardingPinController } from "@/lib/maps/OnboardingPinController";

export interface OnboardingPinMapProps {
  latitude: number;
  longitude: number;
  onLocationChange: (lat: number, lng: number) => void;
  assignedStop?: Stop | null;
  walkingDistanceMeters?: number;
  walkingTimeMins?: number;
  height?: string;
  className?: string;
  zoom?: number;
}

export default function OnboardingPinMap({
  latitude,
  longitude,
  onLocationChange,
  assignedStop,
  walkingDistanceMeters,
  walkingTimeMins,
  height = "360px",
  className = "",
  zoom = 15,
}: OnboardingPinMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<OnboardingPinController | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [isLocatingGps, setIsLocatingGps] = useState(false);

  const onLocationChangeRef = useRef(onLocationChange);
  onLocationChangeRef.current = onLocationChange;

  // Initialize OOP Controller on Mount
  useEffect(() => {
    if (!containerRef.current || controllerRef.current) return;

    const controller = new OnboardingPinController({
      zoom,
      onLocationChange: (coords) => {
        onLocationChangeRef.current(coords.latitude, coords.longitude);
      },
    });

    const initLat = latitude && !isNaN(latitude) ? latitude : 29.220936;
    const initLng = longitude && !isNaN(longitude) ? longitude : 79.514496;

    controller
      .initialize(containerRef.current, { latitude: initLat, longitude: initLng })
      .then(() => {
        setMapReady(true);
        if (assignedStop) {
          controller.setPickupStop(assignedStop, walkingDistanceMeters, walkingTimeMins);
        }
      })
      .catch(console.error);

    controllerRef.current = controller;

    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [zoom]);

  // Sync Home Pin coordinates when changed externally (e.g. from address search autocomplete)
  useEffect(() => {
    if (!controllerRef.current || !mapReady) return;
    if (latitude && longitude && !isNaN(latitude) && !isNaN(longitude)) {
      controllerRef.current.setHomePin({ latitude, longitude }, true);
    }
  }, [latitude, longitude, mapReady]);

  // Sync Assigned Pickup Stop & Pedestrian Walking Path
  useEffect(() => {
    if (!controllerRef.current || !mapReady) return;
    controllerRef.current.setPickupStop(assignedStop, walkingDistanceMeters, walkingTimeMins);
  }, [assignedStop, walkingDistanceMeters, walkingTimeMins, mapReady]);

  // Trigger Device GPS Locate
  const handleLocateMe = useCallback(async () => {
    if (!controllerRef.current || isLocatingGps) return;
    setIsLocatingGps(true);
    try {
      await controllerRef.current.locateCurrentDevice();
    } catch (err) {
      console.warn("Location error:", err);
    } finally {
      setIsLocatingGps(false);
    }
  }, [isLocatingGps]);

  // Recenter on current home pin
  const handleRecenter = useCallback(() => {
    if (!controllerRef.current) return;
    controllerRef.current.recenterOnHome();
  }, []);

  return (
    <div
      className={`relative w-full rounded-2xl overflow-hidden border border-gray-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 shadow-inner select-none ${className}`}
      style={{ height }}
    >
      {/* Map DOM Element */}
      <div ref={containerRef} className="w-full h-full z-0" />

      {/* Floating UI Overlays */}
      {/* 1. Instruction Badge */}
      <div className="absolute top-3 left-3 z-10 pointer-events-none">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 dark:bg-zinc-900/90 backdrop-blur-md text-white text-xs font-semibold shadow-lg border border-white/10">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span>Drag pin or tap map to set doorstep</span>
        </div>
      </div>

      {/* 2. Map Control Actions (Recenter, Locate Me, Zoom) */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5 shadow-md">
        <button
          type="button"
          onClick={handleRecenter}
          title="Recenter on Home Pin"
          className="w-8 h-8 rounded-xl bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-700 flex items-center justify-center transition-transform active:scale-95 shadow-sm"
        >
          <Crosshair className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        </button>

        <button
          type="button"
          onClick={handleLocateMe}
          disabled={isLocatingGps}
          title="Locate Current Device"
          className="w-8 h-8 rounded-xl bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-700 flex items-center justify-center transition-transform active:scale-95 shadow-sm"
        >
          {isLocatingGps ? (
            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
          ) : (
            <Navigation className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          )}
        </button>

        <div className="flex flex-col bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl overflow-hidden mt-1">
          <button
            type="button"
            onClick={() => controllerRef.current?.zoomIn()}
            title="Zoom In"
            className="w-8 h-7 flex items-center justify-center text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-700 text-xs border-b border-gray-200 dark:border-zinc-700"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => controllerRef.current?.zoomOut()}
            title="Zoom Out"
            className="w-8 h-7 flex items-center justify-center text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-700 text-xs"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 3. Bottom Assigned Stop Walking Chip */}
      {assignedStop && walkingDistanceMeters !== undefined && (
        <div className="absolute bottom-3 left-3 right-3 sm:right-auto z-10 pointer-events-none">
          <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-gray-200 dark:border-zinc-700 shadow-xl text-gray-800 dark:text-white pointer-events-auto">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Footprints className="w-4 h-4" />
            </div>
            <div className="min-w-0 pr-1">
              <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                Assigned Boarding Stop
              </div>
              <div className="text-xs font-bold text-gray-900 dark:text-white truncate">
                {assignedStop.name}
              </div>
            </div>
            <div className="ml-auto pl-2 border-l border-gray-200 dark:border-zinc-800 text-right shrink-0">
              <div className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                {walkingDistanceMeters}m
              </div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">
                ~{walkingTimeMins || Math.round(walkingDistanceMeters / 80)} min walk
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Styles for Leaflet markers & tooltips */}
      <style jsx global>{`
        .custom-walking-tooltip {
          background: rgba(15, 23, 42, 0.92) !important;
          color: #fff !important;
          border: 1px solid rgba(16, 185, 129, 0.4) !important;
          border-radius: 9999px !important;
          padding: 3px 10px !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25) !important;
        }
        .custom-walking-tooltip::before {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
