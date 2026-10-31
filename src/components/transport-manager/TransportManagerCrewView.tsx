"use client";

import React, { useState, useEffect, useMemo } from "react";
import { store } from "@/lib/store";
import {
  Users,
  BusFront,
  Search,
  CheckCircle2,
  AlertTriangle,
  CalendarDays,
  Award,
  ShieldCheck,
  X,
  Plus,
  RefreshCw,
  Clock,
  QrCode,
  Banknote,
  Check,
  Lock,
  Sunrise,
  Sunset,
  Building,
} from "lucide-react";
import { formatTime, formatDate } from "@/lib/utils";
import type { Trip, Bus, Route, Staff, UserAccount, AttendanceRecord } from "@/lib/types";
import { CustomDropdown } from "@/components/common/CustomDropdown";

interface TransportManagerCrewViewProps {
  initialTrips?: Trip[];
  initialBuses?: Bus[];
  initialRoutes?: Route[];
  initialStaff?: Staff[];
  initialUsers?: UserAccount[];
}

export default function TransportManagerCrewView({
  initialTrips = [],
  initialBuses = [],
  initialRoutes = [],
  initialStaff = [],
  initialUsers = [],
}: TransportManagerCrewViewProps) {
  const [trips, setTrips] = useState<Trip[]>(() => (initialTrips.length > 0 ? initialTrips : store.getTrips()));
  const [buses, setBuses] = useState<Bus[]>(() => (initialBuses.length > 0 ? initialBuses : store.getBuses()));
  const [routes, setRoutes] = useState<Route[]>(() => (initialRoutes.length > 0 ? initialRoutes : store.getRoutes()));
  const [staff, setStaff] = useState<Staff[]>(() => (initialStaff.length > 0 ? initialStaff : store.getStaff()));
  const [users, setUsers] = useState<UserAccount[]>(() => (initialUsers.length > 0 ? initialUsers : store.getUsers()));
  const [shifts, setShifts] = useState<any[]>(() => store.getShifts());
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(() => store.getAttendanceRecords());

  const [activeViewMode, setActiveViewMode] = useState<"ROSTER" | "DUTY_LEDGER">("ROSTER");
  const [crewSearchQuery, setCrewSearchQuery] = useState("");
  const [shiftFilter, setShiftFilter] = useState("ALL");
  const [selectedTripForCrew, setSelectedTripForCrew] = useState<any | null>(null);
  const [crewModalOpen, setCrewModalOpen] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [selectedConductorId, setSelectedConductorId] = useState("");
  const [isAssigningCrew, setIsAssigningCrew] = useState(false);
  const [crewAssignError, setCrewAssignError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [crewDate, setCrewDate] = useState(() => {
    const now = new Date();
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    return ist.toISOString().split("T")[0];
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  useEffect(() => {
    const unsub = store.subscribe(() => {
      setTrips(store.getTrips());
      setBuses(store.getBuses());
      setRoutes(store.getRoutes());
      setStaff(store.getStaff());
      setUsers(store.getUsers());
      setShifts(store.getShifts());
      setAttendanceRecords(store.getAttendanceRecords());
    });
    return unsub;
  }, []);

  // 1. DRIVERS: strictly users/staff where role === 'driver' (conductors cannot drive!)
  const eligibleDrivers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; phone: string; license?: string; role: string; employeeCode?: string }>();
    staff
      .filter((s) => s.role === "driver")
      .forEach((s) => {
        map.set(s.id, {
          id: s.id,
          name: s.fullName,
          phone: s.phone || "—",
          license: s.licenseNo || "HMV-COMMERCIAL",
          role: "driver",
          employeeCode: s.employeeCode,
        });
      });
    users
      .filter((u) => u.role === "driver")
      .forEach((u) => {
        if (!map.has(u.id)) {
          map.set(u.id, {
            id: u.id,
            name: u.fullName,
            phone: u.phone || "—",
            license: "HMV-COMMERCIAL",
            role: "driver",
          });
        }
      });
    return Array.from(map.values());
  }, [staff, users]);

  // 2. CONDUCTORS: BOTH conductors AND qualified drivers are eligible!
  const eligibleConductors = useMemo(() => {
    const map = new Map<string, { id: string; name: string; phone: string; role: string; isActingDriver?: boolean; employeeCode?: string }>();
    staff
      .filter((s) => s.role === "conductor")
      .forEach((s) => {
        map.set(s.id, {
          id: s.id,
          name: s.fullName,
          phone: s.phone || "—",
          role: "conductor",
          isActingDriver: false,
          employeeCode: s.employeeCode,
        });
      });
    users
      .filter((u) => u.role === "conductor")
      .forEach((u) => {
        if (!map.has(u.id)) {
          map.set(u.id, {
            id: u.id,
            name: u.fullName,
            phone: u.phone || "—",
            role: "conductor",
            isActingDriver: false,
          });
        }
      });
    staff
      .filter((s) => s.role === "driver")
      .forEach((s) => {
        if (!map.has(s.id)) {
          map.set(s.id, {
            id: s.id,
            name: `${s.fullName} (Qualified Driver)`,
            phone: s.phone || "—",
            role: "driver",
            isActingDriver: true,
            employeeCode: s.employeeCode,
          });
        }
      });
    return Array.from(map.values());
  }, [staff, users]);

  // Filtered Trips for selected date and dynamic shift
  const filteredTrips = useMemo(() => {
    return trips.filter((t) => {
      if (t.tripDate !== crewDate) return false;
      if (shiftFilter !== "ALL" && t.shiftId !== shiftFilter) return false;
      if (!crewSearchQuery.trim()) return true;
      const q = crewSearchQuery.toLowerCase();
      const bus = buses.find((b) => b.id === t.busId);
      const route = routes.find((r) => r.id === t.routeId);
      return (
        t.tripCode?.toLowerCase().includes(q) ||
        String(bus?.busNumber).includes(q) ||
        route?.name?.toLowerCase().includes(q)
      );
    });
  }, [trips, crewDate, crewSearchQuery, shiftFilter, buses, routes]);

  const crewDutyRecords = useMemo(() => {
    return attendanceRecords.filter(
      (a) =>
        a.userRole === "driver" ||
        a.userRole === "conductor" ||
        a.signatureToken?.startsWith("DUTY-") ||
        a.method === "BUS_QR_SCAN"
    );
  }, [attendanceRecords]);

  const openAssignModal = (trip: Trip) => {
    setSelectedTripForCrew(trip);
    setSelectedDriverId(trip.driverId || "");
    setSelectedConductorId(trip.conductorId || "");
    setCrewAssignError(null);
    setCrewModalOpen(true);
  };

  const handleSaveCrewAssignment = async () => {
    if (!selectedTripForCrew) return;
    setIsAssigningCrew(true);
    setCrewAssignError(null);

    try {
      const res = await fetch("/api/staff/assign-crew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId: selectedTripForCrew.id,
          driverId: selectedDriverId || null,
          conductorId: selectedConductorId || null,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showToast("✓ Crew roster updated successfully!");
        setCrewModalOpen(false);
        store.syncFromSupabase();
      } else {
        setCrewAssignError(data.error || "Failed to update crew assignment.");
      }
    } catch (err: any) {
      setCrewAssignError("Network error: " + err.message);
    } finally {
      setIsAssigningCrew(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-xs font-bold animate-in slide-in-from-bottom-3">
          <CheckCircle2 className="w-4 h-4 text-green-400 dark:text-green-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-blue-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-xs font-mono font-bold text-blue-300 mb-2">
              <Award className="w-3.5 h-3.5" />
              <span>Crew Qualification Dispatch Matrix</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black">
              Bus Crew Allocation & Role Qualifications
            </h2>
            <p className="text-xs sm:text-sm text-blue-200/80 max-w-2xl mt-1">
              Staff dispatch authority: Assign certified drivers and conductors to campus transit buses.
              <span className="block mt-1 font-bold text-yellow-300 text-xs">
                • Driver Slot: Strictly qualified drivers only (conductors cannot drive).
                • Conductor Slot: Both conductors and certified drivers can serve as conductors.
              </span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-gray-800/80 p-2 rounded-2xl border border-gray-700">
              <CalendarDays className="w-4 h-4 text-blue-400" />
              <input
                type="date"
                value={crewDate}
                onChange={(e) => setCrewDate(e.target.value)}
                className="text-xs px-2 py-1 rounded-xl bg-gray-900 border border-gray-700 text-white font-mono font-bold outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Crew Status Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="text-[10px] uppercase font-black tracking-wider text-blue-600 dark:text-blue-400">
            Scheduled Runs
          </div>
          <div className="text-2xl font-black font-mono mt-1 text-gray-900 dark:text-white">
            {filteredTrips.length}
          </div>
          <div className="text-[10px] text-gray-400 font-mono mt-0.5">Fleet runs for selected date</div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="text-[10px] uppercase font-black tracking-wider text-green-600 dark:text-green-400">
            Fully Crewed
          </div>
          <div className="text-2xl font-black font-mono mt-1 text-green-600 dark:text-green-400">
            {filteredTrips.filter((t) => t.driverId && t.conductorId).length}
          </div>
          <div className="text-[10px] text-gray-400 font-mono mt-0.5">Driver + Conductor Ready</div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="text-[10px] uppercase font-black tracking-wider text-red-600 dark:text-red-400">
            Missing Driver
          </div>
          <div className="text-2xl font-black font-mono mt-1 text-red-600 dark:text-red-400">
            {filteredTrips.filter((t) => !t.driverId).length}
          </div>
          <div className="text-[10px] text-gray-400 font-mono mt-0.5">Requires Immediate Action</div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="text-[10px] uppercase font-black tracking-wider text-yellow-600 dark:text-yellow-400">
            Missing Conductor
          </div>
          <div className="text-2xl font-black font-mono mt-1 text-yellow-600 dark:text-yellow-400">
            {filteredTrips.filter((t) => !t.conductorId).length}
          </div>
          <div className="text-[10px] text-gray-400 font-mono mt-0.5">Ticket Radar Officer Needed</div>
        </div>
      </div>

      {/* View Mode Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-2">
        <button
          onClick={() => setActiveViewMode("ROSTER")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeViewMode === "ROSTER"
              ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
              : "bg-white dark:bg-gray-850 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          }`}
        >
          <BusFront className="w-4 h-4" />
          <span>Fleet Crew Dispatch Table</span>
        </button>

        <button
          onClick={() => setActiveViewMode("DUTY_LEDGER")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeViewMode === "DUTY_LEDGER"
              ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
              : "bg-white dark:bg-gray-850 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          }`}
        >
          <Banknote className="w-4 h-4" />
          <span>Crew Duty Attendance & Payroll Ledger ({crewDutyRecords.length})</span>
        </button>
      </div>

      {/* Tab 1: Dispatch Table */}
      {activeViewMode === "ROSTER" && (
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 sm:p-6 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="font-black text-sm text-gray-900 dark:text-white flex items-center gap-2">
              <BusFront className="w-4 h-4 text-blue-600" />
              <span>Fleet Crew Dispatch Table</span>
            </h3>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <CustomDropdown
                value={shiftFilter}
                onChange={(val) => setShiftFilter(val)}
                size="sm"
                options={[
                  { value: "ALL", label: `All Shifts (${shifts.length})` },
                  ...shifts.map((s) => ({
                    value: s.id,
                    label: `${s.name}${s.startTime ? ` (${s.startTime})` : ""}`,
                  })),
                ]}
                containerClassName="w-48"
              />
              <div className="relative flex-1 sm:w-72 sm:flex-none">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={crewSearchQuery}
                  onChange={(e) => setCrewSearchQuery(e.target.value)}
                  placeholder="Search bus or route..."
                  className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:border-blue-500 font-bold"
                />
              </div>
            </div>
          </div>

          {filteredTrips.length === 0 ? (
            <div className="py-16 text-center text-xs text-gray-400 font-mono space-y-2">
              <Users className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600" />
              <div>No trips found for the selected date or search query.</div>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-50 dark:bg-gray-800/60 uppercase font-black text-gray-400 border-b border-gray-200 dark:border-gray-800">
                  <tr>
                    <th className="p-3.5">Bus & Trip</th>
                    <th className="p-3.5">Corridor Route</th>
                    <th className="p-3.5">Assigned Driver</th>
                    <th className="p-3.5">Assigned Conductor</th>
                    <th className="p-3.5 text-center">Crew Status</th>
                    <th className="p-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredTrips.map((trip) => {
                    const bus = buses.find((b) => b.id === trip.busId);
                    const route = routes.find((r) => r.id === trip.routeId);
                    const driver = staff.find((s) => s.id === trip.driverId) || users.find((u) => u.id === trip.driverId);
                    const conductor = staff.find((s) => s.id === trip.conductorId) || users.find((u) => u.id === trip.conductorId);

                    const driverAtt = attendanceRecords.find(
                      (a) =>
                        (a.userId === trip.driverId || a.studentId === trip.driverId) &&
                        (a.tripId === trip.id || a.busId === trip.busId)
                    );

                    const conductorAtt = attendanceRecords.find(
                      (a) =>
                        (a.userId === trip.conductorId || a.studentId === trip.conductorId) &&
                        (a.tripId === trip.id || a.busId === trip.busId)
                    );

                    const isComplete = Boolean(trip.driverId && trip.conductorId);

                    return (
                      <tr key={trip.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                        <td className="p-3.5">
                          <div className="font-black text-gray-900 dark:text-white flex items-center gap-1.5">
                            <BusFront className="w-3.5 h-3.5 text-blue-600" />
                            <span>{bus?.busNumber || "Bus TBA"}</span>
                          </div>
                          <div className="text-[10px] font-mono text-gray-400">{trip.tripCode}</div>
                          {store.isTripSpecial(trip) && (
                            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                              <Lock className="w-2.5 h-2.5 shrink-0" />
                              <span>Special Restricted Run</span>
                            </span>
                          )}
                        </td>

                        <td className="p-3.5">
                          <div className="font-bold text-gray-800 dark:text-gray-200">{route?.name || "Route TBA"}</div>
                          <div className="text-[10px] font-mono mt-0.5">
                            {(() => {
                              const shift = shifts.find((s) => s.id === trip.shiftId);
                              const isOutbound = shift?.direction === "CAMPUS_TO_HOME";
                              const isC2C = shift?.direction === "CAMPUS_TO_CAMPUS";
                              return (
                                <span
                                  className={`inline-flex items-center gap-1 font-bold ${
                                    isC2C
                                      ? "text-purple-600 dark:text-purple-400"
                                      : isOutbound
                                      ? "text-indigo-600 dark:text-indigo-400"
                                      : "text-blue-600 dark:text-blue-400"
                                  }`}
                                >
                                  {isC2C ? (
                                    <Building className="w-3 h-3 shrink-0" />
                                  ) : isOutbound ? (
                                    <Sunset className="w-3 h-3 shrink-0" />
                                  ) : (
                                    <Sunrise className="w-3 h-3 shrink-0" />
                                  )}
                                  <span>{shift?.name || "Transit Run"}</span>
                                  {shift?.startTime && (
                                    <span className="opacity-75 font-normal">({shift.startTime})</span>
                                  )}
                                </span>
                              );
                            })()}
                          </div>
                        </td>

                        <td className="p-3.5">
                          {driver ? (
                            <div>
                              <div className="font-bold text-gray-900 dark:text-white">{driver.fullName}</div>
                              <div className="text-[10px] text-gray-400 font-mono">{driver.phone || "—"}</div>
                              {driverAtt ? (
                                driverAtt.method === "BUS_QR_SCAN" ? (
                                  <div className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                                    <ShieldCheck className="w-3 h-3" />
                                    <span>✓ QR Checked-in ({formatTime(driverAtt.timestamp)})</span>
                                  </div>
                                ) : (
                                  <div className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>✓ Card Checked-in ({formatTime(driverAtt.timestamp)})</span>
                                  </div>
                                )
                              ) : (
                                <div className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-500 mt-0.5">
                                  <Clock className="w-3 h-3" />
                                  <span>Check-in Pending</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] font-bold text-red-500 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Unassigned
                            </span>
                          )}
                        </td>

                        <td className="p-3.5">
                          {conductor ? (
                            <div>
                              <div className="font-bold text-gray-900 dark:text-white">{conductor.fullName}</div>
                              <div className="text-[10px] text-gray-400 font-mono">{conductor.phone || "—"}</div>
                              {conductorAtt ? (
                                conductorAtt.method === "BUS_QR_SCAN" ? (
                                  <div className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                                    <ShieldCheck className="w-3 h-3" />
                                    <span>✓ QR Checked-in ({formatTime(conductorAtt.timestamp)})</span>
                                  </div>
                                ) : (
                                  <div className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>✓ Card Checked-in ({formatTime(conductorAtt.timestamp)})</span>
                                  </div>
                                )
                              ) : (
                                <div className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-500 mt-0.5">
                                  <Clock className="w-3 h-3" />
                                  <span>Check-in Pending</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] font-bold text-yellow-500 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Unassigned
                            </span>
                          )}
                        </td>

                        <td className="p-3.5 text-center">
                          <span
                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                              isComplete
                                ? "bg-green-100 dark:bg-green-950/60 text-green-800 dark:text-green-300"
                                : "bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300"
                            }`}
                          >
                            {isComplete ? "Fully Crewed" : "Incomplete"}
                          </span>
                        </td>

                        <td className="p-3.5 text-right">
                          <button
                            onClick={() => openAssignModal(trip)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
                          >
                            {isComplete ? "Change Crew" : "Assign Crew"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Crew Duty Attendance & Payroll Ledger */}
      {activeViewMode === "DUTY_LEDGER" && (
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 sm:p-6 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-black text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <Banknote className="w-4 h-4 text-emerald-600" />
                <span>Staff & Crew Duty Attendance Ledger</span>
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                Verified duty check-ins recorded via Physical Bus QR Door Scanner or Card Selector for payroll and shift compensation auditing.
              </p>
            </div>
          </div>

          {crewDutyRecords.length === 0 ? (
            <div className="py-16 text-center text-xs text-gray-400 font-mono space-y-2">
              <Clock className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600" />
              <div>No staff duty attendance logged yet. Attendance is recorded when crew scans a bus QR or selects a bus card.</div>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-50 dark:bg-gray-800/60 uppercase font-black text-gray-400 border-b border-gray-200 dark:border-gray-800">
                  <tr>
                    <th className="p-3.5">Crew Member</th>
                    <th className="p-3.5">Assigned Bus</th>
                    <th className="p-3.5">Trip & Corridor</th>
                    <th className="p-3.5">Verification Method</th>
                    <th className="p-3.5">Timestamp</th>
                    <th className="p-3.5">Duty Signature</th>
                    <th className="p-3.5 text-right">Payroll Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {crewDutyRecords.map((record) => {
                    const bus = buses.find((b) => b.id === record.busId);
                    const trip = trips.find((t) => t.id === record.tripId);
                    const route = routes.find((r) => r.id === trip?.routeId);

                    return (
                      <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                        <td className="p-3.5">
                          <div className="font-bold text-gray-900 dark:text-white">
                            {record.userName || record.userId || "Staff Member"}
                          </div>
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider mt-0.5 ${
                              record.userRole === "driver"
                                ? "bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300"
                                : "bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300"
                            }`}
                          >
                            {record.userRole || "CREW"}
                          </span>
                        </td>

                        <td className="p-3.5">
                          <div className="font-bold text-gray-800 dark:text-gray-200">
                            {bus?.busNumber || record.busId || "Fleet Bus"}
                          </div>
                          <div className="text-[10px] font-mono text-gray-400">
                            {bus?.registrationNo || "UK-07-FLEET"}
                          </div>
                        </td>

                        <td className="p-3.5">
                          <div className="font-bold text-gray-800 dark:text-gray-200">
                            {trip?.tripCode || record.tripId || "General Duty"}
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {route?.name || "Campus Transit Corridor"}
                          </div>
                        </td>

                        <td className="p-3.5">
                          {record.method === "BUS_QR_SCAN" ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold text-[11px]">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Bus Door QR Scan</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 font-bold text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                              <span>Card Selector</span>
                            </span>
                          )}
                        </td>

                        <td className="p-3.5 font-mono text-gray-600 dark:text-gray-300">
                          <div>{formatDate(record.timestamp)}</div>
                          <div className="text-[10px] text-gray-400">{formatTime(record.timestamp)}</div>
                        </td>

                        <td className="p-3.5 font-mono text-[10px] text-gray-500">
                          {record.signatureToken || `DUTY-${record.id.substring(0, 8)}`}
                        </td>

                        <td className="p-3.5 text-right">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-black text-[10px]">
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>Qualified Duty Record</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Crew Assignment Modal */}
      {crewModalOpen && selectedTripForCrew && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
              <h4 className="font-black text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                <span>Assign Bus Crew</span>
              </h4>
              <button
                onClick={() => setCrewModalOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {crewAssignError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300">
                {crewAssignError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              {/* Driver Select */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-gray-500 mb-1">
                  Designated Driver (Strictly Drivers Only)
                </label>
                <CustomDropdown
                  value={selectedDriverId}
                  onChange={(val) => setSelectedDriverId(val)}
                  placeholder="— Unassign Driver —"
                  options={[
                    { value: "", label: "— Unassign Driver —" },
                    ...eligibleDrivers.map((d) => ({
                      value: d.id,
                      label: `${d.name} (${d.license || "HMV"}) • ${d.phone}`,
                    })),
                  ]}
                />
              </div>

              {/* Conductor Select */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-gray-500 mb-1">
                  Designated Conductor (Conductors or Qualified Drivers)
                </label>
                <CustomDropdown
                  value={selectedConductorId}
                  onChange={(val) => setSelectedConductorId(val)}
                  placeholder="— Unassign Conductor —"
                  options={[
                    { value: "", label: "— Unassign Conductor —" },
                    ...eligibleConductors.map((c) => ({
                      value: c.id,
                      label: `${c.name} • ${c.phone}`,
                    })),
                  ]}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                onClick={() => setCrewModalOpen(false)}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCrewAssignment}
                disabled={isAssigningCrew}
                className="px-4 py-2 text-xs font-black rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-sm"
              >
                {isAssigningCrew ? "Saving Roster..." : "Confirm Crew Allocation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
