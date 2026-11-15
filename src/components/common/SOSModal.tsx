"use client";

import React, { useState } from "react";
import { AlertOctagon, CheckCircle2, PhoneCall } from "lucide-react";
import { Button, Sheet, Textarea, cn } from "@/components/ui";

/**
 * Rider SOS. Sends the alert to the transport office and the bus conductor through
 * POST /api/students/sos (with GPS when the student allows it). 112 is always one tap away.
 */
const REASONS = [
  { id: "EMERGENCY_PANIC", label: "Emergency" },
  { id: "MEDICAL", label: "Medical" },
  { id: "HARASSMENT", label: "Unsafe / harassment" },
  { id: "LOST", label: "Missed the bus / lost" },
  { id: "OTHER", label: "Other" },
] as const;

export function SOSModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void; studentId?: string }) {
  const [reason, setReason] = useState<(typeof REASONS)[number]["id"]>("EMERGENCY_PANIC");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"IDLE" | "SENDING" | "SENT" | "FAILED">("IDLE");
  const [error, setError] = useState<string | null>(null);

  const send = async (coords?: { latitude: number; longitude: number }) => {
    try {
      const r = await fetch("/api/students/sos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, note: note || undefined, ...(coords || {}) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) throw new Error(d.error || "The alert could not be sent. Call 112 now.");
      setState("SENT");
    } catch (e) {
      setError((e as Error).message);
      setState("FAILED");
    }
  };

  const trigger = () => {
    setState("SENDING");
    setError(null);
    if (!navigator.geolocation) return void send();
    navigator.geolocation.getCurrentPosition(
      (p) => void send({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => void send(), // send without location rather than not at all
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 30000 }
    );
  };

  const close = () => {
    setState("IDLE");
    setNote("");
    setError(null);
    onClose();
  };

  return (
    <Sheet open={isOpen} onClose={close} title={<span className="flex items-center gap-2 text-rose-600"><AlertOctagon className="w-5 h-5" /> Emergency SOS</span>}>
      <div className="space-y-4">
        <a href="tel:112" className="flex items-center justify-center gap-2 w-full p-3 rounded-xl bg-rose-600 text-white font-black">
          <PhoneCall className="w-5 h-5" /> Call 112 (police / ambulance)
        </a>
        {state === "SENT" ? (
          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 text-sm flex gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>Alert sent to the transport office and your bus conductor. Stay where you are if it is safe.</span>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-500">This alerts the transport office and your bus conductor, with your location if you allow it.</p>
            <div className="flex flex-wrap gap-1.5">
              {REASONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setReason(r.id)}
                  className={cn("px-3 py-2 rounded-xl text-xs font-bold border", reason === r.id ? "bg-rose-600 text-white border-rose-600" : "border-gray-200 dark:border-zinc-800")}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="What is happening? (optional)" />
            {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}
            <Button block variant="danger" onClick={trigger} loading={state === "SENDING"}>
              Send SOS alert
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}
