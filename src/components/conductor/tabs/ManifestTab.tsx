"use client";

import React, { useMemo, useState } from "react";
import { AlertTriangle, BellRing, BusFront, CheckCircle2, Phone, RotateCcw, Search, Users, X } from "lucide-react";
import { Booking, Student, Stop, Bus, Route, Shift } from "@/lib/types";
import { getSafePhotoUrl } from "@/lib/image-utils";
import { useConductorContext, type EnrichedPassenger, type BusDepartureAlert } from "../ConductorContext";
import { GateOccupancyCard } from "../GateOccupancyCard";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Segmented, Sheet, Stat, Textarea, cn } from "@/components/ui";

interface ManifestTabProps {
  tripBookings: (EnrichedPassenger | Booking)[];
  students: Student[];
  stops: Stop[];
  bus?: Bus;
  route?: Route;
  shift?: Shift;
  boardedCount: number;
  pendingCount: number;
  waitlistCount: number;
  roamingCount: number;
  onboardConfirmedCount?: number;
  runningCount?: number;
  outsideCount?: number;
  activeDepartureAlert?: BusDepartureAlert | null;
  onTriggerDepartureAlert?: (customMessage?: string) => Promise<boolean>;
  onDismissDepartureAlert?: () => Promise<boolean>;
  onMarkAttendance: (studentId: string, status: "BOARDED" | "ABSENT" | "NO_SHOW") => void;
  onMarkRoamingHold?: (studentId: string, bookingId: string) => void;
  onRefresh?: () => void;
  isSyncing?: boolean;
}

type StatusFilter = "ALL" | "AWAITING" | "BOARDED" | "WAITLIST" | "ROAMING";

