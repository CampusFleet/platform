"use client";

import React from "react";
import dynamic from "next/dynamic";
import {
  MapPin,
  Search,
  Crosshair,
  Navigation,
  Loader2,
  X,
  Sparkles,
  Route as RouteIcon,
  Clock,
  AlertTriangle,
  Check,
  ArrowRight,
} from "lucide-react";
import { StepHomeAndRouteProps } from "./types";

// Dynamically load the dedicated OOP Onboarding Pin Map client-side (Zero route data leak)
const OnboardingPinMap = dynamic(() => import("@/components/maps/OnboardingPinMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-80 rounded-2xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center border border-zinc-200 dark:border-zinc-800">
      <div className="flex flex-col items-center gap-2 text-zinc-400">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        <span className="text-xs font-medium">Initializing Onboarding Pin Map...</span>
      </div>
    </div>
  ),
});

export function StepHomeAndRoute({
  homeAddress,
  addressSearchQuery,
  isGeocodingAddress,
  isResolvingAddress,
  searchSuggestions,
  isSearchingSuggestions,
  showSuggestionsDropdown,
  fuzzySuggestions,
  fuzzyNotice,
  regionalLandmarks,
  homeLat,
  homeLng,
  stopsForMap,
  assignedStop,
  assignedRoute,
  allStops,
  primaryStopId,
  selectedZoneCode,
  assignedRouteName,
  walkingDistanceMeters,
  walkingTimeMins,
  isOutOfServiceArea,
  serviceAreaWarning,
  showAllStopsPicker,
  stopSearchQuery,
  availableStopsForCampus,
  isDetectingGPS,
  onAddressInputChange,
  onSearchAddress,
  onClearAddress,
  onSelectSuggestion,
  onDetectGPS,
  onMapLocationSelect,
  onToggleAllStopsPicker,
  onStopSearchQueryChange,
  onSelectPickupStop,
  onContinue,
}: StepHomeAndRouteProps) {
  return (
    <div className="bg-white dark:bg-zinc-900 border-y sm:border border-gray-200 dark:border-zinc-800 rounded-none sm:rounded-3xl shadow-none sm:shadow-sm space-y-4 sm:space-y-6 animate-in fade-in duration-200 overflow-hidden w-full">
      {/* Google Maps-Standard Address Search with Autocomplete & Fuzzy Fallback */}
      <div className="px-4 sm:px-8 pt-4 sm:pt-6 space-y-3 relative">
        <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex items-center justify-between">
          <span>Search Home Address or Area</span>
          {isResolvingAddress && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5 animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Resolving pin address...
            </span>
          )}
        </label>

        <div className="relative">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                {isSearchingSuggestions ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </div>
              <input
                type="text"
                value={addressSearchQuery || homeAddress}
                onChange={e => onAddressInputChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onSearchAddress();
                  }
                }}
                placeholder="e.g. Mukhani Chauraha, Haldwani"
                className="w-full pl-10 pr-9 py-3 rounded-2xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
              />
              {(addressSearchQuery || homeAddress) && (
                <button
                  type="button"
                  onClick={onClearAddress}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                  title="Clear input"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSearchAddress()}
                disabled={isGeocodingAddress}
                className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isGeocodingAddress ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span>Locate</span>
              </button>

              <button
                type="button"
                onClick={onDetectGPS}
                disabled={isDetectingGPS}
                className="px-4 py-3 rounded-2xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-800 dark:text-gray-200 font-bold text-xs shadow-2xs transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
                title="Detect Current GPS Location"
              >
                <Navigation className={`w-4 h-4 ${isDetectingGPS ? "animate-spin text-emerald-600" : "text-emerald-600 dark:text-emerald-400"}`} />
                <span className="hidden sm:inline">Use GPS</span>
              </button>
            </div>
          </div>

          {/* Live Autocomplete Suggestions Dropdown (Google Maps standard) */}
          {showSuggestionsDropdown && searchSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 sm:right-32 mt-1.5 z-50 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-2xl shadow-2xl overflow-hidden divide-y divide-gray-100 dark:divide-zinc-800 max-h-72 overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
              {searchSuggestions.map((item, idx) => (
                <div
                  key={`${item.latitude}_${item.longitude}_${idx}`}
                  onClick={() => onSelectSuggestion(item)}
                  className="p-3.5 flex items-start gap-3 hover:bg-emerald-50/60 dark:hover:bg-zinc-800/80 cursor-pointer transition-colors"
                >
                  <div className="p-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
                    <MapPin className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                      {item.mainText}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                      {item.secondaryText || item.formattedAddress}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fuzzy / "Did you mean?" Suggested Locations (when exact query has 0 matches) */}
        {fuzzyNotice && fuzzySuggestions.length > 0 && (
          <div className="p-4 rounded-2xl border border-amber-300/80 dark:border-amber-700/60 bg-amber-50/80 dark:bg-amber-950/30 space-y-2.5 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 text-xs font-bold">
              <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Did you mean one of these nearby areas?</span>
            </div>
            <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90">
              {fuzzyNotice}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {fuzzySuggestions.map((cand, idx) => (
                <button
                  key={`${cand.latitude}_${cand.longitude}_${idx}`}
                  type="button"
                  onClick={() => onSelectSuggestion(cand)}
                  className="text-left p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-amber-200 dark:border-zinc-800 hover:border-emerald-500 dark:hover:border-emerald-500 hover:shadow-xs transition-all flex items-center gap-2.5 cursor-pointer group"
                >
                  <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 group-hover:scale-110 transition-transform" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                      {cand.mainText}
                    </p>
                    <p className="text-[10px] text-gray-400 truncate">
                      {cand.secondaryText || cand.formattedAddress}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Regional Landmark Quick-Select Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0 mr-1">
            Nearby Hubs:
          </span>
          {regionalLandmarks.map((hub) => (
            <button
              key={hub.name}
              type="button"
              onClick={() => {
                onSelectSuggestion({
                  formattedAddress: hub.query,
                  mainText: hub.name,
                  secondaryText: hub.query,
                  latitude: hub.lat,
                  longitude: hub.lng,
                });
              }}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 dark:bg-zinc-800 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400 dark:hover:border-emerald-700/60 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-zinc-700 shrink-0 transition-colors cursor-pointer"
            >
              📍 {hub.name}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive CampusFleet Map with Tactile Pin Drop (Zero Route Data Leak) */}
      <div className="space-y-2">
        <div className="px-4 sm:px-8 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
            <Crosshair className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="truncate">Tap map or drag pin to your exact building entrance</span>
          </span>
          <span className="font-mono text-[10px] sm:text-[11px] bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full shrink-0">
            GPS Active
          </span>
        </div>

        {/* Full-width Map Container on Mobile with Zero Margin Clipping */}
        <div className="w-full rounded-none sm:rounded-2xl overflow-hidden border-y sm:border border-gray-200 dark:border-zinc-800 shadow-sm relative z-0">
          <OnboardingPinMap
            latitude={homeLat}
            longitude={homeLng}
            onLocationChange={onMapLocationSelect}
            assignedStop={assignedStop}
            assignedRoute={assignedRoute}
            allStops={allStops}
            walkingDistanceMeters={walkingDistanceMeters}
            walkingTimeMins={walkingTimeMins}
            height="460px"
            zoom={15}
          />
        </div>
      </div>

      {/* Automated Transit Match Summary Card */}
      <div className="px-4 sm:px-8">
        <div className="p-4 sm:p-5 rounded-2xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-sm font-bold text-emerald-950 dark:text-emerald-200">
              Auto-Matched Transit Allocation
            </h3>
          </div>
          <span className="text-[11px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
            Zone {selectedZoneCode.replace("ZONE_", "")}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 text-xs">
          <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-emerald-100 dark:border-zinc-800 space-y-1">
            <div className="text-gray-500 dark:text-gray-400 font-medium flex items-center gap-1.5">
              <RouteIcon className="w-3.5 h-3.5 text-emerald-600" />
              <span>Assigned Route</span>
            </div>
            <p className="font-bold text-gray-900 dark:text-white truncate">
              {assignedRouteName}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-emerald-100 dark:border-zinc-800 space-y-1">
            <div className="text-gray-500 dark:text-gray-400 font-medium flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-600" />
              <span>Nearest Pickup Stop</span>
            </div>
            <p className="font-bold text-gray-900 dark:text-white truncate" title={assignedStop?.name}>
              {assignedStop?.name || "Corridor Stop"}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-emerald-100 dark:border-zinc-800 space-y-1">
            <div className="text-gray-500 dark:text-gray-400 font-medium flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isOutOfServiceArea ? "Corridor Distance" : "Walking Distance"}</span>
            </div>
            {isOutOfServiceArea ? (
              <div>
                <p className="font-bold text-amber-600 dark:text-amber-400">
                  ~{Math.round(walkingDistanceMeters / 1000)} km (Out of Range)
                </p>
                <p className="text-[10px] text-gray-500">Boarding at corridor stop</p>
              </div>
            ) : (
              <p className="font-bold text-emerald-700 dark:text-emerald-400">
                {walkingDistanceMeters}m • ~{walkingTimeMins} min walk
              </p>
            )}
          </div>
        </div>

        {/* Service Area Warning Banner (Prevents absurd 135km walking distance confusion) */}
        {isOutOfServiceArea && serviceAreaWarning && (
          <div className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-200 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">Home Location is Outside Local Shuttle Corridor</p>
              <p className="text-[11px] leading-relaxed text-amber-900/90 dark:text-amber-300/90">
                {serviceAreaWarning}
              </p>
            </div>
          </div>
        )}

        {/* Optional Alternative Stops Accordion (Campus Corridor Filtered) */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onToggleAllStopsPicker}
            className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            {showAllStopsPicker ? "Hide alternative stops" : "Prefer a different boarding stop? Choose from corridor catalog →"}
          </button>

          {showAllStopsPicker && (
            <div className="mt-3 p-4 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-2.5">
              <input
                type="text"
                value={stopSearchQuery}
                onChange={e => onStopSearchQueryChange(e.target.value)}
                placeholder="Search stop by name or landmark..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-800">
                {availableStopsForCampus
                  .filter(s => !stopSearchQuery || s.name.toLowerCase().includes(stopSearchQuery.toLowerCase()))
                  .map(s => {
                    const isCurrent = s.id === (primaryStopId || assignedStop?.id);
                    return (
                      <div
                        key={s.id}
                        onClick={() => onSelectPickupStop(s.id, s.zoneCode, s.name)}
                        className={`p-2.5 flex items-center justify-between text-xs cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-zinc-800 transition-colors ${
                          isCurrent ? "bg-emerald-50 dark:bg-emerald-950/40 font-bold" : ""
                        }`}
                      >
                        <div>
                          <span className="text-gray-900 dark:text-white">{s.name}</span>
                          {s.landmark && <p className="text-[10px] text-gray-400">{s.landmark}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          {isCurrent ? (
                            <span className="text-emerald-600 font-bold flex items-center gap-1 text-[11px]">
                              <Check className="w-3.5 h-3.5" /> Selected
                            </span>
                          ) : (
                            <span className="text-gray-500 hover:text-emerald-600 font-medium">Select</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

      {/* Navigation Buttons */}
      <div className="px-4 sm:px-8 pb-5 sm:pb-8 flex justify-end">
        <button
          type="button"
          onClick={onContinue}
          className="w-full sm:w-auto px-8 py-3.5 sm:py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>Continue to Profile & Photo</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

