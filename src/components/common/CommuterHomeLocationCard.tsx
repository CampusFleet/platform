"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
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
  Save,
  BusFront,
  CheckCircle2,
} from "lucide-react";
import { store } from "@/lib/store";
import { detectCommuterZoneAndStop } from "@/lib/zone-detector";
import type { Stop, Route, TransitZone, Campus } from "@/lib/types";

// Dynamically load OnboardingPinMap client-side to prevent SSR issues
const OnboardingPinMap = dynamic(() => import("@/components/maps/OnboardingPinMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-80 bg-gray-50 dark:bg-zinc-900 flex items-center justify-center border border-gray-200 dark:border-zinc-800">
      <div className="flex flex-col items-center gap-2 text-gray-400 dark:text-zinc-500">
        <Loader2 className="w-6 h-6 animate-spin text-green-600 dark:text-green-500" />
        <span className="text-xs font-medium">Initializing Interactive Corridor Map...</span>
      </div>
    </div>
  ),
});

export interface AddressSuggestion {
  formattedAddress: string;
  mainText: string;
  secondaryText: string;
  latitude: number;
  longitude: number;
  provider?: string;
}

export interface RegionalLandmark {
  name: string;
  query: string;
  lat: number;
  lng: number;
}

const DEFAULT_REGIONAL_LANDMARKS: RegionalLandmark[] = [
  { name: "Mukhani Chauraha", query: "Mukhani Chauraha, Haldwani", lat: 29.2195, lng: 79.512 },
  { name: "Pilikothi", query: "Pilikothi, Haldwani", lat: 29.2285, lng: 79.521 },
  { name: "Kusumkhera", query: "Kusumkhera, Haldwani", lat: 29.224, lng: 79.501 },
  { name: "Lal Danth Tiraha", query: "Laldant Tiraha, Haldwani", lat: 29.2125, lng: 79.5085 },
  { name: "Kamluwaganja", query: "Kamluwaganja, Haldwani", lat: 29.2085, lng: 79.4895 },
  { name: "Kathgodam Rly", query: "Kathgodam Railway Station, Haldwani", lat: 29.273, lng: 79.534 },
];

export interface CommuterHomeLocationCardProps {
  studentId: string;
  initialAddress?: string;
  initialLat?: number;
  initialLng?: number;
  onLocationSaved?: (newLocation: {
    address: string;
    latitude: number;
    longitude: number;
    autoAssignedStopId?: string | null;
  }) => void;
  showToast: (type: "success" | "error" | "warning" | "info", message: string, title?: string) => void;
}

