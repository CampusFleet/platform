"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, Hand, MapPin, Phone, X } from "lucide-react";
import { useConductorContext } from "../ConductorContext";
import { Badge, Button, Card, CardHeader, EmptyState } from "@/components/ui";
import { calculateDistanceKm } from "@/lib/utils";
import { getSafePhotoUrl } from "@/lib/image-utils";

/**
 * "Wait for me" requests from riders on the conductor's current run. Data comes with the duty poll
 * (/api/crew/duty every 8 s: haltRequests + busLocation), so this tab adds no polling of its own.
 * Approve/Reject → PATCH /api/dispatch/halt-requests (crew must be assigned to the trip).
 */

const HOLD_SECONDS = 120;

function chime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(587, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.2);
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  } catch {
    /* no audio */
  }
}

export default function HaltRequestsTab() {
  const { duty, activeTrip, showToast, refreshLiveState } = useConductorContext();
  const requests = duty?.haltRequests || [];
  const bus = duty?.busLocation || null;
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const pendingCount = requests.filter((r) => r.status === "PENDING").length;
  const prevPending = useRef(pendingCount);

  useEffect(() => {
    if (pendingCount > prevPending.current) chime();
    prevPending.current = pendingCount;
  }, [pendingCount]);

  useEffect(() => {
    if (!requests.some((r) => r.status === "APPROVED")) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [requests]);

  const act = async (studentId: string, status: "APPROVED" | "REJECTED" | "COMPLETED") => {
    if (!activeTrip) return;
    setBusy(studentId);
    try {
      const res = await fetch("/api/dispatch/halt-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId: activeTrip.id, studentId, status }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.success) throw new Error(d.error || "Could not update the request.");
      showToast(status === "APPROVED" ? "The student was told the bus will wait." : status === "REJECTED" ? "The student was told the bus cannot wait." : "Request closed.");
      await refreshLiveState();
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!activeTrip) {
    return <EmptyState className="mt-10" icon={<Hand className="w-6 h-6" />} title="No trip right now" />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={<Hand className="w-5 h-5" />}
          title="Wait requests"
          subtitle="Students who asked the bus to wait for them"
          action={pendingCount > 0 ? <Badge tone="amber" dot>{pendingCount} waiting</Badge> : <Badge tone="green">None</Badge>}
        />
        {requests.length === 0 && <p className="text-sm text-gray-500">No requests on this run.</p>}
        <ul className="space-y-2">
          {requests.map((r) => {
            const phone = duty?.manifest.find((p) => p.studentId === r.studentId)?.phone || null;
            const km = bus && Number.isFinite(r.latitude) ? calculateDistanceKm(bus.latitude, bus.longitude, r.latitude, r.longitude) : null;
            const left = r.status === "APPROVED" ? Math.max(0, HOLD_SECONDS - Math.round((now - new Date(r.updatedAt).getTime()) / 1000)) : null;
            return (
              <li key={r.studentId} className="p-3 rounded-xl border border-gray-200 dark:border-zinc-800 flex items-start gap-3 min-w-0">
                {r.studentPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={getSafePhotoUrl(r.studentPhoto)} alt="" className="w-11 h-11 rounded-xl object-cover shrink-0" />
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-zinc-900 shrink-0" />
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-black truncate">{r.studentName}</p>
                    <Badge tone={r.status === "PENDING" ? "amber" : r.status === "APPROVED" ? "green" : r.status === "REJECTED" ? "red" : "neutral"}>{r.status.toLowerCase()}</Badge>
                  </div>
                  <p className="text-xs text-gray-500 flex flex-wrap items-center gap-x-2">
                    <span>{new Date(r.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                    {km != null && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`} from the bus
                      </span>
                    )}
                    {left != null && <span className="font-bold text-emerald-700 dark:text-emerald-400">holding · {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>}
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {r.status === "PENDING" && (
                      <>
                        <Button size="sm" variant="success" loading={busy === r.studentId} onClick={() => act(r.studentId, "APPROVED")}>
                          <Check className="w-4 h-4" /> Wait
                        </Button>
                        <Button size="sm" variant="secondary" disabled={busy === r.studentId} onClick={() => act(r.studentId, "REJECTED")}>
                          <X className="w-4 h-4" /> Can't wait
                        </Button>
                      </>
                    )}
                    {r.status === "APPROVED" && (
                      <Button size="sm" variant="secondary" loading={busy === r.studentId} onClick={() => act(r.studentId, "COMPLETED")}>
                        Done
                      </Button>
                    )}
                    {Number.isFinite(r.latitude) && (
                      <a className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-blue-600" href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`} target="_blank" rel="noreferrer">
                        <MapPin className="w-4 h-4" /> Map
                      </a>
                    )}
                    {phone && (
                      <a className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-emerald-700" href={`tel:${phone}`}>
                        <Phone className="w-4 h-4" /> Call
                      </a>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
