"use client";

import React, { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, Compass, AlertCircle, Hand, MapPin, Loader2, Navigation2, Check, X } from "lucide-react";
import { store } from "@/lib/store";
import { supabase } from "@/lib/supabaseClient";
import { calculateDistanceKm } from "@/lib/utils";
import type { Bus, Trip, FleetBusMarkerData } from "@/lib/types";

// Leaflet Map (no SSR)
const CampusFleetMap = dynamic(() => import("@/components/maps/CampusFleetMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[600px] rounded-[2rem] bg-gray-100 dark:bg-gray-800 animate-pulse flex flex-col items-center justify-center font-bold text-gray-400 p-6 text-center">
      <Compass className="w-12 h-12 mb-4 animate-spin-slow opacity-50" />
      Initializing Radar Map...
    </div>
  ),
});

export default function RunningLatePage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);

  const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [liveBuses, setLiveBuses] = useState<FleetBusMarkerData[]>([]);

  const [haltStatus, setHaltStatus] = useState<string>("IDLE");
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    setCurrentUser(store.getCurrentUser());
    setTrips(store.getTrips());
    setBuses(store.getBuses());

    const unsub = store.subscribe(() => {
      setCurrentUser(store.getCurrentUser());
      setTrips(store.getTrips());
      setBuses(store.getBuses());
    });
    return unsub;
  }, []);

  const [activeTripsLive, setActiveTripsLive] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;
    const fetchBusLocations = async () => {
      // Bypass store and check for active trips directly to ensure real-time radar
      let currentActiveTrips: any[] = [];
      try {
        const { data } = await supabase
          .from('trips')
          .select('id, bus_id, status, shift_id, is_special, facility_type, driver_id, conductor_id')
          .eq('status', 'IN_PROGRESS');
        if (data) {
          const user = store.getCurrentUser();
          currentActiveTrips = data.filter((t: any) => {
            const tripObj: any = {
              id: t.id,
              busId: t.bus_id,
              shiftId: t.shift_id,
              status: t.status,
              isSpecial: Boolean(t.is_special),
              facilityType: t.facility_type,
              driverId: t.driver_id,
              conductorId: t.conductor_id,
            };
            return store.isTripVisibleToUser(tripObj, user);
          });
        }
      } catch (e) { }

      if (isMounted) setActiveTripsLive(currentActiveTrips);

      if (currentActiveTrips.length === 0) {
        if (isMounted) setLiveBuses([]);
        return;
      }

      const newLiveBuses: FleetBusMarkerData[] = [];
      for (const trip of currentActiveTrips) {
        if (!trip.bus_id) continue;
        try {
          const res = await fetch(`/api/telematics/live?busId=${trip.bus_id}`);
          if (!res.ok) continue;
          const data = await res.json();
          if (data.liveLocation) {
            const busData = buses.find(b => b.id === data.liveLocation.busId);
            newLiveBuses.push({
              busId: data.liveLocation.busId,
              tripId: trip.id,
              latitude: Number(data.liveLocation.latitude),
              longitude: Number(data.liveLocation.longitude),
              speedKmh: Number(data.liveLocation.speedKmh ?? 0),
              headingDeg: Number(data.liveLocation.headingDeg ?? 0),
              tripStatus: trip.status || "NONE",
              state: data.liveLocation.state || "NONE",
              busNumber: busData?.busNumber || "NONE",
              shortLabel: busData?.busNumber || "NONE",
              registrationNo: busData?.registrationNo || "NONE",
              statusText: data.liveLocation.statusText || trip.status || "NONE"
            } as FleetBusMarkerData);
          }
        } catch (e) { }
      }
      if (isMounted) setLiveBuses(newLiveBuses);
    };

    fetchBusLocations();
    const interval = setInterval(fetchBusLocations, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [buses]);

  useEffect(() => {
    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => { },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  const nearestBus = useMemo<FleetBusMarkerData | undefined>(() => {
    if (!userLocation || liveBuses.length === 0) return undefined;
    let minDist = Infinity;
    let closest: FleetBusMarkerData | undefined = undefined;

    liveBuses.forEach(b => {
      const dist = calculateDistanceKm(userLocation.lat, userLocation.lng, b.latitude, b.longitude);
      if (dist < minDist) {
        minDist = dist;
        closest = b;
      }
    });
    return closest;
  }, [userLocation, liveBuses]);

  // Poll Halt Request Status
  useEffect(() => {
    if (!nearestBus || !currentUser?.id) return;
    let isMounted = true;
    const checkHaltStatus = async () => {
      try {
        const res = await fetch(`/api/dispatch/halt-requests?tripId=${nearestBus.tripId}&studentId=${currentUser.id}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.request) {
            setHaltStatus(data.request.status);
          }
        }
      } catch (e) { }
    };

    checkHaltStatus();
    const interval = setInterval(checkHaltStatus, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [nearestBus?.tripId, currentUser?.id]);

  const handleRequestHalt = async () => {
    if (!nearestBus || !currentUser || !userLocation) return;
    setIsRequesting(true);
    try {
      const res = await fetch("/api/dispatch/halt-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId: nearestBus.tripId,
          studentId: currentUser.id,
          studentName: currentUser.fullName || currentUser.name || "NONE",
          latitude: userLocation.lat,
          longitude: userLocation.lng
        })
      });
      if (res.ok) {
        setHaltStatus("PENDING");
      }
    } catch (e) {
      console.error(e);
    }
    setIsRequesting(false);
  };

  if (activeTripsLive.length === 0) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 h-screen flex flex-col justify-center">
        <Link href="/portal" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 mb-6 font-bold self-start">
          <ArrowLeft className="w-4 h-4" /> Back to Hub
        </Link>
        <div className="bg-white dark:bg-gray-900/80 backdrop-blur-xl p-10 rounded-[2.5rem] text-center border border-gray-100 dark:border-gray-800 shadow-2xl animate-in fade-in zoom-in-95">
          <div className="w-20 h-20 bg-gray-50 dark:bg-gray-800/50 rounded-3xl mx-auto flex items-center justify-center mb-6">
            <AlertCircle className="w-10 h-10 text-gray-400" />
          </div>
          <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">No Active Shifts Running</h2>
          <p className="text-gray-500 mt-3 max-w-md mx-auto leading-relaxed">
            There are currently no buses on the road. The radar will automatically activate when a shift begins.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <div className="w-full mx-auto animate-in fade-in flex-1 flex flex-col">
        {/* Header Segment */}
        <div className="px-4 py-4 sm:px-6 max-w-6xl w-full mx-auto flex items-center justify-between shrink-0">
          <Link href="/portal" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 shadow-sm transition-colors">
            <ArrowLeft className="w-4 h-4" /> Hub
          </Link>
          <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 px-3 py-1.5 rounded-xl text-blue-700 dark:text-blue-400 text-xs font-black uppercase tracking-widest">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            Live Radar
          </div>
        </div>

        {/* Map Container */}
        <div className="flex-1 w-full max-w-6xl mx-auto px-0 sm:px-6 pb-6 relative flex flex-col">
          <div className="flex-1 bg-white dark:bg-gray-900 sm:rounded-[2rem] shadow-2xl border-y sm:border border-gray-200 dark:border-gray-800 overflow-hidden relative flex flex-col">

            {/* Overlay Gradient for top of map */}
            <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-black/20 to-transparent z-[500] pointer-events-none" />

            {/* Map Element */}
            <div className="flex-1 w-full min-h-[500px] relative z-0">
              <CampusFleetMap
                stops={[]}
                fleetBuses={liveBuses}
                focusedBusId={nearestBus?.busId}
                showUserLocation={true}
                height="100%"
                interactiveMode="VIEW"
                draftPinLocation={userLocation ? [userLocation.lat, userLocation.lng] : undefined}
              />
            </div>

            {/* Floating SOS Halt Request Card */}
            {nearestBus && userLocation && (
              <div className="absolute bottom-6 sm:bottom-8 left-4 right-4 sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-md z-[1000] animate-in slide-in-from-bottom-8 duration-500">
                <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-gray-200/50 dark:border-gray-700/50 p-5 sm:p-6 ring-1 ring-black/5 dark:ring-white/10">

                  {/* Status Indicator */}
                  <div className="flex items-start justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-blue-100 dark:bg-blue-500/20 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-inner">
                        <Compass className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-black text-lg text-gray-900 dark:text-white leading-tight">Bus {nearestBus.shortLabel}</h3>
                        <div className="flex items-center gap-1 mt-0.5 text-sm text-gray-500 font-medium">
                          <Navigation2 className="w-3.5 h-3.5" />
                          {Math.round(calculateDistanceKm(userLocation.lat, userLocation.lng, nearestBus.latitude, nearestBus.longitude) * 1000)}m away
                        </div>
                      </div>
                    </div>
                    {haltStatus !== "IDLE" && (
                      <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${haltStatus === "APPROVED" ? "bg-green-100 text-green-700" :
                        haltStatus === "REJECTED" ? "bg-red-100 text-red-700" :
                          "bg-yellow-100 text-yellow-700"
                        }`}>
                        {haltStatus}
                      </span>
                    )}
                  </div>

                  {/* Dynamic Action Button */}
                  {haltStatus === "APPROVED" ? (
                    <div className="w-full py-4 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-black text-center flex items-center justify-center gap-2 shadow-lg shadow-green-500/25">
                      <Check className="w-5 h-5" /> Driver Alerted! Wait Here.
                    </div>
                  ) : haltStatus === "REJECTED" ? (
                    <div className="w-full py-4 rounded-2xl bg-gray-100 dark:bg-gray-800 text-red-500 font-black text-center border border-red-100 dark:border-red-500/20 flex items-center justify-center gap-2">
                      <X className="w-5 h-5" /> Cannot Stop (Bus Full/Passed)
                    </div>
                  ) : haltStatus === "PENDING" ? (
                    <div className="w-full py-4 rounded-2xl bg-yellow-400 text-yellow-900 font-black text-center flex items-center justify-center gap-3 shadow-lg shadow-yellow-400/20">
                      <Loader2 className="w-5 h-5 animate-spin" /> Awaiting Conductor Approval...
                    </div>
                  ) : (
                    <button
                      onClick={handleRequestHalt}
                      disabled={isRequesting}
                      className="w-full group relative overflow-hidden py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] transition-all text-white font-black flex items-center justify-center gap-2 shadow-xl shadow-blue-500/25 disabled:opacity-70 disabled:active:scale-100"
                    >
                      <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                      <span className="relative z-10 flex items-center gap-2">
                        {isRequesting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Hand className="w-5 h-5" />}
                        {isRequesting ? "Requesting..." : "SOS: Request Bus to Stop"}
                      </span>
                    </button>
                  )}

                  {haltStatus === "IDLE" && (
                    <p className="text-center text-[11px] text-gray-400 mt-3 font-medium">
                      Only use this if you are actively walking to the route corridor.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
