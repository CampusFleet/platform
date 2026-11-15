"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, BusFront, Clock, Send } from "lucide-react";
import { Badge, Button, Card, EmptyState, Field, Textarea, cn } from "@/components/ui";
import type { LeaveEarlyRequest, LeaveEarlyState } from "@/lib/students/leave-early";

const STATUS: Record<LeaveEarlyRequest["status"], { label: string; tone: string }> = {
  PENDING: { label: "Waiting for teacher", tone: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900" },
  APPROVED: { label: "Approved", tone: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-900" },
  REJECTED: { label: "Not approved", tone: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-900" },
  WITHDRAWN: { label: "Withdrawn", tone: "bg-gray-50 text-gray-600 border-gray-200 dark:bg-zinc-900 dark:text-gray-300 dark:border-zinc-800" },
};

export default function LeaveEarlyForm({ initial }: { initial: LeaveEarlyState }) {
  const [state, setState] = useState(initial);
  const [shiftId, setShiftId] = useState<string>(initial.options[0]?.shiftId ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"send" | string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const call = async (method: "POST" | "DELETE", body: object, tag: string) => {
    setBusy(tag);
    setError(null);
    try {
      const res = await fetch("/api/students/early-departure", {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Something went wrong. Try again.");
      setState({ blocked: data.blocked, usualRide: data.usualRide, options: data.options, today: data.today });
      setShiftId(data.options?.[0]?.shiftId ?? "");
      if (method === "POST") setReason("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Link href="/portal" className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white">
        <ArrowLeft className="w-3.5 h-3.5" /> My Commute
      </Link>

      <Card>
        <h1 className="text-lg font-black">Leave early</h1>
        <p className="text-sm text-gray-500 mt-1">
          Ask your class teacher to let you go home on an earlier bus today. If they approve, you're booked on that bus and your usual bus home is released.
        </p>
        {state.usualRide && (
          <p className="mt-3 text-xs text-gray-600 dark:text-gray-300 flex items-center gap-1.5 min-w-0">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Your usual bus home: {state.usualRide.shiftName}, {state.usualRide.departs}</span>
          </p>
        )}
      </Card>

      {state.today.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500 px-1">Today</h2>
          {state.today.map((r) => (
            <Card key={r.id} className="space-y-2">
              <div className="flex items-start justify-between gap-3 min-w-0">
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">
                    {r.shiftName || "Earlier bus"}{r.departs ? `, ${r.departs}` : ""}
                  </div>
                  {r.status === "APPROVED" && (
                    <div className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5 flex items-center gap-1">
                      <BusFront className="w-3.5 h-3.5 shrink-0" />
                      {r.busNumber != null ? `You're booked on Bus ${r.busNumber}.` : "You're booked on this bus."}
                    </div>
                  )}
                </div>
                <span className={cn("shrink-0 px-2 py-0.5 rounded-full border text-[11px] font-bold", STATUS[r.status]?.tone)}>
                  {STATUS[r.status]?.label ?? r.status}
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300 break-words">{r.reason}</p>
              {r.teacherRemarks && <p className="text-xs text-gray-500 italic break-words">Teacher's note: {r.teacherRemarks}</p>}
              {r.status === "PENDING" && (
                <Button size="sm" variant="ghost" className="text-rose-600" loading={busy === r.id} onClick={() => call("DELETE", { requestId: r.id }, r.id)}>
                  Withdraw request
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      {state.blocked ? (
        state.today.some((r) => r.status === "PENDING" || r.status === "APPROVED") ? null : (
          <EmptyState title="You can't ask to leave early right now">{state.blocked}</EmptyState>
        )
      ) : state.options.length === 0 ? (
        <EmptyState icon={<BusFront className="w-5 h-5" />} title="No earlier bus today">
          No bus on your route leaves earlier than your usual ride home for the rest of today. Contact the transport office if this is an emergency.
        </EmptyState>
      ) : (
        <Card className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-bold">Which bus?</div>
            <div className="grid gap-2" role="radiogroup" aria-label="Earlier bus">
              {state.options.map((o) => (
                <button
                  key={o.shiftId}
                  type="button"
                  role="radio"
                  aria-checked={shiftId === o.shiftId}
                  onClick={() => setShiftId(o.shiftId)}
                  className={cn(
                    "w-full text-left p-3 rounded-xl border flex items-center justify-between gap-3 min-w-0 transition-colors",
                    shiftId === o.shiftId
                      ? "border-blue-600 bg-blue-50 dark:bg-blue-950/30"
                      : "border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-900"
                  )}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-bold truncate">{o.shiftName}</span>
                    <span className="block text-xs text-gray-500 truncate">
                      {o.buses.length === 1 ? `Bus ${o.buses[0]}` : `Bus ${o.buses.join(", ")}`}
                    </span>
                  </span>
                  <Badge>{o.departs}</Badge>
                </button>
              ))}
            </div>
          </div>
          <Field label="Reason">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="For example: doctor's appointment at 2 PM"
            />
          </Field>
          {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
          <Button
            block
            loading={busy === "send"}
            disabled={!shiftId || reason.trim().length < 5}
            onClick={() => call("POST", { shiftId, reason: reason.trim() }, "send")}
          >
            <Send className="w-4 h-4" /> Send to my teacher
          </Button>
        </Card>
      )}
      {error && state.blocked && <p className="text-xs font-semibold text-rose-600 px-1">{error}</p>}
    </div>
  );
}