export function CommuterHomeLocationCard({
  studentId,
  initialAddress = "",
  initialLat = 29.220936,
  initialLng = 79.514496,
  onLocationSaved,
  showToast,
}: CommuterHomeLocationCardProps) {
  // Coordinates and text state
  const [homeAddress, setHomeAddress] = useState(initialAddress);
  const [addressSearchQuery, setAddressSearchQuery] = useState("");
  const [homeLat, setHomeLat] = useState<number>(initialLat);
  const [homeLng, setHomeLng] = useState<number>(initialLng);

  // Loading & dropdown states
  const [isGeocodingAddress, setIsGeocodingAddress] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [isSearchingSuggestions, setIsSearchingSuggestions] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestionsDropdown, setShowSuggestionsDropdown] = useState(false);
  const [fuzzySuggestions, setFuzzySuggestions] = useState<AddressSuggestion[]>([]);
  const [fuzzyNotice, setFuzzyNotice] = useState<string | null>(null);
  const [isDetectingGPS, setIsDetectingGPS] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccessNotice, setSavedSuccessNotice] = useState<string | null>(null);

  // Auto-detection results
  const [autoAssignedStopId, setAutoAssignedStopId] = useState<string | null>(null);
  const [primaryStopId, setPrimaryStopId] = useState<string>("");
  const [selectedZoneCode, setSelectedZoneCode] = useState<string>("ZONE_B");
  const [assignedRouteName, setAssignedRouteName] = useState<string>("Campus Transit Corridor");
  const [assignedRouteId, setAssignedRouteId] = useState<string>("");
  const [walkingDistanceMeters, setWalkingDistanceMeters] = useState<number>(390);
  const [walkingTimeMins, setWalkingTimeMins] = useState<number>(5);
  const [isOutOfServiceArea, setIsOutOfServiceArea] = useState(false);
  const [serviceAreaWarning, setServiceAreaWarning] = useState<string | null>(null);

  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Transit data from central store
  const stops = useMemo(() => store.getStops() || [], []);
  const routes = useMemo(() => store.getRoutes() || [], []);
  const transitZones = useMemo(() => store.getTransitZones() || [], []);
  const primaryCampus = useMemo(() => store.getPrimaryCampus() || null, []);

  // Assigned stop and route objects for map rendering
  const assignedStop = useMemo(() => {
    return stops.find(s => s.id === primaryStopId || s.id === autoAssignedStopId);
  }, [stops, primaryStopId, autoAssignedStopId]);

  const assignedRoute = useMemo(() => {
    return routes.find(r => r.id === assignedRouteId || r.name === assignedRouteName);
  }, [routes, assignedRouteId, assignedRouteName]);

  // Sync initial props
  useEffect(() => {
    if (initialAddress) setHomeAddress(initialAddress);
    if (initialLat) setHomeLat(initialLat);
    if (initialLng) setHomeLng(initialLng);
    if (initialLat && initialLng) {
      runAutoStopAndZoneDetection(initialLat, initialLng);
    }
  }, [initialAddress, initialLat, initialLng]);

  // Automatic zone, route, and nearest stop detector
  const runAutoStopAndZoneDetection = (lat: number, lng: number) => {
    if (!stops || stops.length === 0) return;
    const result = detectCommuterZoneAndStop(lat, lng, stops, routes, transitZones, primaryCampus);
    if (result) {
      setSelectedZoneCode(result.assignedZone.code);
      setAutoAssignedStopId(result.nearestStop.id);
      setPrimaryStopId(result.nearestStop.id);
      setWalkingDistanceMeters(result.walkingDistanceMeters);
      setWalkingTimeMins(result.walkingTimeMins);
      setIsOutOfServiceArea(Boolean(result.isOutOfServiceArea));
      setServiceAreaWarning(result.serviceAreaWarning || null);
      if (result.assignedRoute) {
        setAssignedRouteId(result.assignedRoute.id);
        setAssignedRouteName(result.assignedRoute.name);
      }
    }
  };

  // Reverse geocode lat/lng to street address
  const fetchAddressForCoordinates = async (lat: number, lng: number) => {
    setIsResolvingAddress(true);
    try {
      const res = await fetch(`/api/geo/reverse-geocode?lat=${lat}&lng=${lng}`);
      const data = await res.json();
      if (data.success && data.address) {
        setHomeAddress(data.address);
        setAddressSearchQuery(data.address);
      }
    } catch (err) {
      console.warn("Could not reverse geocode coordinates:", err);
    } finally {
      setIsResolvingAddress(false);
    }
  };

  // Map pin drag/click handler
  const handleMapLocationSelect = (lat: number, lng: number) => {
    setHomeLat(lat);
    setHomeLng(lng);
    fetchAddressForCoordinates(lat, lng);
    runAutoStopAndZoneDetection(lat, lng);
  };

  // Debounced address search input
  const handleAddressInputChange = (val: string) => {
    setAddressSearchQuery(val);
    setHomeAddress(val);
    setFuzzyNotice(null);
    setFuzzySuggestions([]);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    const trimmed = val.trim();
    if (trimmed.length < 3) {
      setSearchSuggestions([]);
      setShowSuggestionsDropdown(false);
      setIsSearchingSuggestions(false);
      return;
    }

    setIsSearchingSuggestions(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geo/geocode?address=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        if (data.results && Array.isArray(data.results) && data.results.length > 0) {
          setSearchSuggestions(data.results);
          setShowSuggestionsDropdown(true);
          setFuzzySuggestions([]);
          setFuzzyNotice(null);
        } else if (data.isFuzzy && data.suggestions && data.suggestions.length > 0) {
          setSearchSuggestions([]);
          setShowSuggestionsDropdown(false);
          setFuzzySuggestions(data.suggestions);
          setFuzzyNotice(data.message || `No exact match for "${trimmed}". Did you mean one of these nearby areas?`);
        } else {
          setSearchSuggestions([]);
          setShowSuggestionsDropdown(false);
        }
      } catch (err) {
        console.warn("Autocomplete fetch error:", err);
      } finally {
        setIsSearchingSuggestions(false);
      }
    }, 320);
  };

  // Suggestion pick
  const handleSelectSuggestion = (item: AddressSuggestion) => {
    const lat = Number(item.latitude);
    const lng = Number(item.longitude);
    setHomeLat(lat);
    setHomeLng(lng);
    setHomeAddress(item.formattedAddress);
    setAddressSearchQuery(item.mainText || item.formattedAddress);
    setShowSuggestionsDropdown(false);
    setFuzzySuggestions([]);
    setFuzzyNotice(null);
    runAutoStopAndZoneDetection(lat, lng);
    showToast("success", `Map centered on "${item.mainText || item.formattedAddress}"`, "Location Locked");
  };

  // Geocode address search button
  const handleSearchAddress = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setShowSuggestionsDropdown(false);
    const query = (addressSearchQuery || homeAddress).trim();
    if (!query) {
      showToast("warning", "Please type your street, colony, or landmark name.", "Address Required");
      return;
    }

    setIsGeocodingAddress(true);
    setFuzzyNotice(null);
    setFuzzySuggestions([]);

    try {
      const res = await fetch(`/api/geo/geocode?address=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.success && data.latitude && data.longitude) {
        const lat = Number(data.latitude);
        const lng = Number(data.longitude);
        setHomeLat(lat);
        setHomeLng(lng);
        if (data.formattedAddress) {
          setHomeAddress(data.formattedAddress);
          setAddressSearchQuery(data.formattedAddress);
        }
        runAutoStopAndZoneDetection(lat, lng);
        showToast("success", `Found coordinates for "${data.formattedAddress || query}"`, "Location Found");
      } else if (data.isFuzzy && data.suggestions && data.suggestions.length > 0) {
        setFuzzySuggestions(data.suggestions);
        setFuzzyNotice(data.message || `No exact match found for "${query}". Did you mean one of these areas?`);
        showToast("info", "No exact match. See suggestions below.", "Fuzzy Match");
      } else {
        showToast("error", data.message || "Could not locate address.", "Search Not Found");
      }
    } catch (err: any) {
      showToast("error", err.message || "Geocoding network error", "Search Error");
    } finally {
      setIsGeocodingAddress(false);
    }
  };

  const handleClearAddress = () => {
    setAddressSearchQuery("");
    setHomeAddress("");
    setSearchSuggestions([]);
    setShowSuggestionsDropdown(false);
    setFuzzySuggestions([]);
    setFuzzyNotice(null);
  };

  // GPS Device Detection
  const handleDetectGPS = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      showToast("warning", "Geolocation is not supported by your browser.", "GPS Error");
      return;
    }
    setIsDetectingGPS(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setHomeLat(lat);
        setHomeLng(lng);
        setIsDetectingGPS(false);
        showToast("success", `GPS location locked! Pin dropped.`, "GPS Acquired");
        fetchAddressForCoordinates(lat, lng);
        runAutoStopAndZoneDetection(lat, lng);
      },
      err => {
        setIsDetectingGPS(false);
        showToast("error", `Could not acquire GPS: ${err.message}`, "GPS Error");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Primary Save Action: Sync with backend and auto-reassign bus run
  const handleSaveLocation = async () => {
    if (!studentId) {
      showToast("error", "Student profile not identified.", "Save Error");
      return;
    }
    if (!homeLat || !homeLng) {
      showToast("warning", "Please select a valid location on the map.", "Coordinates Missing");
      return;
    }

    setIsSaving(true);
    setSavedSuccessNotice(null);

    try {
      const res = await fetch("/api/students/home-location", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          latitude: homeLat,
          longitude: homeLng,
          address: homeAddress.trim(),
          chosenStopId: primaryStopId || autoAssignedStopId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to update home location");
      }

      const assignedStopName = data.homeLocation?.autoAssignedStopName || assignedStop?.name || "Corridor Stop";
      const assignedBusInfo = data.homeLocation?.autoAssignedBusNumber ? `Bus ${data.homeLocation.autoAssignedBusNumber}` : "Direct Fleet Shuttle";
      const successText = `Home address updated! Auto-assigned to ${assignedStopName} on ${assignedBusInfo}.`;

      setSavedSuccessNotice(successText);
      showToast("success", successText, "Corridor Bus Synchronized");

      if (onLocationSaved) {
        onLocationSaved({
          address: homeAddress,
          latitude: homeLat,
          longitude: homeLng,
          autoAssignedStopId: data.homeLocation?.autoAssignedStopId || autoAssignedStopId,
        });
      }
    } catch (err: any) {
      showToast("error", err.message || "Could not save home coordinates.", "Save Failed");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-none shadow-xs space-y-6">
      {/* Header with Title and Pin Icon */}
      <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800/60">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">
              Home Location & Interactive Pin Drop
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 uppercase bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-300 border border-green-300 dark:border-green-800">
              Live Corridor Snapping
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Search your residential address or drop the pin on the map. Your transit corridor, nearest bus stop, and vehicle run auto-update instantly.
          </p>
        </div>
        <div className="p-2 border border-gray-100 dark:border-gray-800 rounded-none text-green-600 dark:text-green-400 shrink-0">
          <MapPin className="w-5 h-5" />
        </div>
      </div>

      <div className="p-6 pt-0 space-y-5">
        {/* Success Notice Banner */}
        {savedSuccessNotice && (
          <div className="p-3 text-xs border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 text-green-800 dark:text-green-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">{savedSuccessNotice}</span>
          </div>
        )}

        {/* Address Search with Autocomplete & Fuzzy Fallback */}
        <div className="space-y-2 relative">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-gray-400" />
              <span>Search Residential Area or Landmark</span>
            </label>
            {isResolvingAddress && (
              <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1 animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" /> Resolving pin address...
              </span>
            )}
          </div>

          <div className="relative">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  {isSearchingSuggestions ? (
                    <Loader2 className="w-4 h-4 animate-spin text-green-600" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </div>
                <input
                  type="text"
                  value={addressSearchQuery || homeAddress}
                  onChange={e => handleAddressInputChange(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSearchAddress();
                    }
                  }}
                  placeholder="E.g. Flat 402, Sunrise Residency, Mukhani, Haldwani"
                  className="w-full pl-9 pr-8 py-2.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-none focus:outline-none focus:border-green-500 text-sm font-sans placeholder:text-gray-400"
                />
                {(addressSearchQuery || homeAddress) && (
                  <button
                    type="button"
                    onClick={handleClearAddress}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                    title="Clear address input"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSearchAddress()}
                  disabled={isGeocodingAddress}
                  className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-900 dark:text-white border border-gray-300 dark:border-zinc-700 font-medium text-xs rounded-none transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isGeocodingAddress ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  <span>Locate</span>
                </button>

                <button
                  type="button"
                  onClick={handleDetectGPS}
                  disabled={isDetectingGPS}
                  className="px-4 py-2.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 font-medium text-xs rounded-none transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                  title="Detect Device GPS Location"
                >
                  <Navigation className={`w-3.5 h-3.5 ${isDetectingGPS ? "animate-spin text-green-600" : "text-green-600 dark:text-green-400"}`} />
                  <span>Use GPS</span>
                </button>
              </div>
            </div>

            {/* Live Autocomplete Suggestions Dropdown */}
            {showSuggestionsDropdown && searchSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 sm:right-32 mt-1 z-50 bg-white dark:bg-black border border-gray-300 dark:border-gray-700 rounded-none shadow-xl divide-y divide-gray-100 dark:divide-gray-800 max-h-64 overflow-y-auto">
                {searchSuggestions.map((item, idx) => (
                  <div
                    key={`${item.latitude}_${item.longitude}_${idx}`}
                    onClick={() => handleSelectSuggestion(item)}
                    className="p-3 flex items-start gap-2.5 hover:bg-green-50/60 dark:hover:bg-zinc-900 cursor-pointer transition-colors"
                  >
                    <div className="p-1 text-green-600 dark:text-green-400 shrink-0 mt-0.5">
                      <MapPin className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
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

          {/* Fuzzy Suggestions (When exact query not found) */}
          {fuzzyNotice && fuzzySuggestions.length > 0 && (
            <div className="p-3 border border-amber-300 dark:border-amber-700/60 bg-amber-50/80 dark:bg-amber-950/30 space-y-2">
              <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Did you mean one of these nearby areas?</span>
              </div>
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                {fuzzyNotice}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5">
                {fuzzySuggestions.map((cand, idx) => (
                  <button
                    key={`${cand.latitude}_${cand.longitude}_${idx}`}
                    type="button"
                    onClick={() => handleSelectSuggestion(cand)}
                    className="text-left p-2 bg-white dark:bg-zinc-900 border border-amber-200 dark:border-zinc-800 hover:border-green-500 text-xs flex items-center gap-2 cursor-pointer"
                  >
                    <MapPin className="w-3 h-3 text-green-600 shrink-0" />
                    <span className="truncate text-gray-900 dark:text-white font-medium">{cand.mainText}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Regional Quick-Select Landmark Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 no-scrollbar">
            <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400 shrink-0 mr-1">
              Corridor Hubs:
            </span>
            {DEFAULT_REGIONAL_LANDMARKS.map(hub => (
              <button
                key={hub.name}
                type="button"
                onClick={() => {
                  handleSelectSuggestion({
                    formattedAddress: hub.query,
                    mainText: hub.name,
                    secondaryText: hub.query,
                    latitude: hub.lat,
                    longitude: hub.lng,
                  });
                }}
                className="px-2.5 py-1 text-[11px] bg-gray-50 hover:bg-green-50 hover:text-green-700 hover:border-green-300 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-green-300 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-zinc-700 shrink-0 transition-colors cursor-pointer"
              >
                📍 {hub.name}
              </button>
            ))}
          </div>
        </div>

        {/* Interactive Onboarding Pin Map */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5 text-green-600" />
              <span>Tap anywhere on the map or drag pin to your exact building entrance</span>
            </span>
            <span className="font-mono text-[10px] bg-green-50 dark:bg-green-950/60 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 px-2 py-0.5">
              {homeLat.toFixed(5)}, {homeLng.toFixed(5)}
            </span>
          </div>

          <div className="w-full border border-gray-200 dark:border-gray-800 rounded-none overflow-hidden relative z-0">
            <OnboardingPinMap
              latitude={homeLat}
              longitude={homeLng}
              onLocationChange={handleMapLocationSelect}
              assignedStop={assignedStop}
              assignedRoute={assignedRoute}
              allStops={stops}
              walkingDistanceMeters={walkingDistanceMeters}
              walkingTimeMins={walkingTimeMins}
              height="380px"
              zoom={15}
            />
          </div>
        </div>

        {/* Auto-Matched Transit Corridor Summary Card */}
        <div className="p-4 border border-green-200 dark:border-green-900/60 bg-green-50/40 dark:bg-green-950/20 space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-600 animate-pulse" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-green-900 dark:text-green-200">
                Auto-Matched Transit Allocation
              </h3>
            </div>
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-green-100 dark:bg-green-900/60 text-green-800 dark:text-green-300 border border-green-300 dark:border-green-700 font-mono">
              {selectedZoneCode}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-white dark:bg-black border border-green-100 dark:border-zinc-800 space-y-1">
              <div className="text-gray-500 dark:text-gray-400 font-medium flex items-center gap-1.5 text-[11px]">
                <RouteIcon className="w-3.5 h-3.5 text-green-600" />
                <span>Assigned Route</span>
              </div>
              <p className="font-semibold text-gray-900 dark:text-white truncate">
                {assignedRouteName}
              </p>
            </div>

            <div className="p-3 bg-white dark:bg-black border border-green-100 dark:border-zinc-800 space-y-1">
              <div className="text-gray-500 dark:text-gray-400 font-medium flex items-center gap-1.5 text-[11px]">
                <BusFront className="w-3.5 h-3.5 text-green-600" />
                <span>Nearest Boarding Stop</span>
              </div>
              <p className="font-semibold text-gray-900 dark:text-white truncate" title={assignedStop?.name}>
                {assignedStop?.name || "Bhakda & Laldant Road Chauraha"}
              </p>
            </div>

            <div className="p-3 bg-white dark:bg-black border border-green-100 dark:border-zinc-800 space-y-1">
              <div className="text-gray-500 dark:text-gray-400 font-medium flex items-center gap-1.5 text-[11px]">
                <Clock className="w-3.5 h-3.5 text-green-600" />
                <span>Walking Proximity</span>
              </div>
              <p className="font-semibold text-green-700 dark:text-green-300 font-mono">
                {walkingDistanceMeters}m • ~{walkingTimeMins} min walk
              </p>
            </div>
          </div>

          {isOutOfServiceArea && serviceAreaWarning && (
            <div className="p-3 border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed">{serviceAreaWarning}</p>
            </div>
          )}
        </div>

        {/* Action Save Button */}
        <div className="flex items-center justify-between pt-2">
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Saving coordinates automatically re-evaluates the optimal vehicle run and locks your seat pass.
          </p>

          <button
            type="button"
            onClick={handleSaveLocation}
            disabled={isSaving || isResolvingAddress || isGeocodingAddress || !homeLat || !homeLng}
            className="px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium rounded-none transition-colors text-sm shadow-xs active:scale-95 cursor-pointer flex items-center gap-2 shrink-0"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving & Reserving Bus...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Coordinates & Update Bus</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

