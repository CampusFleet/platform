"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Bus, MapPin, Sparkles, RefreshCw, AlertCircle, CheckCircle2, ArrowRight, Clock, Zap } from "lucide-react";
import { Stop } from "@/lib/types";
import { CustomDropdown } from "@/components/common/CustomDropdown";

interface IncomingShuttle {
  tripId: string;
  tripCode?: string;
  routeId: string;
  routeName: string;
  direction: string;
  busId: string;
  busNumber: string;
  plateNumber?: string;
  capacity: number;
  currentOccupancy: number;
  availableSeats: number;
  hasFreeSeats: boolean;
  status?: "IN_PROGRESS" | "SCHEDULED" | string;
  departureTime?: string;
  arrivalTime?: string;
  shiftName?: string;
  nearestMergeStop: {
    id: string;
    name: string;
  };
  canTakeStanding: boolean;
}

interface IncomingShuttleRadarProps {
  studentId: string;
  currentStopId?: string;
  stops: Stop[];
  onClaimSuccess?: (result: any) => void;
}

export function IncomingShuttleRadar({
  studentId,
  currentStopId,
  stops,
  onClaimSuccess,
}: IncomingShuttleRadarProps) {
  const [selectedStopId, setSelectedStopId] = useState<string>(currentStopId || stops[0]?.id || "");
  const [shuttles, setShuttles] = useState<IncomingShuttle[]>([]);
  const [loading, setLoading] = useState(false);
  const [claimingTripId, setClaimingTripId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    if (currentStopId) {
      setSelectedStopId(currentStopId);
    } else if (!selectedStopId && stops.length > 0) {
      setSelectedStopId(stops[0].id);
    }
  }, [currentStopId, stops, selectedStopId]);

  const fetchIncomingShuttles = useCallback(async (stopId: string) => {
    if (!stopId) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/shuttles/incoming-claim?stopId=${encodeURIComponent(stopId)}`);
      const data = await res.json();
      if (data.success) {
        const raw = data.shuttles || [];
        // Deduplicate shuttles by busId so no duplicate physical buses render
        const seen = new Set<string>();
        const unique = raw.filter((s: IncomingShuttle) => {
          const key = s.busId || s.tripId;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setShuttles(unique);
      } else {
        setMessage({ type: "error", text: data.message || "Could not retrieve incoming shuttles." });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: "Network error loading shuttle radar." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedStopId) {
      fetchIncomingShuttles(selectedStopId);
    }
  }, [selectedStopId, fetchIncomingShuttles]);

  const handlePickOne = async (shuttle: IncomingShuttle) => {
    if (!studentId) {
      setMessage({ type: "error", text: "Please log in to claim a seat or standing pass." });
      return;
    }
    setClaimingTripId(shuttle.tripId);
    setMessage(null);

    try {
      const res = await fetch("/api/shuttles/incoming-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          tripId: shuttle.tripId,
          stopId: selectedStopId,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setMessage({
          type: "success",
          text: data.message,
        });
        if (onClaimSuccess) {
          onClaimSuccess(data);
        }
        // Refresh radar list
        fetchIncomingShuttles(selectedStopId);
      } else {
        setMessage({ type: "error", text: data.message || "Failed to claim incoming shuttle pass." });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: "Failed to connect to server." });
    } finally {
      setClaimingTripId(null);
    }
  };

  const selectedStop = stops.find((s) => s.id === selectedStopId) || stops[0];

  return (
    <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 sm:p-6 border border-gray-200 dark:border-gray-800 shadow-lg space-y-5">
      {/* Header with Title & Stop Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100 dark:border-gray-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/60 px-2.5 py-0.5 rounded-full border border-pink-200 dark:border-pink-800/60">
              <Zap className="w-3 h-3 text-pink-500 fill-pink-500 shrink-0" />
              <span>Missed Bus / Rapid Transit Recovery</span>
            </span>
          </div>
          <h3 className="text-lg font-black text-gray-900 dark:text-white mt-1">
            Approaching Shuttle Radar & &quot;Pick One&quot;
          </h3>
          <p className="text-xs text-gray-500 max-w-lg">
            Reached your stop late? Approaching buses on your route allow instant seat claiming. If seats are full, claim an authorized Standing Pass valid till the next Bus Merge Stop!
          </p>
        </div>

        {/* Station Selector Pill */}
        <div className="flex items-center gap-2">
          <CustomDropdown
            value={selectedStopId}
            onChange={(val) => setSelectedStopId(val)}
            size="sm"
            options={stops.map((s) => ({
              value: s.id,
              label: `${s.name} (${s.code}) ${s.isBusMergeStop ? "• Merge Hub" : ""}`,
            }))}
            containerClassName="w-64"
          />

          <button
            onClick={() => fetchIncomingShuttles(selectedStopId)}
            disabled={loading}
            className="p-2.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
            title="Refresh approaching buses"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Status Message */}
      {message && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center gap-2.5 animate-in fade-in ${
            message.type === "success"
              ? "bg-green-50 dark:bg-green-950/40 border-green-300 dark:border-green-800 text-green-900 dark:text-green-200"
              : message.type === "error"
              ? "bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200"
              : "bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Incoming Shuttles List */}
      <div className="space-y-3">
        {loading && shuttles.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-400 font-bold animate-pulse space-y-2">
            <RefreshCw className="w-6 h-6 mx-auto animate-spin text-pink-600" />
            <div>Scanning approaching campus shuttles near {selectedStop?.name}...</div>
          </div>
        ) : shuttles.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-dashed border-gray-200 dark:border-gray-800 space-y-2">
            <Bus className="w-8 h-8 mx-auto text-gray-400" />
            <div className="text-sm font-bold text-gray-700 dark:text-gray-300">
              No Approaching Shuttles Detected
            </div>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              No active buses are currently en route to {selectedStop?.name}. Check regular shifts or select an alternative boarding station.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {shuttles.map((shuttle) => {
              const isClaiming = claimingTripId === shuttle.tripId;
              const hasFreeSeats = shuttle.availableSeats > 0;

              return (
                <div
                  key={shuttle.tripId}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                    hasFreeSeats
                      ? "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 hover:border-blue-500"
                      : "bg-pink-50/40 dark:bg-pink-950/20 border-pink-200 dark:border-pink-900/60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`p-2.5 rounded-xl ${
                          hasFreeSeats
                            ? "bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400"
                            : "bg-pink-100 dark:bg-pink-950 text-pink-600 dark:text-pink-400"
                        }`}
                      >
                        <Bus className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-1.5">
                          <span>{shuttle.busNumber}</span>
                          <span className="text-[10px] font-normal px-2 py-0.5 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-mono">
                            {shuttle.direction === "CAMPUS_TO_HOME" ? "Campus → Home" : "Home → Campus"}
                          </span>
                          {shuttle.status === "IN_PROGRESS" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-950 px-2 py-0.5 rounded-full border border-green-300 dark:border-green-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                              En Route
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-md font-mono">
                              <Clock className="w-3 h-3 text-gray-400" />
                              {shuttle.departureTime || "07:30"}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 font-medium mt-0.5">
                          {shuttle.routeName} {shuttle.shiftName ? `• ${shuttle.shiftName}` : ""}
                        </div>
                      </div>
                    </div>

                    {/* Capacity Badge */}
                    <div className="text-right">
                      {hasFreeSeats ? (
                        <span className="px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-950/80 text-green-800 dark:text-green-300 text-[10px] font-extrabold border border-green-300 dark:border-green-800 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          {shuttle.availableSeats} Free Seats
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full bg-yellow-100 dark:bg-yellow-950/80 text-yellow-800 dark:text-yellow-300 text-[10px] font-extrabold border border-yellow-300 dark:border-yellow-800">
                          Seats Full • Stand OK
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Standing Pass Reassurance Notice if Bus is full */}
                  {!hasFreeSeats && (
                    <div className="p-2.5 rounded-xl bg-pink-100/60 dark:bg-pink-950/50 border border-pink-200 dark:border-pink-800/40 text-[11px] text-pink-900 dark:text-pink-300 space-y-0.5">
                      <div className="font-bold flex items-center gap-1">
                        <span>⚡ Standing Passenger Permitted</span>
                      </div>
                      <p className="text-[10px] opacity-90">
                        Stand safely till <strong>{shuttle.nearestMergeStop.name}</strong>. Free seat will be allocated there!
                      </p>
                    </div>
                  )}

                  {/* Pick One Button */}
                  <div className="pt-1 flex items-center justify-between gap-3">
                    <div className="text-[11px] text-gray-400 font-mono">
                      Cap: {shuttle.currentOccupancy}/{shuttle.capacity}
                    </div>

                    <button
                      onClick={() => handlePickOne(shuttle)}
                      disabled={isClaiming}
                      className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer ${
                        hasFreeSeats
                          ? "bg-blue-600 hover:bg-blue-500  text-white shadow-blue-500/20"
                          : "bg-pink-700 hover:bg-pink-600  text-white shadow-pink-500/20"
                      }`}
                    >
                      {isClaiming ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Claiming...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>
                            {hasFreeSeats ? "Pick One (Free Seat)" : "Pick One (Stand Till Merge)"}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
