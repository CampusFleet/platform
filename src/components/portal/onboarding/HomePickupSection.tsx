"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, Crosshair, MapPin, Search, X } from "lucide-react";
import type { Stop } from "@/lib/types";
import { Badge, Button, Card, CardHeader, cn, Field, Input } from "@/components/ui";
import type { CampusOption, HomeLocation, PickupOption } from "./form";

const OnboardingPinMap = dynamic(() => import("@/components/maps/OnboardingPinMap"), {
  ssr: false,
  loading: () => <div className="w-full h-[260px] rounded-2xl bg-gray-100 dark:bg-zinc-900 animate-pulse" />,
});

interface Suggestion {
  formattedAddress: string;
  mainText?: string;
  secondaryText?: string;
  latitude: number;
  longitude: number;
}

/**
 * Section 2: home location and pickup stop. The student searches an address, uses GPS, or drags the
 * pin. Stops, zone and fee come from GET /api/students/pickup-options; the server re-checks the
 * choice on save. A stop with no route cannot be chosen; a stop with no zone shows "Fee not set".
 */
export function HomePickupSection({
  home,
  stopId,
  campus,
  options,
  loadingOptions,
  outOfServiceArea,
  onHome,
  onStop,
  showErrors,
  title = "2. Home and pickup stop",
}: {
  home: HomeLocation | null;
  stopId: string;
  campus: CampusOption | null;
  options: PickupOption[];
  loadingOptions: boolean;
  outOfServiceArea: boolean;
  onHome: (h: HomeLocation) => void;
  onStop: (id: string) => void;
  showErrors: boolean;
  title?: string;
}) {
  const [query, setQuery] = useState(home?.address || "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>();
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current && home?.address) setQuery(home.address);
  }, [home?.address]);

  const search = (text: string) => {
    typed.current = true;
    setQuery(text);
    setNotice(null);
    if (debounce.current) clearTimeout(debounce.current);
    if (text.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/geo/geocode?address=${encodeURIComponent(text.trim())}`);
        const data = await res.json();
        const list: Suggestion[] = data.results?.length ? data.results : data.isFuzzy ? data.suggestions || [] : [];
        setSuggestions(list.slice(0, 6));
        if (!list.length) setNotice("No match. Add your area or city, or drop the pin on the map.");
        else if (data.isFuzzy) setNotice("No exact match. Did you mean one of these?");
      } catch {
        setNotice("Address search is not available. Use GPS or the map.");
      } finally {
        setSearching(false);
      }
    }, 350);
  };

  const pick = (s: Suggestion) => {
    typed.current = false;
    setSuggestions([]);
    setNotice(null);
    setQuery(s.formattedAddress);
    onHome({ latitude: Number(s.latitude), longitude: Number(s.longitude), address: s.formattedAddress });
  };

  const reverse = async (lat: number, lng: number, fallback: string) => {
    let address = fallback;
    try {
      const res = await fetch(`/api/geo/reverse-geocode?lat=${lat}&lng=${lng}`);
      const data = await res.json();
      if (data.success && data.address) address = data.address;
    } catch {
      /* keep fallback */
    }
    typed.current = false;
    setQuery(address);
    onHome({ latitude: lat, longitude: lng, address });
  };

  const gps = () => {
    if (!navigator.geolocation) {
      setNotice("Location is not available in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        void reverse(pos.coords.latitude, pos.coords.longitude, query);
      },
      (e) => {
        setLocating(false);
        setNotice(e.code === e.PERMISSION_DENIED ? "Location permission denied. Search your address instead." : "Could not get your location. Search your address instead.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const selected = options.find((o) => o.stopId === stopId) || null;
  const mapStop = selected ? ({ id: selected.stopId, name: selected.name, latitude: selected.latitude, longitude: selected.longitude } as unknown as Stop) : null;

  return (
    <Card>
      <CardHeader icon={<MapPin className="w-5 h-5" />} title={title} subtitle="We suggest the nearest stop on a bus route" />

      <div className="space-y-3">
        <div className="relative">
          <Field label="Home address" error={showErrors && !home ? "Choose your home location" : null}>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <Input value={query} onChange={(e) => search(e.target.value)} placeholder="House, street, area, city" className="pl-9 pr-9" autoComplete="street-address" />
              {query && (
                <button type="button" aria-label="Clear" onClick={() => { setQuery(""); setSuggestions([]); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </Field>
          {suggestions.length > 0 && (
            <ul className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden">
              {suggestions.map((s, i) => (
                <li key={`${s.latitude},${s.longitude},${i}`}>
                  <button type="button" onClick={() => pick(s)} className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 min-w-0">
                    <span className="block text-sm font-semibold truncate">{s.mainText || s.formattedAddress}</span>
                    {s.secondaryText && <span className="block text-xs text-gray-500 truncate">{s.secondaryText}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {(notice || searching) && <p className="text-xs text-gray-500">{searching ? "Searching…" : notice}</p>}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={gps} loading={locating}>
            <Crosshair className="w-4 h-4" /> Use my location
          </Button>
          {!home && campus && (
            <Button size="sm" variant="ghost" onClick={() => void reverse(campus.latitude, campus.longitude, "")}>
              <MapPin className="w-4 h-4" /> Pick on map
            </Button>
          )}
        </div>

        {home && (
          <>
            <OnboardingPinMap
              latitude={home.latitude}
              longitude={home.longitude}
              onLocationChange={(lat, lng) => void reverse(lat, lng, home.address)}
              assignedStop={mapStop}
              walkingDistanceMeters={selected ? Math.round(selected.distanceKm * 1000) : undefined}
              walkingTimeMins={selected?.walkMins}
              height="260px"
              zoom={15}
            />
            <p className="text-xs text-gray-500">Drag the pin to your exact gate if it is off.</p>
          </>
        )}

        {home && outOfServiceArea && !loadingOptions && (
          <div className="flex gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Your home is far from every bus stop. Pick the stop you can reach each day.</span>
          </div>
        )}

        {home && (
          <div className="space-y-2" role="radiogroup" aria-label="Pickup stop">
            <p className="text-xs font-bold text-gray-700 dark:text-gray-300">Pickup stop</p>
            {loadingOptions && options.length === 0 && <div className="h-16 rounded-xl bg-gray-100 dark:bg-zinc-900 animate-pulse" />}
            {!loadingOptions && options.length === 0 && <p className="text-sm text-gray-500">No bus stops found for this campus.</p>}
            {options.map((o) => {
              const usable = Boolean(o.routeId);
              const active = o.stopId === stopId;
              return (
                <button
                  key={o.stopId}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={!usable}
                  onClick={() => onStop(o.stopId)}
                  className={cn(
                    "w-full text-left p-3 rounded-xl border flex items-start gap-3 min-w-0 transition",
                    active ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30" : "border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-900",
                    !usable && "opacity-50"
                  )}
                >
                  <span className={cn("mt-0.5 w-4 h-4 rounded-full border-2 shrink-0", active ? "border-emerald-500 bg-emerald-500 shadow-[inset_0_0_0_2px_white] dark:shadow-[inset_0_0_0_2px_black]" : "border-gray-300 dark:border-zinc-600")} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold truncate">{o.name}</span>
                    <span className="block text-xs text-gray-500 truncate">
                      {o.distanceKm < 1 ? `${Math.round(o.distanceKm * 1000)} m` : `${o.distanceKm.toFixed(1)} km`} away · about {o.walkMins} min walk
                      {o.routeName ? ` · ${o.routeName}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    {!usable ? (
                      <Badge>No bus route</Badge>
                    ) : o.semesterFee != null ? (
                      <span className="block text-sm font-black">₹{o.semesterFee.toLocaleString("en-IN")}</span>
                    ) : (
                      <Badge tone="amber">Fee not set</Badge>
                    )}
                    {o.zoneName && <span className="block text-[11px] text-gray-500 max-w-[7rem] truncate">{o.zoneName}</span>}
                  </span>
                </button>
              );
            })}
            {showErrors && !stopId && <p className="text-xs font-semibold text-rose-600">Choose a pickup stop</p>}
          </div>
        )}
      </div>
    </Card>
  );
}
