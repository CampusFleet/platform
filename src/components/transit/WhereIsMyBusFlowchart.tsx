"use client";

import React, { useMemo, useState } from "react";
import { Route, Stop, LiveBusLocation, Bus, Trip } from "@/lib/types";
import { calculateHaversineDistanceKm } from "@/lib/eta-calculator";
import {
  MapPin,
  Clock,
  Navigation,
  Gauge,
  RefreshCw,
  Map as MapIcon,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Zap,
  BusFront,
  ArrowDown,
  ShieldCheck,
  Flag,
} from "lucide-react";

export interface WhereIsMyBusFlowchartProps {
  route: Route;
  stops?: Stop[];
  buses?: Bus[];
  bus?: Bus | null;
  busLocation?: LiveBusLocation | null;
  trip?: Trip | null;
  selectedStopId?: string;
  onSelectStop?: (stop: Stop) => void;
  onToggleMapView?: () => void;
  isMapViewActive?: boolean;
  activeStopIndex?: number;
  baseDepartureTime?: string; // e.g. "07:15"
}

/**
 * Format minutes offset from base time into 12-hour AM/PM string
 */
function formatTimeWithOffset(baseTimeStr = "07:15", offsetMins = 0): string {
  const [hStr, mStr] = baseTimeStr.split(":");
  let totalMins = (parseInt(hStr, 10) || 7) * 60 + (parseInt(mStr, 10) || 15) + offsetMins;
  
  // Wrap 24h
  totalMins = (totalMins + 1440) % 1440;
  
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  const displayMins = mins < 10 ? `0${mins}` : `${mins}`;
  
  return `${displayHours}:${displayMins} ${ampm}`;
}

