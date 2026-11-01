"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useConductorContext } from "../ConductorContext";
import {
  Hand,
  MapPin,
  Check,
  X,
  Navigation2,
  Clock,
  AlertTriangle,
  Volume2,
  VolumeX,
  Compass,
  Phone,
  Timer,
} from "lucide-react";
import type { HaltRequest } from "@/lib/types";
import { calculateDistanceKm } from "@/lib/utils";
import { getSafePhotoUrl } from "@/lib/image-utils";
import { store } from "@/lib/store";

export default function HaltRequestsTab() {
  const { activeTrip, bus, route, students, showToast } = useConductorContext();
  const [requests, setRequests] = useState<HaltRequest[]>([]);
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [holdTimers, setHoldTimers] = useState<Record<string, number>>({});

  // Bus Telematics location
  const [busLocation, setBusLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Poll telematics for active bus
  useEffect(() => {
    if (!bus?.id) return;
    const fetchBusLoc = async () => {
      try {
        const res = await fetch(`/api/telematics/live?busId=${bus.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.liveLocation?.latitude && data.liveLocation?.longitude) {
            setBusLocation({
              lat: Number(data.liveLocation.latitude),
              lng: Number(data.liveLocation.longitude),
            });
          }
        }
      } catch {
        // Fallback to store
        const storeLoc = store.getLiveLocation();
        if (storeLoc?.latitude && storeLoc?.longitude) {
          setBusLocation({ lat: storeLoc.latitude, lng: storeLoc.longitude });
        }
      }
    };

    fetchBusLoc();
    const interval = setInterval(fetchBusLoc, 4000);
    return () => clearInterval(interval);
  }, [bus?.id]);

  // Fast Student Map
  const studentMap = useMemo(() => {
    const map = new Map<string, any>();
    students.forEach(s => {
      if (s.id) map.set(s.id, s);
      if (s.userId) map.set(s.userId, s);
    });
    return map;
  }, [students]);

  // Fetch Requests
  const prevPendingRef = useRef(0);

  useEffect(() => {
    if (!activeTrip) return;

    let isMounted = true;
    const fetchRequests = async () => {
      try {
        const res = await fetch(`/api/dispatch/halt-requests?tripId=${activeTrip.id}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.requests) {
            const sorted = data.requests.sort(
              (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );

            const pending = sorted.filter((r: any) => r.status === "PENDING").length;
            if (pending > prevPendingRef.current && soundEnabled) {
              playChimeAlert();
            }
            prevPendingRef.current = pending;

            setRequests(sorted);
          }
        }
      } catch {}
    };

    fetchRequests();
    const interval = setInterval(fetchRequests, 3500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeTrip, soundEnabled]);

  // Countdown timer ticker for approved holds
  useEffect(() => {
    const interval = setInterval(() => {
      setHoldTimers(prev => {
        const next: Record<string, number> = {};
        let changed = false;
        Object.entries(prev).forEach(([id, secs]) => {
          if (secs > 0) {
            next[id] = secs - 1;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  function playChimeAlert() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch {}
  }

  const handleAction = async (studentId: string, status: "APPROVED" | "REJECTED") => {
    if (!activeTrip) return;
    setIsLoading(studentId);
    try {
      const res = await fetch("/api/dispatch/halt-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId: activeTrip.id, studentId, status }),
      });
      if (res.ok) {
        showToast(status === "APPROVED" ? "✓ Halt Approved (Bus holding for 2 mins)" : "Halt Request Rejected");
        setRequests(prev => prev.map(r => (r.studentId === studentId ? { ...r, status } : r)));

        if (status === "APPROVED") {
          setHoldTimers(prev => ({ ...prev, [studentId]: 120 }));
        }
      }
    } catch {
      showToast("Failed to update request");
    }
    setIsLoading(null);
  };

  if (!activeTrip) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-zinc-500 font-mono animate-in fade-in">
        <Hand className="w-12 h-12 mb-4 opacity-40 text-blue-500" />
        <p className="font-bold">No active trip selected. Please select a bus from the top bar.</p>
      </div>
    );
  }

  const pendingCount = requests.filter(r => r.status === "PENDING").length;

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* ── TOP SOS HERO BANNER ── */}
      <div className="bg-zinc-950 dark:bg-black border border-zinc-800 rounded-3xl p-5 sm:p-7 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-black uppercase tracking-widest mb-2.5">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  pendingCount > 0 ? "bg-amber-400 animate-pulse shadow-md shadow-amber-400/50" : "bg-emerald-400"
                }`}
              />
              <span className={pendingCount > 0 ? "text-amber-300" : "text-emerald-400"}>
                {pendingCount > 0 ? `${pendingCount} Active Emergency Halt Requests` : "No Emergency Halts"}
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              SOS & Late Student Halts
            </h2>
            <p className="text-zinc-400 mt-1 font-medium text-xs sm:text-sm max-w-md">
              Students running late send real-time GPS halt requests. Approve to hold the bus for 2 minutes or maintain schedule.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            {/* Audio Toggle */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                soundEnabled
                  ? "bg-zinc-900 border-zinc-700 text-white hover:bg-zinc-800"
                  : "bg-zinc-900/40 border-zinc-800 text-zinc-500"
              }`}
              title={soundEnabled ? "Mute alert chimes" : "Unmute alert chimes"}
            >
              {soundEnabled ? <Volume2 className="w-5 h-5 text-amber-400" /> : <VolumeX className="w-5 h-5" />}
            </button>

            {/* Pending Stat Badge */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-5 py-3 text-center min-w-[100px]">
              <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">{pendingCount}</div>
              <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Pending</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── REQUESTS GRID ── */}
      {requests.length === 0 ? (
        <div className="bg-zinc-950 dark:bg-black rounded-3xl p-12 text-center border border-zinc-800 shadow-sm flex flex-col items-center justify-center space-y-3">
          <div className="w-14 h-14 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center">
            <Check className="w-7 h-7 text-emerald-400" />
          </div>
          <h3 className="text-base font-bold text-white">All Clear — On Schedule</h3>
          <p className="text-zinc-400 text-xs max-w-xs">
            No students have triggered a late halt for {bus?.busNumber || "this bus"}. New requests will pop up instantly with an audible chime.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {requests.map(req => {
            const isPending = req.status === "PENDING";
            const isApproved = req.status === "APPROVED";
            const isRejected = req.status === "REJECTED";
            const loading = isLoading === req.studentId;
            const remainingHold = holdTimers[req.studentId] || 0;

            const stud = studentMap.get(req.studentId);
            const studentName = stud?.fullName || req.studentName || "Student";
            const studentCollegeId = stud?.studentIdCode || "";
            const studentPhoto = stud?.photoUrl || req.studentPhoto || "";
            const phone = stud?.phone;

            // Distance calculation
            let distanceInfo: { text: string; walkingMins: number } | null = null;
            if (busLocation && req.latitude && req.longitude) {
              const distKm = calculateDistanceKm(busLocation.lat, busLocation.lng, req.latitude, req.longitude);
              const meters = Math.round(distKm * 1000);
              const walkingMins = Math.max(1, Math.round(meters / 80));
              distanceInfo = {
                text: meters < 1000 ? `${meters}m away` : `${distKm.toFixed(1)}km away`,
                walkingMins,
              };
            }

            return (
              <div
                key={req.id}
                className={`relative bg-zinc-950 dark:bg-black rounded-3xl p-5 border shadow-xl flex flex-col transition-all duration-300 ${
                  isPending
                    ? "border-amber-500/50 shadow-amber-500/5 ring-1 ring-amber-500/20"
                    : "border-zinc-800 opacity-80"
                }`}
              >
                {/* Status Badge */}
                <div className="flex items-center justify-between mb-3.5">
                  <span
                    className={`px-2.5 py-1 text-[10px] font-black uppercase rounded-lg tracking-wider flex items-center gap-1.5 ${
                      isApproved
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                        : isRejected
                        ? "bg-red-950 text-red-400 border border-red-800"
                        : "bg-amber-950 text-amber-300 border border-amber-800 animate-pulse"
                    }`}
                  >
                    {isPending && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                    {req.status}
                  </span>

                  <span className="text-[11px] font-mono text-zinc-500 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-zinc-400" />
                    {new Date(req.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                {/* Student Identity Card */}
                <div className="flex items-center gap-3 mb-3.5">
                  {studentPhoto ? (
                    <div className="relative w-12 h-14 rounded-xl overflow-hidden border border-emerald-500/70 bg-black shrink-0 shadow-sm">
                      <img
                        src={getSafePhotoUrl(studentPhoto)}
                        alt={studentName}
                        crossOrigin="anonymous"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-12 h-14 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center font-black text-zinc-300 text-sm uppercase shrink-0">
                      {studentName.substring(0, 2)}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-white text-base truncate">{studentName}</h4>
                    {studentCollegeId && (
                      <div className="text-[10px] font-mono font-bold text-zinc-400">
                        ID: {studentCollegeId}
                      </div>
                    )}
                    {stud?.department && (
                      <div className="text-xs text-zinc-500 truncate">{stud.department}</div>
                    )}
                  </div>

                  {phone && (
                    <a
                      href={`tel:${phone}`}
                      className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-emerald-400 hover:text-white"
                      title={`Call ${studentName}`}
                    >
                      <Phone className="w-4 h-4" />
                    </a>
                  )}
                </div>

                {/* Distance & Sprint Estimation */}
                {distanceInfo && (
                  <div className="mb-3.5 p-2.5 rounded-xl bg-zinc-900/70 border border-zinc-800 text-xs flex items-center justify-between text-zinc-300">
                    <span className="flex items-center gap-1.5 font-bold text-amber-300">
                      <Compass className="w-3.5 h-3.5 text-amber-400" />
                      {distanceInfo.text}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-400">
                      ~{distanceInfo.walkingMins} min sprint
                    </span>
                  </div>
                )}

                {/* Active Hold Countdown Timer */}
                {isApproved && remainingHold > 0 && (
                  <div className="mb-3.5 p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/80 text-emerald-300 text-xs space-y-1.5 animate-pulse">
                    <div className="flex items-center justify-between font-black">
                      <span className="flex items-center gap-1.5">
                        <Timer className="w-4 h-4 text-emerald-400" /> Bus Holding
                      </span>
                      <span className="font-mono text-sm font-black">
                        {Math.floor(remainingHold / 60)}:{(remainingHold % 60).toString().padStart(2, "0")}
                      </span>
                    </div>
                    <div className="w-full bg-emerald-950 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-400 h-full rounded-full transition-all"
                        style={{ width: `${(remainingHold / 120) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Locate on Map Link */}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${req.latitude},${req.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full bg-zinc-900 hover:bg-zinc-800 py-2.5 rounded-xl text-center text-xs font-bold text-zinc-300 border border-zinc-800 flex items-center justify-center gap-2 mb-3.5 transition-colors cursor-pointer"
                >
                  <Navigation2 className="w-4 h-4 text-blue-400" />
                  <span>Locate on Google Maps</span>
                </a>

                {/* Thumb Action Buttons (min 48px) */}
                <div className="mt-auto pt-3 border-t border-zinc-800">
                  {isPending ? (
                    <div className="flex items-center gap-2">
                      <button
                        disabled={loading}
                        onClick={() => handleAction(req.studentId, "APPROVED")}
                        className="flex-1 min-h-[46px] rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                        <span>Hold 2 Mins</span>
                      </button>

                      <button
                        disabled={loading}
                        onClick={() => handleAction(req.studentId, "REJECTED")}
                        className="flex-1 min-h-[46px] rounded-xl bg-zinc-900 hover:bg-red-950/60 hover:text-red-400 border border-zinc-800 text-zinc-400 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <X className="w-4 h-4" />
                        <span>Reject</span>
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`text-center text-xs font-black py-1.5 rounded-xl ${
                        isApproved ? "text-emerald-400 bg-emerald-950/20" : "text-red-400 bg-red-950/20"
                      }`}
                    >
                      {isApproved ? "✓ Stop Approved (Holding)" : "✕ Stop Rejected"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
