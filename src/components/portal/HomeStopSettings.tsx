"use client";

import React, { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui";
import { HomePickupSection, type HomeLocation, type PickupOption } from "@/components/portal/onboarding";

/**
 * Settings: change home location and pickup stop. Same picker as onboarding; saved through
 * PUT /api/students/home-location. After payment, stops in another zone are shown but not accepted.
 */
export function HomeStopSettings() {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [home, setHome] = useState<HomeLocation | null>(null);
  const [stopId, setStopId] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [campusId, setCampusId] = useState<string | null>(null);
  const [zoneLocked, setZoneLocked] = useState(false);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [options, setOptions] = useState<PickupOption[]>([]);
  const [outOfArea, setOutOfArea] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const picked = useRef(true);

  useEffect(() => {
    fetch("/api/students/home-location", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.message);
        setHome(d.home);
        setStopId(d.stopId || "");
        setSavedKey(JSON.stringify([d.home, d.stopId || ""]));
        setCampusId(d.campusId);
        setZoneLocked(Boolean(d.zoneLocked));
        setZoneId(d.zoneId);
        setOptions(d.options || []);
        setOutOfArea(Boolean(d.outOfServiceArea));
      })
      .catch((e) => setLoadError(e.message || "Could not load your pickup stop."))
      .finally(() => setLoaded(true));
  }, []);

  // Reload stop options when the home pin moves.
  const lat = home?.latitude;
  const lng = home?.longitude;
  useEffect(() => {
    if (!loaded || lat == null || lng == null) return;
    const ctrl = new AbortController();
    const q = new URLSearchParams({ lat: String(lat), lng: String(lng) });
    if (campusId) q.set("campusId", campusId);
    setLoadingOptions(true);
    fetch(`/api/students/pickup-options?${q}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return;
        const list: PickupOption[] = d.options || [];
        setOptions(list);
        setOutOfArea(Boolean(d.outOfServiceArea));
        setStopId((cur) => (picked.current && list.some((o) => o.stopId === cur && o.routeId) ? cur : d.defaultStopId || ""));
      })
      .catch(() => {})
      .finally(() => !ctrl.signal.aborted && setLoadingOptions(false));
    return () => ctrl.abort();
  }, [lat, lng, campusId, loaded]);

  if (!loaded) return <div className="h-40 rounded-2xl bg-gray-100 dark:bg-zinc-900 animate-pulse" />;
  if (loadError) return <p className="text-sm text-gray-500">{loadError}</p>;

  const selected = options.find((o) => o.stopId === stopId) || null;
  const otherZone = zoneLocked && selected && selected.zoneId !== zoneId;
  const dirty = JSON.stringify([home, stopId]) !== savedKey;

  const save = async () => {
    if (!home || !stopId) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/students/home-location", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...home, stopId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.success) throw new Error(d.message || "Could not save.");
      setSavedKey(JSON.stringify([home, stopId]));
      setMsg({ ok: true, text: d.message || "Saved." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {zoneLocked && (
        <p className="text-xs text-gray-500 flex items-start gap-1.5">
          <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Your pass is paid, so you can only pick stops in your current zone. For another zone, contact the transport office.
        </p>
      )}
      <HomePickupSection
        home={home}
        stopId={stopId}
        campus={null}
        options={options}
        loadingOptions={loadingOptions}
        outOfServiceArea={outOfArea}
        onHome={(h) => {
          picked.current = false;
          setHome(h);
        }}
        onStop={(id) => {
          picked.current = true;
          setStopId(id);
        }}
        showErrors={false}
        title="Home and pickup stop"
      />
      {otherZone && <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">This stop is in a different zone from your paid pass.</p>}
      {msg && <p className={`text-xs font-semibold ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"}`} role="status">{msg.text}</p>}
      <Button variant="success" onClick={save} loading={saving} disabled={!dirty || !home || !stopId || Boolean(otherZone)}>
        Save home and stop
      </Button>
    </div>
  );
}
