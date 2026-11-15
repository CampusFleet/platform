"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Armchair, Users } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, Segmented } from "@/components/ui";

/**
 * Settings → seat preferences. The boarding chart assigns every seat; these preferences (row,
 * window/aisle, seat partner) are what it uses. A seat partner needs both students to agree:
 * one sends a request by university ID, the other accepts it here.
 */

type Row = "FRONT" | "MIDDLE" | "BACK" | "NO_PREFERENCE";
type Pos = "WINDOW" | "AISLE" | "NO_PREFERENCE";
interface PartnerReq {
  id: string;
  sender_id: string;
  sender_name: string | null;
  receiver_id: string;
  receiver_name: string | null;
}

export function SeatPreferencesSettings() {
  const [row, setRow] = useState<Row>("NO_PREFERENCE");
  const [pos, setPos] = useState<Pos>("NO_PREFERENCE");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [active, setActive] = useState<PartnerReq | null>(null);
  const [incoming, setIncoming] = useState<PartnerReq[]>([]);
  const [outgoing, setOutgoing] = useState<PartnerReq[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [partnerCode, setPartnerCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [partnerMsg, setPartnerMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadPartners = useCallback(async () => {
    const r = await fetch("/api/students/seat-partner-requests", { cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    if (!d.success) return;
    setActive(d.activePartnership || null);
    setIncoming(d.incomingRequests || []);
    setOutgoing(d.outgoingRequests || []);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/students/seat-preferences", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/students/me", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([p, m]) => {
        if (p.success) {
          setRow(p.preferences.rowPreference || "NO_PREFERENCE");
          setPos(p.preferences.positionPreference || "NO_PREFERENCE");
        }
        setMe(m.student?.id ?? null);
      })
      .finally(() => setLoaded(true));
    loadPartners();
  }, [loadPartners]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/students/seat-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowPreference: row, positionPreference: pos }),
      });
      const d = await r.json().catch(() => ({}));
      setMsg({ ok: Boolean(d.success), text: d.message || (d.success ? "Saved." : "Could not save.") });
    } finally {
      setSaving(false);
    }
  };

  const partnerAction = async (action: string, extra: Record<string, unknown>) => {
    setBusy(action);
    setPartnerMsg(null);
    try {
      const r = await fetch("/api/students/seat-partner-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const d = await r.json().catch(() => ({}));
      setPartnerMsg({ ok: Boolean(d.success), text: d.message || (d.success ? "Done." : "Something went wrong.") });
      if (d.success) {
        setPartnerCode("");
        await loadPartners();
      }
    } finally {
      setBusy(null);
    }
  };

  const otherName = (r: PartnerReq) => (r.sender_id === me ? r.receiver_name : r.sender_name) || "your partner";

  return (
    <Card>
      <CardHeader icon={<Armchair className="w-5 h-5" />} title="Seat preferences" subtitle="Your seat is assigned by the boarding chart. It uses these when it can." />
      {!loaded ? (
        <div className="h-24 rounded-xl bg-gray-100 dark:bg-zinc-900 animate-pulse" />
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-gray-700 dark:text-gray-300">Row</p>
            <Segmented
              value={row}
              onChange={(v) => setRow(v as Row)}
              options={[
                { value: "NO_PREFERENCE", label: "Any" },
                { value: "FRONT", label: "Front" },
                { value: "MIDDLE", label: "Middle" },
                { value: "BACK", label: "Back" },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-gray-700 dark:text-gray-300">Seat</p>
            <Segmented
              value={pos}
              onChange={(v) => setPos(v as Pos)}
              options={[
                { value: "NO_PREFERENCE", label: "Any" },
                { value: "WINDOW", label: "Window" },
                { value: "AISLE", label: "Aisle" },
              ]}
            />
          </div>
          {msg && <p className={`text-xs font-semibold ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"}`}>{msg.text}</p>}
          <Button size="sm" onClick={save} loading={saving}>Save preferences</Button>

          <div className="pt-4 border-t border-gray-100 dark:border-zinc-900 space-y-3">
            <p className="text-sm font-black flex items-center gap-2"><Users className="w-4 h-4" /> Seat partner</p>
            {active ? (
              <div className="flex items-center justify-between gap-3 min-w-0">
                <p className="text-sm min-w-0 truncate">You sit with <strong>{otherName(active)}</strong>.</p>
                <Button size="sm" variant="secondary" loading={busy === "UNLINK_PARTNER"} onClick={() => partnerAction("UNLINK_PARTNER", { requestId: active.id })}>Remove</Button>
              </div>
            ) : (
              <>
                {incoming.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 min-w-0 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40">
                    <p className="text-sm min-w-0 truncate"><strong>{r.sender_name || "A classmate"}</strong> wants to sit with you.</p>
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" variant="success" loading={busy === "ACCEPT_REQUEST"} onClick={() => partnerAction("ACCEPT_REQUEST", { requestId: r.id })}>Accept</Button>
                      <Button size="sm" variant="ghost" loading={busy === "DECLINE_REQUEST"} onClick={() => partnerAction("DECLINE_REQUEST", { requestId: r.id })}>Decline</Button>
                    </div>
                  </div>
                ))}
                {outgoing.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 min-w-0">
                    <p className="text-sm min-w-0 truncate">Waiting for <strong>{r.receiver_name || "your classmate"}</strong> to accept.</p>
                    <Button size="sm" variant="ghost" loading={busy === "CANCEL_REQUEST"} onClick={() => partnerAction("CANCEL_REQUEST", { requestId: r.id })}>Cancel</Button>
                  </div>
                ))}
                {outgoing.length === 0 && (
                  <div className="flex items-end gap-2">
                    <Field label="Classmate's university ID" className="flex-1">
                      <Input value={partnerCode} onChange={(e) => setPartnerCode(e.target.value.toUpperCase())} maxLength={30} autoCapitalize="characters" />
                    </Field>
                    <Button
                      size="md"
                      disabled={partnerCode.trim().length < 3}
                      loading={busy === "SEND_REQUEST"}
                      onClick={() => partnerAction("SEND_REQUEST", { receiverStudentIdCode: partnerCode.trim() })}
                    >
                      Invite
                    </Button>
                  </div>
                )}
              </>
            )}
            {partnerMsg && <p className={`text-xs font-semibold ${partnerMsg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"}`}>{partnerMsg.text}</p>}
            <p className="text-[11px] text-gray-500">Partners must ride the same bus. You are seated together from the next boarding chart, if two seats side by side are free.</p>
          </div>
        </div>
      )}
    </Card>
  );
}
