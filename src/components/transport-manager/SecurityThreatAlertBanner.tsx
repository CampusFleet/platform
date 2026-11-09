"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  AlertTriangle,
  Volume2,
  VolumeX,
  X,
  ExternalLink,
  CheckCircle,
  Eye,
  Radio,
  MapPin,
} from "lucide-react";
import type { BusSecurityIncident } from "@/lib/types";

export function SecurityThreatAlertBanner() {
  const [activeIncidents, setActiveIncidents] = useState<BusSecurityIncident[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const audioIntervalRef = useRef<NodeJS.Timeout>();

  // Web Audio emergency pulse
  const playAlarmSiren = useCallback(() => {
    if (isMuted) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      // High-low emergency two-tone alert
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(440, ctx.currentTime + 0.15);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } catch (e) {
      // Audio context restricted until user interacts
    }
  }, [isMuted]);

  // Fetch active incidents
  const fetchActiveIncidents = useCallback(async () => {
    try {
      const res = await fetch("/api/transport-manager/incidents?status=ACTIVE&limit=5");
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.incidents)) {
        setActiveIncidents(data.incidents);
      }
    } catch (e) {
      // Polling error non-fatal
    }
  }, []);

  useEffect(() => {
    fetchActiveIncidents();

    // 1. Cross-tab BroadcastChannel listener
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof window !== "undefined" && "BroadcastChannel" in window) {
        channel = new BroadcastChannel("campusfleet_security_incidents");
        channel.onmessage = (event) => {
          if (event?.data?.type === "NEW_INCIDENT") {
            fetchActiveIncidents();
            setIsDismissed(false);
            playAlarmSiren();
          }
        };
      }
    } catch (e) {
      // fallback to polling
    }

    // 2. Poll active threats every 6 seconds
    const interval = setInterval(fetchActiveIncidents, 6000);

    return () => {
      clearInterval(interval);
      if (channel) channel.close();
    };
  }, [fetchActiveIncidents, playAlarmSiren]);

  // Play alarm pulse every 12 seconds if critical threats are active and not dismissed
  useEffect(() => {
    const hasCritical = activeIncidents.some((i) => i.severity === "CRITICAL");
    if (hasCritical && !isDismissed && !isMuted) {
      playAlarmSiren();
      audioIntervalRef.current = setInterval(playAlarmSiren, 12000);
    }
    return () => {
      if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
    };
  }, [activeIncidents, isDismissed, isMuted, playAlarmSiren]);

  if (activeIncidents.length === 0 || isDismissed) {
    return null;
  }

  const latestIncident = activeIncidents[0];

  const handleAcknowledgeQuick = async (id: string) => {
    try {
      await fetch(`/api/transport-manager/incidents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "ACKNOWLEDGED",
          resolutionNotes: "Quick acknowledged from global threat alert banner",
        }),
      });
      fetchActiveIncidents();
    } catch (e) {
      console.warn("Failed to acknowledge quick incident:", e);
    }
  };

  return (
    <aside
      aria-label="Critical Security Threat Alert"
      className="sticky top-0 z-50 bg-gradient-to-r from-rose-900 via-rose-800 to-red-950 text-white px-4 py-2.5 shadow-2xl border-b-2 border-rose-500 animate-in slide-in-from-top-2 duration-300"
    >
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        {/* Left: Incident info & pulsing siren icon */}
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
            </span>
            <div className="p-2 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-300">
              <ShieldAlert className="w-5 h-5 animate-pulse text-rose-400" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-600 text-white">
                {latestIncident.severity} ALERT
              </span>
              <span className="text-sm font-black text-rose-100">
                {latestIncident.incidentType.replace(/_/g, " ")}
              </span>
              <span className="text-xs text-rose-200/80 font-mono">
                • Bus {latestIncident.busNumber || latestIncident.busId}
              </span>
            </div>
            <p className="text-xs text-rose-200/90 flex items-center gap-1.5 mt-0.5">
              <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>
                Detected at <strong>{latestIncident.stopName || "Route Stop"}</strong> (
                {latestIncident.latitude.toFixed(4)}, {latestIncident.longitude.toFixed(4)})
              </span>
              {activeIncidents.length > 1 && (
                <span className="font-bold underline ml-1 text-white">
                  +{activeIncidents.length - 1} more active
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end">
          <button
            type="button"
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-700/60 text-rose-200 transition-colors"
            title={isMuted ? "Unmute alarm siren" : "Mute alarm siren"}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-amber-300" />}
          </button>

          <button
            type="button"
            onClick={() => handleAcknowledgeQuick(latestIncident.id)}
            className="px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-600 text-xs font-bold text-rose-100 rounded-xl transition-all active:scale-95 flex items-center gap-1.5"
          >
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>Acknowledge</span>
          </button>

          <Link
            href="/transport-manager/security"
            className="px-3 py-1.5 bg-white text-rose-950 hover:bg-rose-50 text-xs font-black rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5"
          >
            <Eye className="w-3.5 h-3.5 text-rose-700" />
            <span>Open Security Center</span>
          </Link>

          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="p-1.5 text-rose-300 hover:text-white rounded-lg hover:bg-rose-900/40 transition-colors"
            title="Minimize alert banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