export function WhereIsMyBusFlowchart({
  route,
  stops: stopsCatalog = [],
  buses = [],
  bus,
  busLocation,
  trip,
  selectedStopId,
  onSelectStop,
  onToggleMapView,
  isMapViewActive = false,
  activeStopIndex = 1,
  baseDepartureTime = "07:15",
}: WhereIsMyBusFlowchartProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  const stops = useMemo(() => {
    const rawStops = route?.stops || [];
    return rawStops
      .map((rs: any, idx: number) => {
        const stopObj =
          rs?.stop ||
          (stopsCatalog || []).find((s) => s.id === (rs?.stopId || rs?.stop_id)) || {
            id: rs?.stopId || rs?.stop_id || `stop-${idx}`,
            name: rs?.name || `Station ${idx + 1}`,
            code: rs?.code || `ST-${idx + 1}`,
            latitude: Number(rs?.latitude) || 29.38,
            longitude: Number(rs?.longitude) || 79.52,
            landmark: rs?.landmark || "",
            geofenceRadiusMeters: 100,
            campusId: "",
            campus: "",
            isBusMergeStop: false,
          };
        return {
          ...rs,
          stopId: rs?.stopId || rs?.stop_id || stopObj.id,
          stopOrder: rs?.stopOrder ?? idx + 1,
          arrivalOffsetMinutes: rs?.arrivalOffsetMinutes ?? idx * 5,
          bufferTimeMinutes: rs?.bufferTimeMinutes ?? 2,
          stop: stopObj,
        };
      })
      .filter((rs) => Boolean(rs && rs.stop));
  }, [route, stopsCatalog]);

  // Determine current active stop index from liveLocation if available
  const currentIndex = useMemo(() => {
    if (!busLocation || stops.length === 0) return activeStopIndex;

    if (busLocation.nextStopId) {
      const idx = stops.findIndex((s) => s.stopId === busLocation.nextStopId);
      if (idx !== -1) return Math.max(0, idx);
    }

    if (busLocation.currentStopId) {
      const idx = stops.findIndex((s) => s.stopId === busLocation.currentStopId);
      if (idx !== -1) return idx;
    }

    return activeStopIndex;
  }, [busLocation, stops, activeStopIndex]);

  // Cumulative distances from origin
  const stopDistances = useMemo(() => {
    if (stops.length === 0) return [];
    const distances: number[] = [0];
    let cumulative = 0;

    for (let i = 1; i < stops.length; i++) {
      const prev = stops[i - 1]?.stop;
      const curr = stops[i]?.stop;
      if (!prev || !curr) {
        distances.push(cumulative);
        continue;
      }
      const dist = calculateHaversineDistanceKm(
        prev.latitude ?? 0,
        prev.longitude ?? 0,
        curr.latitude ?? 0,
        curr.longitude ?? 0
      );
      cumulative += dist;
      distances.push(Math.round(cumulative * 10) / 10);
    }
    return distances;
  }, [stops]);

  // Live speed & delay
  const liveSpeed = Math.round(busLocation?.speedKmh ?? 0);
  const delayMinutes = busLocation?.delayMinutes ?? 0;
  const isDelayed = delayMinutes > 2;

  // Real-time broadcasted coordinates from driver telematics
  const busLat = busLocation?.latitude ?? stops[currentIndex]?.stop?.latitude ?? stops[0]?.stop?.latitude ?? 0;
  const busLng = busLocation?.longitude ?? stops[currentIndex]?.stop?.longitude ?? stops[0]?.stop?.longitude ?? 0;
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${busLat},${busLng}`;

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setLastRefreshedAt(new Date());
      setIsRefreshing(false);
    }, 600);
  };

  if (stops.length === 0) {
    return (
      <div className="w-full p-8 text-center bg-white dark:bg-black text-gray-500 rounded-xl border border-gray-200 dark:border-gray-800 font-mono text-sm">
        No station stops mapped to this transit corridor.
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl overflow-hidden bg-white dark:bg-black text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col font-sans select-none">
      {/* ── Top Header Cockpit ── */}
      <div className="bg-gray-50/70 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-800 text-xs font-mono font-semibold">
                {route.code || "CORRIDOR-1"}
              </span>
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
                <BusFront className="w-5 h-5 text-green-600 dark:text-green-500 shrink-0" />
                <span>{route.name}</span>
              </h2>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <span>{bus?.busNumber || "Campus Bus"}</span>
              <span>•</span>
              <span>{route.totalDistanceKm || stopDistances[stopDistances.length - 1] || 28} km Corridor</span>
              <span>•</span>
              <span>Departure {baseDepartureTime} AM</span>
            </p>
          </div>

          {/* Quick Actions & Status Badge */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span
              className={`px-2.5 py-1 rounded-md text-xs font-medium tracking-wide flex items-center gap-1.5 border ${
                liveSpeed > 0
                  ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
                  : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  liveSpeed > 0 ? "bg-green-500 animate-ping" : "bg-amber-500"
                }`}
              />
              {liveSpeed > 0 ? `In Transit • ${liveSpeed} km/h` : "Standby at Origin"}
            </span>

            {onToggleMapView && (
              <button
                onClick={onToggleMapView}
                className="px-3 py-1 rounded-md bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-700 text-xs font-medium transition-colors flex items-center gap-1.5"
                title="Switch between Flowchart and Map"
              >
                <MapIcon className="w-3.5 h-3.5 text-gray-500" />
                <span>{isMapViewActive ? "Flowchart" : "Map View"}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Table Header (Arrival | Station | Departure) ── */}
      <div className="grid grid-cols-12 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 px-3 sm:px-6 py-2.5">
        <div className="col-span-3 text-left">Arrival</div>
        <div className="col-span-6 text-center sm:text-left sm:pl-8">Station & Milestones</div>
        <div className="col-span-3 text-right">Departure</div>
      </div>

      {/* ── Vertical Timeline Track (The "Where Is My Train" Rail) ── */}
      <div className="relative py-4 px-2 sm:px-6 space-y-0 max-h-[580px] overflow-y-auto custom-scrollbar">
        {stops.map((rs, idx) => {
          const isPassed = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          const isUpcoming = idx > currentIndex;
          const isSelected = rs.stop?.id === selectedStopId;
          const isFirst = idx === 0;
          const isLast = idx === stops.length - 1;

          // Compute scheduled & live times
          const scheduledArrival = formatTimeWithOffset(baseDepartureTime, rs.arrivalOffsetMinutes);
          const liveArrivalMins = rs.arrivalOffsetMinutes + delayMinutes;
          const liveArrival = formatTimeWithOffset(baseDepartureTime, liveArrivalMins);

          const scheduledDeparture = formatTimeWithOffset(
            baseDepartureTime,
            rs.arrivalOffsetMinutes + (rs.bufferTimeMinutes || 2)
          );
          const liveDeparture = formatTimeWithOffset(
            baseDepartureTime,
            liveArrivalMins + (rs.bufferTimeMinutes || 2)
          );

          const distanceKm = stopDistances[idx] ?? rs.arrivalOffsetMinutes * 0.7;

          return (
            <React.Fragment key={rs.stopId || rs.stop?.id || idx}>
              {/* If bus is moving between previous stop and this current stop, show live bus marker */}
              {isCurrent && !isFirst && (
                <div className="relative my-2 py-2.5 px-3 sm:px-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900/60 text-blue-900 dark:text-blue-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-sm">
                      <BusFront className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-blue-900 dark:text-blue-100 flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-mono text-[10px] font-bold">
                          LIVE
                        </span>
                        <span>Approaching {rs.stop?.name || "Next Stop"}</span>
                      </div>
                      <p className="text-[11px] text-blue-700 dark:text-blue-300 mt-0.5">
                        Speed: <strong>{liveSpeed} km/h</strong> • {isDelayed ? `${delayMinutes}m delay` : "On time"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="px-2.5 py-1 rounded-md bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 text-[11px] font-medium transition-colors flex items-center gap-1.5"
                      title="Open driver's live GPS coordinates in Google Maps"
                    >
                      <svg className="w-3 h-3 text-red-500 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                      </svg>
                      <span className="hidden sm:inline">Google Maps</span>
                    </a>
                  </div>
                </div>
              )}

              {/* ── Stop Row ── */}
              <div
                onClick={() => onSelectStop && rs.stop && onSelectStop(rs.stop)}
                className={`grid grid-cols-12 items-center py-3 px-2 sm:px-3 rounded-lg transition-colors cursor-pointer relative ${
                  isSelected
                    ? "bg-green-50 dark:bg-green-950/30 border border-green-300 dark:border-green-800"
                    : isPassed
                    ? "opacity-60 hover:opacity-100 hover:bg-gray-50 dark:hover:bg-gray-900/50"
                    : "hover:bg-gray-50 dark:hover:bg-gray-900/50"
                }`}
              >
                {/* Left Column: Arrival Time */}
                <div className="col-span-3 text-left space-y-0.5">
                  <div className="text-[11px] font-mono text-gray-400">
                    {isFirst ? "Origin" : scheduledArrival}
                  </div>
                  {!isFirst && (
                    <div
                      className={`text-xs font-mono font-bold ${
                        isDelayed ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"
                      }`}
                    >
                      {liveArrival}
                      {isDelayed && (
                        <span className="text-[10px] ml-1 block sm:inline font-sans font-normal">
                          (+{delayMinutes}m)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Center Column: Spine Track + Station Info */}
                <div className="col-span-6 flex items-center gap-3 sm:gap-4 relative">
                  {/* Vertical Track Spine */}
                  <div className="relative flex flex-col items-center justify-center shrink-0 w-8">
                    {/* Upper Line */}
                    {!isFirst && (
                      <div
                        className={`w-1 h-6 -top-6 absolute z-0 ${
                          isPassed || isCurrent
                            ? "bg-green-500"
                            : "bg-gray-200 dark:bg-gray-800"
                        }`}
                      />
                    )}

                    {/* Station Node Badge */}
                    <div className="relative z-10">
                      {isPassed ? (
                        <div className="w-5 h-5 rounded-full bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400 border border-green-400 dark:border-green-700 flex items-center justify-center">
                          <CheckCircle2 className="w-3 h-3" />
                        </div>
                      ) : isCurrent ? (
                        <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-sm">
                          <span className="text-xs font-bold">{idx + 1}</span>
                        </div>
                      ) : isSelected ? (
                        <div className="w-6 h-6 rounded-full bg-green-600 text-white ring-2 ring-green-300 dark:ring-green-800 flex items-center justify-center shadow-sm">
                          <MapPin className="w-3 h-3" />
                        </div>
                      ) : isLast ? (
                        <div className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 flex items-center justify-center">
                          <Flag className="w-2.5 h-2.5 text-gray-500 dark:text-gray-400" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 flex items-center justify-center text-[10px] font-medium text-gray-500">
                          {idx + 1}
                        </div>
                      )}
                    </div>

                    {/* Lower Line */}
                    {!isLast && (
                      <div
                        className={`w-1 h-6 -bottom-6 absolute z-0 ${
                          isPassed
                            ? "bg-green-500"
                            : "bg-gray-200 dark:bg-gray-800"
                        }`}
                      />
                    )}
                  </div>

                  {/* Station Name & Distance Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4
                        className={`text-xs sm:text-sm font-semibold truncate ${
                          isSelected
                            ? "text-green-800 dark:text-green-300 font-bold"
                            : isPassed
                            ? "text-gray-500 dark:text-gray-400"
                            : "text-gray-900 dark:text-white"
                        }`}
                      >
                        {rs.stop?.name || `Station ${idx + 1}`}
                      </h4>
                      {isLast && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                          Campus
                        </span>
                      )}
                      {isSelected && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800 flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" /> Your Stop
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="font-mono">{distanceKm} km</span>
                      <span>•</span>
                      <span className="truncate max-w-[130px] sm:max-w-[200px]">
                        {rs.stop?.landmark || `Bay ${String.fromCharCode(65 + (idx % 4))}`}
                      </span>
                    </div>

                    {/* Specific alert for student pickup */}
                    {isSelected && !isPassed && (
                      <div className="mt-1.5 p-2 rounded-md bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 text-[11px] text-green-800 dark:text-green-300 font-medium flex items-center gap-2">
                        <Clock className="w-3 h-3 text-green-600 dark:text-green-400 shrink-0" />
                        <span>
                          Arriving in ~{Math.max(1, (idx - currentIndex) * 8 + delayMinutes)} mins ({idx - currentIndex} stops away)
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Departure Time */}
                <div className="col-span-3 text-right space-y-0.5">
                  <div className="text-[11px] font-mono text-gray-400">
                    {isLast ? "End" : scheduledDeparture}
                  </div>
                  {!isLast && (
                    <div
                      className={`text-xs font-mono font-bold ${
                        isDelayed ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"
                      }`}
                    >
                      {liveDeparture}
                    </div>
                  )}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Bottom Telematics Cockpit HUD ── */}
      <div className="bg-gray-50/70 dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Speedometer & Live Telemetry Dial */}
        <div className="flex items-center gap-3 self-stretch sm:self-auto justify-between sm:justify-start">
          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-center">
            <div>
              <span className="font-bold text-base font-mono text-gray-900 dark:text-white leading-none block">
                {liveSpeed}
              </span>
              <span className="text-[9px] uppercase font-medium text-gray-400">
                km/h
              </span>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
              <span>
                {currentIndex < stops.length
                  ? `Approaching ${stops[currentIndex]?.stop?.name || "Next Stop"}`
                  : "Arrived at Destination"}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mt-0.5 font-mono">
              <ShieldCheck className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
              <span>Updated {lastRefreshedAt.toLocaleTimeString()}</span>
            </p>
          </div>
        </div>

        {/* Refresh, Google Maps & Map View Toggle Buttons */}
        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end flex-wrap">
          <button
            onClick={handleRefresh}
            className="p-2 rounded-md bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 transition-colors"
            title="Refresh Live Telematics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-green-600" : ""}`} />
          </button>

          {/* Direct Google Maps Live GPS Link */}
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 rounded-md bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 font-medium text-xs border border-gray-300 dark:border-gray-700 transition-colors flex items-center gap-1.5"
            title="Open live coordinates in Google Maps"
          >
            <svg className="w-3.5 h-3.5 text-red-500 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
            <span className="hidden sm:inline">Google Maps</span>
          </a>

          {onToggleMapView && (
            <button
              onClick={onToggleMapView}
              className="flex-1 sm:flex-initial px-3 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white font-medium text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>{isMapViewActive ? "View Stop Timeline" : "View Satellite Map"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default WhereIsMyBusFlowchart;
