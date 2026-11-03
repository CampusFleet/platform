import React from "react";
import { Crosshair, Building2, Navigation, MapPin } from "lucide-react";
import { Stop } from "@/lib/types";

interface MapOverlaysProps {
  showUserLocation?: boolean;
  userLocation: { lat: number; lng: number; accuracy: number } | null;
  isLocating: boolean;
  onLocateUser: () => void;
  showCampusLandmark?: boolean;
  campusTerminalStop?: Stop | null;
  onPanToCampus: () => void;
  locationNotice: string | null;
  interactiveMode?: "VIEW" | "PIN_DROP";
  showPinHint?: boolean;
  hasRouteLegend?: boolean;
}

export function MapOverlays({
  showUserLocation,
  userLocation,
  isLocating,
  onLocateUser,
  showCampusLandmark,
  campusTerminalStop,
  onPanToCampus,
  locationNotice,
  interactiveMode,
  showPinHint,
  hasRouteLegend,
}: MapOverlaysProps) {
  const isPinDrop = interactiveMode === "PIN_DROP";

  return (
    <>
      {/* Floating Google Controls: Locate Me & Center on Campus */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
        {showUserLocation && (
          <button
            onClick={onLocateUser}
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

        {showCampusLandmark && campusTerminalStop && !isPinDrop && (
          <button
            onClick={onPanToCampus}
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

      {/* Transient Pin Helper Pill: Shows for 1 second on activation or touch, then auto-disappears */}
      {isPinDrop && showPinHint && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 dark:bg-zinc-900/95 text-white font-medium text-xs px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 border border-white/20 pointer-events-none transition-all duration-300 animate-in fade-in zoom-in-95">
          <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Click anywhere on map to drop pin</span>
        </div>
      )}

      {/* Google Maps Transit Legend: STRICTLY HIDDEN in PIN_DROP mode to prevent route data leaks */}
      {!isPinDrop && hasRouteLegend && (
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
                onClick={onPanToCampus}
                className="flex items-center gap-1 text-blue-600 dark:text-blue-400 cursor-pointer hover:underline"
                title={`Pan to ${campusTerminalStop.name}`}
              >
                <span>🏛️</span>
                <span>{campusTerminalStop.code}</span>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

