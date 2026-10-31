"use client";

import React, { useState, useEffect, useMemo } from "react";
import { store } from "@/lib/store";
import { Campus, TransitZone, Stop } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Building2,
  Layers,
  Plus,
  Pencil,
  Trash2,
  MapPin,
  IndianRupee,
  ShieldCheck,
  CheckCircle2,
  Search,
  CheckSquare,
  Square,
  Navigation,
  Bus,
  Phone,
  Mail,
  ExternalLink,
  Sparkles,
  Sliders,
  Check,
  X,
  AlertCircle,
} from "lucide-react";
import { CustomDropdown } from "@/components/common/CustomDropdown";

interface StaffCampusesViewProps {
  initialCampuses?: Campus[];
  initialZones?: TransitZone[];
  initialStops?: Stop[];
  user?: any;
}

export function StaffCampusesView({
  initialCampuses,
  initialZones,
  initialStops,
  user,
}: StaffCampusesViewProps) {
  // Store Subscriptions
  const [campuses, setCampuses] = useState<Campus[]>(() => initialCampuses || store.getCampuses());
  const [transitZones, setTransitZones] = useState<TransitZone[]>(() => initialZones || store.getTransitZones(undefined, true));
  const [stops, setStops] = useState<Stop[]>(() => initialStops || store.getStops());

  // Active View Tabs
  const [activeSection, setActiveSection] = useState<"CAMPUSES" | "ZONES">("CAMPUSES");
  const [selectedCampusId, setSelectedCampusId] = useState<string>(() => {
    return initialCampuses?.find((c) => c.isPrimary)?.id || initialCampuses?.[0]?.id || store.getPrimaryCampus()?.id || "";
  });

  // Notification Toast
  const [toast, setToast] = useState<string | null>(null);

  // Campus Modal State
  const [campusModalOpen, setCampusModalOpen] = useState(false);
  const [editingCampus, setEditingCampus] = useState<Campus | null>(null);
  const [campusForm, setCampusForm] = useState({
    name: "",
    code: "",
    address: "",
    landmark: "",
    city: "",
    latitude: 29.375015,
    longitude: 79.529479,
    geofenceRadiusMeters: 100,
    fleetCapacity: 50,
    parkingBays: 16,
    contactPhone: "",
    contactEmail: "",
    isPrimary: false,
    isActive: true,
  });
  const [isSavingCampus, setIsSavingCampus] = useState(false);
  const [deleteCampusConfirm, setDeleteCampusConfirm] = useState<Campus | null>(null);

  // Zone Modal State
  const [zoneModalOpen, setZoneModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<TransitZone | null>(null);
  const [zoneForm, setZoneForm] = useState({
    code: "ZONE_A",
    name: "",
    semesterFee: 12000,
    installmentsAllowed: 3,
    corridorDescription: "",
    isActive: true,
    assignedStopIds: [] as string[],
  });
  const [stopFilterSearch, setStopFilterSearch] = useState("");
  const [isSavingZone, setIsSavingZone] = useState(false);
  const [deleteConfirmZone, setDeleteConfirmZone] = useState<TransitZone | null>(null);

  // Sync with store
  useEffect(() => {
    const unsub = store.subscribe(() => {
      setCampuses(store.getCampuses());
      setTransitZones(store.getTransitZones(undefined, true));
      setStops(store.getStops());
    });
    return unsub;
  }, []);

  // Ensure selected campus is valid
  useEffect(() => {
    if (!selectedCampusId && campuses.length > 0) {
      setSelectedCampusId(campuses.find((c) => c.isPrimary)?.id || campuses[0].id);
    }
  }, [campuses, selectedCampusId]);

  const activeCampus = useMemo(() => {
    return campuses.find((c) => c.id === selectedCampusId) || campuses[0];
  }, [campuses, selectedCampusId]);

  const activeCampusZones = useMemo(() => {
    return transitZones.filter((z) => z.campusId === selectedCampusId);
  }, [transitZones, selectedCampusId]);

  const activeCampusStops = useMemo(() => {
    return stops.filter((s) => s.campusId === selectedCampusId);
  }, [stops, selectedCampusId]);

  // Campus CRUD Handlers
  const handleOpenCreateCampus = () => {
    setEditingCampus(null);
    setCampusForm({
      name: "",
      code: "",
      address: "",
      landmark: "",
      city: "",
      latitude: 29.375,
      longitude: 79.529,
      geofenceRadiusMeters: 100,
      fleetCapacity: 40,
      parkingBays: 15,
      contactPhone: "+91 ",
      contactEmail: "transport@university.ac.in",
      isPrimary: campuses.length === 0,
      isActive: true,
    });
    setCampusModalOpen(true);
  };

  const handleOpenEditCampus = (campus: Campus) => {
    setEditingCampus(campus);
    setCampusForm({
      name: campus.name,
      code: campus.code,
      address: campus.address || "",
      landmark: campus.landmark || "",
      city: campus.city || "",
      latitude: campus.latitude,
      longitude: campus.longitude,
      geofenceRadiusMeters: campus.geofenceRadiusMeters || 100,
      fleetCapacity: campus.fleetCapacity || 50,
      parkingBays: campus.parkingBays || 16,
      contactPhone: campus.contactPhone || "",
      contactEmail: campus.contactEmail || "",
      isPrimary: Boolean(campus.isPrimary),
      isActive: campus.isActive !== false,
    });
    setCampusModalOpen(true);
  };

  const handleSaveCampus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campusForm.name.trim() || !campusForm.code.trim()) {
      alert("Campus Name and Code are required.");
      return;
    }
    setIsSavingCampus(true);
    try {
      if (editingCampus) {
        await store.updateCampus(editingCampus.id, {
          name: campusForm.name.trim(),
          code: campusForm.code.trim().toUpperCase(),
          address: campusForm.address.trim(),
          landmark: campusForm.landmark.trim(),
          city: campusForm.city.trim(),
          latitude: Number(campusForm.latitude),
          longitude: Number(campusForm.longitude),
          geofenceRadiusMeters: Number(campusForm.geofenceRadiusMeters),
          fleetCapacity: Number(campusForm.fleetCapacity),
          parkingBays: Number(campusForm.parkingBays),
          contactPhone: campusForm.contactPhone.trim(),
          contactEmail: campusForm.contactEmail.trim(),
          isPrimary: campusForm.isPrimary,
          isActive: campusForm.isActive,
        });
        setToast(`✓ Campus ${campusForm.name} updated successfully.`);
      } else {
        const created = await store.createCampus({
          name: campusForm.name.trim(),
          code: campusForm.code.trim().toUpperCase(),
          address: campusForm.address.trim(),
          landmark: campusForm.landmark.trim(),
          city: campusForm.city.trim(),
          latitude: Number(campusForm.latitude),
          longitude: Number(campusForm.longitude),
          geofenceRadiusMeters: Number(campusForm.geofenceRadiusMeters),
          fleetCapacity: Number(campusForm.fleetCapacity),
          parkingBays: Number(campusForm.parkingBays),
          contactPhone: campusForm.contactPhone.trim(),
          contactEmail: campusForm.contactEmail.trim(),
          isPrimary: campusForm.isPrimary,
          isActive: campusForm.isActive,
        });
        setSelectedCampusId(created.id);
        setToast(`✓ New campus ${created.name} registered.`);
      }
      setTimeout(() => setToast(null), 3500);
      setCampusModalOpen(false);
      setEditingCampus(null);
      await store.syncFromSupabase();
    } catch (err: any) {
      alert("Failed to save campus: " + err.message);
    } finally {
      setIsSavingCampus(false);
    }
  };

  const handleSetPrimaryCampus = async (campusId: string) => {
    try {
      await store.setPrimaryCampus(campusId);
      setToast("✓ Primary operational campus updated.");
      setTimeout(() => setToast(null), 3500);
      await store.syncFromSupabase();
    } catch (err: any) {
      alert("Failed to update primary campus: " + err.message);
    }
  };

  const handleDeleteCampus = async () => {
    if (!deleteCampusConfirm) return;
    try {
      await store.deleteCampus(deleteCampusConfirm.id);
      setToast(`✓ Campus ${deleteCampusConfirm.name} removed.`);
      setTimeout(() => setToast(null), 3500);
      setDeleteCampusConfirm(null);
      await store.syncFromSupabase();
    } catch (err: any) {
      alert("Failed to delete campus: " + err.message);
    }
  };

  // Zone CRUD Handlers
  const handleOpenCreateZone = () => {
    setEditingZone(null);
    const nextCodeLetter = String.fromCharCode(65 + (activeCampusZones.length % 26));
    setZoneForm({
      code: `ZONE_${nextCodeLetter}`,
      name: `Zone ${nextCodeLetter}: Corridor`,
      semesterFee: 12000,
      installmentsAllowed: 3,
      corridorDescription: "",
      isActive: true,
      assignedStopIds: [],
    });
    setStopFilterSearch("");
    setZoneModalOpen(true);
  };

  const handleOpenEditZone = (zone: TransitZone) => {
    setEditingZone(zone);
    const currentAssigned = activeCampusStops
      .filter((s) => s.zoneCode === zone.code)
      .map((s) => s.id);
    setZoneForm({
      code: zone.code,
      name: zone.name,
      semesterFee: zone.semesterFee,
      installmentsAllowed: zone.installmentsAllowed,
      corridorDescription: zone.corridorDescription,
      isActive: zone.isActive !== false,
      assignedStopIds: currentAssigned,
    });
    setStopFilterSearch("");
    setZoneModalOpen(true);
  };

  const handleToggleStop = (stopId: string) => {
    setZoneForm((prev) => {
      const isChecked = prev.assignedStopIds.includes(stopId);
      const updated = isChecked
        ? prev.assignedStopIds.filter((id) => id !== stopId)
        : [...prev.assignedStopIds, stopId];

      const autoDescription = activeCampusStops
        .filter((s) => updated.includes(s.id))
        .map((s) => s.name)
        .join(", ");

      return {
        ...prev,
        assignedStopIds: updated,
        corridorDescription: autoDescription || prev.corridorDescription,
      };
    });
  };

  const handleSelectAllStops = (select: boolean) => {
    const updated = select ? activeCampusStops.map((s) => s.id) : [];
    const autoDescription = select ? activeCampusStops.map((s) => s.name).join(", ") : "";
    setZoneForm((prev) => ({
      ...prev,
      assignedStopIds: updated,
      corridorDescription: autoDescription,
    }));
  };

  const handleSaveZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampusId) {
      alert("Please select a campus first.");
      return;
    }
    if (!zoneForm.code.trim() || !zoneForm.name.trim()) {
      alert("Zone code and zone name are required.");
      return;
    }
    setIsSavingZone(true);
    try {
      if (editingZone) {
        await store.updateTransitZone(editingZone.id || editingZone.code, {
          code: zoneForm.code.trim().toUpperCase(),
          name: zoneForm.name.trim(),
          semesterFee: Number(zoneForm.semesterFee) || 0,
          installmentsAllowed: Number(zoneForm.installmentsAllowed) || 3,
          corridorDescription: zoneForm.corridorDescription.trim(),
          isActive: zoneForm.isActive,
          campusId: selectedCampusId,
          assignedStopIds: zoneForm.assignedStopIds,
        });
        setToast(`✓ Zone ${zoneForm.code} updated and assigned ${zoneForm.assignedStopIds.length} stops.`);
      } else {
        await store.createTransitZone({
          code: zoneForm.code.trim().toUpperCase(),
          name: zoneForm.name.trim(),
          semesterFee: Number(zoneForm.semesterFee) || 0,
          installmentsAllowed: Number(zoneForm.installmentsAllowed) || 3,
          corridorDescription: zoneForm.corridorDescription.trim(),
          isActive: zoneForm.isActive,
          campusId: selectedCampusId,
          assignedStopIds: zoneForm.assignedStopIds,
        });
        setToast(`✓ Zone ${zoneForm.code} created for ${activeCampus?.name || "Campus"} with fee ₹${Number(zoneForm.semesterFee).toLocaleString("en-IN")}.`);
      }
      setTimeout(() => setToast(null), 3500);
      setZoneModalOpen(false);
      setEditingZone(null);
      await store.syncFromSupabase();
    } catch (err: any) {
      alert("Failed to save zone: " + err.message);
    } finally {
      setIsSavingZone(false);
    }
  };

  const handleDeleteZone = async () => {
    if (!deleteConfirmZone) return;
    try {
      await store.deleteTransitZone(deleteConfirmZone.id || deleteConfirmZone.code);
      setToast(`✓ Zone ${deleteConfirmZone.code} deleted.`);
      setTimeout(() => setToast(null), 3500);
      setDeleteConfirmZone(null);
      await store.syncFromSupabase();
    } catch (err: any) {
      alert("Failed to delete zone: " + err.message);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-16">
      {/* Toast Notification */}
      {toast && (
        <div className="p-4 rounded-2xl bg-green-600 text-white font-bold text-xs shadow-xl flex items-center justify-between animate-in slide-in-from-top">
          <span>{toast}</span>
          <button onClick={() => setToast(null)} className="text-white/80 hover:text-white p-1 rounded-lg cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-[11px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-2">
            <Building2 className="w-3.5 h-3.5" /> Institutional Multi-Campus Infrastructure
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white flex items-center gap-2.5">
            Campus Entities & Fare Zones
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1 max-w-2xl">
            Configure universities & branch campuses, assign depot bays, price transit zones, and bundle passenger stops strictly per campus.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpenCreateCampus}
            className="px-4 py-2.5 bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-900 font-extrabold text-xs rounded-2xl flex items-center gap-2 shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" /> Add Campus Entity
          </button>

          <button
            type="button"
            onClick={handleOpenCreateZone}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-2xl flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all"
          >
            <Plus className="w-4 h-4" /> New Zone for {activeCampus?.code || "Campus"}
          </button>
        </div>
      </div>

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-1">
          <div className="text-[11px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" /> Registered Campuses
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white font-mono">
            {campuses.length}
          </div>
          <div className="text-[11px] text-gray-500">
            Primary: {campuses.find((c) => c.isPrimary)?.code || "None"}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-1">
          <div className="text-[11px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" /> Total Transit Zones
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white font-mono">
            {transitZones.length}
          </div>
          <div className="text-[11px] text-gray-500">
            Across {campuses.length} regional centers
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-1">
          <div className="text-[11px] font-black uppercase tracking-wider text-green-600 dark:text-green-400 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> Network Stops
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white font-mono">
            {stops.length}
          </div>
          <div className="text-[11px] text-gray-500">
            {activeCampusStops.length} mapped to {activeCampus?.code || "active"}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-1">
          <div className="text-[11px] font-black uppercase tracking-wider text-yellow-600 dark:text-yellow-400 flex items-center gap-1.5">
            <Bus className="w-3.5 h-3.5" /> Depot Capacity
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white font-mono">
            {campuses.reduce((acc, c) => acc + (c.parkingBays || 0), 0)} Bays
          </div>
          <div className="text-[11px] text-gray-500">
            {campuses.reduce((acc, c) => acc + (c.fleetCapacity || 0), 0)} Max bus parking
          </div>
        </div>
      </div>

      {/* Navigation Section Tabs */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSection("CAMPUSES")}
            className={`px-4 py-2 rounded-2xl text-xs font-black flex items-center gap-2 transition-all ${
              activeSection === "CAMPUSES"
                ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Campuses & Facilities ({campuses.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("ZONES")}
            className={`px-4 py-2 rounded-2xl text-xs font-black flex items-center gap-2 transition-all ${
              activeSection === "ZONES"
                ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <Layers className="w-4 h-4 text-blue-500" />
            <span>Campus Zones & Stop Bundling ({activeCampusZones.length})</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: CAMPUSES & INFRASTRUCTURE */}
      {activeSection === "CAMPUSES" && (
        <div className="space-y-6 animate-in fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {campuses.map((campus) => {
              const zoneCount = transitZones.filter((z) => z.campusId === campus.id).length;
              const stopCount = stops.filter((s) => s.campusId === campus.id).length;
              const isSelected = campus.id === selectedCampusId;

              return (
                <div
                  key={campus.id}
                  className={`bg-white dark:bg-gray-900 rounded-3xl border p-6 shadow-sm flex flex-col justify-between space-y-5 transition-all ${
                    campus.isPrimary
                      ? "border-blue-400 dark:border-blue-800 ring-2 ring-blue-500/20"
                      : "border-gray-200 dark:border-gray-800 hover:border-gray-300"
                  }`}
                >
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white font-black text-sm flex items-center justify-center shadow-md">
                          {campus.code?.slice(0, 4) || "CAMP"}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-black text-base text-gray-900 dark:text-white">
                              {campus.name}
                            </h3>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                            <span className="font-bold text-gray-700 dark:text-gray-300">{campus.code}</span>
                            <span>•</span>
                            <span>{campus.city || "Uttarakhand"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {campus.isPrimary ? (
                          <span className="px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-black text-[10px] uppercase tracking-wider flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" /> Primary
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSetPrimaryCampus(campus.id)}
                            className="px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-950 text-gray-600 hover:text-blue-600 text-[10px] font-extrabold transition-all"
                          >
                            Set as Primary
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenEditCampus(campus)}
                          className="p-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-blue-50 text-gray-600 hover:text-blue-600 transition-all"
                          title="Edit Campus Details"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>

                        {!campus.isPrimary && campuses.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setDeleteCampusConfirm(campus)}
                            className="p-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-red-50 text-gray-600 hover:text-red-600 transition-all"
                            title="Delete Campus"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Address & Landmark */}
                    <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 text-xs space-y-1 text-gray-600 dark:text-gray-300">
                      <div className="flex items-center gap-1.5 font-bold text-gray-800 dark:text-white">
                        <MapPin className="w-3.5 h-3.5 text-blue-500" />
                        <span>{campus.landmark || "Main Campus Entrance"}</span>
                      </div>
                      <div className="text-[11px] text-gray-400 pl-5">
                        {campus.address || "Address not provided"}
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
                        <div className="text-[10px] font-bold text-gray-400 uppercase">Parking Bays</div>
                        <div className="text-base font-black text-gray-900 dark:text-white font-mono mt-0.5">
                          {campus.parkingBays || 16}
                        </div>
                      </div>

                      <div className="p-2.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
                        <div className="text-[10px] font-bold text-gray-400 uppercase">Fare Zones</div>
                        <div className="text-base font-black text-blue-600 dark:text-blue-400 font-mono mt-0.5">
                          {zoneCount}
                        </div>
                      </div>

                      <div className="p-2.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
                        <div className="text-[10px] font-bold text-gray-400 uppercase">Mapped Stops</div>
                        <div className="text-base font-black text-green-600 dark:text-green-400 font-mono mt-0.5">
                          {stopCount}
                        </div>
                      </div>
                    </div>

                    {/* Coordinates & Contact Info */}
                    <div className="flex flex-wrap items-center justify-between text-[11px] text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-800">
                      <div className="flex items-center gap-1 font-mono text-[10px]">
                        <span>GPS: {campus.latitude.toFixed(4)}, {campus.longitude.toFixed(4)}</span>
                        <span>(±{campus.geofenceRadiusMeters || 100}m)</span>
                      </div>

                      {campus.contactPhone && (
                        <div className="flex items-center gap-1 text-[10px]">
                          <Phone className="w-3 h-3 text-blue-500" />
                          <span>{campus.contactPhone}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions / Jump to Zones */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCampusId(campus.id);
                        setActiveSection("ZONES");
                      }}
                      className="w-full py-2.5 px-4 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-extrabold text-xs flex items-center justify-center gap-2 transition-all border border-blue-200 dark:border-blue-900"
                    >
                      <Layers className="w-4 h-4" />
                      <span>Manage Zones & Stops for {campus.code} ({zoneCount} Zones)</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 2: PER-CAMPUS ZONES, PRICING & STOP BUNDLING */}
      {activeSection === "ZONES" && (
        <div className="space-y-6 animate-in fade-in">
          {/* Active Campus Selector Bar */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" /> Active Operating Campus
                </span>
                <h3 className="text-base font-black text-gray-900 dark:text-white mt-0.5">
                  Choose Campus to Configure Zones, Stops & Pass Pricing
                </h3>
              </div>

              <button
                type="button"
                onClick={handleOpenCreateZone}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow"
              >
                <Plus className="w-4 h-4" /> Add Zone to {activeCampus?.code || "Campus"}
              </button>
            </div>

            {/* Campus Selector Pills */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              {campuses.map((c) => {
                const isSelected = c.id === selectedCampusId;
                const zoneCount = transitZones.filter((z) => z.campusId === c.id).length;
                const stopCount = stops.filter((s) => s.campusId === c.id).length;

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCampusId(c.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all border ${
                      isSelected
                        ? "bg-blue-600 text-white border-blue-600 shadow-md"
                        : "bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300"
                    }`}
                  >
                    <span>{c.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isSelected
                          ? "bg-white/20 text-white"
                          : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      {zoneCount} Zones
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Zones List for Active Campus */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
                  <span>Transit Zones & Pass Pricing for {activeCampus?.name}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 font-bold text-gray-600 dark:text-gray-400">
                    {activeCampusZones.length} Zones
                  </span>
                </h4>
                <p className="text-xs text-gray-500 mt-0.5">
                  Students affiliated with {activeCampus?.name} pay these semester fees based on the corridor zone of their primary boarding stop.
                </p>
              </div>
            </div>

            {activeCampusZones.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 rounded-3xl border border-dashed border-gray-300 dark:border-gray-800 p-12 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                  <Layers className="w-7 h-7" />
                </div>
                <h5 className="font-black text-base text-gray-900 dark:text-white">
                  No Zones Configured for {activeCampus?.name}
                </h5>
                <p className="text-xs text-gray-500 max-w-md mx-auto">
                  Every campus encapsulates its own dedicated transit zones and pricing. Click below to bundle stops into this campus's first fare zone.
                </p>
                <button
                  type="button"
                  onClick={handleOpenCreateZone}
                  className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl shadow hover:bg-blue-700"
                >
                  Create First Zone
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {activeCampusZones.map((zone) => {
                  const assignedStops = activeCampusStops.filter((s) => s.zoneCode === zone.code);

                  return (
                    <div
                      key={zone.id || zone.code}
                      className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-3">
                        {/* Zone Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="px-3 py-1 rounded-xl bg-blue-600 text-white font-black text-xs tracking-wider shadow-sm">
                              {zone.code}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                zone.isActive !== false
                                  ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                              }`}
                            >
                              {zone.isActive !== false ? "Active" : "Inactive"}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditZone(zone)}
                              className="p-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-blue-50 text-gray-600 hover:text-blue-600 transition-all"
                              title="Edit Zone & Assigned Stops"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmZone(zone)}
                              className="p-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-red-50 text-gray-600 hover:text-red-600 transition-all"
                              title="Delete Zone"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Zone Title */}
                        <div>
                          <h5 className="font-black text-sm text-gray-900 dark:text-white">
                            {zone.name}
                          </h5>
                          <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            <span>{activeCampus?.name}</span>
                          </div>
                        </div>

                        {/* Pass Pricing Card */}
                        <div className="p-3.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60 space-y-1">
                          <div className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1">
                            <IndianRupee className="w-3 h-3" /> Student Pass Price
                          </div>
                          <div className="text-2xl font-black text-gray-900 dark:text-white font-mono">
                            ₹{Number(zone.semesterFee).toLocaleString("en-IN")}
                            <span className="text-xs font-bold text-gray-500 font-sans ml-1">/ semester</span>
                          </div>
                          <div className="text-[10px] text-gray-500 font-medium">
                            Up to <span className="font-bold text-gray-700 dark:text-gray-300">{zone.installmentsAllowed || 3} installments</span> allowed
                          </div>
                        </div>

                        {/* Assigned Stops Section */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-blue-500" />
                              Bundled Stops ({assignedStops.length})
                            </span>
                            <button
                              type="button"
                              onClick={() => handleOpenEditZone(zone)}
                              className="text-[10px] font-bold text-blue-600 hover:underline"
                            >
                              Assign Stops
                            </button>
                          </div>

                          {assignedStops.length === 0 ? (
                            <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-dashed border-gray-200 dark:border-gray-800 text-[11px] text-gray-400 italic text-center">
                              No stops bundled into this zone yet.
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1">
                              {assignedStops.map((st) => (
                                <span
                                  key={st.id}
                                  className="px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-[10px] font-bold text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
                                >
                                  {st.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Corridor Description */}
                        {zone.corridorDescription && (
                          <div className="text-[10px] text-gray-400 line-clamp-2">
                            <span className="font-bold">Corridor:</span> {zone.corridorDescription}
                          </div>
                        )}
                      </div>

                      <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-[10px] text-gray-400">
                        <span>ID: {zone.id?.slice(0, 16) || zone.code}</span>
                        <span>{zone.updatedAt ? `Updated ${formatDate(zone.updatedAt)}` : "Standard"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT CAMPUS ENTITY */}
      {campusModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative max-w-2xl w-full bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-2xl border border-gray-200 dark:border-gray-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div>
                <h3 className="font-black text-lg text-gray-900 dark:text-white flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-blue-600" />
                  {editingCampus ? `Edit Campus Entity (${editingCampus.code})` : "Register New Campus Entity"}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Configure regional branch, depot parking bays, and GIS coordinates.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setCampusModalOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCampus} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-black text-gray-700 dark:text-gray-300 block mb-1">
                    Campus Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Graphic Era University - Dehradun Campus"
                    value={campusForm.name}
                    onChange={(e) => setCampusForm({ ...campusForm, name: e.target.value })}
                    className="w-full text-xs p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 font-bold outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-gray-700 dark:text-gray-300 block mb-1">
                    Campus Code (Unique) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. GEU-DDN, GEHU-BHT"
                    value={campusForm.code}
                    onChange={(e) => setCampusForm({ ...campusForm, code: e.target.value.toUpperCase() })}
                    className="w-full text-xs p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 font-mono font-bold uppercase tracking-wider outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-black text-gray-700 dark:text-gray-300 block mb-1">
                    City / Region *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dehradun, Bhimtal, Haldwani"
                    value={campusForm.city}
                    onChange={(e) => setCampusForm({ ...campusForm, city: e.target.value })}
                    className="w-full text-xs p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-gray-700 dark:text-gray-300 block mb-1">
                    Main Gate / Depot Landmark
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Bell Road Main Gate & Bus Terminal"
                    value={campusForm.landmark}
                    onChange={(e) => setCampusForm({ ...campusForm, landmark: e.target.value })}
                    className="w-full text-xs p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-gray-700 dark:text-gray-300 block mb-1">
                  Full Physical Address
                </label>
                <input
                  type="text"
                  placeholder="e.g. 566/6, Bell Road, Clement Town, Dehradun 248002"
                  value={campusForm.address}
                  onChange={(e) => setCampusForm({ ...campusForm, address: e.target.value })}
                  className="w-full text-xs p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 outline-none focus:border-blue-500"
                />
              </div>

              {/* GIS Coordinates & Fleet Specs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-black text-gray-700 dark:text-gray-300 block mb-1">
                    Latitude
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={campusForm.latitude}
                    onChange={(e) => setCampusForm({ ...campusForm, latitude: Number(e.target.value) })}
                    className="w-full text-xs p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-gray-700 dark:text-gray-300 block mb-1">
                    Longitude
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={campusForm.longitude}
                    onChange={(e) => setCampusForm({ ...campusForm, longitude: Number(e.target.value) })}
                    className="w-full text-xs p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-gray-700 dark:text-gray-300 block mb-1">
                    Depot Bays
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={campusForm.parkingBays}
                    onChange={(e) => setCampusForm({ ...campusForm, parkingBays: Number(e.target.value) })}
                    className="w-full text-xs p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-gray-700 dark:text-gray-300 block mb-1">
                    Geofence (m)
                  </label>
                  <input
                    type="number"
                    min={20}
                    value={campusForm.geofenceRadiusMeters}
                    onChange={(e) => setCampusForm({ ...campusForm, geofenceRadiusMeters: Number(e.target.value) })}
                    className="w-full text-xs p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 font-mono"
                  />
                </div>
              </div>

              {/* Contact Information */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-black text-gray-700 dark:text-gray-300 block mb-1">
                    Transport Desk Phone
                  </label>
                  <input
                    type="text"
                    value={campusForm.contactPhone}
                    onChange={(e) => setCampusForm({ ...campusForm, contactPhone: e.target.value })}
                    placeholder="+91 8057999901"
                    className="w-full text-xs p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-gray-700 dark:text-gray-300 block mb-1">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    value={campusForm.contactEmail}
                    onChange={(e) => setCampusForm({ ...campusForm, contactEmail: e.target.value })}
                    placeholder="transport@geu.ac.in"
                    className="w-full text-xs p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950"
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="flex flex-wrap gap-4 pt-2 border-t border-gray-100 dark:border-gray-800">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={campusForm.isPrimary}
                    onChange={(e) => setCampusForm({ ...campusForm, isPrimary: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                    Designate as Primary Campus Hub
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={campusForm.isActive}
                    onChange={(e) => setCampusForm({ ...campusForm, isActive: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                    Campus is Active
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setCampusModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 rounded-xl hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingCampus}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow disabled:opacity-50"
                >
                  {isSavingCampus ? "Saving..." : editingCampus ? "Update Campus" : "Register Campus"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT TRANSIT ZONE & ASSIGN STOPS */}
      {zoneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative max-w-2xl w-full bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-2xl border border-gray-200 dark:border-gray-800 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div>
                <h3 className="font-black text-lg text-gray-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-blue-600" />
                  {editingZone ? `Edit Transit Zone (${zoneForm.code})` : "Configure New Transit Zone"}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Assigned strictly to <span className="font-bold text-blue-600">{activeCampus?.name}</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setZoneModalOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveZone} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-gray-700 dark:text-gray-300 block mb-1">
                    Zone Code *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ZONE_A, ZONE_B"
                    value={zoneForm.code}
                    onChange={(e) => setZoneForm({ ...zoneForm, code: e.target.value.toUpperCase() })}
                    className="w-full text-xs p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 font-bold uppercase tracking-wider outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-gray-700 dark:text-gray-300 block mb-1">
                    Semester Pass Price (₹) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-gray-400 font-bold text-xs">₹</span>
                    <input
                      type="number"
                      required
                      min={0}
                      step={500}
                      value={zoneForm.semesterFee}
                      onChange={(e) => setZoneForm({ ...zoneForm, semesterFee: Number(e.target.value) })}
                      className="w-full text-xs pl-7 pr-3 py-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 font-black font-mono text-sm outline-none focus:border-blue-500 text-blue-600 dark:text-blue-400"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-gray-700 dark:text-gray-300 block mb-1">
                    Zone Display Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Zone A: Clock Tower & Rajpur Road Corridor"
                    value={zoneForm.name}
                    onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
                    className="w-full text-xs p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 font-medium outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-gray-700 dark:text-gray-300 block mb-1">
                    Allowed Installments
                  </label>
                  <CustomDropdown
                    value={zoneForm.installmentsAllowed}
                    onChange={(val) => setZoneForm({ ...zoneForm, installmentsAllowed: Number(val) })}
                    options={[
                      { value: 1, label: "1 Installment (Full Payment Upfront)" },
                      { value: 2, label: "2 Installments (50% Split)" },
                      { value: 3, label: "3 Installments (Standard Split)" },
                      { value: 4, label: "4 Installments (Flexible Monthly)" },
                    ]}
                  />
                </div>
              </div>

              {/* Stop Assignment Section: Strictly encapsulated for this campus */}
              <div className="pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-black text-gray-800 dark:text-white flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-blue-600" />
                      Take Already Created Stops into this Zone ({zoneForm.assignedStopIds.length} Selected)
                    </label>
                    <p className="text-[10px] text-gray-500">
                      Check stops registered for <span className="font-bold">{activeCampus?.name}</span> to bundle them into this pricing zone.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectAllStops(true)}
                      className="text-[10px] font-bold text-blue-600 hover:underline"
                    >
                      Select All
                    </button>
                    <span className="text-gray-300">•</span>
                    <button
                      type="button"
                      onClick={() => handleSelectAllStops(false)}
                      className="text-[10px] font-bold text-gray-500 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Stop Search Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder={`Search ${activeCampusStops.length} stops in ${activeCampus?.code}...`}
                    value={stopFilterSearch}
                    onChange={(e) => setStopFilterSearch(e.target.value)}
                    className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 outline-none focus:border-blue-500"
                  />
                </div>

                {/* Stops List */}
                <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-800 rounded-2xl p-2 divide-y divide-gray-100 dark:divide-gray-800/60 bg-gray-50/50 dark:bg-gray-950/40">
                  {activeCampusStops.length === 0 ? (
                    <div className="p-4 text-center text-xs text-gray-400 font-medium">
                      No stops currently mapped to {activeCampus?.name}. Create stops in Route Builder first.
                    </div>
                  ) : (
                    activeCampusStops
                      .filter((s) => {
                        if (!stopFilterSearch.trim()) return true;
                        const q = stopFilterSearch.toLowerCase();
                        return (
                          s.name.toLowerCase().includes(q) ||
                          s.code.toLowerCase().includes(q) ||
                          (s.landmark && s.landmark.toLowerCase().includes(q))
                        );
                      })
                      .map((s) => {
                        const isChecked = zoneForm.assignedStopIds.includes(s.id);
                        const isOtherZone = s.zoneCode && s.zoneCode !== zoneForm.code;

                        return (
                          <div
                            key={s.id}
                            onClick={() => handleToggleStop(s.id)}
                            className={`p-2.5 rounded-xl flex items-center justify-between cursor-pointer transition-all ${
                              isChecked
                                ? "bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-200"
                                : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              {isChecked ? (
                                <CheckSquare className="w-4 h-4 text-blue-600 flex-shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              )}
                              <div>
                                <div className="text-xs font-bold flex items-center gap-1.5">
                                  <span>{s.name}</span>
                                  <span className="text-[10px] font-mono text-gray-400">({s.code})</span>
                                </div>
                                {s.landmark && (
                                  <div className="text-[10px] text-gray-400 truncate max-w-sm">
                                    {s.landmark}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="text-[10px]">
                              {isChecked ? (
                                <span className="px-2 py-0.5 rounded-md bg-blue-600 text-white font-black uppercase text-[9px]">
                                  Selected
                                </span>
                              ) : isOtherZone ? (
                                <span className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-800 text-gray-500 text-[9px]">
                                  In {s.zoneCode}
                                </span>
                              ) : (
                                <span className="text-gray-400 italic text-[9px]">Unassigned</span>
                              )}
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>

              {/* Corridor Description */}
              <div>
                <label className="text-xs font-black text-gray-700 dark:text-gray-300 block mb-1">
                  Corridor Description / Stops Summary
                </label>
                <textarea
                  rows={2}
                  value={zoneForm.corridorDescription}
                  onChange={(e) => setZoneForm({ ...zoneForm, corridorDescription: e.target.value })}
                  placeholder="e.g. Clock Tower, Dilaram Chowk, Jakhan, Rajpur Road"
                  className="w-full text-xs p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 outline-none focus:border-blue-500"
                />
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="zoneActiveModal"
                  checked={zoneForm.isActive}
                  onChange={(e) => setZoneForm({ ...zoneForm, isActive: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600"
                />
                <label htmlFor="zoneActiveModal" className="text-xs font-bold text-gray-700 dark:text-gray-300">
                  Zone is active and selectable for student pass generation
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setZoneModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 rounded-xl hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingZone}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow disabled:opacity-50"
                >
                  {isSavingZone ? "Saving Zone..." : editingZone ? "Update Zone & Pricing" : "Create Zone & Pricing"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATIONS */}
      {deleteConfirmZone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative max-w-md w-full bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-2xl border border-gray-200 dark:border-gray-800 space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-black text-base text-red-600 flex items-center gap-2">
                <Trash2 className="w-5 h-5" /> Delete Transit Zone
              </span>
              <button
                type="button"
                onClick={() => setDeleteConfirmZone(null)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-600 dark:text-gray-300">
              Are you sure you want to delete <span className="font-bold text-gray-900 dark:text-white">{deleteConfirmZone.name} ({deleteConfirmZone.code})</span> for <span className="font-bold">{activeCampus?.name}</span>?
            </p>

            <div className="p-3 rounded-xl bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-900 text-[11px] text-yellow-700 dark:text-yellow-300">
              Stops bundled into this zone will be unassigned.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmZone(null)}
                className="px-4 py-2 text-xs font-bold text-gray-600 rounded-xl hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteZone}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteCampusConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative max-w-md w-full bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-2xl border border-gray-200 dark:border-gray-800 space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-black text-base text-red-600 flex items-center gap-2">
                <Trash2 className="w-5 h-5" /> Delete Campus Entity
              </span>
              <button
                type="button"
                onClick={() => setDeleteCampusConfirm(null)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-600 dark:text-gray-300">
              Are you sure you want to remove <span className="font-bold text-gray-900 dark:text-white">{deleteCampusConfirm.name} ({deleteCampusConfirm.code})</span>?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteCampusConfirm(null)}
                className="px-4 py-2 text-xs font-bold text-gray-600 rounded-xl hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteCampus}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default StaffCampusesView;
