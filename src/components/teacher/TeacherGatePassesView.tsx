"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BusFront, Check, Phone, ShieldCheck, X } from "lucide-react";
import { UnifiedAppHeader } from "@/components/common/UnifiedAppHeader";
import { Badge, Button, Card, EmptyState, Input, Segmented, Select, cn } from "@/components/ui";
import { getSafePhotoUrl } from "@/lib/image-utils";
import type { GatePassItem } from "@/lib/teachers/gate-passes";

/**
 * Teacher review of leave-early requests. Approving books the student on the bus they picked
 * (review_early_departure); the server re-checks that this teacher teaches the student's class.
 */
type Filter = "PENDING" | "APPROVED" | "REJECTED" | "ALL";

const STATUS_TONE: Record<GatePassItem["status"], "amber" | "green" | "red" | "neutral"> = {
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  WITHDRAWN: "neutral",
  EXPIRED: "neutral",
};
const STATUS_LABEL: Record<GatePassItem["status"], string> = {
  PENDING: "Waiting",
  APPROVED: "Approved",
  REJECTED: "Not approved",
  WITHDRAWN: "Withdrawn",
  EXPIRED: "Expired",
};

export default function TeacherGatePassesView({
  initialRequests,
  classes,
}: {
  initialRequests: GatePassItem[];
  classes: { id: string; name: string }[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [filter, setFilter] = useState<Filter>("PENDING");
  const [classId, setClassId] = useState("ALL");
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const counts = useMemo(
    () => ({
      PENDING: requests.filter((r) => r.status === "PENDING").length,
      APPROVED: requests.filter((r) => r.status === "APPROVED").length,
      REJECTED: requests.filter((r) => r.status === "REJECTED").length,
      ALL: requests.length,
    }),
    [requests]
  );
  const shown = requests.filter((r) => (filter === "ALL" || r.status === filter) && (classId === "ALL" || r.classId === classId));

  const reload = async () => {
    const res = await fetch("/api/teacher/early-departures", { credentials: "include", cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) setRequests(data.requests);
  };

  const decide = async (r: GatePassItem, approve: boolean) => {
    setBusy(r.id);
    setMessage(null);
    try {
      const res = await fetch("/api/teacher/early-departures", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: r.id, status: approve ? "APPROVED" : "REJECTED", remarks: remarks[r.id] || "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Could not save the decision.");
      setMessage({
        ok: true,
        text: approve
          ? `${r.studentName || "The student"} is booked on the earlier bus and has been told.`
          : `${r.studentName || "The student"} has been told. Their usual bus home is unchanged.`,
      });
      await reload();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
      await reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-black text-gray-900 dark:text-gray-100 pb-24">
      <UnifiedAppHeader
        portalTitle="CampusFleet"
        portalSubtitle="Teacher"
        navLinks={[
          { href: "/teacher", label: "Teacher Desk" },
          { href: "/teacher/attendance", label: "Attendance" },
          { href: "/teacher/schedule", label: "Schedule Shift" },
          { href: "/teacher/gate-passes", label: "Gate Passes" },
        ]}
      />
      <div className="w-full max-w-3xl mx-auto px-3 sm:px-4 py-4 space-y-4">
        <Link href="/teacher" className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white">
          <ArrowLeft className="w-3.5 h-3.5" /> Teacher Desk
        </Link>

        <Card>
          <div className="flex items-start gap-3 min-w-0">
            <span className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-black">Gate passes</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Students in your classes asking to go home on an earlier bus today. Approving books them on the bus they picked and releases their usual seat.
              </p>
            </div>
          </div>
        </Card>

        {message && (
          <div
            role="status"
            className={cn(
              "p-3 rounded-xl border text-sm font-semibold flex items-start justify-between gap-3",
              message.ok
                ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-200"
                : "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-200"
            )}
          >
            <span className="min-w-0 break-words">{message.text}</span>
            <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss" className="shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
            <Segmented<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                { value: "PENDING", label: `Waiting (${counts.PENDING})` },
                { value: "APPROVED", label: `Approved (${counts.APPROVED})` },
                { value: "REJECTED", label: `Not approved (${counts.REJECTED})` },
                { value: "ALL", label: `All (${counts.ALL})` },
              ]}
            />
          </div>
          {classes.length > 1 && (
            <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="sm:max-w-[14rem]" aria-label="Class">
              <option value="ALL">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          )}
        </div>

        {shown.length === 0 ? (
          <EmptyState icon={<ShieldCheck className="w-5 h-5" />} title={filter === "PENDING" ? "Nothing waiting" : "No requests here"}>
            {filter === "PENDING" ? "New leave-early requests from your classes show up here." : "Try another filter."}
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {shown.map((r) => (
              <Card key={r.id} className="space-y-3">
                <div className="flex items-start gap-3 min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getSafePhotoUrl(r.studentPhoto || undefined)}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover bg-gray-100 dark:bg-zinc-800 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="min-w-0">
                        <div className="text-sm font-black truncate">{r.studentName || "Name not set"}</div>
                        <div className="text-xs text-gray-500 truncate">{r.className || "Class not set"}{r.requestDate ? ` · ${r.requestDate}` : ""}</div>
                      </div>
                      <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 min-w-0">
                  <BusFront className="w-4 h-4 shrink-0 text-blue-600" />
                  <span className="truncate">
                    Wants: {r.shiftName || "Earlier bus"}{r.departs ? `, ${r.departs}` : ""}
                    {r.status === "APPROVED" && r.busNumber != null ? ` · booked on Bus ${r.busNumber}` : ""}
                  </span>
                </div>

                <p className="p-3 rounded-xl bg-gray-50 dark:bg-zinc-900 text-sm break-words">{r.reason}</p>
                {r.teacherRemarks && <p className="text-xs text-gray-500 italic break-words">Your note: {r.teacherRemarks}</p>}

                {r.status === "PENDING" && (
                  <div className="space-y-2">
                    <Input
                      value={remarks[r.id] || ""}
                      onChange={(e) => setRemarks((p) => ({ ...p, [r.id]: e.target.value }))}
                      maxLength={300}
                      placeholder="Note for the student (optional)"
                      aria-label="Note for the student"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="success" loading={busy === r.id} onClick={() => decide(r, true)}>
                        <Check className="w-4 h-4" /> Approve
                      </Button>
                      <Button variant="secondary" disabled={busy === r.id} onClick={() => decide(r, false)}>
                        <X className="w-4 h-4" /> Don&apos;t approve
                      </Button>
                    </div>
                  </div>
                )}
                {r.studentPhone && (
                  <a href={`tel:${r.studentPhone}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600">
                    <Phone className="w-3.5 h-3.5" /> Call student
                  </a>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
