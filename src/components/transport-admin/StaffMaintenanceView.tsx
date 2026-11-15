"use client";

import React, { useState, useEffect } from "react";
import { store } from "@/lib/client-store";
import {
  Wrench,
  Search,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Eye,
  X,
  FileSpreadsheet,
  BusFront,
  Calendar,
  Image as ImageIcon,
  RefreshCw,
} from "lucide-react";
import type { Bus, MaintenanceRequest } from "@/lib/types";
import { getSafePhotoUrl } from "@/lib/image-utils";
import { CustomDropdown } from "@/components/common/CustomDropdown";

interface StaffMaintenanceViewProps {
  initialBuses?: Bus[];
  initialRequests?: MaintenanceRequest[];
}

export default function StaffMaintenanceView({
  initialBuses = [],
  initialRequests = [],
}: StaffMaintenanceViewProps) {
  const [buses] = useState<Bus[]>(() => (initialBuses.length > 0 ? initialBuses : store.getBuses()));
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>(initialRequests);
  const [isLoading, setIsLoading] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Create Defect Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [vehicleNo, setVehicleNo] = useState("");
  const [busId, setBusId] = useState("");
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [rate, setRate] = useState<number>(0);
  const [defectDesc, setDefectDesc] = useState("");
  const [defectImages, setDefectImages] = useState<string[]>([]);
  const [remarks, setRemarks] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Work Done Modal
  const [workModalRequest, setWorkModalRequest] = useState<MaintenanceRequest | null>(null);
  const [workDesc, setWorkDesc] = useState("");
  const [workImages, setWorkImages] = useState<string[]>([]);
  const [isWorkSubmitting, setIsWorkSubmitting] = useState(false);

  // Lightbox
  const [lightboxImg, setLightboxImg] = useState<{ url: string; title: string } | null>(null);
  const [toast, setToast] = useState<{ msg: string; isError?: boolean } | null>(null);

  const showToast = (msg: string, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchMaintenanceRequests = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/maintenance/requests");
      const data = await res.json();
      if (data.success && Array.isArray(data.requests)) {
        setMaintenanceRequests(data.requests);
      }
    } catch (err) {
      console.error("Failed to fetch maintenance requests for staff:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMaintenanceRequests();
  }, []);

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    onSuccess: (url: string) => void
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append("file", files[i]);

        const res = await fetch("/api/maintenance/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (data.success && data.url) {
          onSuccess(data.url);
        } else {
          showToast(data.message || "Failed to upload image.", true);
        }
      }
    } catch (err: any) {
      showToast("Network error uploading image: " + err.message, true);
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleCreateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleNo || !item) {
      showToast("Please provide Vehicle No. and Item.", true);
      return;
    }

    setIsSubmitting(true);
    try {
      const amount = (quantity || 1) * (rate || 0);
      const res = await fetch("/api/maintenance/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleNo,
          busId: busId || undefined,
          item,
          quantity,
          rate,
          amount,
          defectDescription: defectDesc,
          defectImageUrls: defectImages,
          remarks,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setIsCreateModalOpen(false);
        setVehicleNo("");
        setBusId("");
        setItem("");
        setQuantity(1);
        setRate(0);
        setDefectDesc("");
        setRemarks("");
        setDefectImages([]);
        showToast("✓ Vehicle maintenance defect ticket logged!");
        await fetchMaintenanceRequests();
      } else {
        showToast(data.message || "Failed to create entry.", true);
      }
    } catch (err: any) {
      showToast("Error creating entry: " + err.message, true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveWorkProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workModalRequest) return;

    setIsWorkSubmitting(true);
    try {
      const res = await fetch(`/api/maintenance/requests/${workModalRequest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workDoneDescription: workDesc,
          workDoneImageUrls: workImages,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setWorkModalRequest(null);
        setWorkDesc("");
        setWorkImages([]);
        showToast("✓ Workshop progress & photos recorded!");
        await fetchMaintenanceRequests();
      } else {
        showToast(data.message || "Failed to update work details.", true);
      }
    } catch (err: any) {
      showToast("Error saving work details: " + err.message, true);
    } finally {
      setIsWorkSubmitting(false);
    }
  };

  const filteredRequests = maintenanceRequests.filter((req) => {
    const matchesStatus = statusFilter === "ALL" || req.status === statusFilter;
    const matchesSearch =
      !searchTerm ||
      req.vehicleNo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.item?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.defectDescription?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const openCount = maintenanceRequests.filter((r) => r.status === "OPEN").length;
  const inProgressCount = maintenanceRequests.filter((r) => r.status === "IN_PROGRESS").length;
  const completedCount = maintenanceRequests.filter((r) => r.status === "COMPLETED").length;

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 ${
            toast.isError
              ? "bg-red-600 text-white shadow-red-500/20"
              : "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
          } px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-xs font-bold animate-in slide-in-from-bottom-3`}
        >
          {toast.isError ? (
            <AlertTriangle className="w-4 h-4 text-white" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-green-400 dark:text-green-600" />
          )}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 sm:p-6 border border-gray-200 dark:border-gray-800 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-black text-base text-gray-900 dark:text-white flex items-center gap-2">
              <Wrench className="w-5 h-5 text-yellow-500" />
              <span>Workshop Maintenance & Fleet Defect Register</span>
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Staff defect dispatch: Report vehicle mechanical issues, upload photographic evidence, and track workshop repair progress.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={fetchMaintenanceRequests}
              className="p-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-bold"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-4 py-2.5 bg-yellow-600 hover:bg-yellow-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md shadow-yellow-500/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Report Vehicle Defect</span>
            </button>
          </div>
        </div>
      </div>

      {/* Status Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-black tracking-wider text-red-600 dark:text-red-400">
              Open Defects
            </div>
            <div className="text-2xl font-black font-mono mt-1 text-gray-900 dark:text-white">{openCount}</div>
            <div className="text-[10px] text-gray-400 font-mono mt-0.5">Awaiting garage action</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/60 text-red-600 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-black tracking-wider text-yellow-600 dark:text-yellow-400">
              In Workshop
            </div>
            <div className="text-2xl font-black font-mono mt-1 text-yellow-600 dark:text-yellow-400">{inProgressCount}</div>
            <div className="text-[10px] text-gray-400 font-mono mt-0.5">Under active repair</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-yellow-50 dark:bg-yellow-950/60 text-yellow-600 flex items-center justify-center">
            <Wrench className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-black tracking-wider text-green-600 dark:text-green-400">
              Repairs Completed
            </div>
            <div className="text-2xl font-black font-mono mt-1 text-green-600 dark:text-green-400">{completedCount}</div>
            <div className="text-[10px] text-gray-400 font-mono mt-0.5">Vehicle cleared for runs</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-950/60 text-green-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-black tracking-wider text-blue-600 dark:text-blue-400">
              Total Logged
            </div>
            <div className="text-2xl font-black font-mono mt-1 text-gray-900 dark:text-white">
              {maintenanceRequests.length}
            </div>
            <div className="text-[10px] text-gray-400 font-mono mt-0.5">All-time register items</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center">
            <BusFront className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Register Table */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 sm:p-6 border border-gray-200 dark:border-gray-800 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search vehicle number, part, defect..."
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:border-yellow-500 font-bold"
            />
          </div>

          <div className="flex items-center gap-2">
            <CustomDropdown
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
              size="sm"
              options={[
                { value: "ALL", label: `All Statuses (${maintenanceRequests.length})` },
                { value: "OPEN", label: `Open (${openCount})` },
                { value: "IN_PROGRESS", label: `In Workshop (${inProgressCount})` },
                { value: "COMPLETED", label: `Completed (${completedCount})` },
              ]}
              containerClassName="w-48"
            />
          </div>
        </div>

        {filteredRequests.length === 0 ? (
          <div className="py-16 text-center text-xs text-gray-400 font-mono space-y-2">
            <Wrench className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600" />
            <div>No maintenance requests found matching your filter.</div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 dark:bg-gray-800/60 uppercase font-black text-gray-400 border-b border-gray-200 dark:border-gray-800">
                <tr>
                  <th className="p-3.5">S.No</th>
                  <th className="p-3.5">Vehicle</th>
                  <th className="p-3.5">Item / Defect</th>
                  <th className="p-3.5">Defect Photos</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5">Work Done & Proof</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredRequests.map((req, idx) => (
                  <tr key={req.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="p-3.5 font-mono text-gray-400">#{req.serialNo || idx + 1}</td>

                    <td className="p-3.5">
                      <div className="font-black text-gray-900 dark:text-white flex items-center gap-1.5">
                        <BusFront className="w-3.5 h-3.5 text-yellow-500" />
                        <span>{req.vehicleNo}</span>
                      </div>
                      <div className="text-[10px] text-gray-400 font-mono">
                        {req.date ? new Date(req.date).toLocaleDateString() : "—"}
                      </div>
                    </td>

                    <td className="p-3.5 max-w-xs">
                      <div className="font-bold text-gray-900 dark:text-white truncate">{req.item}</div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                        {req.defectDescription || "No notes provided"}
                      </div>
                    </td>

                    <td className="p-3.5">
                      {req.defectImageUrls && req.defectImageUrls.length > 0 ? (
                        <div className="flex gap-1.5">
                          {req.defectImageUrls.map((url, i) => (
                            <button
                              key={i}
                              onClick={() => setLightboxImg({ url, title: `Defect Photo ${i + 1} - ${req.vehicleNo}` })}
                              className="w-8 h-8 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-700 relative group cursor-pointer"
                            >
                              <img src={getSafePhotoUrl(url)} alt="defect" className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-400 italic">None</span>
                      )}
                    </td>

                    <td className="p-3.5 text-center">
                      <span
                        className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                          req.status === "OPEN"
                            ? "bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300"
                            : req.status === "IN_PROGRESS"
                            ? "bg-yellow-100 dark:bg-yellow-950/60 text-yellow-800 dark:text-yellow-300"
                            : "bg-green-100 dark:bg-green-950/60 text-green-800 dark:text-green-300"
                        }`}
                      >
                        {req.status}
                      </span>
                    </td>

                    <td className="p-3.5 max-w-xs">
                      {req.workDoneDescription ? (
                        <div className="text-[11px] text-gray-800 dark:text-gray-200 truncate">
                          {req.workDoneDescription}
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-400 italic">Awaiting work proof</span>
                      )}
                      {req.workDoneImageUrls && req.workDoneImageUrls.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {req.workDoneImageUrls.map((url, i) => (
                            <button
                              key={i}
                              onClick={() => setLightboxImg({ url, title: `Repair Proof ${i + 1} - ${req.vehicleNo}` })}
                              className="w-6 h-6 rounded overflow-hidden border border-green-400"
                            >
                              <img src={getSafePhotoUrl(url)} alt="work proof" className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                    </td>

                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => {
                          setWorkModalRequest(req);
                          setWorkDesc(req.workDoneDescription || "");
                          setWorkImages(req.workDoneImageUrls || []);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold transition-all"
                      >
                        Add Work Proof
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Defect Ticket Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="max-w-lg w-full bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
              <h4 className="font-black text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <Wrench className="w-4 h-4 text-yellow-500" />
                <span>Log Vehicle Defect / Workshop Request</span>
              </h4>
              <button onClick={() => setIsCreateModalOpen(false)} className="p-1 text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateEntry} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-gray-500 mb-1">
                    Select Bus
                  </label>
                  <CustomDropdown
                    value={busId}
                    onChange={(val) => {
                      setBusId(val);
                      const b = buses.find((item) => item.id === Number(val));
                      if (b) setVehicleNo(String(b.busNumber));
                    }}
                    placeholder="— Select from fleet —"
                    options={[
                      { value: "", label: "— Select from fleet —" },
                      ...buses.map((b) => ({
                        value: String(b.id),
                        label: `Bus ${b.busNumber} (${b.registrationNo || b.model})`,
                      })),
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-gray-500 mb-1">
                    Vehicle No. *
                  </label>
                  <input
                    type="text"
                    value={vehicleNo}
                    onChange={(e) => setVehicleNo(e.target.value)}
                    placeholder="e.g. UK 04 PA 1234"
                    required
                    className="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none font-bold font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-gray-500 mb-1">
                  Item / Defect Title *
                </label>
                <input
                  type="text"
                  value={item}
                  onChange={(e) => setItem(e.target.value)}
                  placeholder="e.g. Brake Pad Replacement, Clutch Slipping"
                  required
                  className="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-gray-500 mb-1">
                  Detailed Defect Description
                </label>
                <textarea
                  value={defectDesc}
                  onChange={(e) => setDefectDesc(e.target.value)}
                  rows={2}
                  placeholder="Explain the mechanical defect or symptoms observed..."
                  className="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none"
                />
              </div>

              {/* Upload Defect Photos */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-gray-500 mb-1">
                  Defect Proof Photos
                </label>
                <label className="px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold flex items-center gap-2 cursor-pointer w-fit">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isUploading ? "Uploading..." : "Upload Defect Photos"}</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e, (url) => setDefectImages((p) => [...p, url]))}
                    disabled={isUploading}
                    className="hidden"
                  />
                </label>
                {defectImages.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {defectImages.map((url, i) => (
                      <div key={i} className="w-12 h-12 rounded-xl overflow-hidden relative border border-gray-300">
                        <img src={getSafePhotoUrl(url)} alt="defect" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-yellow-600 hover:bg-yellow-500 text-white font-black shadow-sm"
                >
                  {isSubmitting ? "Submitting..." : "Log Defect in Register"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Work Done Modal */}
      {workModalRequest && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
              <h4 className="font-black text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <Wrench className="w-4 h-4 text-green-500" />
                <span>Record Workshop Work & Photos</span>
              </h4>
              <button onClick={() => setWorkModalRequest(null)} className="p-1 text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveWorkProof} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-gray-500 mb-1">
                  Work Done Description
                </label>
                <textarea
                  value={workDesc}
                  onChange={(e) => setWorkDesc(e.target.value)}
                  rows={3}
                  placeholder="Describe parts replaced, mechanics involved, workshop test drive..."
                  required
                  className="w-full p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-gray-500 mb-1">
                  Upload Work Done Proof Photos
                </label>
                <label className="px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold flex items-center gap-2 cursor-pointer w-fit">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isUploading ? "Uploading..." : "Upload Repair Photos"}</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e, (url) => setWorkImages((p) => [...p, url]))}
                    disabled={isUploading}
                    className="hidden"
                  />
                </label>
                {workImages.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {workImages.map((url, i) => (
                      <div key={i} className="w-12 h-12 rounded-xl overflow-hidden relative border border-green-400">
                        <img src={getSafePhotoUrl(url)} alt="work" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setWorkModalRequest(null)}
                  className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isWorkSubmitting}
                  className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white font-black shadow-sm"
                >
                  {isWorkSubmitting ? "Saving..." : "Save Work Proof"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxImg && (
        <div
          onClick={() => setLightboxImg(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-2xl w-full bg-gray-900 rounded-3xl p-4 border border-gray-700 space-y-3 cursor-default"
          >
            <div className="flex items-center justify-between pb-2 border-b border-gray-800">
              <span className="text-xs font-bold text-gray-300">{lightboxImg.title}</span>
              <button onClick={() => setLightboxImg(null)} className="p-1 text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden max-h-[70vh] flex items-center justify-center bg-black">
              <img src={getSafePhotoUrl(lightboxImg.url)} alt="Inspection" className="max-w-full max-h-[70vh] object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
