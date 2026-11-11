"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Camera, KeyRound, RefreshCw, Trash2, Wifi, WifiOff } from "lucide-react";

interface DeviceRow {
  id: string;
  device_mac: string;
  kind: "PI_GATE" | "ESP32_RFID" | "PHONE";
  bus_id: number | null;
  busNumber: number | null;
  door: "IN" | "OUT" | "BOTH";
  label: string | null;
  key_version: number;
  last_seen_at: string | null;
  revoked_at: string | null;
  firmware_version: string | null;
  online: boolean;
  health: { queueDepth?: number; cameras?: Record<string, boolean>; gps?: { fix?: boolean }; diskFreeMb?: number } | null;
}

interface BusOption {
  id: number;
  busNumber: number | string;
}

/**
 * Transport Admin: pair door cameras / RFID readers by MAC (same workflow as RFID),
 * see their health, rotate or revoke keys. The device key is shown once at pairing.
 */
export function GateDevicesPanel({ buses }: { buses: BusOption[] }) {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [mac, setMac] = useState("");
  const [busId, setBusId] = useState<string>("");
  const [door, setDoor] = useState<"IN" | "OUT" | "BOTH">("IN");
  const [kind, setKind] = useState<"PI_GATE" | "ESP32_RFID">("PI_GATE");
  const [issued, setIssued] = useState<{ mac: string; key: string; busNumber: number; keyVersion: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/gate/devices", { cache: "no-store" });
    if (res.ok) setDevices((await res.json()).devices || []);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const pair = async (overrideMac?: string, overrideBus?: number, overrideDoor?: string, overrideKind?: string) => {
    setBusy(true);
    setError(null);
    setIssued(null);
    try {
      const res = await fetch("/api/gate/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mac: overrideMac ?? mac,
          busId: overrideBus ?? Number(busId),
          door: overrideDoor ?? door,
          kind: overrideKind ?? kind,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Pairing failed");
      setIssued({ mac: data.mac, key: data.deviceKey, busNumber: data.busNumber, keyVersion: data.keyVersion });
      setMac("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this device? It will stop being able to send data immediately.")) return;
    await fetch(`/api/gate/devices?id=${id}`, { method: "DELETE" });
    load();
  };

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
          <Camera className="w-5 h-5 text-blue-600" /> Door cameras &amp; readers
        </h2>
        <button type="button" onClick={load} className="p-2 rounded-xl border border-slate-200 dark:border-slate-700" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
        <input value={mac} onChange={(e) => setMac(e.target.value)} placeholder="MAC e.g. D8:3A:DD:12:34:56"
          className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm font-mono" />
        <select value={busId} onChange={(e) => setBusId(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm">
          <option value="">Bus…</option>
          {buses.map((b) => <option key={b.id} value={b.id}>Bus {b.busNumber}</option>)}
        </select>
        <select value={`${kind}:${door}`} onChange={(e) => { const [k, d] = e.target.value.split(":"); setKind(k as any); setDoor(d as any); }}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm">
          <option value="PI_GATE:IN">Camera — In door</option>
          <option value="PI_GATE:OUT">Camera — Out door</option>
          <option value="PI_GATE:BOTH">Camera — both doors</option>
          <option value="ESP32_RFID:BOTH">ESP32 RFID reader</option>
        </select>
        <button type="button" disabled={busy || !mac || !busId} onClick={() => pair()}
          className="px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-50">
          Pair device
        </button>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}

      {issued && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-2">
          <p className="text-sm font-bold text-amber-900 dark:text-amber-100 flex items-center gap-2">
            <KeyRound className="w-4 h-4" /> Device key for {issued.mac} (Bus {issued.busNumber}, v{issued.keyVersion})
          </p>
          <code className="block break-all text-xs p-2 rounded-lg bg-white dark:bg-black border border-amber-200 dark:border-amber-900 select-all">{issued.key}</code>
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Put this in the device config now (<code>/etc/campusfleet/agent.env</code> → <code>CF_DEVICE_KEY</code>). It is not shown again; re-pair to rotate it.
          </p>
          <button type="button" onClick={() => setIssued(null)} className="text-xs font-bold underline">I have saved it</button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-slate-500">
            <tr><th className="py-2">Device</th><th>Bus</th><th>Door</th><th>Status</th><th>Queue</th><th>Cameras / GPS</th><th>Last seen</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {devices.map((d) => (
              <tr key={d.id} className={d.revoked_at ? "opacity-50" : ""}>
                <td className="py-2 font-mono">{d.device_mac}<div className="text-[10px] text-slate-400">{d.kind} · key v{d.key_version} {d.firmware_version ? `· fw ${d.firmware_version}` : ""}</div></td>
                <td>{d.busNumber ? `Bus ${d.busNumber}` : "—"}</td>
                <td>{d.door}</td>
                <td>
                  {d.revoked_at ? "Revoked" : d.online
                    ? <span className="inline-flex items-center gap-1 text-emerald-600"><Wifi className="w-3.5 h-3.5" /> Online</span>
                    : <span className="inline-flex items-center gap-1 text-slate-500"><WifiOff className="w-3.5 h-3.5" /> Offline</span>}
                </td>
                <td>{d.health?.queueDepth ?? "—"}</td>
                <td>
                  {d.health?.cameras ? Object.entries(d.health.cameras).map(([k, v]) => `${k}:${v ? "ok" : "FAIL"}`).join(" ") : "—"}
                  {d.health?.gps ? ` · GPS ${d.health.gps.fix ? "fix" : "no fix"}` : ""}
                </td>
                <td>{d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : "never"}</td>
                <td className="text-right whitespace-nowrap">
                  {d.kind !== "PHONE" && !d.revoked_at && d.bus_id && (
                    <button type="button" title="Rotate key" onClick={() => pair(d.device_mac, d.bus_id!, d.door, d.kind)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                      <KeyRound className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {!d.revoked_at && (
                    <button type="button" title="Revoke" onClick={() => revoke(d.id)} className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950 text-rose-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {devices.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-slate-400">No devices paired yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