function boardedVia(u: string) {
  const m = u.toUpperCase();
  if (m.includes("FACE") || m.includes("BIOMETRIC")) return "Face ID";
  if (m.includes("DYNAMIC") || m.includes("QR")) return "QR";
  if (m.includes("RFID")) return "RFID card";
  return u;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function ManifestTab({
  tripBookings,
  students,
  stops,
  bus,
  route,
  shift,
  boardedCount,
  pendingCount,
  waitlistCount,
  roamingCount,
  onboardConfirmedCount = 0,
  runningCount = 0,
  outsideCount,
  activeDepartureAlert,
  onTriggerDepartureAlert,
  onDismissDepartureAlert,
  onMarkAttendance,
}: ManifestTabProps) {
  const { duty } = useConductorContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [selectedStopId, setSelectedStopId] = useState("ALL");
  const [recallOpen, setRecallOpen] = useState(false);
  const [recallMessage, setRecallMessage] = useState("");
  const [sendingRecall, setSendingRecall] = useState(false);

  const studentMap = useMemo(() => {
    const map = new Map<string, Student>();
    students.forEach((s) => {
      if (s.id) map.set(s.id, s);
      if (s.userId) map.set(s.userId, s);
    });
    return map;
  }, [students]);

  const stopMap = useMemo(() => new Map(stops.map((s) => [s.id, s] as const)), [stops]);

  // Teachers are identified from the duty manifest (EnrichedPassenger has no `kind`).
  const teacherIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of duty?.manifest || []) if (p.kind === "TEACHER") ids.add(p.reservationId).add(p.studentId);
    return ids;
  }, [duty]);

  const stopSummaries = useMemo(() => {
    const counts: Record<string, { id: string; name: string; total: number; boarded: number }> = {};
    tripBookings.forEach((b) => {
      const id = b.boardingStopId || "";
      if (!id) return;
      counts[id] ??= { id, name: stopMap.get(id)?.name || (b as EnrichedPassenger).boardingStopName || "Not set", total: 0, boarded: 0 };
      counts[id].total += 1;
      if (b.status === "BOARDED") counts[id].boarded += 1;
    });
    return Object.values(counts);
  }, [tripBookings, stopMap]);

  const filteredPassengers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tripBookings.filter((b) => {
      const s = (b as EnrichedPassenger).student || studentMap.get(b.studentId);
      if (selectedStopId !== "ALL" && b.boardingStopId !== selectedStopId) return false;
      if (statusFilter === "BOARDED" && b.status !== "BOARDED") return false;
      if (statusFilter === "AWAITING" && b.status !== "CONFIRMED") return false;
      if (statusFilter === "WAITLIST" && b.status !== "WAITLISTED") return false;
      if (statusFilter === "ROAMING" && b.roamingStatus !== "ROAMING") return false;
      if (!q) return true;
      const e = b as any;
      return [s?.fullName || e.fullName, s?.studentIdCode || e.studentIdCode, s?.phone, b.seatNumber || e.seatCode, stopMap.get(b.boardingStopId || "")?.name, s?.department]
        .some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [tripBookings, selectedStopId, statusFilter, searchQuery, studentMap, stopMap]);

  const stopName = (b: EnrichedPassenger | Booking) =>
    stopMap.get(b.boardingStopId || "")?.name || (b as EnrichedPassenger).boardingStopName || "";
  const capacity = bus?.capacity || 0;
  const occupancy = capacity ? Math.min(100, Math.round((boardedCount / capacity) * 100)) : null;
  const load = occupancy == null ? null : occupancy >= 90 ? { tone: "red" as const, label: "Full", bar: "bg-rose-500" } : occupancy >= 70 ? { tone: "amber" as const, label: "Busy", bar: "bg-amber-500" } : { tone: "green" as const, label: "Normal", bar: "bg-emerald-500" };
  const outside = outsideCount !== undefined ? outsideCount : pendingCount;
  const filtersOn = selectedStopId !== "ALL" || statusFilter !== "ALL" || !!searchQuery;

  const sendRecall = async () => {
    setSendingRecall(true);
    if (onTriggerDepartureAlert) await onTriggerDepartureAlert(recallMessage);
    setSendingRecall(false);
    setRecallOpen(false);
  };

  return (
    <div className="space-y-4">
      {bus?.id ? <GateOccupancyCard busId={Number(bus.id)} capacity={capacity || undefined} /> : null}

      <Card className="space-y-3">
        <CardHeader
          icon={<BusFront className="w-5 h-5" />}
          title={bus?.busNumber ? `Bus ${bus.busNumber}` : "Bus not set"}
          subtitle={[route?.name || "Route not set", shift?.name, shift?.startTime && `Departs ${shift.startTime}`].filter(Boolean).join(" · ")}
          action={load && <Badge tone={load.tone}>{load.label}</Badge>}
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Boarded" value={`${boardedCount} / ${tripBookings.length}`} hint={occupancy != null ? `${occupancy}% of seats` : undefined} />
          <Stat label="Awaiting" value={pendingCount} />
          <Stat label="Waitlist" value={waitlistCount} />
          <Stat label="Seats" value={capacity || "Not set"} hint={bus?.registrationNo} />
        </div>
        {load && (
          <div className="h-2 rounded-full bg-gray-100 dark:bg-zinc-800 overflow-hidden">
            <div className={cn("h-full rounded-full transition-all", load.bar)} style={{ width: `${occupancy}%` }} />
          </div>
        )}

        <div className={cn("p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center gap-3", activeDepartureAlert ? "border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30" : "border-gray-200 dark:border-zinc-800")}>
          <div className="min-w-0 flex-1 text-xs text-gray-600 dark:text-gray-400 space-y-1">
            <p className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
              <BellRing className="w-4 h-4 shrink-0 text-amber-500" />
              <span className="truncate">{activeDepartureAlert ? "Departure alarm is ringing" : "Departure alarm"}</span>
            </p>
            {activeDepartureAlert ? (
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="green">{onboardConfirmedCount} in the bus</Badge>
                <Badge tone="amber">{runningCount} running (2 min hold)</Badge>
                <Badge>{outside} not back</Badge>
              </div>
            ) : (
              <p>Rings the phones of riders who are not on the bus yet.</p>
            )}
          </div>
          {activeDepartureAlert ? (
            <Button variant="secondary" size="sm" className="shrink-0" onClick={async () => onDismissDepartureAlert && (await onDismissDepartureAlert())}>
              Stop alarm
            </Button>
          ) : (
            <Button
              variant="danger"
              size="sm"
              className="shrink-0"
              onClick={() => {
                setRecallMessage(`${bus?.busNumber ? `Bus ${bus.busNumber}` : "Your bus"} is about to leave. Please come back and confirm you are on board.`);
                setRecallOpen(true);
              }}
            >
              Sound alarm ({outside})
            </Button>
          )}
        </div>
      </Card>

      {stopSummaries.length > 0 && (
        <Segmented
          value={selectedStopId}
          onChange={setSelectedStopId}
          options={[
            { value: "ALL", label: `All stops (${tripBookings.length})` },
            ...stopSummaries.map((s) => ({
              value: s.id,
              label: (
                <span className="flex items-center gap-1.5">
                  <span className="truncate max-w-[10rem]">{s.name}</span>
                  <span className="opacity-70">{s.boarded}/{s.total}</span>
                </span>
              ),
            })),
          ]}
        />
      )}

      <Card className="space-y-3">
        <Segmented<StatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "ALL", label: `All (${tripBookings.length})` },
            { value: "AWAITING", label: `Awaiting (${pendingCount})` },
            { value: "BOARDED", label: `Boarded (${boardedCount})` },
            { value: "WAITLIST", label: `Waitlist (${waitlistCount})` },
            { value: "ROAMING", label: `Roaming (${roamingCount})` },
          ]}
        />
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search name, ID, seat, stop" className="pl-10 pr-10" />
          {searchQuery && (
            <button type="button" aria-label="Clear search" onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {filteredPassengers.length === 0 ? (
          <EmptyState
            className="border-0"
            icon={<Users className="w-6 h-6" />}
            title="No passengers"
            action={filtersOn && (
              <Button variant="secondary" size="sm" onClick={() => { setSelectedStopId("ALL"); setStatusFilter("ALL"); setSearchQuery(""); }}>
                Clear filters
              </Button>
            )}
          >
            {filtersOn ? "Nobody matches these filters." : "Nobody is on this run yet."}
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {filteredPassengers.map((b) => {
              const e = b as EnrichedPassenger;
              const s = e.student || studentMap.get(b.studentId);
              const isBoarded = b.status === "BOARDED";
              const isAbsent = b.status === "ABSENT" || b.status === "NO_SHOW";
              const isWaitlisted = b.status === "WAITLISTED";
              const seat = b.seatNumber || e.seatCode || (isWaitlisted ? (b.waitlistPosition ? `WL-${b.waitlistPosition}` : "WL") : "No seat");
              const name = s?.fullName || e.fullName || "Name not set";
              const idCode = s?.studentIdCode || e.studentIdCode || "";
              const photo = s?.photoUrl || e.photoUrl || "";
              const phone = s?.phone || e.phone;
              const isTeacher = teacherIds.has(b.id) || teacherIds.has(b.studentId);
              return (
                <li
                  key={b.id || `passenger-${b.studentId}`}
                  className={cn(
                    "p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center gap-3 min-w-0",
                    isBoarded ? "border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20" : isAbsent ? "border-gray-200 dark:border-zinc-800 opacity-60" : "border-gray-200 dark:border-zinc-800"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={cn(
                        "w-11 h-11 shrink-0 rounded-xl flex items-center justify-center px-1 text-center text-[10px] font-black leading-tight",
                        isBoarded ? "bg-emerald-600 text-white" : isWaitlisted ? "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300" : "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300"
                      )}
                    >
                      <span className="line-clamp-2 break-all">{seat}</span>
                    </div>
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getSafePhotoUrl(photo)}
                        alt=""
                        crossOrigin="anonymous"
                        referrerPolicy="no-referrer"
                        onError={(ev) => {
                          if (ev.currentTarget.src !== photo) ev.currentTarget.src = photo;
                        }}
                        className="w-11 h-11 rounded-xl object-cover shrink-0"
                      />
                    ) : (
                      <div title="No photo on file. Check their ID card." className="w-11 h-11 shrink-0 rounded-xl border border-dashed border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 flex flex-col items-center justify-center">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span className="text-[8px] font-bold leading-none mt-0.5">Check ID</span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-sm font-black truncate">{name}</p>
                        {isTeacher && <Badge tone="blue" className="shrink-0">Teacher</Badge>}
                        {b.roamingStatus === "ONBOARD_CONFIRMED" ? (
                          <Badge tone="green" className="shrink-0">In bus</Badge>
                        ) : b.roamingStatus === "RUNNING_TO_BUS" ? (
                          <Badge tone="amber" className="shrink-0">Running</Badge>
                        ) : b.roamingStatus === "ROAMING" ? (
                          <Badge className="shrink-0">Roaming</Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        {[idCode, stopName(b) || "Stop not set", s?.department, s?.semester && `Sem ${s.semester}`].filter(Boolean).join(" · ")}
                      </p>
                      {b.boardedAt && (
                        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 truncate">
                          Boarded {time(b.boardedAt)}
                          {e.unlockedBy && ` · ${boardedVia(e.unlockedBy)}`}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 justify-end">
                    {phone && (
                      <a href={`tel:${phone}`} aria-label={`Call ${name}`} className="p-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 text-emerald-600">
                        <Phone className="w-4 h-4" />
                      </a>
                    )}
                    {isBoarded ? (
                      <>
                        <Badge tone="green" className="py-1.5 px-3">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Boarded
                        </Badge>
                        <Button variant="secondary" size="sm" aria-label="Undo, mark not boarded" title="Undo" onClick={() => onMarkAttendance(b.studentId, "ABSENT")}>
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="success" size="sm" className="min-h-[44px] flex-1 sm:flex-initial px-5" onClick={() => onMarkAttendance(b.studentId, "BOARDED")}>
                          <CheckCircle2 className="w-4 h-4" /> Board
                        </Button>
                        <Button variant="secondary" size="sm" className="min-h-[44px]" onClick={() => onMarkAttendance(b.studentId, "ABSENT")}>
                          Absent
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Sheet
        open={recallOpen}
        onClose={() => setRecallOpen(false)}
        title="Sound departure alarm"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" block onClick={() => setRecallOpen(false)}>Cancel</Button>
            <Button variant="danger" block loading={sendingRecall} onClick={sendRecall}>Ring {outside} phones</Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
          <p>
            {outside} riders not on the bus will hear an alarm and can answer &ldquo;I&apos;m in the bus&rdquo; or &ldquo;Running to the bus&rdquo; (2 min hold).
          </p>
          <Field label="Message">
            <Textarea value={recallMessage} onChange={(ev) => setRecallMessage(ev.target.value)} rows={3} />
          </Field>
        </div>
      </Sheet>
    </div>
  );
}
