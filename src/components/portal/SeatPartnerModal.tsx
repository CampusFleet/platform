"use client";

import React, { useState, useEffect } from "react";
import {
  Users,
  CheckCircle2,
  X,
  Clock,
  Sparkles,
  HeartHandshake,
  Search,
  UserCheck,
  Compass,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  Loader2,
  Lock,
} from "lucide-react";
import type { SeatRowPreference, SeatPositionPreference, SeatPartnerRequest } from "@/lib/types";

interface SeatPartnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  busId: string;
  busNumber: string;
  shiftId?: string;
  currentSeat?: string | null;
  onPairUpdated?: () => void;
  showToast: (msg: string, type?: "success" | "error" | "warning") => void;
}

export function SeatPartnerModal({
  isOpen,
  onClose,
  studentId,
  busId,
  busNumber,
  shiftId,
  currentSeat,
  onPairUpdated,
  showToast,
}: SeatPartnerModalProps) {
  const [activeTab, setActiveTab] = useState<"PARTNER" | "PREFERENCES">("PARTNER");

  // Preferences State
  const [rowPref, setRowPref] = useState<SeatRowPreference>("NO_PREFERENCE");
  const [posPref, setPosPref] = useState<SeatPositionPreference>("NO_PREFERENCE");
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

  // Partner Requests & Fellow Bus Passengers
  const [busPeers, setBusPeers] = useState<any[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<SeatPartnerRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<SeatPartnerRequest[]>([]);
  const [activePartnership, setActivePartnership] = useState<SeatPartnerRequest | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Fetch Requests and Bus Passengers
  const loadPartnerData = async () => {
    if (!studentId || !busId) return;
    setIsLoadingData(true);
    try {
      const url = `/api/students/seat-partner-requests?studentId=${encodeURIComponent(studentId)}&busId=${encodeURIComponent(busId)}${shiftId ? `&shiftId=${encodeURIComponent(shiftId)}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setIncomingRequests(data.incomingRequests || []);
        setOutgoingRequests(data.outgoingRequests || []);
        setActivePartnership(data.activePartnership || null);
        setBusPeers(data.busPeers || []);
      }

      // Fetch seat preferences
      const prefRes = await fetch(`/api/students/seat-preferences?studentId=${encodeURIComponent(studentId)}`);
      const prefData = await prefRes.json();
      if (prefData.success && prefData.preferences) {
        setRowPref(prefData.preferences.rowPreference || "NO_PREFERENCE");
        setPosPref(prefData.preferences.positionPreference || "NO_PREFERENCE");
      }
    } catch (err) {
      console.warn("Could not load seat partner data:", err);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadPartnerData();
    }
  }, [isOpen, studentId, busId, shiftId]);

  if (!isOpen) return null;

  // Filter peers by search query
  const filteredPeers = busPeers.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.fullName?.toLowerCase().includes(q) ||
      p.studentIdCode?.toLowerCase().includes(q) ||
      p.department?.toLowerCase().includes(q)
    );
  });

  // Handle Save Preferences
  const handleSavePreferences = async () => {
    setIsSavingPrefs(true);
    try {
      const res = await fetch("/api/students/seat-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          rowPreference: rowPref,
          positionPreference: posPref,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("Seat preferences saved! Your auto-assigned seat has been updated.", "success");
        if (onPairUpdated) onPairUpdated();
        onClose();
      } else {
        showToast(data.message || "Failed to save preferences.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Network error.", "error");
    } finally {
      setIsSavingPrefs(false);
    }
  };

  // Handle Partner Request Actions
  const handlePartnerAction = async (action: string, payload: Record<string, any>) => {
    setActionInProgress(action);
    try {
      const res = await fetch("/api/students/seat-partner-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, "success");
        await loadPartnerData();
        if (onPairUpdated) onPairUpdated();
        if (action === "ACCEPT_REQUEST") {
          setTimeout(() => onClose(), 1200);
        }
      } else {
        showToast(data.message || "Failed to complete partner action.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Network error.", "error");
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Seat Preferences & Partner Pairing
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Railway-inspired seating: Row zone, window/aisle, and mutual companion pairing
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 px-6 pt-3 gap-4">
          <button
            onClick={() => setActiveTab("PARTNER")}
            className={`pb-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "PARTNER"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
            }`}
          >
            <HeartHandshake className="w-4 h-4" />
            <span>Seat Partner on {busNumber}</span>
            {incomingRequests.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-pink-500 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab("PREFERENCES")}
            className={`pb-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === "PREFERENCES"
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Row & Position Preference</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {isLoadingData ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              <span className="text-xs">Loading seat partner data...</span>
            </div>
          ) : activeTab === "PARTNER" ? (
            <div className="space-y-5">
              {/* Active Partnership Banner */}
              {activePartnership && (
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 flex items-center justify-between gap-3 animate-in fade-in">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                        Confirmed Seat Partner:{" "}
                        {activePartnership.senderId === studentId
                          ? activePartnership.receiverName
                          : activePartnership.senderName}
                      </div>
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                        {activePartnership.allocatedPair
                          ? `Seated side-by-side in Seats ${activePartnership.allocatedPair.senderSeat} & ${activePartnership.allocatedPair.receiverSeat}`
                          : "Paired on this bus run"}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      handlePartnerAction("UNLINK_PARTNER", {
                        requestId: activePartnership.id,
                        studentId,
                      })
                    }
                    disabled={actionInProgress !== null}
                    className="px-3 py-1.5 rounded-xl border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900 text-emerald-800 dark:text-emerald-200 text-xs font-bold transition-all cursor-pointer"
                  >
                    Unlink
                  </button>
                </div>
              )}

              {/* Incoming Invitation Alert */}
              {incomingRequests.length > 0 && !activePartnership && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Incoming Seat Partner Requests ({incomingRequests.length})
                  </h4>
                  {incomingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in slide-in-from-top-2"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                          <Users className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                            {req.senderName} wants to sit with you on {busNumber}
                          </div>
                          <p className="text-[11px] text-indigo-700 dark:text-indigo-400">
                            Preferred Row: {req.preferredRowZone || "Middle"} • Adjacent seats will be locked automatically.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <button
                          onClick={() =>
                            handlePartnerAction("ACCEPT_REQUEST", {
                              requestId: req.id,
                              respondingStudentId: studentId,
                            })
                          }
                          disabled={actionInProgress !== null}
                          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          {actionInProgress === "ACCEPT_REQUEST" ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          <span>Accept & Pair</span>
                        </button>

                        <button
                          onClick={() =>
                            handlePartnerAction("DECLINE_REQUEST", {
                              requestId: req.id,
                            })
                          }
                          disabled={actionInProgress !== null}
                          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs transition-all cursor-pointer"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Outgoing Pending Invitation Alert */}
              {outgoingRequests.length > 0 && !activePartnership && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Awaiting Response
                  </h4>
                  {outgoingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-medium">
                        <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Invitation sent to <strong>{req.receiverName}</strong></span>
                      </div>
                      <button
                        onClick={() =>
                          handlePartnerAction("CANCEL_REQUEST", {
                            requestId: req.id,
                          })
                        }
                        className="text-xs text-amber-700 hover:underline font-bold cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Fellow Passengers on this Bus */}
              {!activePartnership && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                        Fellow Commuters on {busNumber} ({filteredPeers.length})
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Choose a classmate or friend to send a seat partner invitation
                      </p>
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search classmate by name or ERP ID..."
                      className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-2 divide-y divide-slate-100 dark:divide-slate-800/60">
                    {filteredPeers.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-400">
                        No other students found matching this search on {busNumber}.
                      </div>
                    ) : (
                      filteredPeers.map((peer) => {
                        const isPendingToPeer = outgoingRequests.some((r) => r.receiverId === peer.studentId);
                        return (
                          <div
                            key={peer.studentId}
                            className="pt-2 flex items-center justify-between gap-3 text-xs"
                          >
                            <div>
                              <div className="font-bold text-slate-900 dark:text-white">
                                {peer.fullName}
                              </div>
                              <p className="text-[11px] text-slate-500">
                                {peer.studentIdCode ? `${peer.studentIdCode} • ` : ""}
                                {peer.className || peer.department || "Classmate"}
                                {peer.currentSeat ? ` (Seat ${peer.currentSeat})` : ""}
                              </p>
                            </div>

                            <button
                              onClick={() =>
                                handlePartnerAction("SEND_REQUEST", {
                                  senderId: studentId,
                                  receiverId: peer.studentId,
                                  busId,
                                  shiftId,
                                  preferredRowZone: rowPref,
                                })
                              }
                              disabled={isPendingToPeer || actionInProgress !== null}
                              className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                                isPendingToPeer
                                  ? "bg-slate-100 dark:bg-slate-800 text-slate-400"
                                  : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs active:scale-95"
                              }`}
                            >
                              {isPendingToPeer ? "Invited ✓" : "Invite Partner"}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* PREFERENCES TAB */
            <div className="space-y-6 animate-in fade-in">
              {/* Row Zone Preference */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Coach Row Preference (IRCTC Berth Style)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  {[
                    { value: "FRONT", label: "Front Coach", desc: "Rows 1–3 • Easy exit" },
                    { value: "MIDDLE", label: "Middle Coach", desc: "Rows 4–7 • Lowest vibration" },
                    { value: "BACK", label: "Rear Coach", desc: "Rows 8–10 • Rear bench" },
                    { value: "NO_PREFERENCE", label: "Any Row", desc: "Smart load-balanced" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRowPref(opt.value as SeatRowPreference)}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        rowPref === opt.value
                          ? "border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200 shadow-2xs font-bold"
                          : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      <div className="font-bold">{opt.label}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Position Preference (Window vs Aisle) */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Seat Position Preference
                </label>
                <div className="grid grid-cols-3 gap-2.5 text-xs">
                  {[
                    { value: "WINDOW", label: "Window Seat", desc: "Wall view" },
                    { value: "AISLE", label: "Aisle Seat", desc: "Extra legroom" },
                    { value: "NO_PREFERENCE", label: "No Preference", desc: "Flexible" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPosPref(opt.value as SeatPositionPreference)}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        posPref === opt.value
                          ? "border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200 shadow-2xs font-bold"
                          : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      <div className="font-bold">{opt.label}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Save Preferences Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleSavePreferences}
                  disabled={isSavingPrefs}
                  className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSavingPrefs ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>Save Preferences & Auto-Assign Seat</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

