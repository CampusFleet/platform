"use client";

import React, { useEffect, useState } from "react";
import { store } from "@/lib/client-store";
import { Bus, VehicleStatus, Route, Trip } from "@/lib/types";
import { parseSeatLayout, calculateBusCapacity } from "@/lib/utils";
import { BusFront, Plus, Edit2, Trash2, ShieldAlert, CheckCircle2, Wrench, Search, MapPin, Sparkles, RefreshCw, QrCode, X } from "lucide-react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { CustomDropdown } from "@/components/common/CustomDropdown";

export interface TransportAdminBusesProps {
  initialBuses?: Bus[];
  initialRoutes?: Route[];
  initialTrips?: Trip[];
}

export default function TransportAdminBusesView({
  initialBuses = [],
  initialRoutes = [],
  initialTrips = [],
}: TransportAdminBusesProps = {}) {
  const [buses, setBuses] = useState<Bus[]>(() => initialBuses.length > 0 ? initialBuses : store.getBuses());
  const [routes, setRoutes] = useState<Route[]>(() => initialRoutes.length > 0 ? initialRoutes : store.getRoutes());
  const [trips, setTrips] = useState<Trip[]>(() => initialTrips.length > 0 ? initialTrips : store.getTrips());
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingBus, setEditingBus] = useState<Bus | null>(null);
  const [allocatingBus, setAllocatingBus] = useState<Bus | null>(null);
  const [viewingQrBus, setViewingQrBus] = useState<Bus | null>(null);
  const [selectedRouteIdToAllocate, setSelectedRouteIdToAllocate] = useState("");

  const [formData, setFormData] = useState<{
    busNumber: number;
    registrationNo: string;
    model: string;
    capacity: number;
    seatLayout: string;
    totalRows?: number;
    status: VehicleStatus;
    gpsDeviceId: string;
    insuranceExpiry: string;
    maintenanceDueDate: string;
  }>({
    busNumber: -1,
    registrationNo: "",
    model: "",
    capacity: 0,
    seatLayout: "NONE",
    totalRows: undefined,
    status: "ACTIVE",
    gpsDeviceId: "",
    insuranceExpiry: "",
    maintenanceDueDate: "",
  });

  const [leftColsCount, setLeftColsCount] = useState<number>(2);
  const [rightColsCount, setRightColsCount] = useState<number>(2);
  const [rowsCount, setRowsCount] = useState<number>(10);
  const [hasRearBench, setHasRearBench] = useState<boolean>(true);

  useEffect(() => {
    const unsub = store.subscribe(() => {
      setBuses(store.getBuses());
      setRoutes(store.getRoutes());
      setTrips(store.getTrips());
    });
    return unsub;
  }, []);

  const updateLayoutAndCapacity = (
    newRows: number,
    newLeft: number,
    newRight: number,
    newRearBench: boolean
  ) => {
    setRowsCount(newRows);
    setLeftColsCount(newLeft);
    setRightColsCount(newRight);
    setHasRearBench(newRearBench);

    if (newLeft > 0 && newRight > 0 && newRows > 0) {
      const layoutStr = `${newLeft}x${newRight}`;
      const cap = calculateBusCapacity(newRows, layoutStr, newRearBench);
      setFormData(prev => ({
        ...prev,
        seatLayout: layoutStr,
        totalRows: newRows,
        capacity: cap,
      }));
    }
  };

  const handleOpenAddModal = () => {
    setEditingBus(null);
    setLeftColsCount(2);
    setRightColsCount(2);
    setRowsCount(10);
    setHasRearBench(true);
    const initialCap = calculateBusCapacity(10, "2x2", true);
    setFormData({
      busNumber: -1,
      registrationNo: "",
      model: "",
      capacity: initialCap,
      seatLayout: "2x2",
      totalRows: 10,
      status: "ACTIVE",
      gpsDeviceId: "",
      insuranceExpiry: "",
      maintenanceDueDate: "",
    });
    setIsAddModalOpen(true);
  };

  const handleCreateOrUpdateBus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.busNumber <= 0 || !formData.registrationNo || !formData.gpsDeviceId) {
      alert("Please fill all required fields and enter a valid vehicle number");
      return;
    }

    const payload = {
      ...formData,
      busNumber: Number(formData.busNumber) || 0,
    };

    if (editingBus) {
      await store.updateBus(editingBus.id, payload);
      setEditingBus(null);
    } else {
      await store.createBus(payload);
      setIsAddModalOpen(false);
    }

    setFormData({
      busNumber: -1,
      registrationNo: "",
      model: "",
      capacity: 0,
      seatLayout: "NONE",
      totalRows: undefined,
      status: "ACTIVE",
      gpsDeviceId: "",
      insuranceExpiry: "",
      maintenanceDueDate: "",
    });
  };

  const handleEditClick = (bus: Bus) => {
    setEditingBus(bus);
    const { left, right } = parseSeatLayout(bus.seatLayout);
    const l = left > 0 ? left : 2;
    const r = right > 0 ? right : 2;
    const derivedRows = bus.totalRows || (bus.capacity > 0 && l + r > 0 ? Math.max(1, Math.ceil((bus.capacity - 1) / (l + r))) : 10);
    setLeftColsCount(l);
    setRightColsCount(r);
    setRowsCount(derivedRows);
    setHasRearBench(true);
    setFormData({
      busNumber: bus.busNumber,
      registrationNo: bus.registrationNo,
      model: bus.model,
      capacity: bus.capacity,
      seatLayout: bus.seatLayout,
      totalRows: bus.totalRows || derivedRows,
      status: bus.status,
      gpsDeviceId: bus.gpsDeviceId,
      insuranceExpiry: bus.insuranceExpiry,
      maintenanceDueDate: bus.maintenanceDueDate,
    });
    setIsAddModalOpen(true);
  };

  const handleDeleteBus = async (busId: number, busNumber: number) => {
    if (confirm(`Are you sure you want to delete Bus ${busNumber}? This will unassign it from all active schedules.`)) {
      await store.deleteBus(busId);
    }
  };

  const handleAllocateRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allocatingBus || !selectedRouteIdToAllocate) return;
    await store.allocateBusToRoute(allocatingBus.id, selectedRouteIdToAllocate);
    alert(`Successfully allocated Bus ${allocatingBus.busNumber} to Route!`);
    setAllocatingBus(null);
  };

  const filteredBuses = buses.filter(
    b =>
      String(b.busNumber).includes(searchQuery.toLowerCase()) ||
      b.registrationNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.model.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white flex items-center gap-2.5">
            <BusFront className="w-7 h-7 text-blue-600" />
            Campus Bus Fleet Management
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Production fleet administration: Add buses, configure seat layouts, allocate vehicles to campus routes & stops.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-2xl flex items-center gap-2 shadow-md shadow-blue-600/20 transition-transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Add New Vehicle
          </button>
        </div>
      </div>

      {/* Search & Filter bar */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="relative max-w-sm w-full">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search bus name, registration number..."
            className="w-full text-xs pl-9 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none"
          />
        </div>

        <div className="text-xs font-mono text-gray-500">
          Showing {filteredBuses.length} of {buses.length} Fleet Vehicles
        </div>
      </div>

      {/* Empty State Banner */}
      {buses.length === 0 && (
        <div className="p-12 text-center bg-white dark:bg-gray-900 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-800 space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center mx-auto">
            <BusFront className="w-8 h-8" />
          </div>
          <div>
            <h3 className="font-black text-lg text-gray-900 dark:text-white">No Buses in Fleet</h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
              Start by adding your institution's buses to allocate them to routes, stops, and morning/evening shifts.
            </p>
          </div>
          <button
            onClick={handleOpenAddModal}
            className="px-5 py-2.5 bg-blue-600 text-white font-bold text-xs rounded-2xl shadow-lg shadow-blue-600/20"
          >
            + Add First Bus Vehicle
          </button>
        </div>
      )}

      {/* Bus Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredBuses.map(bus => {
          // Find assigned trips and routes
          const assignedTrips = trips.filter(t => t.busId === bus.id);
          const assignedRouteIds = Array.from(new Set(assignedTrips.map(t => t.routeId)));
          const assignedRoutes = routes.filter(r => assignedRouteIds.includes(r.id));

          return (
            <div
              key={bus.id}
              className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4 hover:border-blue-500/60 transition-all flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                      {bus.registrationNo}
                    </span>
                    <h3 className="font-bold text-base text-gray-900 dark:text-white mt-0.5">
                      {bus.busNumber}
                    </h3>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide uppercase ${bus.status === "ACTIVE"
                      ? "bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-300"
                      : "bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-300"
                      }`}
                  >
                    {bus.status}
                  </span>
                </div>

                <div className="text-xs text-gray-500">
                  Model: <span className="font-semibold text-gray-800 dark:text-gray-200">{bus.model}</span>
                </div>

                {/* Capacity & Seat Config */}
                <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl text-xs">
                  <div>
                    <span className="text-[10px] uppercase text-gray-400 font-bold">Capacity</span>
                    <div className="font-black text-gray-900 dark:text-white font-mono mt-0.5">
                      {bus.capacity} Seats ({bus.seatLayout !== "NONE" ? bus.seatLayout : "Unassigned"}
                      {bus.totalRows ? ` • ${bus.totalRows} Rows` : ""})
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-gray-400 font-bold">GPS Device ID</span>
                    <div className="font-bold text-gray-900 dark:text-white font-mono mt-0.5 truncate">
                      {bus.gpsDeviceId}
                    </div>
                  </div>
                </div>

                {/* Assigned Corridor / Routes */}
                <div className="p-3 bg-blue-50/60 dark:bg-blue-950/30 rounded-2xl border border-blue-100 dark:border-blue-900/40 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Allocated Corridors ({assignedRoutes.length})
                  </span>
                  {assignedRoutes.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {assignedRoutes.map(r => (
                        <span key={r.id} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700">
                          {r.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-gray-400 italic">No routes allocated yet</div>
                  )}
                </div>

                {/* Compliance & Expiry */}
                <div className="text-[11px] text-gray-500 space-y-1 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <div className="flex justify-between">
                    <span>Insurance Expiry:</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{bus.insuranceExpiry}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Maintenance Due:</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{bus.maintenanceDueDate}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => setViewingQrBus(bus)}
                  className="flex-1 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                  title="Print Boarding QR Code"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  QR
                </button>

                <button
                  onClick={() => setAllocatingBus(bus)}
                  className="flex-1 py-2 bg-gray-100 hover:bg-blue-50 dark:bg-gray-800 dark:hover:bg-blue-950/60 text-blue-600 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  Allocate Route
                </button>

                <button
                  onClick={() => handleEditClick(bus)}
                  className="p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl"
                  title="Edit Bus"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => handleDeleteBus(bus.id, bus.busNumber)}
                  className="p-2 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 text-red-600 rounded-xl"
                  title="Delete Bus"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Bus Modal */}
      {(isAddModalOpen || editingBus) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <form
            onSubmit={handleCreateOrUpdateBus}
            className="w-full max-w-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 space-y-4 text-gray-900 dark:text-white shadow-2xl"
          >
            <h3 className="font-black text-lg">
              {editingBus ? `Edit Bus ${editingBus.busNumber}` : "Add New Fleet Bus"}
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold uppercase tracking-wider text-gray-400">Bus Number *</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 44"
                  value={formData.busNumber > 0 ? formData.busNumber : ""}
                  onChange={e => setFormData({ ...formData, busNumber: e.target.value ? Number(e.target.value) : -1 })}
                  className="w-full p-2.5 mt-1 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold uppercase tracking-wider text-gray-400">Registration Number</label>
                  <input
                    type="text"
                    required
                    placeholder="DL-01-AX-4821"
                    value={formData.registrationNo}
                    onChange={e => setFormData({ ...formData, registrationNo: e.target.value })}
                    className="w-full p-2.5 mt-1 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="font-bold uppercase tracking-wider text-gray-400">GPS Device IMEI / ID</label>
                  <input
                    type="text"
                    required
                    placeholder="GPS-TRK-901"
                    value={formData.gpsDeviceId}
                    onChange={e => setFormData({ ...formData, gpsDeviceId: e.target.value })}
                    className="w-full p-2.5 mt-1 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none font-mono"
                  />
                </div>
              </div>

              {/* Dynamic N x M Gangway Configuration & Chassis Rows */}
              <div className="p-3.5 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700/60 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-black text-xs uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                    Chassis Length & Seating Grid (N x M)
                  </label>
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                    {leftColsCount}x{rightColsCount} ({rowsCount} Rows)
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="font-bold text-[10px] uppercase text-gray-400">Total Rows</label>
                    <input
                      type="number"
                      min={1}
                      max={35}
                      value={rowsCount}
                      onChange={e => {
                        const val = Math.max(1, parseInt(e.target.value) || 1);
                        updateLayoutAndCapacity(val, leftColsCount, rightColsCount, hasRearBench);
                      }}
                      className="w-full p-2 mt-1 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-bold text-center outline-none"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-[10px] uppercase text-gray-400">Left Column (N)</label>
                    <input
                      type="number"
                      min={1}
                      max={4}
                      value={leftColsCount}
                      onChange={e => {
                        const val = Math.max(1, parseInt(e.target.value) || 1);
                        updateLayoutAndCapacity(rowsCount, val, rightColsCount, hasRearBench);
                      }}
                      className="w-full p-2 mt-1 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-bold text-center outline-none"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-[10px] uppercase text-gray-400">Right Column (M)</label>
                    <input
                      type="number"
                      min={1}
                      max={4}
                      value={rightColsCount}
                      onChange={e => {
                        const val = Math.max(1, parseInt(e.target.value) || 1);
                        updateLayoutAndCapacity(rowsCount, leftColsCount, val, hasRearBench);
                      }}
                      className="w-full p-2 mt-1 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-bold text-center outline-none"
                    />
                  </div>
                </div>

                {/* Common Presets */}
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Presets:</span>
                  {[
                    { label: "2x2 Standard", l: 2, r: 2 },
                    { label: "3x2 High Cap", l: 3, r: 2 },
                    { label: "2x3 High Cap", l: 2, r: 3 },
                    { label: "1x2 Shuttle", l: 1, r: 2 },
                    { label: "3x3 Wide-body", l: 3, r: 3 },
                  ].map(preset => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => updateLayoutAndCapacity(rowsCount, preset.l, preset.r, hasRearBench)}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${leftColsCount === preset.l && rightColsCount === preset.r
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200/70 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300"
                        }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Rear bench middle seat checkbox */}
                <label className="flex items-center gap-2 pt-1 text-xs cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hasRearBench}
                    onChange={e => updateLayoutAndCapacity(rowsCount, leftColsCount, rightColsCount, e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                  />
                  <span className="text-gray-700 dark:text-gray-300 font-medium text-[11px]">
                    Continuous Rear Bench (+1 center middle seat across gangway in back row)
                  </span>
                </label>

                {/* Live Computed Capacity Banner with optional override */}
                <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-blue-900 dark:text-blue-300">
                      Total Physical Capacity:
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={formData.capacity}
                      onChange={e => setFormData({ ...formData, capacity: parseInt(e.target.value) || 0 })}
                      className="ml-2 w-16 p-1 text-center font-mono font-black text-xs text-blue-700 dark:text-blue-300 bg-white dark:bg-gray-800 rounded-lg border border-blue-200 dark:border-blue-800"
                    />
                    <span className="ml-1 text-xs text-blue-700 dark:text-blue-300 font-bold">Seats</span>
                  </div>
                  <span className="text-[10px] text-blue-700/80 dark:text-blue-400/80 font-medium">
                    {rowsCount} rows × {leftColsCount + rightColsCount} cols {hasRearBench && rowsCount > 1 ? "+ 1 rear seat" : ""}
                  </span>
                </div>
              </div>

              <div>
                <label className="font-bold uppercase tracking-wider text-gray-400">Bus Model / Make</label>
                <input
                  type="text"
                  value={formData.model}
                  onChange={e => setFormData({ ...formData, model: e.target.value })}
                  className="w-full p-2.5 mt-1 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold uppercase tracking-wider text-gray-400">Insurance Expiry</label>
                  <input
                    type="date"
                    value={formData.insuranceExpiry}
                    onChange={e => setFormData({ ...formData, insuranceExpiry: e.target.value })}
                    className="w-full p-2.5 mt-1 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold uppercase tracking-wider text-gray-400">Vehicle Status</label>
                  <CustomDropdown
                    value={formData.status}
                    onChange={val => setFormData({ ...formData, status: val as VehicleStatus })}
                    options={[
                      { value: "ACTIVE", label: "ACTIVE (Operational)" },
                      { value: "MAINTENANCE", label: "MAINTENANCE (Workshop)" },
                      { value: "DECOMMISSIONED", label: "DECOMMISSIONED" },
                    ]}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingBus(null);
                }}
                className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-xs font-bold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md"
              >
                {editingBus ? "Save Changes" : "Create Fleet Bus"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Allocate Bus to Route Modal */}
      {allocatingBus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <form
            onSubmit={handleAllocateRoute}
            className="w-full max-w-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 space-y-4 text-gray-900 dark:text-white shadow-2xl"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-base">Allocate Vehicle to Corridor</h3>
                <p className="text-xs text-gray-500">{allocatingBus.busNumber} ({allocatingBus.registrationNo})</p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <label className="font-bold uppercase tracking-wider text-gray-400">Select Transit Corridor / Route</label>
              <CustomDropdown
                value={selectedRouteIdToAllocate}
                onChange={val => setSelectedRouteIdToAllocate(val)}
                placeholder="-- Choose Campus Route --"
                options={[
                  { value: "", label: "-- Choose Campus Route --" },
                  ...routes.map(r => ({
                    value: r.id,
                    label: `${r.name} • ${r.stops.length} Stops`,
                  })),
                ]}
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAllocatingBus(null)}
                className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-xs font-bold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!selectedRouteIdToAllocate}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl"
              >
                Confirm Allocation
              </button>
            </div>
          </form>
        </div>
      )}

      {/* View Bus QR Modal */}
      {viewingQrBus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-5 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-black text-lg text-gray-900 dark:text-white flex items-center gap-2">
                <QrCode className="w-5 h-5 text-blue-500" />
                Bus Boarding QR
              </h3>
              <button
                onClick={() => setViewingQrBus(null)}
                className="p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 text-center space-y-6">
              <div className="bg-white p-4 rounded-3xl inline-block shadow-md border border-gray-100">
                <QRCodeSVG
                  value={JSON.stringify({ type: "BUS_QR", busId: viewingQrBus.id })}
                  size={200}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="H"
                />
              </div>

              <div>
                <h4 className="font-black text-xl text-gray-900 dark:text-white">
                  {viewingQrBus.busNumber}
                </h4>
                <p className="text-sm font-mono text-gray-500 mt-1">
                  {viewingQrBus.registrationNo}
                </p>
                <p className="text-xs text-gray-400 mt-4 max-w-xs mx-auto">
                  Print this QR code and paste it on the bus door. Students will scan this with their CampusFleet app to securely mark their attendance.
                </p>
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <div className="flex gap-3">
                  <button
                    onClick={() => setViewingQrBus(null)}
                    className="flex-1 py-3 text-sm font-bold bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-2xl transition-all"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="flex-1 py-3 text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-2xl transition-all shadow-md shadow-blue-600/20"
                  >
                    Print Bus QR
                  </button>
                </div>
                <Link
                  href={`/transport-admin/buses/${viewingQrBus.id}/seat-qrs`}
                  className="w-full py-3 text-sm font-bold bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded-2xl transition-all shadow-sm text-center"
                >
                  Print Seat QRs ({viewingQrBus.capacity} Seats)
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
